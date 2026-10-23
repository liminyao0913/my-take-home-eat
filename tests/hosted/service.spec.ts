import { test, expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HistoryPage, ProfileSnapshot, RoomSnapshot, Suggestions } from "../../src/lib/contracts";
import { verifyGroupFlow } from "../browser/group-flow";

const origin = new URL(process.env.HOSTED_BASE_URL!).origin;
const headers = { Origin: origin };
const artifacts = process.env.HOSTED_ARTIFACT_DIR!;
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const path = (name: string) => join(artifacts, name);
function record(name: string, value: unknown) { writeFileSync(path(name), JSON.stringify(value, null, 2), { mode: 0o600 }); chmodSync(path(name), 0o600); }
async function saveContext(context: BrowserContext, name: string) { await context.storageState({ path: path(name) }); chmodSync(path(name), 0o600); }
async function room(api: APIRequestContext, id: string): Promise<RoomSnapshot> {
  const response = await api.get(`/api/rooms/${id}`); expect(response.status()).toBe(200); return response.json();
}
async function profile(api: APIRequestContext): Promise<ProfileSnapshot> { return (await api.get("/api/profile")).json(); }
async function fillPreferences(page: Page, cuisine: string) {
  await page.getByRole("button", { name: "My preferences (optional)", exact: true }).click();
  await page.getByLabel(cuisine, { exact: true }).check();
  await page.getByLabel("Remember cuisine and budget for future meals").check();
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(page.getByText("Saved ✓", { exact: true })).toBeVisible();
}

