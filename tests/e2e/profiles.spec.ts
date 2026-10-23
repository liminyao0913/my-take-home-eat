import { test, expect, type Page } from "@playwright/test";
import Sqlite from "better-sqlite3";
import { createHash } from "node:crypto";
import { dirname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { apiUrl, card, createRoom, deadline, expectWinner, joinRoom, snapshot } from "./helpers";
import type { HistoryPage, ProfileSnapshot, Suggestions } from "../../src/lib/contracts";

const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const headers = { Origin: "http://localhost:3100" };
const personal = async (page: Page): Promise<ProfileSnapshot> => (await page.request.get("/api/profile")).json();
const history = async (page: Page): Promise<HistoryPage> => (await page.request.get("/api/profile/rooms")).json();

async function finish(page: Page) {
  await page.getByRole("button", { name: "I'm done", exact: true }).click();
  await page.getByRole("button", { name: "Finish voting early", exact: true }).click();
  await page.getByRole("button", { name: "Confirm and show result", exact: true }).click();
  await expect(page.getByTestId("result")).toBeVisible();
}

function fixture(change: (db: Sqlite.Database) => void) {
  const path = resolve(process.env.LETS_EAT_E2E_DB!);
  if (!dirname(path).startsWith(`${resolve(tmpdir())}${sep}lets-eat-e2e-`) || !path.endsWith(`${sep}test.sqlite`)) throw new Error("Refusing to alter a non-test database");
  const db = new Sqlite(path, { timeout: 5000 });
  try { db.pragma("foreign_keys = ON"); db.transaction(() => change(db))(); }
  finally { db.close(); }
}

test("returning browser saves defaults, sees outcomes, and creates a fresh meal from history", async ({ page }, testInfo) => {
  const url = await createRoom(page);
  await page.getByRole("button", { name: "My preferences (optional)", exact: true }).click();
  await expect(page.getByLabel("Remember cuisine and budget for future meals")).not.toBeChecked();
  await page.getByLabel("Thai", { exact: true }).check();
  await page.getByLabel("Preferred price ceiling").selectOption("1");
  await page.getByLabel("From", { exact: true }).fill("12:00");
  await page.getByLabel("Until", { exact: true }).fill("14:00");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Saved ✓", { exact: true })).toBeVisible();
  expect((await personal(page)).profile?.preferences).toEqual({ cuisines: [], maxPriceLevel: null });
  await page.getByLabel("Remember cuisine and budget for future meals").check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Saved ✓", { exact: true })).toBeVisible();
  await card(page, "Little Thai").getByRole("button", { name: /I'd go/ }).click();
  await finish(page);
  await expectWinner(page, "Little Thai");
  const closed = await snapshot(page);
  await page.goto("/me");
  const entry = page.getByRole("article", { name: "Lunch with the crew" });
  await expect(entry).toContainText("Created by you");
  await expect(entry).toContainText("The group's pick");
  await expect(page.getByLabel("Thai", { exact: true })).toBeChecked();
  await page.getByLabel("Default name").fill("Alex next time");
  await page.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByText("Defaults saved ✓")).toBeVisible();
  expect((await snapshot(page, url)).me).toEqual(closed.me);
  expect((await snapshot(page, url)).result).toEqual(closed.result);
  await page.goto("/");
  await expect(page.getByLabel("Your name")).toHaveValue("Alex next time");
  await expect(page.getByLabel("Use my saved preferences")).toBeChecked();
  const suggestion = page.getByRole("article", { name: "Suggested Little Thai" });
  await expect(suggestion).toContainText("You approved this in 1 round");
  await suggestion.getByRole("button", { name: "Add to this meal" }).click();
  await expect(page.getByLabel("Place name", { exact: true })).toHaveValue("Little Thai");
  await page.getByLabel("Meal date", { exact: true }).fill(tomorrow());
  await page.getByLabel("Start time", { exact: true }).fill("18:45");
  await page.getByRole("button", { name: "Create a meal room" }).click();
  await expect(page).toHaveURL(/\/r\/[\w-]+$/);
  expect(page.url()).not.toBe(url);
  const next = await snapshot(page);
  expect(next.me?.preferences).toEqual({ cuisines: ["Thai"], maxPriceLevel: 1, startTime: null, endTime: null });
  expect(next.me?.choices).toEqual({});
  expect(next.options[0]).toMatchObject({ placeName: "Little Thai", approvalCount: 0, blockCount: 0 });
  expect(new Date(next.options[0].startAt).toISOString().slice(11, 16)).toBe("18:45");
  expect(next.participants).toHaveLength(1);
  expect(next.room.deadlineAt - next.room.createdAt).toBe(600_000);

  // Another round must not erase the first round's personal recommendation signals.
  const restarted = await page.request.post(`${apiUrl(url)}/rounds`, { headers: { ...headers, "X-Room-Round": "1" }, data: { mealDate: tomorrow(), options: [{ placeName: "Fresh round", startTime: "13:00" }] } });
  expect(restarted.ok()).toBeTruthy();
  await page.goto("/me");
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("Round 2");
  await entry.getByText("Previous rounds · 1", { exact: true }).click();
  await expect(entry.locator(".history-rounds")).toContainText("Little Thai");
  await entry.getByText("Use a past idea", { exact: true }).click();
  await entry.getByRole("link", { name: "Use Little Thai from round 1" }).click();
  await expect(page.getByLabel("Place name", { exact: true })).toHaveValue("Little Thai");
  await expect(page.getByText("Past idea loaded.", { exact: false })).toBeVisible();
  await expect(page).toHaveURL("http://localhost:3100/");
  await expect(page.getByRole("article", { name: "Suggested Little Thai" })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/me");
  await expect(entry).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("my-meals-mobile.png"), fullPage: true });
});

test("same-named browsers are separate; joining offers defaults and removal stays personal", async ({ page, browser }) => {
  const url = await createRoom(page, false);
  const original = await snapshot(page);
  const context = await browser.newContext({ baseURL: "http://localhost:3100" });
  try {
    const other = await context.newPage();
    await other.goto("/demo");
    await other.getByRole("button", { name: "Show result", exact: true }).click();
    await other.goto(url);
    expect((await personal(other)).profile).toBeNull();
    expect((await context.cookies()).filter((cookie) => cookie.name === "lets_eat_guest")).toEqual([]);
    const privateIdea = `/api/profile/rooms/${original.room.id}/ideas/${original.options[0].id}`;
    expect((await other.request.get(privateIdea)).status()).toBe(401);
    await joinRoom(other, url, "Alex");
    const otherProfile = (await personal(other)).profile!;
    expect(otherProfile.id).not.toBe((await personal(page)).profile!.id);
    await other.goto("/me");
    await expect(other.getByRole("article", { name: "Lunch with the crew" })).toContainText("Joined by you");
    await other.getByLabel("Italian", { exact: true }).check();
    await other.getByLabel("Preferred price ceiling").selectOption("2");
    await other.getByRole("button", { name: "Save defaults" }).click();
    await expect(other.getByText("Defaults saved ✓")).toBeVisible();
    const secondUrl = await createRoom(page, false);
    const second = await snapshot(page);
    expect((await other.request.get(`/api/profile/rooms/${second.room.id}/ideas/${second.options[0].id}`)).status()).toBe(404);
    expect((await other.request.delete(`/api/profile/rooms/${second.room.id}`, { headers })).status()).toBe(404);
    await other.goto(secondUrl);
    await expect(other.getByLabel("Your name")).toHaveValue("Alex");
    await expect(other.getByLabel("Use my saved preferences")).toBeChecked();
    await other.getByText("Edit preferences for this meal", { exact: true }).click();
    await other.getByLabel("Thai", { exact: true }).check();
    await other.getByRole("button", { name: "Join the table" }).click();
    await expect(other.getByRole("button", { name: "I'm done", exact: true })).toBeVisible();
    expect((await snapshot(other)).me?.preferences).toMatchObject({ cuisines: ["Italian", "Thai"], maxPriceLevel: 2, startTime: null, endTime: null });
    expect((await personal(other)).profile?.preferences.cuisines).toEqual(["Italian"]);
    await other.locator(".people-panel > summary").click();
    await other.getByRole("button", { name: "Leave this meal" }).click();
    await expect(other.getByRole("button", { name: "Join the table" })).toBeVisible();
    await other.goto("/me");
    const left = other.getByRole("article").filter({ hasText: "You left" });
    await expect(left).toBeVisible();
    await left.getByRole("button", { name: "Remove from my history" }).click();
    await left.getByRole("button", { name: "Confirm removal" }).click();
    await expect(other.getByRole("article")).toHaveCount(1);
    await other.goto(secondUrl);
    await expect(other.getByLabel("Use my saved preferences")).toBeChecked();
    await other.getByLabel("Use my saved preferences").uncheck();
    expect((await history(other)).rooms.map((room) => room.roomId)).not.toContain(second.room.id);
    await other.getByRole("button", { name: "Join the table" }).click();
    await expect(other.getByRole("button", { name: "I'm done", exact: true })).toBeVisible();
    expect((await snapshot(other)).me?.preferences).toEqual({ cuisines: [], maxPriceLevel: null, startTime: null, endTime: null });
    expect((await history(other)).rooms).toHaveLength(2);
    expect((await personal(page)).profile?.preferences.cuisines).toEqual([]);
  } finally { await context.close(); }
});

test("forgetting and server expiry revoke cookies without deleting shared contributions", async ({ page, browser }) => {
  const url = await createRoom(page, false);
  await card(page, "Little Thai").getByRole("button", { name: /I'd go/ }).click();
  await finish(page);
  const closed = await snapshot(page);
  const cookie = (await page.context().cookies()).find((cookie) => cookie.name === "lets_eat_guest")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.expires - Date.now() / 1000).toBeGreaterThan(179 * 86400);
  await page.goto("/me");
  await page.getByRole("button", { name: "Forget this browser", exact: true }).click();
  await expect(page.getByRole("group", { name: "Confirm forgetting this browser" })).toContainText("shared-room contributions stay");
  await page.getByRole("button", { name: "Confirm forget", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3100/");
  expect((await personal(page)).profile).toBeNull();
  const replay = await browser.newContext();
  try {
    await replay.addCookies([cookie]);
    const attacker = await replay.newPage();
    expect((await attacker.request.get("http://localhost:3100/api/profile/rooms")).status()).toBe(401);
    const unchanged = await snapshot(attacker, url);
    expect(unchanged.me).toBeNull();
    expect(unchanged.result).toEqual(closed.result);
    expect(unchanged.participants).toEqual(closed.participants);
    expect((await attacker.request.post("http://localhost:3100/api/profile/import", { headers })).status()).toBe(409);
  } finally { await replay.close(); }
  const newUrl = await createRoom(page, false);
  const freshCookie = (await page.context().cookies()).find((item) => item.name === "lets_eat_guest")!;
  expect(freshCookie.value).not.toBe(cookie.value);
  await page.goto("about:blank");
  const hash = createHash("sha256").update(freshCookie.value).digest("hex");
  fixture((db) => { expect(db.prepare("UPDATE browser_credentials SET expires_at = ? WHERE token_hash = ?").run(Date.now() - 1, hash).changes).toBe(1); });
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: "Your next meal starts here" })).toBeVisible();
  expect((await personal(page)).canImportLegacy).toBe(false);
  expect((await page.context().cookies()).filter((item) => item.name === "lets_eat_guest")).toEqual([]);
  expect((await snapshot(page, newUrl)).me).toBeNull();
});

test("legacy meals require a one-time explicit import without guessing defaults", async ({ page }) => {
  const url = await createRoom(page, false);
  await card(page, "Little Thai").getByRole("button", { name: /I'd go/ }).click();
  await finish(page);
  const before = await personal(page);
  const cookie = (await page.context().cookies()).find((item) => item.name === "lets_eat_guest")!;
  const hash = createHash("sha256").update(cookie.value).digest("hex");
  await page.goto("about:blank");
  // Simulate the post-migration state of a browser that had meals before profiles existed.
  fixture((db) => {
    db.prepare("DELETE FROM profiles WHERE id = ?").run(before.profile!.id);
    db.prepare("UPDATE browser_credentials SET legacy_available = 1 WHERE token_hash = ?").run(hash);
  });
  await page.goto("/me");
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: "Add existing meals from this browser" }).click();
  const entry = page.getByRole("article", { name: "Lunch with the crew" });
  await expect(entry).toContainText("Joined by you");
  expect((await personal(page)).profile?.preferences).toEqual({ cuisines: [], maxPriceLevel: null });
  await expect(page.getByRole("button", { name: "Add existing meals from this browser" })).toHaveCount(0);
  await entry.getByRole("button", { name: "Remove from my history" }).click();
  await entry.getByRole("button", { name: "Confirm removal" }).click();
  await expect(entry).toHaveCount(0);
  await page.reload();
  expect((await history(page)).rooms).toEqual([]);
  expect((await page.request.post("/api/profile/import", { headers })).status()).toBe(409);
  expect((await snapshot(page, url)).result?.winner?.placeName).toBe("Little Thai");
  const recs: Suggestions = await (await page.request.post("/api/profile/recommendations", { headers, data: { preferences: { cuisines: [], maxPriceLevel: null } } })).json();
  expect(recs.suggestions).toEqual([]);
});

test("suggestion failures, stale responses, and other areas keep the manual draft intact", async ({ page }) => {
  const url = await createRoom(page, false);
  await card(page, "Little Thai").getByRole("button", { name: /I'd go/ }).click();
  await finish(page);
  await page.route("**/api/profile/recommendations", (route) => route.abort());
  await page.goto("/");
  await page.getByLabel("Your name").fill("Room alias");
  await page.getByLabel("Place name", { exact: true }).fill("My handwritten idea");
  await expect(page.getByRole("button", { name: "Retry suggestions" })).toBeVisible();
  await page.unroute("**/api/profile/recommendations");
  await page.getByRole("button", { name: "Retry suggestions" }).click();
  await expect(page.getByRole("article", { name: "Suggested Little Thai" })).toBeVisible();
  await expect(page.getByLabel("Place name", { exact: true })).toHaveValue("My handwritten idea");
  await page.getByLabel("Area", { exact: true }).fill("Uptown");
  await expect(page.getByRole("article", { name: "Suggested Little Thai" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show other past areas" }).click();
  await expect(page.getByRole("article", { name: "Suggested Little Thai" })).toBeVisible();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let received!: () => void;
  const reached = new Promise<void>((resolve) => { received = resolve; });
  await page.route("**/api/profile/recommendations", async (route) => {
    if (route.request().postDataJSON().area === "Downtown") {
      const response = await route.fetch(); received(); await blocked;
      await route.fulfill({ response }).catch(() => {});
    } else await route.continue();
  });
  await page.getByLabel("Area", { exact: true }).fill("Downtown");
  await reached;
  await page.getByLabel("Area", { exact: true }).fill("Elsewhere");
  await expect(page.getByText("No past ideas match this recorded area.")).toBeVisible();
  release();
  await expect(page.getByRole("article", { name: "Suggested Little Thai" })).toHaveCount(0);
  await expect(page.getByLabel("Your name")).toHaveValue("Room alias");
  await expect(page.getByLabel("Place name", { exact: true })).toHaveValue("My handwritten idea");
  await page.getByLabel("Meal date", { exact: true }).fill(tomorrow());
  await page.getByLabel("Start time", { exact: true }).fill("17:15");
  await page.getByRole("button", { name: "Create a meal room" }).click();
  await expect(page).toHaveURL(/\/r\/[\w-]+$/);
  expect(page.url()).not.toBe(url);
  expect((await snapshot(page)).options[0].placeName).toBe("My handwritten idea");
});

test("a no-vote outcome is manually reusable but does not invent a recommendation", async ({ page }) => {
  const url = await createRoom(page, false);
  deadline(url);
  await expectWinner(page, "Little Thai");
  await page.goto("/me");
  const entry = page.getByRole("article", { name: "Lunch with the crew" });
  await expect(entry).toContainText("Suggested meal");
  await entry.getByText("Use a past idea", { exact: true }).click();
  await page.route("**/api/profile/rooms/*/ideas/*", (route) => route.abort());
  await entry.getByRole("link", { name: "Use Little Thai from round 1" }).click();
  await expect(page.getByRole("button", { name: "Retry past idea" })).toBeVisible();
  await page.getByText("Restaurant details (optional)", { exact: true }).click();
  await page.getByLabel("Location", { exact: true }).fill("My unfinished location draft");
  await page.getByLabel("Start time", { exact: true }).fill("18:15");
  await page.unroute("**/api/profile/rooms/*/ideas/*");
  await page.getByRole("button", { name: "Retry past idea" }).click();
  await expect(page.getByLabel("Place name", { exact: true }).nth(0)).toHaveValue("");
  await expect(page.getByLabel("Location", { exact: true }).nth(0)).toHaveValue("My unfinished location draft");
  await expect(page.getByLabel("Place name", { exact: true }).nth(1)).toHaveValue("Little Thai");
  await expect(page.getByLabel("Start time", { exact: true }).nth(1)).toHaveValue("18:15");
  await expect(page.getByText("No past approvals or approved group picks yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("article", { name: "Suggested Little Thai" })).toHaveCount(0);
});

test("My meals and Recent meals refresh on return while preserving preference and meal drafts", async ({ page }) => {
  const url = await createRoom(page, false);
  const original = await snapshot(page);
  const mine = await page.context().newPage();
  const home = await page.context().newPage();
  await mine.goto("/me");
  await mine.getByLabel("Default name").fill("Unsaved default name");
  await home.goto("/");
  await home.getByLabel("Place name", { exact: true }).fill("Unfinished meal idea");
  await expect(home.locator(".recent-meals")).toContainText("Open");
  await page.request.put(`${apiUrl(url)}/participants/me/ready`, { headers, data: { ready: true } });
  expect((await page.request.post(`${apiUrl(url)}/finish`, { headers })).status()).toBe(200);
  await mine.bringToFront(); await mine.evaluate(() => window.dispatchEvent(new Event("focus")));
  const entry = mine.getByRole("article", { name: "Lunch with the crew" });
  await expect(entry).toContainText("Decided");
  await expect(mine.getByLabel("Default name")).toHaveValue("Unsaved default name");
  await home.bringToFront(); await home.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(home.locator(".recent-meals")).toContainText("Decided");
  await expect(home.getByLabel("Place name", { exact: true })).toHaveValue("Unfinished meal idea");
  expect((await page.request.post(`${apiUrl(url)}/rounds`, { headers, data: { mealDate: tomorrow(), options: [{ placeName: "Another round", startTime: "13:00" }] } })).status()).toBe(201);
  await mine.bringToFront(); await mine.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(entry).toContainText("Round 2"); await expect(entry.locator(".history-status")).toHaveText("Open");
  await expect(mine.getByLabel("Default name")).toHaveValue("Unsaved default name");
  await mine.route("**/api/profile/rooms?*", (route) => route.abort());
  await mine.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(mine.getByRole("button", { name: "Retry history" })).toBeVisible();
  await expect(entry).toBeVisible();
  await expect(mine.getByLabel("Default name")).toHaveValue("Unsaved default name");
  await mine.unroute("**/api/profile/rooms?*");
  await page.request.delete(`/api/profile/rooms/${original.room.id}`, { headers });
  await mine.getByRole("button", { name: "Retry history" }).click();
  await expect(entry).toHaveCount(0);
  await home.close(); await mine.close();
});

test("an obsolete history response cannot replace a newer result or reset a draft", async ({ page }) => {
  const url = await createRoom(page, false);
  await page.goto("/me");
  const entry = page.getByRole("article", { name: "Lunch with the crew" });
  await expect(entry.locator(".history-status")).toHaveText("Open");
  await page.getByLabel("Default name").fill("Keep this draft");
  let received!: () => void, release!: () => void;
  const reached = new Promise<void>((resolve) => { received = resolve; });
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let first = true;
  await page.route("**/api/profile/rooms?*", async (route) => {
    if (!first) { await route.continue(); return; }
    first = false;
    const response = await route.fetch(); received(); await blocked;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await reached;
  await page.request.put(`${apiUrl(url)}/participants/me/ready`, { headers, data: { ready: true } });
  expect((await page.request.post(`${apiUrl(url)}/finish`, { headers })).status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(entry.locator(".history-status")).toHaveText("Decided");
  release();
  await expect(entry).toHaveCount(1);
  await expect(entry.locator(".history-status")).toHaveText("Decided");
  await expect(page.getByLabel("Default name")).toHaveValue("Keep this draft");
});
