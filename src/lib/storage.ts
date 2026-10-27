import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// Where uploaded files live. Keys are "2026/10/photo-1a2b3c4d.jpg"; every
// driver serves them at /uploads/<key>, so switching drivers keeps URLs.
export interface Storage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>;
  read(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Accepts only plain relative keys, so no driver can be pointed outside its
// folder or prefix ("..", absolute paths, odd characters are refused).
export function safeKey(key: string | string[]): string | null {
  const segments = Array.isArray(key) ? key : key.split("/");
  if (segments.length === 0 || segments.length > 8) return null;
  return segments.every((s) => SEGMENT.test(s) && !s.includes(".."))
    ? segments.join("/")
    : null;
}

function mustKey(key: string) {
  const k = safeKey(key);
  if (!k) throw new Error(`Invalid storage key: ${key}`);
  return k;
}

export class LocalStorage implements Storage {
  private root: string;

  constructor(root: string) {
    this.root = path.resolve(/*turbopackIgnore: true*/ root);
  }

  private file(key: string) {
    return path.join(/*turbopackIgnore: true*/ this.root, mustKey(key));
  }

  async put(key: string, bytes: Uint8Array, _contentType?: string) {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }

  async get(key: string) {
    try {
      const file = this.file(key);
      const info = await stat(file);
      if (!info.isFile()) return null;
      return {
        body: Readable.toWeb(createReadStream(file)) as ReadableStream,
        size: info.size,
      };
    } catch {
      return null;
    }
  }

  async read(key: string) {
    try {
      return new Uint8Array(await readFile(this.file(key)));
    } catch {
      return null;
    }
  }

  async remove(key: string) {
    await rm(this.file(key), { force: true });
  }
}

export class S3Storage implements Storage {
  constructor(
    private client: S3Client,
    private bucket: string,
    private prefix: string,
  ) {}

  private key(key: string) {
    return `${this.prefix}${mustKey(key)}`;
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(key),
        Body: bytes,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  async get(key: string) {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(key) }),
      );
      if (!res.Body) return null;
      return {
        body: res.Body.transformToWebStream(),
        size: res.ContentLength ?? 0,
      };
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async read(key: string) {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(key) }),
      );
      return res.Body ? await res.Body.transformToByteArray() : null;
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async remove(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(key) }),
    );
  }
}

function fromEnv(): Storage {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local")
    return new LocalStorage(process.env.UPLOADS_DIR ?? "./storage/uploads");
  if (driver !== "s3")
    throw new Error(`Unknown STORAGE_DRIVER "${driver}". Use "local" or "s3".`);

  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("STORAGE_DRIVER=s3 needs S3_BUCKET.");
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint,
    // S3-compatible services (R2, MinIO, ...) expect path-style addressing
    forcePathStyle: !!endpoint,
    // Falls back to the standard AWS credential chain when unset
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
  const prefix = (process.env.S3_PREFIX ?? "uploads/").replace(/^\/+/, "");
  return new S3Storage(
    client,
    bucket,
    prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix,
  );
}

let instance: Storage | undefined;
export function storage(): Storage {
  instance ??= fromEnv();
  return instance;
}
