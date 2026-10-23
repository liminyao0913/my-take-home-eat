import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import { once } from "node:events";
import { NextRequest } from "next/server";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "@/server/db";
import { RoomService } from "@/server/rooms";
import { ProfileService } from "@/server/profiles";
import { renewCredential, pruneExpiredProfiles } from "@/server/profile-store";
import { PUT } from "@/app/api/rooms/[roomId]/participants/me/ready/route";
import { GET as getRoom } from "@/app/api/rooms/[roomId]/route";
import { GET as getProfile } from "@/app/api/profile/route";
import { handle } from "@/server/http";

const token = "a".repeat(64);
const hash = createHash("sha256").update(token).digest("hex");
const start = Date.parse("2027-06-01T10:00:00Z");
const input = { displayName: "Alex", mealDate: "2027-06-01", timeZone: "UTC", options: [{ placeName: "Thai", startTime: "12:30" }] };
const cache = globalThis as typeof globalThis & { letsEatDatabase?: ReturnType<typeof openDatabase> };
let directory: string, database: ReturnType<typeof openDatabase>, service: RoomService, profiles: ProfileService;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "lets-eat-auth-"));
  database = openDatabase(join(directory, "test.sqlite"));
  migrate(database.db, { migrationsFolder: "drizzle" });
  cache.letsEatDatabase = database;
  vi.spyOn(Date, "now").mockReturnValue(start);
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  service = new RoomService(database.db); profiles = new ProfileService(database.db);
});
afterEach(() => {
  delete cache.letsEatDatabase;
  database.sqlite.close(); rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});

it("revokes existing participant authority and private snapshots immediately on forgetting", () => {
  const { id } = service.create(hash, { ...input, expectedParticipants: 4 });
  const option = service.get(id, hash).options[0].id;
  profiles.forget(hash);
  const writes = [
    () => service.savePreferences(id, hash, {}), () => service.respond(id, hash, option, { choice: "approve" }),
    () => service.addOption(id, hash, input.options[0]), () => service.removeOption(id, hash, option),
    () => service.setReady(id, hash, { ready: true }), () => service.leave(id, hash),
    () => service.finish(id, hash), () => service.finish(id, hash, { overrideMissing: true }), () => service.startRound(id, hash, input),
    () => service.join(id, hash, { displayName: "Alex" }),
    () => profiles.update(hash, { displayName: "Alex" }), () => profiles.removeRoom(hash, id),
  ];
  for (const write of writes) expect(write).toThrowError(expect.objectContaining({ status: 401 }));
  expect(service.get(id, hash).me).toBeNull();
  expect(service.get(id, null).participants).toHaveLength(1);
});

it("does not carry authorization across a delayed request body", async () => {
  const { id } = service.create(hash, input);
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const request = new NextRequest(`http://localhost:3000/api/rooms/${id}/participants/me/ready`, {
    method: "PUT", headers: { origin: "http://localhost:3000", cookie: `lets_eat_guest=${token}`, "Content-Type": "application/json" },
    body: new ReadableStream({ start(controller) { stream = controller; } }), duplex: "half",
  } as ConstructorParameters<typeof NextRequest>[1]);
  const pending = PUT(request, { params: Promise.resolve({ roomId: id }) });
  await new Promise((resolve) => setImmediate(resolve));
  profiles.forget(hash);
  stream.enqueue(new TextEncoder().encode('{"ready":true}')); stream.close();
  expect((await pending).status).toBe(401);
  expect(service.get(id, null).participants[0].ready).toBe(false);
});

it("rejects expired credentials without waiting for physical cleanup", () => {
  const { id } = service.create(hash, input);
  database.sqlite.prepare("UPDATE browser_credentials SET expires_at = ? WHERE token_hash = ?").run(start, hash);
  expect(() => service.setReady(id, hash, { ready: true })).toThrowError(expect.objectContaining({ status: 401 }));
  expect(service.get(id, hash).me).toBeNull();
  expect(profiles.get(hash).profile).toBeNull();
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM profiles").get()).toEqual({ n: 1 });
});

