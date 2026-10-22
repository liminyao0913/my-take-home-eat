import "server-only";
import Sqlite from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

export function openDatabase(filename: string) {
  mkdirSync(dirname(resolve(filename)), { recursive: true });
  const sqlite = new Sqlite(filename, { timeout: 5000 });
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = FULL");
  return { db: drizzle(sqlite, { schema }), sqlite };
}

export type Database = ReturnType<typeof openDatabase>["db"];
const cache = globalThis as typeof globalThis & { letsEatDatabase?: ReturnType<typeof openDatabase> };

export function getDatabase() {
  return cache.letsEatDatabase ??= openDatabase(process.env.DATABASE_PATH || ".data/lets-eat.sqlite");
}
