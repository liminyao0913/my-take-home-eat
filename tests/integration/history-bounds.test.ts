import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "@/server/db";
import { RoomService } from "@/server/rooms";
import { ProfileService } from "@/server/profiles";
import { ROUND_MS, type PersonalRound } from "@/lib/contracts";
import { recommend } from "@/lib/recommendations";

const start = Date.parse("2027-06-01T10:00:00Z");
const meal = { placeName: "Little Thai", location: "Main St", startTime: "12:30", cuisine: "Thai", priceLevel: 1 };
const input = { displayName: "Alex", title: "Team lunch", mealDate: "2027-06-01", timeZone: "UTC", area: "Downtown", options: [meal] };
let directory: string, database: ReturnType<typeof openDatabase>, rooms: RoomService, profiles: ProfileService, now: number;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "lets-eat-history-")); database = openDatabase(join(directory, "test.sqlite"));
  migrate(database.db, { migrationsFolder: "drizzle" });
  now = start; rooms = new RoomService(database.db, () => now); profiles = new ProfileService(database.db, () => now);
});
afterEach(() => { vi.restoreAllMocks(); database.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });
function finish(id: string, round = 1) {
  const service = new RoomService(database.db, () => now, round);
  service.respond(id, "alex", service.get(id, "alex").options[0].id, { choice: "approve" });
  service.setReady(id, "alex", { ready: true }); service.finish(id, "alex");
}

it("keeps summary query count and response size bounded with 20 versus 2,000 rooms", () => {
  const { id } = rooms.create("alex", input); finish(id);
  const profileId = profiles.get("alex").profile!.id;
  function seed(from: number, through: number) {
    database.sqlite.transaction(() => {
      for (let i = from; i < through; i++) {
        const roomId = `history-${String(i).padStart(5, "0")}`;
        database.sqlite.prepare("INSERT INTO rooms (id, title, meal_date, area, time_zone, created_at, deadline_at, result_json, resolved_at) SELECT ?, title, meal_date, area, time_zone, created_at, deadline_at, result_json, resolved_at FROM rooms WHERE id = ?").run(roomId, id);
        database.sqlite.prepare("INSERT INTO participants (id, room_id, token_hash, display_name, created_at) VALUES (?, ?, 'alex', 'Alex', ?)").run(roomId, roomId, start);
        database.sqlite.prepare("INSERT INTO profile_rooms (profile_id, room_id, participant_id, role) VALUES (?, ?, ?, 'created')").run(profileId, roomId, roomId);
      }
    })();
  }
  seed(1, 20);
  const prepare = vi.spyOn(database.sqlite, "prepare");
  const snapshot = vi.spyOn(RoomService.prototype, "get");
  const small = profiles.history("alex"); const smallQueries = prepare.mock.calls.length;
  expect(small.rooms).toHaveLength(20); expect(small.hasMore).toBe(false);
  seed(20, 2000); prepare.mockClear();
  const large = profiles.history("alex");
  expect(prepare.mock.calls.length).toBe(smallQueries);
  expect(snapshot).not.toHaveBeenCalled();
  expect(large.rooms).toHaveLength(20); expect(large.hasMore).toBe(true);
  for (const page of [small, large]) {
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(8000);
    for (const room of page.rooms) { expect(room).not.toHaveProperty("ideas"); expect(room).not.toHaveProperty("previousRounds"); expect(room).not.toHaveProperty("options"); }
  }
  expect(profiles.history("alex", 0, 3).rooms).toHaveLength(3);
  expect(() => profiles.history("alex", 0, 21)).toThrowError(expect.objectContaining({ status: 400 }));
});

it("paginates all 100 rounds and private reuse ideas without including archives in room polls", () => {
  const { id } = rooms.create("alex", input);
  const firstOption = rooms.get(id, "alex").options[0].id;
  for (let round = 1; round <= 100; round++) {
    finish(id, round);
    if (round < 100) new RoomService(database.db, () => now, round).startRound(id, "alex", { mealDate: input.mealDate, options: [{ ...meal, placeName: `Meal ${round + 1}` }] });
  }
  const poll = rooms.get(id, "alex");
  expect(poll.archiveCount).toBe(99); expect(poll).not.toHaveProperty("previousRounds");
  expect(Buffer.byteLength(JSON.stringify(poll))).toBeLessThan(3000);
  const archived: number[] = [], reusable: number[] = [];
  let before: number | undefined;
  do {
    const page = rooms.archive(id, before);
    expect(page.rounds.length).toBeLessThanOrEqual(10);
    archived.push(...page.rounds.map((round) => round.round)); before = page.nextBeforeRound ?? undefined;
  } while (before);
  do {
    const page = profiles.ideas("alex", id, before);
    expect(new Set(page.ideas.map((idea) => idea.round)).size).toBeLessThanOrEqual(10);
    reusable.push(...page.ideas.map((idea) => idea.round)); before = page.nextBeforeRound ?? undefined;
  } while (before);
  expect(archived).toEqual(Array.from({ length: 99 }, (_, i) => 99 - i));
  expect(reusable).toEqual(Array.from({ length: 100 }, (_, i) => 100 - i));
  expect(profiles.idea("alex", id, firstOption).placeName).toBe("Little Thai");
  profiles.removeRoom("alex", id);
  expect(() => profiles.ideas("alex", id)).toThrowError(expect.objectContaining({ status: 404 }));
  expect(() => profiles.idea("alex", id, firstOption)).toThrowError(expect.objectContaining({ status: 404 }));
  expect(rooms.archive(id).rounds).toHaveLength(10);
  profiles.forget("alex");
  expect(() => profiles.ideas("alex", id)).toThrowError(expect.objectContaining({ status: 401 }));
});

it("settles only the selected history page and the 20 newest eligible recommendation rounds", () => {
  const ids = Array.from({ length: 60 }, (_, i) => rooms.create("alex", { ...input, options: [{ ...meal, placeName: `Meal ${i}` }] }).id);
  const reference: PersonalRound[] = [];
  for (const [i, id] of ids.entries()) {
    const option = rooms.get(id, "alex").options[0];
    if (i % 3) rooms.respond(id, "alex", option.id, { choice: "approve" });
    // Ties exercise stable room-id ordering; the newest 20 include empty rounds.
    const closedAt = start + Math.floor(i / 3) * 1000;
    database.sqlite.prepare("UPDATE rooms SET deadline_at = ? WHERE id = ?").run(closedAt, id);
    reference.push({ roomId: id, round: 1, closedAt, area: "Downtown", signals: i % 3 ? [{ sourceOptionId: option.id, placeName: option.placeName, location: option.location, cuisine: option.cuisine, priceLevel: option.priceLevel, link: option.link, approved: true, groupPick: true }] : [] });
  }
  now += ROUND_MS;
  const recent = profiles.history("alex", 0, 3);
  expect(recent.rooms).toHaveLength(3);
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM rooms WHERE result_json IS NOT NULL").get()).toEqual({ n: 3 });
  const result = profiles.recommendations("alex", { preferences: { cuisines: ["Thai"], maxPriceLevel: 1 } });
  expect(result).toEqual(recommend(reference, { cuisines: ["Thai"], maxPriceLevel: 1 }, "", false, now));
  expect(database.sqlite.prepare("SELECT count(*) AS n FROM rooms WHERE result_json IS NOT NULL").get()).toEqual({ n: 23 });
});
