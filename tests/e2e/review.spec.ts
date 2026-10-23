import { test, expect } from "@playwright/test";
import { apiUrl, card, createRoom, deadline, expectWinner, fillOption, joinRoom, snapshot } from "./helpers";

const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

test("demo reaches vote, preference and all-excluded results without touching real rooms", async ({ page }) => {
  const started = Date.now();
  const roomRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/rooms")) roomRequests.push(request.url()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("link", { name: "Try a demo" }).click();
  await expect(page.getByText("INTERACTIVE DEMO", { exact: true })).toBeVisible();
  await card(page, "Pasta House").getByRole("button", { name: /I'd go/ }).click();
  await page.getByRole("button", { name: "Show result", exact: true }).click();
  await expectWinner(page, "Pasta House");
  await expect(page.getByTestId("result")).toContainText("most approvals");
  expect(Date.now() - started).toBeLessThan(60_000);
  await page.getByRole("button", { name: "No votes: use preferences", exact: true }).click();
  await page.getByRole("button", { name: "Show result", exact: true }).click();
  await expectWinner(page, "Little Thai");
  await expect(page.getByTestId("result")).toContainText("SUGGESTED MEAL");
  await expect(page.getByTestId("result")).toContainText("75% preference match");
  await page.getByRole("button", { name: "All options excluded", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No viable options right now" })).toBeVisible();
  await page.getByRole("button", { name: "Show result", exact: true }).click();
  await expect(page.getByTestId("result")).toContainText("NO WINNER THIS ROUND");
  await page.getByRole("button", { name: "Try a fresh set of responses" }).click();
  await page.getByRole("button", { name: "Show result", exact: true }).click();
  await expectWinner(page, "Little Thai");
  await expect(page.getByTestId("result")).toContainText("Approvals tied");
  expect(roomRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("minimal setup and room-first setup both keep optional details genuinely optional", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Your name").fill("Alex");
  await page.getByLabel("Meal date", { exact: true }).fill(tomorrow());
  await page.getByLabel("Place name", { exact: true }).fill("The corner cafe");
  await page.getByLabel("Start time", { exact: true }).fill("12:30");
  await expect(page.getByLabel("Location", { exact: true })).not.toBeVisible();
  await expect(page.getByLabel("Meal title")).not.toBeVisible();
  await page.getByRole("button", { name: "Create a meal room" }).click();
  await expect(page).toHaveURL(/\/r\/[\w-]+$/);
  const minimal = await snapshot(page);
  expect(minimal.options[0]).toMatchObject({ placeName: "The corner cafe", location: "", cuisine: null, priceLevel: null });
  expect(minimal.room.deadlineAt - minimal.room.createdAt).toBe(600_000);
  await expect(card(page, "The corner cafe")).toContainText("Price not specified");
  await page.goto("/");
  await page.getByLabel("Your name").fill("Alex");
  await page.getByLabel("Meal date", { exact: true }).fill(tomorrow());
  await page.getByLabel("Create the room first; add ideas together").check();
  await page.getByRole("button", { name: "Create a meal room" }).click();
  await expect(page).toHaveURL(/\/r\/[\w-]+$/);
  expect((await snapshot(page)).options).toEqual([]);
  await expect(page.getByText("The table is empty.", { exact: false })).toBeVisible();
  await page.getByText("+ Add a meal idea", { exact: true }).click();
  await page.getByLabel("Place name", { exact: true }).fill("A shared idea");
  await page.getByLabel("Start time", { exact: true }).fill("13:00");
  await page.getByRole("button", { name: "Add option", exact: true }).click();
  await expect(card(page, "A shared idea")).toBeVisible();
});

test("readiness, participant status and confirmation finish a real room early", async ({ page, browser }) => {
  const url = await createRoom(page);
  const original = await snapshot(page);
  const samContext = await browser.newContext();
  const leeContext = await browser.newContext();
  try {
    const sam = await samContext.newPage();
    const lee = await leeContext.newPage();
    await joinRoom(sam, url, "Sam");
    await card(page, "Pasta House").getByRole("button", { name: /I'd go/ }).click();
    await expect(page.getByText("1 of 2 people have responded", { exact: true })).toBeVisible();
    await page.locator(".people-panel > summary").click();
    await expect(page.locator(".people-panel li").filter({ hasText: "Sam" })).toContainText("No response yet");
    await page.getByRole("button", { name: "I'm done", exact: true }).click();
    await expect(page.getByRole("button", { name: "Finish voting early", exact: true })).toHaveCount(0);
    await card(sam, "Pasta House").getByRole("button", { name: /I'd go/ }).click();
    await sam.getByRole("button", { name: "I'm done", exact: true }).click();
    await page.getByRole("button", { name: "Finish voting early", exact: true }).click();
    await expect(page.getByRole("group", { name: "Confirm early finish" })).toContainText("All 2 joined people are ready");
    expect((await snapshot(page)).state).toBe("open");
    // A new arrival invalidates the displayed early-finish opportunity.
    await joinRoom(lee, url, "Lee");
    const staleFinish = await page.request.post(`${apiUrl(url)}/finish`, { headers: { Origin: new URL(url).origin, "X-Room-Round": "1" } });
    expect(staleFinish.status()).toBe(409);
    await expect(page.getByRole("button", { name: "Confirm and show result" })).toHaveCount(0);
    await lee.getByRole("button", { name: "I'm done", exact: true }).click();
    await expect(page.getByText("3 of 3 people have responded", { exact: true })).toBeVisible();
    // Confirmation may reappear after the third participant becomes ready.
    await page.getByRole("button", { name: "Confirm and show result", exact: true }).click();
    for (const person of [page, sam, lee]) await expectWinner(person, "Pasta House");
    const closed = await snapshot(page);
    expect(closed.room.deadlineAt).toBe(original.room.deadlineAt);
    expect(closed.result?.closedEarly).toBe(true);
    expect(closed.result!.closedAt).toBeLessThan(original.room.deadlineAt);
    await page.reload();
    expect((await snapshot(page)).result).toEqual(closed.result);
  } finally { await samContext.close(); await leeContext.close(); }
});

test("constraints guide alternatives and a new round preserves the group on the same link", async ({ page, browser }) => {
  const url = await createRoom(page);
  const context = await browser.newContext();
  try {
    const sam = await context.newPage(); await joinRoom(sam, url, "Sam");
    await page.getByRole("button", { name: "My preferences (optional)", exact: true }).click();
    await page.getByLabel("Thai", { exact: true }).check();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByText("Saved ✓", { exact: true })).toBeVisible();
    for (const name of ["Little Thai", "Pasta House"]) {
      await card(sam, name).getByRole("button", { name: /Can't do this/ }).click();
      await card(sam, name).getByLabel("What doesn't work? (optional)").selectOption("Time conflict");
    }
    await expect(page.getByRole("heading", { name: "No viable options right now" })).toBeVisible();
    await expect(card(page, "Little Thai").locator(".constraint-reasons")).toContainText("Time conflict");
    await page.getByRole("button", { name: "Add an alternative", exact: true }).click();
    await expect(page.locator(".add-option")).toHaveCount(1);
    await expect(page.locator(".add-option").getByLabel("Place name", { exact: true })).toBeFocused();
    await fillOption(page.locator(".add-option"), "Later lunch", "Thai", "1");
    await page.locator(".add-option").getByLabel("Start time", { exact: true }).fill("14:00");
    await page.getByRole("button", { name: "Add option", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No viable options right now" })).toHaveCount(0);
    await card(sam, "Later lunch").getByRole("button", { name: /Can't do this/ }).click();
    const before = await snapshot(page);
    deadline(url);
    await expect(page.getByTestId("result")).toContainText("NO WINNER THIS ROUND");
    await expect(sam.getByTestId("result")).toContainText("NO WINNER THIS ROUND");
    await page.getByText("Start another round in this room", { exact: true }).click();
    await page.getByLabel("New meal date", { exact: true }).fill(tomorrow());
    await fillOption(page.getByRole("group", { name: "New meal option 1", exact: true }), "Fresh idea", "Thai");
    await page.getByRole("button", { name: "Start a new 10-minute round", exact: true }).click();
    await expect(card(sam, "Fresh idea")).toBeVisible(); // Closed rooms continue to refresh.
    expect(page.url()).toBe(url); expect(sam.url()).toBe(url);
    const next = await snapshot(page);
    expect(next.room.round).toBe(2);
    expect(next.participants.map((person) => person.id)).toEqual(before.participants.map((person) => person.id));
    expect(next.participants.every((person) => !person.ready)).toBeTruthy();
    expect(next.me?.preferences).toEqual(before.me?.preferences);
    expect(next.me?.choices).toEqual({});
    expect(next.options).toHaveLength(1);
    expect(next.previousRounds[0].result.winner).toBeNull();
    const staleVote = await page.request.put(`${apiUrl(url)}/options/${next.options[0].id}/response`, { headers: { Origin: new URL(url).origin, "X-Room-Round": "1" }, data: { choice: "block" } });
    expect(staleVote.status()).toBe(409);
    expect((await staleVote.json()).code).toBe("STALE_ROUND");
    await card(sam, "Fresh idea").getByRole("button", { name: /I'd go/ }).click();
    await expect(card(page, "Fresh idea").getByRole("button", { name: /I'd go 1/ })).toBeVisible();
    await page.reload();
    await page.locator(".round-history > summary").click();
    await expect(page.locator(".round-history")).toContainText("No winner");
    expect((await snapshot(page)).room.round).toBe(2);
  } finally { await context.close(); }
});

test("mobile guests join before voting; participants see voting before supporting panels", async ({ page, browser }, testInfo) => {
  const url = await createRoom(page);
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  try {
    const guest = await context.newPage(); await guest.goto(url);
    await expect(guest.getByRole("button", { name: "Join the table" })).toBeVisible();
    const join = await guest.locator(".join-panel").boundingBox();
    const optionsBefore = await guest.locator(".options-section").boundingBox();
    expect(join!.y + join!.height).toBeLessThan(optionsBefore!.y);
    await guest.getByLabel("Your name").fill("Sam");
    await guest.getByRole("button", { name: "Join the table" }).click();
    await expect(guest.locator(".join-panel")).toHaveCount(0);
    const options = await guest.locator(".options-section").boundingBox();
    const people = await guest.locator(".people-panel").boundingBox();
    expect(options!.y + options!.height).toBeLessThan(people!.y);
    await expect(guest.locator(".people-panel")).not.toHaveAttribute("open");
    await expect(guest.locator(".preference-panel")).not.toHaveAttribute("open");
    await card(guest, "Little Thai").getByRole("button", { name: /I'd go/ }).click();
    await expect(guest.getByText("1 of 2 people have responded", { exact: true })).toBeVisible();
    await guest.getByRole("button", { name: "My preferences (optional)", exact: true }).click();
    await expect(guest.getByLabel("Thai", { exact: true })).toBeVisible();
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await guest.screenshot({ path: testInfo.outputPath("mobile-voting.png"), fullPage: true });
  } finally { await context.close(); }
});
