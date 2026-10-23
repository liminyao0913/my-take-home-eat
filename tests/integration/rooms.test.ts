import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "@/server/db";
import { RoomService } from "@/server/rooms";
import { preferencesInput, ROUND_MS } from "@/lib/contracts";

const start = Date.parse("2027-06-01T10:00:00Z");
const option = { placeName: "Little Thai", location: "12 Main St", startTime: "12:30", cuisine: "Thai", priceLevel: 1, link: "" };
const input = { displayName: "Alex", title: "Team lunch", mealDate: "2027-06-01", area: "Downtown", timeZone: "UTC", options: [option, { ...option, placeName: "Pasta place", cuisine: "Italian" }] };
let directory: string;
let filename: string;
let database: ReturnType<typeof openDatabase>;
let service: RoomService;
let now: number;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "lets-eat-integration-"));
  filename = join(directory, "test.sqlite");
  database = openDatabase(filename);
  migrate(database.db, { migrationsFolder: "drizzle" });
  now = start;
  service = new RoomService(database.db, () => now);
});
afterEach(() => {
  database.sqlite.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("real SQLite room service", () => {
  it("creates a room before ideas are chosen and accepts only essential option details", () => {
    const { id } = service.create("alex", { displayName: "Alex", mealDate: input.mealDate, timeZone: "UTC", options: [] });
    expect(service.get(id, "alex")).toMatchObject({ state: "open", options: [], room: { round: 1 } });
    service.addOption(id, "alex", { placeName: "A first idea", startTime: "12:30" });
    expect(service.get(id, "alex").options[0]).toMatchObject({ location: "", cuisine: null, priceLevel: null });
  });
  it("finishes only after every joined participant explicitly marks ready and someone confirms", () => {
    const { id } = service.create("alex", input);
    service.join(id, "sam", { displayName: "Sam" });
    service.savePreferences(id, "alex", { cuisines: ["Thai"] });
    const meal = service.get(id, "sam").options[0].id;
    service.respond(id, "sam", meal, { choice: "approve" });
    expect(service.get(id, "alex").participants.every((p) => p.responded)).toBe(true);
    service.setReady(id, "alex", { ready: true });
    expect(() => service.finish(id, "alex")).toThrowError(expect.objectContaining({ code: "NOT_READY" }));
    service.setReady(id, "sam", { ready: true });
    expect(service.get(id, "sam").state).toBe("open");
    expect(() => service.finish(id, null)).toThrowError(expect.objectContaining({ status: 401 }));
    now += 1000;
    service.finish(id, "sam");
    const closed = service.get(id, "alex");
    expect(closed.result).toMatchObject({ winner: { id: meal }, closedAt: now, closedEarly: true });
    expect(closed.room.deadlineAt).toBe(start + ROUND_MS);
    expect(() => service.respond(id, "alex", meal, { choice: "block" })).toThrowError(expect.objectContaining({ code: "ROOM_CLOSED" }));
  });
  it("invalidates readiness when options or a person's own inputs change", () => {
    const { id } = service.create("alex", input);
    service.join(id, "sam", { displayName: "Sam" });
    for (const person of ["alex", "sam"]) service.setReady(id, person, { ready: true });
    service.savePreferences(id, "alex", { cuisines: ["Thai"] });
    expect(Object.fromEntries(service.get(id, "alex").participants.map((p) => [p.displayName, p.ready]))).toEqual({ Alex: false, Sam: true });
    service.setReady(id, "alex", { ready: true });
    service.addOption(id, "sam", { ...option, placeName: "New alternative" });
    expect(service.get(id, "alex").participants.every((p) => !p.ready)).toBe(true);
    for (const person of ["alex", "sam"]) service.setReady(id, person, { ready: true });
    service.join(id, "lee", { displayName: "Lee" });
    expect(() => service.finish(id, "alex")).toThrowError(expect.objectContaining({ code: "NOT_READY" }));
  });
  it("shares optional block-reason counts and clears reasons when the response changes", () => {
    const { id } = service.create("alex", input);
    const meal = service.get(id, "alex").options[0].id;
    service.respond(id, "alex", meal, { choice: "block", reason: "Over budget" });
    expect(service.get(id, null).options[0].blockReasons).toEqual([{ reason: "Over budget", count: 1 }]);
    expect(service.get(id, "alex").me?.blockReasons).toEqual({ [meal]: "Over budget" });
    expect(() => service.respond(id, "alex", meal, { choice: "block", reason: "Invalid tag" })).toThrow();
    expect(() => service.respond(id, "alex", meal, { choice: "approve", reason: "Over budget" })).toThrow();
    service.respond(id, "alex", meal, { choice: "approve" });
    expect(service.get(id, "alex").options[0]).toMatchObject({ approvalCount: 1, blockCount: 0, blockReasons: [] });
    expect(service.get(id, "alex").me?.blockReasons).toEqual({});
  });
  it("starts a fresh round in the same room with retained people and preferences, and rejects stale writes", () => {
    const { id } = service.create("alex", input);
    service.join(id, "sam", { displayName: "Sam" });
    service.savePreferences(id, "sam", { cuisines: ["Italian"] });
    const before = service.get(id, "sam");
    for (const meal of before.options) service.respond(id, "alex", meal.id, { choice: "block", reason: "Too far" });
    const next = { mealDate: input.mealDate, options: [{ ...option, placeName: "A closer place" }] };
    expect(() => service.startRound(id, "sam", next)).toThrowError(expect.objectContaining({ code: "ROUND_OPEN" }));
    now += ROUND_MS;
    const closed = service.get(id, "sam").result;
    expect(() => service.startRound(id, "outsider", next)).toThrowError(expect.objectContaining({ status: 401 }));
    expect(() => service.startRound(id, "sam", { ...next, options: [{ ...option, startTime: "10:15" }] })).toThrow();
    expect(service.get(id, "sam").result).toEqual(closed);
    service.startRound(id, "sam", next);
    const after = service.get(id, "sam");
    expect(after).toMatchObject({ state: "open", result: null, room: { id, round: 2, deadlineAt: now + ROUND_MS }, me: { id: before.me!.id, preferences: { cuisines: ["Italian"] }, choices: {}, blockReasons: {} } });
    expect(after.participants.map((p) => p.id)).toEqual(before.participants.map((p) => p.id));
    expect(after.participants.every((p) => !p.ready)).toBe(true);
    expect(after.options).toHaveLength(1);
    expect(after.options[0]).toMatchObject({ placeName: "A closer place", approvalCount: 0, blockCount: 0 });
    expect(after.previousRounds[0].result).toEqual(closed);
    expect(() => service.savePreferences(id, "sam", {})).toThrowError(expect.objectContaining({ code: "STALE_ROUND" }));
    expect(() => service.startRound(id, "sam", next)).toThrowError(expect.objectContaining({ code: "STALE_ROUND" }));
    const secondRound = new RoomService(database.db, () => now, 2);
    secondRound.respond(id, "sam", after.options[0].id, { choice: "approve" });
    database.sqlite.close(); database = openDatabase(filename);
    const restored = new RoomService(database.db, () => now, 2).get(id, "sam");
    expect(restored.options[0].approvalCount).toBe(1);
    expect(restored.previousRounds[0].result).toEqual(closed);
  });
  it("creates atomically with a fixed deadline, and rolls back invalid creation", () => {
    expect(() => service.create("alex", { ...input, options: [option, { ...option, startTime: "10:05" }] })).toThrow();
    expect(database.sqlite.prepare("select count(*) as count from rooms").get()).toEqual({ count: 0 });
    const { id } = service.create("alex", input);
    expect(service.get(id, "alex")).toMatchObject({ room: { createdAt: start, deadlineAt: start + ROUND_MS }, participants: [{ displayName: "Alex" }], state: "open" });
  });
  it("rejects invalid date, zone and unsafe links", () => {
    for (const change of [{ mealDate: "2027-02-30" }, { timeZone: "Never/Land" }, { options: [{ ...option, link: "javascript:alert(1)" }] }]) {
      expect(() => service.create("alex", { ...input, ...change })).toThrow();
    }
    expect(database.sqlite.prepare("select count(*) as count from rooms").get()).toEqual({ count: 0 });
  });
  it("keeps joins and votes idempotent and approve/block mutually exclusive", () => {
    const { id } = service.create("alex", input);
    service.join(id, "sam", { displayName: "Sam" });
    service.join(id, "sam", { displayName: "Sam" });
    const meal = service.get(id, "sam").options[0].id;
    service.respond(id, "sam", meal, { choice: "approve" });
    service.respond(id, "sam", meal, { choice: "approve" });
    expect(service.get(id, "sam").options[0]).toMatchObject({ approvalCount: 1, blockCount: 0 });
    service.respond(id, "sam", meal, { choice: "block" });
    expect(service.get(id, "sam").options[0]).toMatchObject({ approvalCount: 0, blockCount: 1 });
    service.respond(id, "sam", meal, { choice: null });
    const snapshot = service.get(id, "sam");
    expect(snapshot.participants.map((p) => p.displayName).sort()).toEqual(["Alex", "Sam"]);
    expect(snapshot.me?.choices).toEqual({});
  });
  it("checks identity, ownership, and cross-room scoping", () => {
    const { id } = service.create("alex", input);
    const second = service.create("alex", input);
    service.join(id, "sam", { displayName: "Sam" });
    const own = service.get(id, "alex").options[0].id;
    const other = service.get(second.id, "alex").options[0].id;
    expect(() => service.respond(id, null, own, { choice: "approve" })).toThrowError(expect.objectContaining({ status: 401 }));
    expect(() => service.removeOption(id, "sam", own)).toThrowError(expect.objectContaining({ status: 403 }));
    expect(() => service.respond(id, "alex", other, { choice: "approve" })).toThrowError(expect.objectContaining({ status: 404 }));
    expect(() => service.removeOption(id, "alex", other)).toThrowError(expect.objectContaining({ status: 404 }));
  });
  it("returns only the caller's private inputs and no token hashes", () => {
    const { id } = service.create("secret-token-hash", input);
    service.join(id, "sam", { displayName: "Sam" });
    service.savePreferences(id, "secret-token-hash", { cuisines: ["Thai"], maxPriceLevel: 1 });
    const publicSnapshot = service.get(id, null);
    expect(publicSnapshot.me).toBeNull();
    expect(publicSnapshot.participants.find((p) => p.displayName === "Alex")).toEqual({ id: expect.any(String), displayName: "Alex", ready: false, responded: true });
    expect(JSON.stringify(publicSnapshot)).not.toMatch(/tokenHash|secret-token-hash|maxPriceLevel|preferredStartMinute/);
    expect(service.get(id, "sam").me?.preferences).toEqual(preferencesInput.parse({}));
  });
  it("leaves without removing proposals and rejoins with cleared inputs", () => {
    const { id } = service.create("alex", input);
    service.savePreferences(id, "alex", { cuisines: ["Thai"] });
    const before = service.get(id, "alex");
    service.respond(id, "alex", before.options[0].id, { choice: "block" });
    service.leave(id, "alex");
    expect(service.get(id, "alex")).toMatchObject({ participants: [], me: null, options: [{ blockCount: 0 }, { blockCount: 0 }] });
    service.join(id, "alex", { displayName: "Alex again" });
    expect(service.get(id, "alex").me).toEqual({ id: before.me?.id, displayName: "Alex again", preferences: preferencesInput.parse({}), choices: {}, blockReasons: {}, ready: false });
  });
  it("deletes an option's responses and gives a replacement a new order", () => {
    const { id } = service.create("alex", input);
    const meal = service.get(id, "alex").options[0].id;
    service.respond(id, "alex", meal, { choice: "approve" });
    service.removeOption(id, "alex", meal);
    service.addOption(id, "alex", option);
    expect(database.sqlite.prepare("select count(*) as count from responses").get()).toEqual({ count: 0 });
    const replacement = service.get(id, "alex").options[1];
    expect(replacement.id).toBeGreaterThan(meal);
    expect(replacement.approvalCount).toBe(0);
  });
  it("preserves saved preferences on a partial or reversed time window", () => {
    const { id } = service.create("alex", input);
    service.savePreferences(id, "alex", { cuisines: ["Thai"] });
    for (const window of [{ startTime: "12:00" }, { startTime: "13:00", endTime: "12:00" }]) expect(() => service.savePreferences(id, "alex", window)).toThrow();
    expect(service.get(id, "alex").me?.preferences.cuisines).toEqual(["Thai"]);
  });
  it("admits before cutoff, rejects at cutoff, and commits a result before returning the error", () => {
    const { id } = service.create("alex", input);
    const meal = service.get(id, "alex").options[1].id;
    now = start + ROUND_MS - 1;
    service.respond(id, "alex", meal, { choice: "approve" });
    now++;
    expect(() => service.respond(id, "alex", meal, { choice: "block" })).toThrowError(expect.objectContaining({ status: 409 }));
    const row = database.sqlite.prepare("select result_json from rooms where id = ?").get(id) as { result_json: string };
    expect(JSON.parse(row.result_json)).toMatchObject({ winner: { id: meal, approvalCount: 1, blockCount: 0 }, closedAt: now });
    for (const write of [
      () => service.join(id, "new", { displayName: "New" }), () => service.savePreferences(id, "alex", {}),
      () => service.addOption(id, "alex", option), () => service.removeOption(id, "alex", meal), () => service.leave(id, "alex"),
    ]) expect(write).toThrowError(expect.objectContaining({ status: 409 }));
  });
  it("keeps one stored result across independent connections and a database restart", () => {
    const { id } = service.create("alex", input);
    now += ROUND_MS;
    const other = openDatabase(filename);
    try {
      const a = service.get(id, "alex");
      const b = new RoomService(other.db, () => now + 100).get(id, "alex");
      expect(b.result).toEqual(a.result);
      database.sqlite.close();
      database = openDatabase(filename);
      expect(new RoomService(database.db, () => now + 200).get(id, "alex").result).toEqual(a.result);
    } finally { other.sqlite.close(); }
  });
  it("checks the clock after a lock wait that crosses the deadline", async () => {
    const { id } = service.create("alex", input);
    const meal = service.get(id, "alex").options[0].id;
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      const Sqlite = require('better-sqlite3');
      const db = new Sqlite(workerData.filename);
      db.exec('BEGIN IMMEDIATE');
      const deadline = Date.now() + 200;
      db.prepare('UPDATE rooms SET deadline_at = ? WHERE id = ?').run(deadline, workerData.id);
      parentPort.postMessage(deadline);
      setTimeout(() => { db.exec('COMMIT'); db.close(); }, 400);
    `, { eval: true, workerData: { filename, id } });
    const exited = once(worker, "exit");
    const [deadline] = await once(worker, "message");
    expect(Date.now()).toBeLessThan(deadline);
    expect(() => new RoomService(database.db).respond(id, "alex", meal, { choice: "approve" })).toThrowError(expect.objectContaining({ status: 409 }));
    await exited;
    expect(new RoomService(database.db).get(id, "alex")).toMatchObject({ state: "closed", options: [{ approvalCount: 0 }, { approvalCount: 0 }] });
  });
});
