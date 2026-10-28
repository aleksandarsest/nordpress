// A small tar (ustar) writer and streaming reader for backups, so no archive
// library is needed. Only regular files; names up to 255 bytes. Pure.

const BLOCK = 512;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function octal(value: number, length: number) {
  return `${value.toString(8).padStart(length - 1, "0")}\0`;
}

function writeString(
  block: Uint8Array,
  offset: number,
  text: string,
  length: number,
) {
  block.set(encoder.encode(text).subarray(0, length), offset);
}

// ustar splits long names into a prefix (155 bytes) and a name (100 bytes)
function splitName(name: string): [string, string] {
  const bytes = encoder.encode(name).length;
  if (bytes <= 100) return ["", name];
  const cut = name.lastIndexOf("/", name.length - 1);
  for (let i = cut; i > 0; i = name.lastIndexOf("/", i - 1)) {
    const prefix = name.slice(0, i);
    const rest = name.slice(i + 1);
    if (
      encoder.encode(prefix).length <= 155 &&
      encoder.encode(rest).length <= 100
    )
      return [prefix, rest];
  }
  throw new Error(`File name too long for the archive: ${name}`);
}

/** The 512-byte header for a file of `size` bytes. */
export function tarHeader(name: string, size: number, mtime = new Date()) {
  const block = new Uint8Array(BLOCK);
  const [prefix, short] = splitName(name);
  writeString(block, 0, short, 100);
  writeString(block, 100, octal(0o644, 8), 8);
  writeString(block, 108, octal(0, 8), 8);
  writeString(block, 116, octal(0, 8), 8);
  writeString(block, 124, octal(size, 12), 12);
  writeString(block, 136, octal(Math.floor(mtime.getTime() / 1000), 12), 12);
  block.fill(0x20, 148, 156); // checksum counts as spaces while computing it
  block[156] = 0x30; // "0": regular file
  writeString(block, 257, "ustar\0", 6);
  writeString(block, 263, "00", 2);
  writeString(block, 345, prefix, 155);
  const sum = block.reduce((a, b) => a + b, 0);
  writeString(block, 148, `${sum.toString(8).padStart(6, "0")}\0 `, 8);
  return block;
}

/** Zero bytes that pad a file's content to a whole block. */
export function tarPadding(size: number) {
  return new Uint8Array((BLOCK - (size % BLOCK)) % BLOCK);
}

/** Two empty blocks end an archive. */
export const TAR_END = new Uint8Array(BLOCK * 2);

export type TarEntry = {
  name: string;
  size: number;
  body: AsyncIterable<Uint8Array>;
};

function readString(block: Uint8Array, offset: number, length: number) {
  const bytes = block.subarray(offset, offset + length);
  const end = bytes.indexOf(0);
  return decoder.decode(end === -1 ? bytes : bytes.subarray(0, end));
}

function parseHeader(block: Uint8Array) {
  if (block.every((b) => b === 0)) return null;
  const stored = Number.parseInt(readString(block, 148, 8).trim(), 8);
  const copy = block.slice();
  copy.fill(0x20, 148, 156);
  if (copy.reduce((a, b) => a + b, 0) !== stored)
    throw new Error("This isn't a valid backup file (damaged archive).");
  const prefix = readString(block, 345, 155);
  const name = readString(block, 0, 100);
  return {
    name: prefix ? `${prefix}/${name}` : name,
    size: Number.parseInt(readString(block, 124, 12).trim() || "0", 8),
    type: String.fromCharCode(block[156] || 0x30),
  };
}

/**
 * Reads entries one at a time from a byte stream. Each entry's body must be
 * read (or skipped by moving on) before the next one is produced.
 */
export async function* readTar(
  source: AsyncIterable<Uint8Array>,
): AsyncGenerator<TarEntry> {
  const iterator = source[Symbol.asyncIterator]();
  let buffer = new Uint8Array(0);
  let done = false;

  async function fill(n: number) {
    while (buffer.length < n && !done) {
      const next = await iterator.next();
      if (next.done) done = true;
      else {
        const merged = new Uint8Array(buffer.length + next.value.length);
        merged.set(buffer);
        merged.set(next.value, buffer.length);
        buffer = merged;
      }
    }
    return buffer.length >= n;
  }

  function take(n: number) {
    const out = buffer.subarray(0, n);
    buffer = buffer.subarray(n);
    return out;
  }

  while (await fill(BLOCK)) {
    const header = parseHeader(take(BLOCK));
    if (!header) return;
    let remaining = header.size;
    const padded = header.size + ((BLOCK - (header.size % BLOCK)) % BLOCK);
    let consumed = 0;
    const body = {
      async *[Symbol.asyncIterator]() {
        while (remaining > 0) {
          if (buffer.length === 0 && !(await fill(1)))
            throw new Error("The backup file is cut off.");
          const chunk = take(Math.min(remaining, buffer.length));
          remaining -= chunk.length;
          consumed += chunk.length;
          yield chunk.slice();
        }
      },
    };
    if (header.type === "0" || header.type === "\0")
      yield { name: header.name, size: header.size, body };
    // Skip whatever the consumer didn't read, plus the padding
    let skip = padded - consumed;
    while (skip > 0) {
      if (!(await fill(Math.min(skip, BLOCK))))
        throw new Error("The backup file is cut off.");
      skip -= take(Math.min(skip, buffer.length)).length;
    }
    remaining = 0;
  }
}

/** Collects an entry's body, for small entries such as the manifest. */
export async function readAll(body: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    length += chunk.length;
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
