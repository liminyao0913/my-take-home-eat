import { expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "@/server/db";

it("upgrades the original schema without losing votes, identities, frozen results, or option IDs", () => {
  const directory = mkdtempSync(join(tmpdir(), "lets-eat-migration-"));
  const filename = join(directory, "test.sqlite");
  const oldMigrations = join(directory, "old-migrations");
  mkdirSync(join(oldMigrations, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  journal.entries = journal.entries.slice(0, 1);
  writeFileSync(join(oldMigrations, "meta", "_journal.json"), JSON.stringify(journal));
  copyFileSync("drizzle/0000_equal_black_tom.sql", join(oldMigrations, "0000_equal_black_tom.sql"));
  let database = openDatabase(filename);
  try {
    migrate(database.db, { migrationsFolder: oldMigrations });
    const result = JSON.stringify({ basis: "votes", winner: { id: 1, placeName: "Original meal" }, closedAt: 1000 });
    database.sqlite.prepare("INSERT INTO rooms VALUES ('room', 'Lunch', '2027-06-01', 'Downtown', 'UTC', 0, 1000, ?, 1000)").run(result);
    database.sqlite.exec("INSERT INTO participants VALUES ('person', 'room', 'identity-hash', 'Alex', 1, '[\"Thai\"]', 1, NULL, NULL, 0)");
    database.sqlite.exec("INSERT INTO options VALUES (1, 'room', 'person', 'Original meal', 'Main St', 5000, 'Thai', 1, NULL, 0)");
    database.sqlite.exec("INSERT INTO responses VALUES ('person', 1, 'approve')");
    database.sqlite.exec("UPDATE sqlite_sequence SET seq = 100 WHERE name = 'options'");
    database.sqlite.close();
    const migrated = spawnSync(process.execPath, ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_PATH: filename }, encoding: "utf8" });
    expect(migrated.status, migrated.stderr).toBe(0);
    database = openDatabase(filename);
    expect(database.sqlite.prepare("SELECT result_json, round FROM rooms").get()).toEqual({ result_json: result, round: 1 });
    expect(database.sqlite.prepare("SELECT token_hash, cuisines_json, ready FROM participants").get()).toEqual({ token_hash: "identity-hash", cuisines_json: '["Thai"]', ready: 0 });
    expect(database.sqlite.prepare("SELECT * FROM responses").all()).toEqual([{ participant_id: "person", option_id: 1, choice: "approve", reason: null }]);
    const inserted = database.sqlite.prepare("INSERT INTO options (room_id, author_id, place_name, location, start_at, cuisine, price_level, created_at) VALUES ('room', 'person', 'New idea', '', 5000, NULL, NULL, 1000)").run();
    expect(inserted.lastInsertRowid).toBe(101);
    expect(database.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(database.sqlite.pragma("foreign_key_check")).toEqual([]);
  } finally {
    if (database.sqlite.open) database.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
