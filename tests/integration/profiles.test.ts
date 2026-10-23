import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "@/server/db";
import { ProfileService } from "@/server/profiles";
import { RoomService } from "@/server/rooms";
import { credentialFor, renewCredential, pruneExpiredProfiles } from "@/server/profile-store";
import { PROFILE_IDLE_MS, ROUND_MS } from "@/lib/contracts";

const start = Date.parse("2027-06-01T10:00:00Z");
const meal = { placeName: "Little Thai", location: "12 Main", startTime: "12:30", cuisine: "Thai", priceLevel: 1 };
const input = { displayName: "Alex", title: "Team lunch", mealDate: "2027-06-01", timeZone: "UTC", area: "Downtown", options: [meal] };
const preferences = { cuisines: ["Thai"], maxPriceLevel: 1 };
let directory: string, filename: string, now: number;
let database: ReturnType<typeof openDatabase>;
let people: ProfileService, rooms: RoomService;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "lets-eat-profiles-")); filename = join(directory, "test.sqlite");
  database = openDatabase(filename); migrate(database.db, { migrationsFolder: "drizzle" });
  now = start; people = new ProfileService(database.db, () => now); rooms = new RoomService(database.db, () => now);
});
afterEach(() => { database.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });
const count = (table: string) => (database.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
const suggestions = (hash = "alex") => people.recommendations(hash, { preferences });
function close(id: string, vote = true) {
  if (vote) rooms.respond(id, "alex", rooms.get(id, "alex").options[0].id, { choice: "approve" });
  rooms.setReady(id, "alex", { ready: true }); rooms.finish(id, "alex");
}

describe("browser profiles in SQLite", () => {
  it("creates identity and history only with a successful contribution, and isolates equal names", () => {
    expect(people.get(null)).toEqual({ profile: null, canImportLegacy: false });
    expect(() => rooms.create("alex", { ...input, options: [{ ...meal, startTime: "10:01" }] })).toThrow();
    expect(count("profiles")).toBe(0);
    const first = rooms.create("alex", input);
    rooms.get(first.id, null);
    expect(count("profiles")).toBe(1);
    const second = rooms.create("sam", input);
    expect(people.get("alex").profile?.id).not.toBe(people.get("sam").profile?.id);
    expect(people.history("alex").rooms.map((room) => room.roomId)).toEqual([first.id]);
    expect(people.history("sam").rooms.map((room) => room.roomId)).toEqual([second.id]);
    expect(() => people.idea("sam", first.id, rooms.get(first.id, "alex").options[0].id)).toThrowError(expect.objectContaining({ status: 404 }));
    expect(() => people.removeRoom("sam", first.id)).toThrowError(expect.objectContaining({ status: 404 }));
    expect(people.get(people.get("alex").profile!.id).profile).toBeNull();
  });
  it("saves defaults explicitly, applies selected inputs only on new membership, and keeps names local", () => {
    const first = rooms.create("alex", input);
    rooms.savePreferences(first.id, "alex", { ...preferences, startTime: "12:00", endTime: "13:00" });
    expect(people.get("alex").profile?.preferences.cuisines).toEqual([]);
    rooms.savePreferences(first.id, "alex", { ...preferences, startTime: "12:00", endTime: "13:00", remember: true });
    expect(people.get("alex").profile?.preferences).toEqual(preferences);
    const second = rooms.create("alex", { ...input, displayName: "Office Alex", preferences });
    expect(rooms.get(second.id, "alex").me?.preferences).toEqual({ ...preferences, startTime: null, endTime: null });
    const third = rooms.create("alex", input);
    expect(rooms.get(third.id, "alex").me?.preferences.cuisines).toEqual([]);
    people.update("alex", { displayName: "New default", cuisines: ["Italian"], maxPriceLevel: 2 });
    expect(rooms.get(first.id, "alex").me).toMatchObject({ displayName: "Alex", preferences: { cuisines: ["Thai"], startTime: "12:00" } });
    expect(rooms.get(second.id, "alex").me?.displayName).toBe("Office Alex");
    rooms.join(second.id, "sam", { displayName: "Sam", preferences });
    rooms.savePreferences(second.id, "sam", { cuisines: ["Italian"] });
    rooms.join(second.id, "sam", { displayName: "Sam", preferences });
    expect(rooms.get(second.id, "sam").me?.preferences.cuisines).toEqual(["Italian"]);
    rooms.savePreferences(first.id, "alex", { remember: true });
    expect(people.get("alex").profile?.preferences).toEqual({ cuisines: [], maxPriceLevel: null });
  });
  it("archives personal signals atomically once, retains them across rounds and database restart", () => {
    const { id } = rooms.create("alex", input);
    const optionId = rooms.get(id, "alex").options[0].id;
    rooms.respond(id, "alex", optionId, { choice: "approve" }); rooms.setReady(id, "alex", { ready: true });
    database.sqlite.exec("CREATE TRIGGER fail_capture BEFORE INSERT ON profile_rounds BEGIN SELECT RAISE(ABORT, 'capture failed'); END;");
    expect(() => rooms.finish(id, "alex")).toThrow("capture failed");
    expect(rooms.get(id, "alex").result).toBeNull(); expect(count("profile_rounds")).toBe(0);
    database.sqlite.exec("DROP TRIGGER fail_capture");
    rooms.finish(id, "alex");
    rooms.get(id, "alex"); people.history("alex"); suggestions();
    expect(count("profile_rounds")).toBe(1);
    rooms.startRound(id, "alex", { mealDate: input.mealDate, options: [{ ...meal, placeName: "New idea" }] });
    expect(count("responses")).toBe(0);
    expect(suggestions().suggestions[0]).toMatchObject({ placeName: "Little Thai", approvalRounds: 1, groupPickRounds: 1 });
    expect(people.history("alex").rooms).toHaveLength(1);
    expect(people.idea("alex", id, optionId)).toMatchObject({ placeName: "Little Thai" });
    expect(people.idea("alex", id, optionId)).not.toHaveProperty("startAt");
    database.sqlite.close(); database = openDatabase(filename);
    people = new ProfileService(database.db, () => now);
    expect(suggestions().suggestions[0].approvalRounds).toBe(1);
    expect(people.history("alex").rooms[0].previousRounds).toHaveLength(1);
  });
  it("settles expired rooms from history and captures deadline signals, including empty rounds", () => {
    const { id } = rooms.create("alex", input);
    now += ROUND_MS;
    const history = people.history("alex");
    expect(history.rooms[0]).toMatchObject({ state: "closed", result: { closedAt: start + ROUND_MS } });
    expect(count("profile_rounds")).toBe(1);
    expect(suggestions().suggestions).toEqual([]); // A no-vote suggestion is not an approved pick.
    expect(people.idea("alex", id, rooms.get(id, "alex").options[0].id).placeName).toBe("Little Thai");
  });
  it("records a group pick without inventing a silent member's personal approval", () => {
    const { id } = rooms.create("alex", input);
    rooms.join(id, "sam", { displayName: "Sam" });
    rooms.respond(id, "alex", rooms.get(id, "alex").options[0].id, { choice: "approve" });
    now += ROUND_MS; rooms.get(id, null);
    expect(suggestions("sam").suggestions[0]).toMatchObject({ approvalRounds: 0, groupPickRounds: 1 });
    expect(suggestions("alex").suggestions[0].approvalRounds).toBe(1);
  });
  it("keeps history on leaving, removes it independently, and only an explicit join restores its entry", () => {
    const { id } = rooms.create("alex", input); close(id);
    people.removeRoom("alex", id);
    expect(people.history("alex").rooms).toEqual([]); expect(suggestions().suggestions).toEqual([]);
    expect(rooms.get(id, "alex").result?.winner).not.toBeNull();
    rooms.startRound(id, "alex", { mealDate: input.mealDate, options: [meal] });
    const next = new RoomService(database.db, () => now, 2);
    next.get(id, "alex"); next.savePreferences(id, "alex", { ...preferences, remember: true });
    expect(people.history("alex").rooms).toEqual([]);
    next.join(id, "alex", { displayName: "Alex" });
    expect(people.history("alex").rooms[0].role).toBe("created");
    expect(suggestions().suggestions).toEqual([]);
    next.leave(id, "alex");
    expect(people.history("alex").rooms[0].left).toBe(true);
  });
  it("paginates own history with open rooms before closed rooms and the newest result first", () => {
    const ids = Array.from({ length: 22 }, () => rooms.create("alex", input).id);
    close(ids[0]); now += 100; close(ids[1]);
    const first = people.history("alex"); const last = people.history("alex", 20);
    expect(first.rooms).toHaveLength(20); expect(first.hasMore).toBe(true);
    expect(first.rooms.every((room) => room.state === "open")).toBe(true);
    expect(last.rooms.map((room) => room.roomId)).toEqual([ids[1], ids[0]]);
    expect(last.hasMore).toBe(false);
    expect(() => people.history("alex", -1)).toThrowError(expect.objectContaining({ status: 400 }));
  });
  it("forgets personal data without changing shared contributions and rejects credential replay", () => {
    const { id } = rooms.create("alex", input); close(id);
    const oldResult = rooms.get(id, "alex").result;
    people.forget("alex");
    for (const table of ["profiles", "profile_rooms", "profile_rounds"]) expect(count(table)).toBe(0);
    expect(count("responses")).toBe(1);
    expect(rooms.get(id, null).result).toEqual(oldResult);
    expect(credentialFor(database.db, "alex", now)).toBeNull();
    expect(people.get("alex")).toEqual({ profile: null, canImportLegacy: false });
    expect(() => people.importLegacy("alex")).toThrow();
    expect(() => rooms.create("alex", input)).toThrowError(expect.objectContaining({ code: "IDENTITY_EXPIRED" }));
    rooms.create("new-cookie", input);
    expect(people.history("new-cookie").rooms).toHaveLength(1);
  });
  it("renews active identities, expires idle profiles, and never adopts expired legacy credentials", () => {
    rooms.create("alex", input);
    now += 2 * 86400000;
    expect(renewCredential(database.db, "alex", () => now)?.expiresAt).toBe(now + PROFILE_IDLE_MS);
    now += PROFILE_IDLE_MS;
    expect(people.get("alex").profile).toBeNull();
    expect(count("profiles")).toBe(1); // Expiry is enforced before background deletion.
    database.db.transaction((tx) => pruneExpiredProfiles(tx, now), { behavior: "immediate" });
    expect(count("profiles")).toBe(0); expect(count("profile_rooms")).toBe(0);
    expect(count("participants")).toBe(1);
    expect(() => people.importLegacy("alex")).toThrow();
  });
  it("imports only matching legacy memberships once without inventing archived personal votes", () => {
    const { id } = rooms.create("alex", input); close(id);
    rooms.startRound(id, "alex", { mealDate: input.mealDate, options: [{ ...meal, placeName: "Current meal" }] });
    const next = new RoomService(database.db, () => now, 2);
    next.respond(id, "alex", next.get(id, "alex").options[0].id, { choice: "approve" });
    next.setReady(id, "alex", { ready: true }); next.finish(id, "alex");
    const unrelated = rooms.create("sam", input);
    database.sqlite.prepare("DELETE FROM profiles WHERE id = ?").run(people.get("alex").profile!.id);
    database.sqlite.prepare("UPDATE browser_credentials SET legacy_available = 1 WHERE token_hash = 'alex'").run();
    expect(people.get("alex")).toEqual({ profile: null, canImportLegacy: true });
    expect(() => people.history("alex")).toThrow();
    people.importLegacy("alex");
    const imported = people.history("alex").rooms;
    expect(imported.map((room) => room.roomId)).toEqual([id]);
    expect(imported[0].role).toBe("joined");
    expect(imported[0].previousRounds).toHaveLength(1);
    expect(imported.some((room) => room.roomId === unrelated.id)).toBe(false);
    expect(suggestions().suggestions.map((item) => item.placeName)).toEqual(["Current meal"]);
    expect(people.get("alex").profile?.preferences).toEqual({ cuisines: [], maxPriceLevel: null });
    people.removeRoom("alex", id);
    expect(() => people.importLegacy("alex")).toThrowError(expect.objectContaining({ code: "IMPORT_UNAVAILABLE" }));
    expect(people.history("alex").rooms).toEqual([]);
  });
});
