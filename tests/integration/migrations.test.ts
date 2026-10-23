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
    expect(database.sqlite.prepare("SELECT token_hash, profile_id, legacy_available FROM browser_credentials").all()).toEqual([{ token_hash: "identity-hash", profile_id: null, legacy_available: 1 }]);
    expect(database.sqlite.prepare("SELECT * FROM profiles").all()).toEqual([]);
    expect(database.sqlite.prepare("SELECT * FROM profile_rooms").all()).toEqual([]);
    const inserted = database.sqlite.prepare("INSERT INTO options (room_id, author_id, place_name, location, start_at, cuisine, price_level, created_at) VALUES ('room', 'person', 'New idea', '', 5000, NULL, NULL, 1000)").run();
    expect(inserted.lastInsertRowid).toBe(101);
    expect(database.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(database.sqlite.pragma("foreign_key_check")).toEqual([]);
  } finally {
    if (database.sqlite.open) database.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it("adds optional invitations to populated rooms and backfills only a recorded creator", () => {
  const directory = mkdtempSync(join(tmpdir(), "lets-eat-invitation-migration-"));
  const filename = join(directory, "test.sqlite");
  const oldMigrations = join(directory, "old-migrations");
  mkdirSync(join(oldMigrations, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  journal.entries = journal.entries.slice(0, 4);
  writeFileSync(join(oldMigrations, "meta", "_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries) copyFileSync(`drizzle/${entry.tag}.sql`, join(oldMigrations, `${entry.tag}.sql`));
  let database = openDatabase(filename);
  try {
    migrate(database.db, { migrationsFolder: oldMigrations });
    database.sqlite.exec(`
      INSERT INTO rooms (id, title, meal_date, area, time_zone, created_at, deadline_at) VALUES
        ('known', 'Known organizer', '2027-06-01', '', 'UTC', 0, 1000),
        ('legacy', 'Unknown organizer', '2027-06-01', '', 'UTC', 0, 1000);
      INSERT INTO participants (id, room_id, token_hash, display_name, created_at) VALUES
        ('owner', 'known', 'owner-hash', 'Owner', 1), ('guest', 'known', 'guest-hash', 'Earlier guest', 0),
        ('unknown', 'legacy', 'unknown-hash', 'First person', 0);
      INSERT INTO profiles (id, display_name, created_at) VALUES ('profile', 'Owner', 0);
      INSERT INTO profile_rooms (profile_id, room_id, participant_id, role) VALUES ('profile', 'known', 'owner', 'created');
      INSERT INTO options (id, room_id, author_id, place_name, location, start_at, created_at) VALUES (7, 'known', 'owner', 'Thai', '', 5000, 0);
      INSERT INTO responses (participant_id, option_id, choice) VALUES ('guest', 7, 'approve');
    `);
    database.sqlite.close();
    const migrated = spawnSync(process.execPath, ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_PATH: filename }, encoding: "utf8" });
    expect(migrated.status, migrated.stderr).toBe(0);
    database = openDatabase(filename);
    expect(database.sqlite.prepare("SELECT id, expected_participants, organizer_participant_id FROM rooms ORDER BY id").all()).toEqual([
      { id: "known", expected_participants: null, organizer_participant_id: "owner" },
      { id: "legacy", expected_participants: null, organizer_participant_id: null },
    ]);
    expect(database.sqlite.prepare("SELECT count(*) AS n FROM responses").get()).toEqual({ n: 1 });
    expect(database.sqlite.prepare("SELECT count(*) AS n FROM participants").get()).toEqual({ n: 3 });
    expect(() => database.sqlite.exec("UPDATE rooms SET expected_participants = 33")).toThrow();
    expect(database.sqlite.pragma("foreign_key_check")).toEqual([]);
    database.sqlite.prepare("DELETE FROM rooms WHERE id = 'known'").run();
    expect(database.sqlite.prepare("SELECT count(*) AS n FROM participants").get()).toEqual({ n: 1 });
    expect(database.sqlite.pragma("foreign_key_check")).toEqual([]);
  } finally {
    if (database.sqlite.open) database.sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
