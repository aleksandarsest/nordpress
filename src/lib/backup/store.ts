import "server-only";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// Where scheduled backups are kept: a private folder on disk, or a separate
// prefix in the S3 bucket. Never the public uploads folder: backups hold
// password hashes and every member's email address.

export type StoredBackup = { name: string; size: number; createdAt: Date };

const NAME = /^nordpress-[0-9TZ-]+?(-[a-z]+(?:-[a-z]+)*)?\.tar\.gz$/;
export const isBackupName = (name: string) => NAME.test(name);

export interface BackupStore {
  list(): Promise<StoredBackup[]>;
  /** Saves a finished archive from a local temporary file. */
  save(name: string, file: string): Promise<void>;
  open(name: string): Promise<{ body: Readable; size: number } | null>;
  remove(name: string): Promise<void>;
  /** Shown in the admin, e.g. "./storage/backups". */
  where: string;
}

class LocalBackups implements BackupStore {
  constructor(private root: string) {}
  get where() {
    return this.root;
  }
  private file(name: string) {
    if (!isBackupName(name)) throw new Error("Invalid backup name.");
    return path.join(/*turbopackIgnore: true*/ path.resolve(this.root), name);
  }
  async list() {
    await mkdir(this.root, { recursive: true });
    const names = (await readdir(this.root)).filter(isBackupName);
    const items = await Promise.all(
      names.map(async (name) => {
        const info = await stat(this.file(name));
        return { name, size: info.size, createdAt: info.mtime };
      }),
    );
    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async save(name: string, file: string) {
    await mkdir(this.root, { recursive: true });
    try {
      await rename(file, this.file(name));
    } catch {
      // Different disk: copy instead
      await pipeline(
        createReadStream(file),
        createWriteStream(this.file(name)),
      );
      await rm(file, { force: true });
    }
  }
  async open(name: string) {
    try {
      const info = await stat(this.file(name));
      return { body: createReadStream(this.file(name)), size: info.size };
    } catch {
      return null;
    }
  }
  async remove(name: string) {
    await rm(this.file(name), { force: true });
  }
}

class S3Backups implements BackupStore {
  constructor(
    private client: S3Client,
    private bucket: string,
    private prefix: string,
  ) {}
  get where() {
    return `s3://${this.bucket}/${this.prefix}`;
  }
  private key(name: string) {
    if (!isBackupName(name)) throw new Error("Invalid backup name.");
    return `${this.prefix}${name}`;
  }
  async list() {
    const res = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: this.prefix }),
    );
    return (res.Contents ?? [])
      .map((o) => ({
        name: (o.Key ?? "").slice(this.prefix.length),
        size: o.Size ?? 0,
        createdAt: o.LastModified ?? new Date(0),
      }))
      .filter((o) => isBackupName(o.name))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async save(name: string, file: string) {
    const { size } = await stat(file);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(name),
        Body: createReadStream(file),
        ContentLength: size,
        ContentType: "application/gzip",
      }),
    );
    await rm(file, { force: true });
  }
  async open(name: string) {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(name) }),
      );
      if (!res.Body) return null;
      return {
        body: Readable.fromWeb(
          res.Body.transformToWebStream() as Parameters<
            typeof Readable.fromWeb
          >[0],
        ),
        size: res.ContentLength ?? 0,
      };
    } catch {
      return null;
    }
  }
  async remove(name: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(name) }),
    );
  }
}

let instance: BackupStore | undefined;

export function backupStore(): BackupStore {
  if (instance) return instance;
  if (
    (process.env.STORAGE_DRIVER ?? "local") === "s3" &&
    process.env.S3_BUCKET
  ) {
    const endpoint = process.env.S3_ENDPOINT || undefined;
    const client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint,
      forcePathStyle: !!endpoint,
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
    const prefix = (process.env.BACKUP_S3_PREFIX ?? "backups/").replace(
      /^\/+/,
      "",
    );
    instance = new S3Backups(
      client,
      process.env.S3_BUCKET,
      prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix,
    );
  } else {
    instance = new LocalBackups(process.env.BACKUP_DIR ?? "./storage/backups");
  }
  return instance;
}
