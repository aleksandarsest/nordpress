import postgres from "postgres";
import { config } from "./config.ts";

// The platform's own data: accounts, sites and invite codes.

export const sql = postgres(config.databaseUrl, { max: 5, onnotice: () => {} });

export type Account = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  created_at: Date;
};
export type Site = {
  id: number;
  account_id: number;
  subdomain: string;
  title: string;
  status: "creating" | "active" | "failed" | "deleting";
  error: string | null;
  db_password: string;
  auth_secret: string;
  internal_token: string;
  cron_secret: string;
  created_at: Date;
};

export async function migrate() {
  await sql`
    create table if not exists accounts (
      id bigserial primary key,
      email text not null unique,
      password_hash text not null,
      created_at timestamptz not null default now()
    )`;
  await sql`
    create table if not exists sites (
      id bigserial primary key,
      account_id bigint not null references accounts(id) on delete cascade,
      subdomain text not null unique,
      title text not null,
      status text not null default 'creating',
      error text,
      db_password text not null,
      auth_secret text not null,
      internal_token text not null,
      cron_secret text not null,
      created_at timestamptz not null default now()
    )`;
  await sql`
    create table if not exists invites (
      code text primary key,
      uses_left integer not null default 1,
      note text not null default '',
      created_at timestamptz not null default now()
    )`;
  await sql`alter table accounts add column if not exists name text not null default ''`;
  await sql`
    create table if not exists domains (
      domain text primary key,
      site_id bigint not null unique references sites(id) on delete cascade,
      status text not null default 'pending',
      www boolean not null default false,
      error text,
      created_at timestamptz not null default now()
    )`;
}

/** A site's own domain: "pending" until its DNS points here and it has a certificate. */
export type Domain = {
  domain: string;
  site_id: number;
  status: "pending" | "active";
  www: boolean;
  error: string | null;
  created_at: Date;
};