it("keeps reads available during an external write lock and returns retryable 503 for a write", async () => {
  const { id } = service.create(hash, input);
  const other = openDatabase(join(directory, "test.sqlite"));
  other.sqlite.exec("BEGIN IMMEDIATE");
  const headers = { origin: "http://localhost:3000", cookie: `lets_eat_guest=${token}` };
  try {
    expect((await getRoom(new NextRequest(`http://localhost:3000/api/rooms/${id}`, { headers }), { params: Promise.resolve({ roomId: id }) })).status).toBe(200);
    expect((await getProfile(new NextRequest("http://localhost:3000/api/profile", { headers }))).status).toBe(200);
    const started = performance.now();
    const response = await PUT(new NextRequest(`http://localhost:3000/api/rooms/${id}/participants/me/ready`, { method: "PUT", headers, body: '{"ready":true}' }), { params: Promise.resolve({ roomId: id }) });
    expect(response.status).toBe(503); expect(response.headers.get("retry-after")).toBe("1");
    expect(performance.now() - started).toBeLessThan(500);
  } finally { other.sqlite.exec("ROLLBACK"); other.sqlite.close(); }
});

it.each(["room", "profile", "renewal"])("rechecks %s authority after waiting for SQLite's write lock", async (operation) => {
  const { id } = service.create(hash, input);
  database.sqlite.pragma("busy_timeout = 1000");
  database.sqlite.prepare("UPDATE browser_credentials SET expires_at = ?").run(start + 1);
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const db = new (require('better-sqlite3'))(workerData.filename);
    db.exec('BEGIN IMMEDIATE');
    db.prepare('UPDATE browser_credentials SET expires_at = ?').run(workerData.expiry);
    parentPort.postMessage('locked');
    setTimeout(() => { db.exec('COMMIT'); db.close(); }, 200);
  `, { eval: true, workerData: { filename: join(directory, "test.sqlite"), expiry: start } });
  const exited = once(worker, "exit");
  await once(worker, "message");
  if (operation === "renewal") expect(renewCredential(database.db, hash)).toBeNull();
  else expect(() => operation === "room" ? service.setReady(id, hash, { ready: true }) : profiles.update(hash, { displayName: "Changed" })).toThrowError(expect.objectContaining({ status: 401 }));
  await exited;
  expect(service.get(id, hash).me).toBeNull();
  expect(database.sqlite.prepare("SELECT expires_at FROM browser_credentials WHERE token_hash = ?").get(hash)).toEqual({ expires_at: start });
});

it("prunes at most 100 children per pass before deleting a profile, retaining its revoked hash", () => {
  const { id } = service.create(hash, input);
  const profile = profiles.get(hash).profile!;
  const insert = database.sqlite.prepare("INSERT INTO profile_rounds (profile_id, room_id, round, closed_at, area, signals_json) VALUES (?, ?, ?, ?, '', '[]')");
  database.sqlite.transaction(() => { for (let i = 1; i <= 250; i++) insert.run(profile.id, id, i, start); })();
  database.sqlite.prepare("UPDATE browser_credentials SET expires_at = ?").run(start);
  for (const remaining of [150, 50, 0]) {
    database.db.transaction((tx) => pruneExpiredProfiles(tx, start), { behavior: "immediate" });
    expect(database.sqlite.prepare("SELECT count(*) AS n FROM profile_rounds").get()).toEqual({ n: remaining });
    expect(database.sqlite.prepare("SELECT count(*) AS n FROM profiles").get()).toEqual({ n: remaining ? 1 : 0 });
  }
  expect(database.sqlite.prepare("SELECT profile_id, legacy_available FROM browser_credentials WHERE token_hash = ?").get(hash)).toEqual({ profile_id: null, legacy_available: 0 });
  expect(() => service.create(hash, input)).toThrowError(expect.objectContaining({ status: 401 }));
});

it("logs only a route template, status, timing, code, and generated correlation ID", async () => {
  const logs = vi.spyOn(console, "info").mockImplementation(() => {});
  const request = new NextRequest("http://localhost:3000/api/rooms/private-room-id/options/123/response?private=query", {
    method: "PUT", headers: { origin: "http://localhost:3000", cookie: "secret-cookie", "X-Request-Id": "untrusted-id" }, body: '{"private":"preference"}',
  });
  const response = await handle(request, () => { throw new Error("SELECT private data: secret-cookie"); });
  const record = JSON.parse(logs.mock.calls[0][0]);
  expect(record).toEqual({ requestId: expect.any(String), route: "/api/rooms/:roomId/options/:optionId/response", status: 500, durationMs: expect.any(Number), code: "SERVER_ERROR" });
  expect(record.requestId).toBe(response.headers.get("X-Request-Id"));
  expect(JSON.stringify(record)).not.toMatch(/private|secret-cookie|SELECT|untrusted/);
});
