import Sqlite from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const filename = resolve(process.env.DATABASE_PATH || ".data/lets-eat.sqlite");
mkdirSync(dirname(filename), { recursive: true });
const sqlite = new Sqlite(filename);
try {
  // Table rebuilds must not cascade-delete child rows while migrations copy data.
  sqlite.pragma("foreign_keys = OFF");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = FULL");
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.pragma("foreign_keys = ON");
  if (sqlite.pragma("foreign_key_check").length) throw new Error("Database migration failed its foreign-key check.");
  console.log("Database migrations applied.");
} finally { sqlite.close(); }
