import { test, expect } from "@playwright/test";
import { request as httpRequest } from "node:http";
import Sqlite from "better-sqlite3";
import { dirname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { apiUrl, createRoom, snapshot } from "./helpers";

const origin = "http://localhost:3100";
const headers = { Origin: origin };
function fixture(change: (db: Sqlite.Database) => void) {
  const path = resolve(process.env.LETS_EAT_E2E_DB!);
  if (!dirname(path).startsWith(`${resolve(tmpdir())}${sep}lets-eat-e2e-`) || !path.endsWith(`${sep}test.sqlite`)) throw new Error("Refusing to alter a non-test database");
  const db = new Sqlite(path, { timeout: 5000 });
  try { db.pragma("foreign_keys = ON"); db.transaction(() => change(db))(); }
  finally { db.close(); }
}
function upload(chunks: string[], finish = true) {
  let resolve!: (status: number) => void;
  const result = new Promise<number>((done) => { resolve = done; });
  const request = httpRequest(`${origin}/api/profile`, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" } }, (response) => {
    response.resume(); resolve(response.statusCode!);
  });
  request.on("error", () => resolve(0));
  for (const chunk of chunks) request.write(chunk);
  if (finish) request.end();
  return { request, result };
}

test("streaming upload limits cancel slow clients without holding health or leaking reader slots", async ({ request }) => {
  const stalled = Array.from({ length: 32 }, () => upload(["{"], false));
  try {
    await expect.poll(async () => (await request.put("/api/profile", { headers, data: { displayName: "Guest" } })).status()).toBe(429);
    const started = performance.now();
    expect((await request.get("/api/health")).status()).toBe(200);
    expect(performance.now() - started).toBeLessThan(1000);
    stalled[0].request.destroy(); stalled[1].request.destroy();
    await expect.poll(async () => (await request.put("/api/profile", { headers, data: { displayName: "Guest" } })).status()).toBe(401);
    expect(await Promise.all(stalled.slice(2).map((item) => item.result))).toEqual(Array(30).fill(408));
    expect((await request.put("/api/profile", { headers, data: { displayName: "Guest" } })).status()).toBe(401);
    expect(await upload(['{"displayName":"', "🍜".repeat(33_000), '"}']).result).toBe(413);
    expect((await request.put("/api/profile", { headers: { ...headers, "Content-Encoding": "gzip" }, data: "{}" })).status()).toBe(415);
  } finally { for (const { request } of stalled) request.destroy(); }
});

test("concurrent options, joins, and room creation cannot exceed durable collection limits", async ({ page, playwright }) => {
  const url = await createRoom(page, false);
  const room = await snapshot(page);
  const proposed = await Promise.all(Array.from({ length: 25 }, (_, i) => page.request.post(`${apiUrl(url)}/options`, { headers, data: { placeName: `Concurrent ${i}`, startTime: "13:00" } })));
  expect(proposed.filter((response) => response.status() === 201)).toHaveLength(19);
  expect(proposed.filter((response) => response.status() === 409)).toHaveLength(6);
  const after = await snapshot(page);
  expect(after.options).toHaveLength(20);
  for (const [i, response] of proposed.entries()) if (response.status() === 201) expect(after.options.map((option) => option.placeName)).toContain(`Concurrent ${i}`);
  fixture((db) => {
    for (let i = 0; i < 30; i++) db.prepare("INSERT INTO participants (id, room_id, token_hash, display_name, active, created_at) VALUES (?, ?, ?, 'Departed', 0, ?)").run(`limit-person-${i}`, room.room.id, `limit-identity-${i}`, Date.now());
  });
  const contexts = await Promise.all([0, 1].map(() => playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: headers })));
  const seeded: string[] = [];
  const created: string[] = [];
  try {
    const joined = await Promise.all(contexts.map((context) => context.post(`${apiUrl(url)}/participants`, { data: { displayName: "Returning coworker" } })));
    expect(joined.map((response) => response.status()).sort()).toEqual([200, 409]);
    fixture((db) => {
      expect(db.prepare("SELECT count(*) AS n FROM participants WHERE room_id = ?").get(room.room.id)).toEqual({ n: 32 });
      const active = (db.prepare("SELECT count(*) AS n FROM rooms WHERE result_json IS NULL AND deadline_at > ?").get(Date.now()) as { n: number }).n;
      for (let i = active; i < 99; i++) {
        const id = `limit-room-${i}`; seeded.push(id);
        db.prepare("INSERT INTO rooms (id, title, meal_date, area, time_zone, created_at, deadline_at) VALUES (?, 'Capacity fixture', '2027-06-01', '', 'UTC', ?, ?)").run(id, Date.now(), Date.now() + 600_000);
      }
    });
    const responses = await Promise.all(contexts.map((context) => context.post("/api/rooms", { data: { displayName: "Coworker", mealDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), timeZone: "UTC" } })));
    for (const response of responses) if (response.status() === 201) created.push((await response.json()).id);
    expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
  } finally {
    await Promise.all(contexts.map((context) => context.dispose()));
    fixture((db) => { for (const id of [...seeded, ...created]) db.prepare("DELETE FROM rooms WHERE id = ?").run(id); });
  }
});