test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ request }) => {
  expect((await request.get("/api/health")).status()).toBe(200);
  const anonymous = await request.get("/api/profile");
  expect(anonymous.status()).toBe(200); expect((await anonymous.json()).profile).toBeNull();
  const version = await (await request.get("/api/version")).json();
  expect(version.commit).toMatch(/^[a-f0-9]{40}$/);
  if (process.env.EXPECTED_COMMIT) expect(version.commit).toBe(process.env.EXPECTED_COMMIT);
  const redirect = await request.get(origin.replace("https:", "http:"), { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(redirect.status());
  expect(new URL(redirect.headers().location, origin).origin).toBe(origin);
  const home = await request.get("/");
  expect(home.status()).toBe(200);
  expect(home.headers()["content-security-policy"]).toBe("frame-ancestors 'none'");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
  record("readiness.json", { checkedAt: new Date().toISOString(), origin, version, redirectStatus: redirect.status() });
});

test("hosted smoke: two browsers decide, remember preferences, and reuse the result", async ({ browser }) => {
  test.skip(process.env.HOSTED_RESUME === "1" || process.env.HOSTED_DEADLINE_ONLY === "1");
  const owner = await browser.newContext({ baseURL: origin, timezoneId: "UTC", permissions: ["clipboard-read", "clipboard-write"] });
  const guest = await browser.newContext({ baseURL: origin, timezoneId: "UTC" });
  try {
    const page = await owner.newPage(); const other = await guest.newPage();
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/demo");
    await page.getByRole("button", { name: "Show result", exact: true }).click();
    await expect(page.getByTestId("result")).toBeVisible();
    expect((await profile(owner.request)).profile).toBeNull();
    await page.goto("/");
    const title = `Hosted smoke ${new Date().toISOString()}`;
    await page.getByLabel("Your name").fill("Hosted organizer");
    await page.getByText("Meal details (optional)", { exact: true }).click();
    await page.getByLabel("Meal title", { exact: true }).fill(title);
    await page.getByLabel("Meal date", { exact: true }).fill(tomorrow());
    await page.getByLabel("Place name", { exact: true }).fill("Hosted Thai");
    await page.getByLabel("Start time", { exact: true }).fill("12:30");
    await page.getByText("Restaurant details (optional)", { exact: true }).click();
    await page.getByLabel("Cuisine", { exact: true }).selectOption("Thai");
    await page.getByRole("button", { name: "Create a meal room", exact: true }).click();
    await expect(page).toHaveURL(/\/r\/[\w-]+$/);
    const invite = page.url(); const id = new URL(invite).pathname.split("/").at(-1)!;
    await page.bringToFront();
    await page.getByRole("button", { name: "Copy invite link", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(invite);
    await other.goto(invite);
    await other.getByLabel("Your name").fill("Hosted friend");
    await other.getByRole("button", { name: "Join the table", exact: true }).click();
    await expect(other.getByRole("button", { name: "I'm done", exact: true })).toBeVisible();
    await other.locator(".add-option > summary").click();
    await other.getByLabel("Place name", { exact: true }).fill("Hosted Pasta");
    await other.getByLabel("Start time", { exact: true }).fill("13:00");
    await other.getByRole("button", { name: "Add option", exact: true }).click();
    await expect(page.getByRole("article", { name: "Hosted Pasta", exact: true })).toBeVisible();
    await fillPreferences(page, "Thai"); await fillPreferences(other, "Italian");
    for (const person of [page, other]) await person.getByRole("article", { name: "Hosted Thai", exact: true }).getByRole("button", { name: /I'd go/ }).click();
    const before = await room(owner.request, id); const theirs = await room(guest.request, id);
    expect(before.options[0].approvalCount).toBe(2);
    expect(before.me?.preferences.cuisines).toEqual(["Thai"]); expect(theirs.me?.preferences.cuisines).toEqual(["Italian"]);
    const anonymous = await browser.newContext({ baseURL: origin });
    try { const publicRoom = await room(anonymous.request, id); expect(publicRoom.me).toBeNull(); expect(JSON.stringify(publicRoom)).not.toMatch(/tokenHash|maxPriceLevel|preferredStartMinute/); }
    finally { await anonymous.close(); }
    expect((await owner.request.put(`/api/rooms/${id}/participants/me/ready`, { headers: { Origin: "https://unrelated.invalid" }, data: { ready: true } })).status()).toBe(403);
    for (const person of [page, other]) await person.getByRole("button", { name: "I'm done", exact: true }).click();
    await page.getByRole("button", { name: "Finish voting early", exact: true }).click();
    await page.getByRole("button", { name: "Confirm and show result", exact: true }).click();
    for (const person of [page, other]) await expect(person.getByTestId("result").getByRole("heading", { name: "Hosted Thai", exact: true })).toBeVisible();
    const closed = await room(owner.request, id);
    expect((await room(guest.request, id)).result).toEqual(closed.result);
    await page.reload(); expect((await room(owner.request, id)).me?.id).toBe(before.me?.id);
    await page.goto("/me"); await expect(page.getByRole("article", { name: title })).toContainText("Hosted Thai");
    const history: HistoryPage = await (await owner.request.get("/api/profile/rooms")).json();
    expect(history.rooms.find((entry) => entry.roomId === id)?.state).toBe("closed");
    await page.goto("/"); await expect(page.getByRole("article", { name: "Suggested Hosted Thai", exact: true })).toBeVisible();
    const cookies = await owner.cookies(); const credential = cookies.find((cookie) => cookie.name === "lets_eat_guest")!;
    expect(credential).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax" });
    await saveContext(owner, "owner.json"); await saveContext(guest, "guest.json");
    record("smoke.json", { origin, roomId: id, title, owner: await profile(owner.request), guest: await profile(guest.request), ownerInputs: closed.me, guestInputs: (await room(guest.request, id)).me, result: closed.result, checkedAt: new Date().toISOString() });
    await page.screenshot({ path: path("returning-browser.png"), fullPage: true });
    expect(errors).toEqual([]);
  } finally { await owner.close(); await guest.close(); }
});

test("P1 hosted: three independent browsers validate the defining group interaction", async ({ browser }) => {
  test.skip(process.env.HOSTED_RESUME === "1" || process.env.HOSTED_DEADLINE_ONLY === "1");
  record("p1-validation.json", await verifyGroupFlow(browser, origin, (page, name) => page.screenshot({ path: path(name), fullPage: true })));
});

test("hosted release: an actual ten-minute deadline gives both browsers the same result", async ({ browser }) => {
  test.skip(process.env.RUN_HOSTED_DEADLINE !== "1" || process.env.HOSTED_RESUME === "1");
  test.setTimeout(12 * 60_000);
  const owner = await browser.newContext({ baseURL: origin, timezoneId: "UTC" });
  const guest = await browser.newContext({ baseURL: origin, timezoneId: "UTC" });
  try {
    const created = await owner.request.post("/api/rooms", { headers, data: { displayName: "Deadline organizer", title: `Hosted deadline ${new Date().toISOString()}`, mealDate: tomorrow(), timeZone: "UTC", options: [{ placeName: "Deadline Thai", startTime: "12:30", cuisine: "Thai" }, { placeName: "Deadline Pasta", startTime: "13:00", cuisine: "Italian" }] } });
    expect(created.status()).toBe(201); const { id } = await created.json();
    expect((await guest.request.post(`/api/rooms/${id}/participants`, { headers, data: { displayName: "Deadline friend" } })).status()).toBe(200);
    const initial = await room(owner.request, id); expect(initial.room.deadlineAt - initial.room.createdAt).toBe(600_000);
    for (const context of [owner, guest]) expect((await context.request.put(`/api/rooms/${id}/options/${initial.options[0].id}/response`, { headers, data: { choice: "approve" } })).status()).toBe(200);
    const page = await owner.newPage(); const other = await guest.newPage();
    await page.goto(`/r/${id}`); await other.goto(`/r/${id}`);
    await expect(page.getByTestId("result")).toBeVisible({ timeout: 630_000 });
    await expect(other.getByTestId("result")).toBeVisible();
    const result = (await room(owner.request, id)).result!;
    expect(result.closedAt).toBe(initial.room.deadlineAt); expect(result.closedEarly).toBe(false);
    expect(result.winner?.placeName).toBe("Deadline Thai"); expect(result.winner?.approvalCount).toBe(2);
    expect((await room(guest.request, id)).result).toEqual(result);
    expect(Date.now()).toBeGreaterThanOrEqual(initial.room.deadlineAt);
    expect((await guest.request.put(`/api/rooms/${id}/options/${initial.options[1].id}/response`, { headers, data: { choice: "approve" } })).status()).toBe(409);
    record("deadline.json", { roomId: id, createdAt: initial.room.createdAt, deadlineAt: initial.room.deadlineAt, observedAt: Date.now(), result });
    await page.screenshot({ path: path("deadline-result.png"), fullPage: true });
  } finally { await owner.close(); await guest.close(); }
});

test("hosted persistence: saved browsers retain their inputs and result after restart", async ({ browser }) => {
  test.skip(process.env.HOSTED_RESUME !== "1");
  const saved = JSON.parse(readFileSync(path("smoke.json"), "utf8"));
  expect(saved.origin).toBe(origin);
  for (const role of ["owner", "guest"] as const) {
    const context = await browser.newContext({ baseURL: origin, timezoneId: "UTC", storageState: path(`${role}.json`) });
    try {
      const page = await context.newPage(); await page.goto(`/r/${saved.roomId}`);
      await expect(page.getByTestId("result")).toBeVisible();
      const current = await room(context.request, saved.roomId);
      expect(current.result).toEqual(saved.result); expect(current.me).toEqual(saved[`${role}Inputs`]);
      expect(await profile(context.request)).toEqual(saved[role]);
      await page.goto("/me"); await expect(page.getByRole("article", { name: saved.title })).toContainText("Hosted Thai");
      const recommendations: Suggestions = await (await context.request.post("/api/profile/recommendations", { headers, data: { preferences: saved[role].profile.preferences } })).json();
      expect(recommendations.suggestions.some((meal) => meal.placeName === "Hosted Thai")).toBe(true);
    } finally { await context.close(); }
  }
  record("persistence.json", { checkedAt: new Date().toISOString(), origin, roomId: saved.roomId, retained: ["identity", "preferences", "votes", "history", "result", "recommendations"] });
});
