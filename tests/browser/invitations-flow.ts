import { expect, type Browser, type Page } from "@playwright/test";
import type { RoomSnapshot } from "../../src/lib/contracts";

export async function verifyInvitations(browser: Browser, origin: string, screenshot: (page: Page, name: string) => Promise<unknown>) {
  const owner = await browser.newContext({ baseURL: origin, timezoneId: "UTC", permissions: ["clipboard-read", "clipboard-write"] });
  const guest = await browser.newContext({ baseURL: origin, timezoneId: "UTC", viewport: { width: 375, height: 812 } });
  const headers = { Origin: origin, "X-Room-Round": "1" };
  try {
    const page = await owner.newPage(); const other = await guest.newPage();
    await page.goto("/");
    await page.getByLabel("Your name", { exact: true }).fill("Invitation organizer");
    await page.getByLabel("Meal date", { exact: true }).fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await page.getByLabel("Place name", { exact: true }).fill("Invitation Thai");
    await page.getByLabel("Start time", { exact: true }).fill("12:30");
    await page.getByText("Meal details (optional)", { exact: true }).click();
    await page.getByLabel("Meal title", { exact: true }).fill(`P1 invitations ${new Date().toISOString()}`);
    await page.getByLabel("Expected people (including you)", { exact: true }).fill("4");
    await page.getByRole("button", { name: "Create a meal room", exact: true }).click();
    await expect(page).toHaveURL(/\/r\/[\w-]+$/);
    const invite = page.url(); const id = new URL(invite).pathname.split("/").at(-1)!;
    const endpoint = `/api/rooms/${id}`;
    await expect(page.locator(".participation-bar")).toContainText("1 joined of 4 expected");
    await other.goto(invite);
    // A matching display name must not grant organizer authority.
    await other.getByLabel("Your name", { exact: true }).fill("Invitation organizer");
    await other.getByRole("button", { name: "Join the table", exact: true }).click();
    for (const person of [page, other]) await expect(person.locator(".participation-bar")).toContainText("2 joined of 4 expected");
    await page.getByRole("button", { name: "I'm done", exact: true }).click();
    const unready = await owner.request.post(`${endpoint}/finish`, { headers, data: { overrideMissing: true } });
    expect(unready.status()).toBe(409); expect((await unready.json()).code).toBe("NOT_READY");
    await other.getByRole("button", { name: "I'm done", exact: true }).click();
    await expect(other.getByRole("region", { name: "Finish voting" })).toContainText("The organizer must confirm");
    await expect(other.getByRole("button", { name: "Finish voting early", exact: true })).toHaveCount(0);
    const implicit = await owner.request.post(`${endpoint}/finish`, { headers });
    expect(implicit.status()).toBe(409); expect((await implicit.json()).code).toBe("MISSING_INVITEES");
    const unauthorized = await guest.request.post(`${endpoint}/finish`, { headers, data: { overrideMissing: true } });
    expect(unauthorized.status()).toBe(403); expect((await unauthorized.json()).code).toBe("ORGANIZER_REQUIRED");
    await page.getByRole("button", { name: "Finish voting early", exact: true }).click();
    await expect(page.getByRole("group", { name: "Confirm early finish" })).toContainText("2 joined of 4 expected");
    await screenshot(page, "invitations-confirm.png");
    await page.getByRole("button", { name: "Keep the round open", exact: true }).click();
    expect((await (await owner.request.get(endpoint)).json()).state).toBe("open");
    await page.getByRole("button", { name: "Finish voting early", exact: true }).click();
    await page.getByRole("button", { name: "Finish without missing people", exact: true }).click();
    const closed: RoomSnapshot = await (await owner.request.get(endpoint)).json();
    expect(closed.result).toMatchObject({ participantCount: 2, expectedParticipantCount: 4, invitationOverride: true, closedEarly: true });
    expect(closed.me?.isOrganizer).toBe(true);
    for (const person of [page, other]) {
      await person.reload();
      await expect(person.getByTestId("result")).toContainText("Organizer finished with 2 of 4 expected people.");
      expect((await (await person.request.get(endpoint)).json()).result).toEqual(closed.result);
    }
    expect((await (await guest.request.get(endpoint)).json()).me.isOrganizer).toBe(false);
    expect(await other.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await screenshot(other, "invitations-result-mobile.png");
    await page.bringToFront();
    await page.getByRole("button", { name: "Copy meal summary", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Organizer finished with 2 of 4 expected people.");
    return { checkedAt: new Date().toISOString(), roomId: id, expected: 4, joined: 2, rejectedUnready: unready.status(), rejectedImplicitFinish: implicit.status(), rejectedGuestOverride: unauthorized.status(), result: closed.result };
  } finally { await owner.close(); await guest.close(); }
}
