import { test, expect } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { card, createRoom, deadline, expectWinner, joinRoom, snapshot } from "./helpers";

test("an unaccelerated ten-minute round selects the meal across two sessions", async ({ page, browser }) => {
  test.skip(process.env.RUN_REAL_DEADLINE !== "1", "Run with npm run test:e2e:release to verify the normal ten-minute deadline.");
  test.setTimeout(660_000);
  const url = await createRoom(page);
  const original = await snapshot(page);
  expect(original.room.deadlineAt - original.room.createdAt).toBe(600_000);
  const context = await browser.newContext();
  try {
    const sam = await context.newPage(); await joinRoom(sam, url, "Sam");
    await card(page, "Pasta House").getByRole("button", { name: /I'd go/ }).click();
    await card(sam, "Pasta House").getByRole("button", { name: /I'd go/ }).click();
    await expect(card(page, "Pasta House").getByRole("button", { name: /I'd go 2/ })).toBeVisible();
    await expect(page.getByTestId("result").getByRole("heading", { name: "Pasta House", exact: true })).toBeVisible({ timeout: 615_000 });
    await expectWinner(sam, "Pasta House");
    const result = await snapshot(page);
    expect(result.room.deadlineAt).toBe(original.room.deadlineAt);
    expect(result.result?.closedAt).toBe(original.room.deadlineAt);
    expect(result.serverNow).toBeGreaterThanOrEqual(original.room.deadlineAt);
    expect(result.result?.basis).toBe("votes");
    for (const person of [page, sam]) {
      const recommendations = await person.request.post(`${new URL(url).origin}/api/profile/recommendations`, { headers: { Origin: new URL(url).origin }, data: { preferences: { cuisines: [], maxPriceLevel: null } } });
      expect(recommendations.ok()).toBeTruthy();
      expect((await recommendations.json()).suggestions[0]).toMatchObject({ placeName: "Pasta House", approvalRounds: 1, groupPickRounds: 1 });
    }
  } finally { await context.close(); }
});

test("rooms, guest identity and results survive application restarts and backup restoration", async ({ page }) => {
  test.setTimeout(60_000);
  const directory = mkdtempSync(join(tmpdir(), "lets-eat-e2e-restart-"));
  const filename = join(directory, "test.sqlite");
  const backup = join(directory, "backup.sqlite");
  const origin = "http://localhost:3101";
  let child: ChildProcess | undefined;
  let logs = "";
  const env = (path: string) => ({ ...process.env, DATABASE_PATH: path, APP_ORIGIN: origin });
  async function start(path: string) {
    child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3101"], { env: env(path), stdio: ["ignore", "pipe", "pipe"] });
    child.stdout!.on("data", (data) => { logs += data; }); child.stderr!.on("data", (data) => { logs += data; });
    await expect.poll(async () => {
      if (child?.exitCode !== null) throw new Error(logs);
      try { return (await fetch(`${origin}/api/health`)).status; } catch { return 0; }
    }, { timeout: 15_000, intervals: [100, 250, 500] }).toBe(200);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, "exit"); child.kill("SIGTERM"); await exited; child = undefined;
  }
  try {
    const migration = spawnSync(process.execPath, ["scripts/migrate.mjs"], { env: env(filename), encoding: "utf8" });
    expect(migration.status, migration.stderr).toBe(0);
    await start(filename);
    const url = await createRoom(page, true, origin);
    const savedDefaults = await page.request.put(`${origin}/api/profile`, { headers: { Origin: origin }, data: { displayName: "Returning Alex", cuisines: ["Italian"], maxPriceLevel: 2 } });
    expect(savedDefaults.ok()).toBeTruthy();
    const profile = await savedDefaults.json();
    await card(page, "Pasta House").getByRole("button", { name: /I'd go/ }).click();
    await expect(card(page, "Pasta House").getByRole("button", { name: /I'd go/ })).toHaveAttribute("aria-pressed", "true");
    const original = await snapshot(page);
    await page.goto("about:blank"); await stop(); await start(filename);
    await page.goto(url);
    await expect(card(page, "Pasta House").getByRole("button", { name: /I'd go/ })).toHaveAttribute("aria-pressed", "true");
    expect((await snapshot(page)).me?.id).toBe(original.me?.id);
    expect(await (await page.request.get(`${origin}/api/profile`)).json()).toEqual(profile);
    deadline(url, Date.now() - 1, filename); await expectWinner(page, "Pasta House");
    const closed = await snapshot(page);
    const saved = spawnSync(process.execPath, ["scripts/backup.mjs", backup], { env: env(filename), encoding: "utf8" });
    expect(saved.status, saved.stderr).toBe(0);
    await page.goto("about:blank"); await stop(); await start(filename); await page.goto(url);
    await expectWinner(page, "Pasta House"); expect((await snapshot(page)).result).toEqual(closed.result);
    await page.goto("about:blank"); await stop(); await start(backup); await page.goto(url);
    await expectWinner(page, "Pasta House"); expect((await snapshot(page)).result).toEqual(closed.result);
    expect((await snapshot(page)).me?.id).toBe(original.me?.id);
    expect(await (await page.request.get(`${origin}/api/profile`)).json()).toEqual(profile);
    expect((await (await page.request.get(`${origin}/api/profile/rooms`)).json()).rooms[0]).toMatchObject({ roomId: closed.room.id, role: "created", result: closed.result });
    const recommendations = await page.request.post(`${origin}/api/profile/recommendations`, { headers: { Origin: origin }, data: { preferences: { cuisines: ["Italian"], maxPriceLevel: 2 } } });
    expect((await recommendations.json()).suggestions[0]).toMatchObject({ placeName: "Pasta House", approvalRounds: 1, groupPickRounds: 1 });
  } finally { await page.goto("about:blank"); await stop(); rmSync(directory, { recursive: true, force: true }); }
});
