import { afterEach, beforeEach, expect, it } from "vitest";
import Sqlite from "better-sqlite3";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "@/server/db";
import { GET } from "@/app/api/health/route";
import { checkDatabase, schemaVersion, validateEnvironment } from "../../scripts/runtime.mjs";

let directory: string, database: ReturnType<typeof openDatabase>;
const cache = globalThis as typeof globalThis & { letsEatDatabase?: ReturnType<typeof openDatabase> };
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "lets-eat-readiness-"));
  database = openDatabase(join(directory, "test.sqlite")); cache.letsEatDatabase = database;
});
afterEach(() => { delete cache.letsEatDatabase; if (database.sqlite.open) database.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });

it("rejects empty and partially migrated databases without making schema changes", async () => {
  expect(GET().status).toBe(503);
  const migrations = join(directory, "partial"); mkdirSync(join(migrations, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")); journal.entries = journal.entries.slice(0, 2);
  writeFileSync(join(migrations, "meta", "_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries) copyFileSync(`drizzle/${entry.tag}.sql`, join(migrations, `${entry.tag}.sql`));
  migrate(database.db, { migrationsFolder: migrations });
  expect(database.sqlite.prepare("SELECT name FROM sqlite_schema WHERE name = 'rooms'").get()).toBeDefined();
  const response = GET();
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ status: "unavailable" });
  expect(database.sqlite.prepare("SELECT name FROM sqlite_schema WHERE name = 'profiles'").get()).toBeUndefined();
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get()).toEqual({ n: 2 });
});

it("checks schema and database reads, and rolls back the startup write probe", async () => {
  migrate(database.db, { migrationsFolder: "drizzle" });
  const before = database.sqlite.prepare("SELECT * FROM __drizzle_migrations").all();
  expect(GET().status).toBe(200); checkDatabase(database.sqlite, true);
  expect(database.sqlite.prepare("SELECT * FROM __drizzle_migrations").all()).toEqual(before);
  const readonly = new Sqlite(join(directory, "test.sqlite"), { readonly: true });
  try { checkDatabase(readonly); expect(() => checkDatabase(readonly, true)).toThrow(); }
  finally { readonly.close(); }
  database.sqlite.exec("DROP INDEX room_open_deadline");
  expect(GET().status).toBe(503);
  database.sqlite.close();
  const response = GET(); expect(response.status).toBe(503);
  expect(await response.text()).not.toContain(directory);
});

it("validates exact origins and refuses Render's localhost or ephemeral defaults", () => {
  expect(validateEnvironment({})).toEqual({ origin: "http://localhost:3000", databasePath: ".data/lets-eat.sqlite" });
  for (const origin of ["garbage", "https://example.com/", "https://example.com/path", "https://user:secret@example.com", "ftp://example.com"]) expect(() => validateEnvironment({ APP_ORIGIN: origin })).toThrow();
  const render = { RENDER: "true", APP_ORIGIN: "https://meal.example.com", DATABASE_PATH: "/var/data/meal.sqlite" };
  expect(validateEnvironment(render).databasePath).toBe("/var/data/meal.sqlite");
  for (const change of [{ APP_ORIGIN: "" }, { DATABASE_PATH: "" }, { DATABASE_PATH: "meal.sqlite" }, { APP_ORIGIN: "http://meal.example.com" }, { APP_ORIGIN: "https://localhost" }, { APP_ORIGIN: "https://127.0.0.1" }]) expect(() => validateEnvironment({ ...render, ...change })).toThrow();
});

it("fails startup clearly on inaccessible databases and logs only sanitized release metadata when ready", () => {
  const failed = spawnSync(process.execPath, ["scripts/check-startup.mjs"], { env: { ...process.env, APP_ORIGIN: "http://localhost:3000", DATABASE_PATH: join(directory, "not-created.sqlite") }, encoding: "utf8" });
  expect(failed.status).toBe(1); expect(failed.stderr).toContain("DATABASE_UNAVAILABLE"); expect(failed.stderr).not.toContain(directory);
  migrate(database.db, { migrationsFolder: "drizzle" });
  const ready = spawnSync(process.execPath, ["scripts/check-startup.mjs"], { env: { ...process.env, APP_ORIGIN: "http://localhost:3000", DATABASE_PATH: join(directory, "test.sqlite"), RENDER_GIT_COMMIT: "a".repeat(40) }, encoding: "utf8" });
  expect(ready.status, ready.stderr).toBe(0);
  expect(JSON.parse(ready.stdout)).toEqual({ event: "startup", status: "ready", commit: "a".repeat(40), origin: "http://localhost:3000", schema: schemaVersion });
});
