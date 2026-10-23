import { test, expect } from "@playwright/test";
import { apiUrl, card, createRoom, deadline, expectWinner, fillOption, joinRoom, snapshot } from "./helpers";

test("three people propose meals and vote concurrently, with one frozen result", async ({ page, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = await createRoom(page);
  const samContext = await browser.newContext();
  const leeContext = await browser.newContext();
  try {
    const sam = await samContext.newPage(); const lee = await leeContext.newPage();
    await joinRoom(sam, url, "Sam"); await joinRoom(lee, url, "Lee");
    await sam.getByText("+ Add a meal idea", { exact: true }).click();
    await fillOption(sam.locator(".add-option"), "Taco Corner", "Mexican");
    await sam.getByRole("button", { name: "Add option", exact: true }).click();
    await expect(card(page, "Taco Corner")).toBeVisible();
    await Promise.all([card(page, "Taco Corner").getByRole("button", { name: /I'd go/ }).click(), card(lee, "Taco Corner").getByRole("button", { name: /I'd go/ }).click()]);
    await card(sam, "Pasta House").getByRole("button", { name: /I'd go/ }).click();
    await expect(card(sam, "Taco Corner").getByRole("button", { name: /I'd go 2/ })).toBeVisible();
    expect((await snapshot(page)).participants).toHaveLength(3);
    deadline(url);
    const results = await Promise.all([snapshot(page), snapshot(sam), snapshot(lee)]);
    expect(results[1].result).toEqual(results[0].result); expect(results[2].result).toEqual(results[0].result);
    for (const participant of [page, sam, lee]) {
      await expectWinner(participant, "Taco Corner");
      await expect(participant.getByTestId("result")).toContainText("most approvals");
    }
    const closed = await page.request.put(`${apiUrl(url)}/options/${results[0].options[0].id}/response`, { headers: { Origin: new URL(url).origin }, data: { choice: "approve" } });
    expect(closed.status()).toBe(409);
    await page.reload(); await expectWinner(page, "Taco Corner");
    expect((await snapshot(page)).result).toEqual(results[0].result);
    expect(errors).toEqual([]);
  } finally { await samContext.close(); await leeContext.close(); }
});

test("preferences choose without votes; dirty drafts survive shared updates", async ({ page, browser }) => {
  const url = await createRoom(page);
  await page.getByText("My preferences", { exact: false }).click();
  await page.getByLabel("Italian", { exact: true }).check();
  const context = await browser.newContext();
  try {
    const sam = await context.newPage(); await joinRoom(sam, url, "Sam");
    await expect(page.locator(".people-panel")).toContainText("Sam");
    await expect(page.getByLabel("Italian", { exact: true })).toBeChecked();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByText("Saved ✓", { exact: true })).toBeVisible();
    await sam.getByText("My preferences", { exact: false }).click();
    await sam.getByLabel("Italian", { exact: true }).check();
    await sam.getByLabel("Preferred price ceiling").selectOption("1");
    await sam.getByRole("button", { name: "Save preferences" }).click();
    await expect(sam.getByText("Saved ✓", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByText("My preferences", { exact: false }).click();
    await expect(page.getByLabel("Italian", { exact: true })).toBeChecked();
    deadline(url);
    await expectWinner(page, "Pasta House"); await expectWinner(sam, "Pasta House");
    await expect(page.getByTestId("result")).toContainText("75% preference match");
    await expect(page.getByTestId("result")).toContainText("0 approved");
  } finally { await context.close(); }
});

test("blocks exclude a popular option; clearing restores other people's approvals", async ({ page, browser }) => {
  const url = await createRoom(page);
  await card(page, "Little Thai").getByRole("button", { name: /I'd go/ }).click();
  const context = await browser.newContext();
  try {
    const sam = await context.newPage(); await joinRoom(sam, url, "Sam");
    const block = card(sam, "Little Thai").getByRole("button", { name: /Can't do this/ });
    await block.click(); await expect(card(page, "Little Thai")).toContainText("Excluded");
    await block.click(); await expect(card(page, "Little Thai")).not.toContainText("Excluded");
    await expect(card(page, "Little Thai").getByRole("button", { name: /I'd go 1/ })).toBeVisible();
    await block.click(); await expect(block).toHaveAttribute("aria-pressed", "true");
    deadline(url); await expectWinner(page, "Pasta House");
    await expect(page.getByTestId("result")).toContainText("1 approval was on excluded options");
  } finally { await context.close(); }
});

test("all blocked options close with no winner", async ({ page }) => {
  const url = await createRoom(page);
  for (const name of ["Little Thai", "Pasta House"]) {
    const button = card(page, name).getByRole("button", { name: /Can't do this/ });
    await button.click(); await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  deadline(url);
  await expect(page.getByTestId("result")).toContainText("NO WINNER THIS ROUND");
  expect((await snapshot(page)).result?.winner).toBeNull();
});

test("ownership, guest continuity, CSRF protection and leaving work through HTTP", async ({ page, browser }) => {
  const url = await createRoom(page);
  const own = await snapshot(page);
  const context = await browser.newContext();
  try {
    const sam = await context.newPage(); await joinRoom(sam, url, "Sam");
    await expect(sam.getByRole("button", { name: "Remove Little Thai" })).toHaveCount(0);
    const forbidden = await sam.request.delete(`${apiUrl(url)}/options/${own.options[0].id}`, { headers: { Origin: new URL(url).origin }, data: { participantId: own.me!.id } });
    expect(forbidden.status()).toBe(403);
    const csrf = await page.request.put(`${apiUrl(url)}/preferences`, { headers: { Origin: "https://unrelated.example" }, data: { cuisines: ["Thai"] } });
    expect(csrf.status()).toBe(403);
    const samCard = card(sam, "Little Thai");
    await samCard.getByRole("button", { name: /I'd go/ }).click();
    await samCard.getByRole("button", { name: /Can't do this/ }).click();
    await expect(samCard.getByRole("button", { name: /I'd go 0/ })).toHaveAttribute("aria-pressed", "false");
    await sam.reload();
    await expect(samCard.getByRole("button", { name: /Can't do this/ })).toHaveAttribute("aria-pressed", "true");
    await sam.getByRole("button", { name: "Leave this meal" }).click();
    await expect(sam.getByRole("button", { name: "Join the table" })).toBeVisible();
    await expect(card(page, "Little Thai")).not.toContainText("Excluded");
    await expect(card(page, "Pasta House")).toBeVisible();
    const cookie = (await page.context().cookies()).find((c) => c.name === "lets_eat_guest");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    const secondUrl = await createRoom(page, false);
    const second = await snapshot(page, secondUrl);
    const scoped = await page.request.put(`${apiUrl(url)}/options/${second.options[0].id}/response`, { headers: { Origin: new URL(url).origin }, data: { choice: "approve" } });
    expect(scoped.status()).toBe(404);
    await page.goto(url);
    expect((await snapshot(page)).me?.id).toBe(own.me?.id);
    expect((await page.context().cookies()).find((c) => c.name === "lets_eat_guest")?.value).toBe(cookie?.value);
  } finally { await context.close(); }
});

test("no input and exact vote ties use the first proposal", async ({ page }) => {
  const firstUrl = await createRoom(page);
  deadline(firstUrl); await expectWinner(page, "Little Thai");
  await expect(page.getByTestId("result")).toContainText("No votes or preferences");
  const secondUrl = await createRoom(page);
  for (const name of ["Little Thai", "Pasta House"]) {
    const button = card(page, name).getByRole("button", { name: /I'd go/ });
    await button.click(); await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  deadline(secondUrl); await expectWinner(page, "Little Thai");
  await expect(page.getByTestId("result")).toContainText("tied on approvals and preference match");
});

test("the room closes when no browser is open", async ({ page, context }) => {
  const url = await createRoom(page);
  const cutoff = Date.now() + 1200;
  deadline(url, cutoff);
  await page.close();
  await expect.poll(() => Date.now(), { intervals: [300] }).toBeGreaterThanOrEqual(cutoff);
  const returning = await context.newPage(); await returning.goto(url);
  await expectWinner(returning, "Little Thai");
  await expect(returning.getByRole("button", { name: /I'd go/ }).first()).toBeDisabled();
});

test("mobile keyboard flow, inline validation, and a copyable result", async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const url = await createRoom(page);
  const approve = card(page, "Pasta House").getByRole("button", { name: /I'd go/ });
  await approve.focus(); await page.keyboard.press("Enter");
  await expect(approve).toHaveAttribute("aria-pressed", "true");
  await page.getByText("My preferences", { exact: false }).click();
  await page.getByLabel("From", { exact: true }).fill("12:00");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator(".preference-panel").getByRole("alert")).toContainText("highlighted");
  await expect(page.getByText("Enter both ends", { exact: false })).toBeVisible();
  await page.getByLabel("Until", { exact: true }).fill("13:00");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Saved ✓", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  deadline(url); await expectWinner(page, "Pasta House");
  await page.getByRole("button", { name: "Copy meal summary" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Pasta House");
  await page.screenshot({ path: testInfo.outputPath("mobile-result.png"), fullPage: true });
});

for (const clipboard of ["unavailable", "denied"] as const) {
  test(`one click copies the full invite link when the clipboard API is ${clipboard}`, async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const url = await createRoom(page, false);
    await page.evaluate((mode) => {
      Object.defineProperty(navigator, "clipboard", { value: mode === "unavailable" ? undefined : {
        writeText: () => Promise.reject(new DOMException("Clipboard access denied", "NotAllowedError")),
      } });
    }, clipboard);
    await page.getByRole("button", { name: "Copy invite link" }).click();
    await expect(page.getByRole("button", { name: "Copied ✓" })).toBeVisible();
    await expect(page.getByLabel("Select and copy")).toHaveCount(0);
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copied ✓" })).toBeFocused();
    const reader = await context.newPage();
    try {
      await reader.goto("/");
      await reader.bringToFront();
      expect(await reader.evaluate(() => navigator.clipboard.readText())).toBe(url);
    } finally { await reader.close(); }
  });
}

test("a network failure preserves the preference draft until a successful retry", async ({ page, context }) => {
  await createRoom(page);
  await page.getByText("My preferences", { exact: false }).click();
  await page.getByLabel("Thai", { exact: true }).check();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator(".preference-panel").getByRole("alert")).toContainText("Your draft is still here");
  await expect(page.getByLabel("Thai", { exact: true })).toBeChecked();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Saved ✓", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByText("My preferences", { exact: false }).click();
  await expect(page.getByLabel("Thai", { exact: true })).toBeChecked();
});
