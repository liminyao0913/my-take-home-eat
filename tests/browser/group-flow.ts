import { expect, type Browser, type Page } from "@playwright/test";
import type { RoomSnapshot } from "../../src/lib/contracts";

// Public browser/API behavior only: shared by localhost and hosted validation.
export async function verifyGroupFlow(browser: Browser, origin: string, screenshot: (page: Page, name: string) => Promise<unknown>) {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ baseURL: origin, timezoneId: "UTC" })));
  const headers = { Origin: origin, "X-Room-Round": "1" };
  try {
    const [organizer, guest, late] = await Promise.all(contexts.map((context) => context.newPage()));
    const pages = [organizer, guest, late];
    const title = `P1 group validation ${new Date().toISOString()}`;
    await organizer.goto("/");
    await organizer.getByLabel("Your name").fill("P1 organizer");
    await organizer.getByText("Meal details (optional)", { exact: true }).click();
    await organizer.getByLabel("Meal title", { exact: true }).fill(title);
    await organizer.getByLabel("Meal date", { exact: true }).fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    await organizer.getByLabel("Place name", { exact: true }).fill("P1 Thai");
    await organizer.getByLabel("Start time", { exact: true }).fill("12:30");
    await organizer.getByRole("button", { name: "Create a meal room", exact: true }).click();
    await expect(organizer).toHaveURL(/\/r\/[\w-]+$/);
    const invite = organizer.url(); const id = new URL(invite).pathname.split("/").at(-1)!;
    const endpoint = `/api/rooms/${id}`;
    const read = async (page: Page): Promise<RoomSnapshot> => {
      const response = await page.request.get(endpoint); expect(response.status()).toBe(200); return response.json();
    };
    await Promise.all([guest.goto(invite), late.goto(invite)]);
    expect((await read(late)).me).toBeNull();
    expect((await contexts[2].cookies()).some((cookie) => cookie.name === "lets_eat_guest")).toBe(false);
    await guest.getByLabel("Your name").fill("P1 first guest");
    await guest.getByRole("button", { name: "Join the table", exact: true }).click();
    await expect(guest.getByRole("button", { name: "I'm done", exact: true })).toBeVisible();
    for (const [i, person] of [organizer, guest].entries()) {
      await person.locator(".add-option > summary").click();
      await person.getByLabel("Place name", { exact: true }).fill(i ? "P1 guest noodles" : "P1 organizer pasta");
      await person.getByLabel("Start time", { exact: true }).fill("13:00");
    }
    await Promise.all([organizer, guest].map((person) => person.getByRole("button", { name: "Add option", exact: true }).click()));
    for (const person of pages) {
      await expect(person.getByRole("article", { name: "P1 guest noodles", exact: true })).toBeVisible();
      await expect(person.getByRole("article", { name: "P1 organizer pasta", exact: true })).toBeVisible();
    }
    const first = await read(organizer);
    const winnerId = first.options.find((option) => option.placeName === "P1 Thai")!.id;
    const alternateId = first.options.find((option) => option.placeName === "P1 guest noodles")!.id;
    await Promise.all([
      organizer.getByRole("article", { name: "P1 Thai", exact: true }).getByRole("button", { name: /I'd go/ }).click(),
      guest.getByRole("article", { name: "P1 guest noodles", exact: true }).getByRole("button", { name: /I'd go/ }).click(),
    ]);
    expect((await read(organizer)).me?.choices).toEqual({ [winnerId]: "approve" });
    expect((await read(guest)).me?.choices).toEqual({ [alternateId]: "approve" });
    await guest.getByRole("article", { name: "P1 Thai", exact: true }).getByRole("button", { name: /I'd go/ }).click();
    const cuisines = ["Thai", "Italian", "Mexican"];
    async function preferences(person: Page, index: number) {
      await person.getByRole("button", { name: "My preferences (optional)", exact: true }).click();
      await person.getByLabel(cuisines[index], { exact: true }).check();
      await person.getByLabel("Preferred price ceiling").selectOption(String(index + 1));
      await person.getByRole("button", { name: "Save preferences", exact: true }).click();
      await expect(person.getByText("Saved ✓", { exact: true })).toBeVisible();
    }
    await preferences(organizer, 0); await preferences(guest, 1);
    const publicView = await read(late);
    expect(publicView.me).toBeNull(); expect(JSON.stringify(publicView)).not.toMatch(/tokenHash|maxPriceLevel|preferredStartMinute/);
    for (const person of [organizer, guest]) await person.getByRole("button", { name: "I'm done", exact: true }).click();
    await organizer.getByRole("button", { name: "Finish voting early", exact: true }).click();
    await expect(organizer.getByRole("group", { name: "Confirm early finish" })).toContainText("All 2 joined people are ready");
    await late.getByLabel("Your name").fill("P1 late guest");
    await late.getByRole("button", { name: "Join the table", exact: true }).click();
    await expect(late.getByRole("button", { name: "I'm done", exact: true })).toBeVisible();
    const staleFinish = await organizer.request.post(`${endpoint}/finish`, { headers });
    expect(staleFinish.status()).toBe(409); expect((await staleFinish.json()).code).toBe("NOT_READY");
    expect((await read(organizer)).state).toBe("open");
    await preferences(late, 2);
    await late.getByRole("article", { name: "P1 Thai", exact: true }).getByRole("button", { name: /I'd go/ }).click();
    await late.getByRole("button", { name: "I'm done", exact: true }).click();
    await expect(organizer.getByText("3 of 3 people are ready to finish.", { exact: true })).toBeVisible();
    const [finish, vote] = await Promise.all([
      organizer.request.post(`${endpoint}/finish`, { headers }),
      late.request.put(`${endpoint}/options/${alternateId}/response`, { headers, data: { choice: "approve" } }),
    ]);
    expect([finish.status(), vote.status()].sort()).toEqual([200, 409]);
    let raceOrder: string;
    if (finish.status() === 200) {
      raceOrder = "finish-before-vote";
      expect((await vote.json()).code).toBe("ROOM_CLOSED");
    } else {
      raceOrder = "vote-before-finish";
      expect((await finish.json()).code).toBe("NOT_READY");
      expect((await read(late)).me?.ready).toBe(false);
      expect((await late.request.put(`${endpoint}/participants/me/ready`, { headers, data: { ready: true } })).status()).toBe(200);
      await organizer.getByRole("button", { name: "Confirm and show result", exact: true }).click();
    }
    const outcomes = await Promise.all(pages.map(read));
    expect(new Set(outcomes.map((value) => value.me?.id)).size).toBe(3);
    const tokens = await Promise.all(contexts.map(async (context) => (await context.cookies()).find((cookie) => cookie.name === "lets_eat_guest")!.value));
    expect(new Set(tokens).size).toBe(3);
    expect(outcomes[0].result).toMatchObject({ winner: { placeName: "P1 Thai", approvalCount: 3 }, closedEarly: true });
    expect(outcomes[0].options.find((option) => option.id === alternateId)?.approvalCount).toBe(vote.status() === 200 ? 2 : 1);
    for (const [i, person] of pages.entries()) {
      expect(outcomes[i].result).toEqual(outcomes[0].result);
      expect(outcomes[i].me?.preferences).toMatchObject({ cuisines: [cuisines[i]], maxPriceLevel: i + 1 });
      expect(outcomes[i].participants).toHaveLength(3);
      expect(JSON.stringify(outcomes[i].participants)).not.toMatch(/preferences|cuisines|maxPriceLevel|token/);
      await person.reload();
      await expect(person.getByTestId("result").getByRole("heading", { name: "P1 Thai", exact: true })).toBeVisible();
      expect((await read(person)).me).toEqual(outcomes[i].me);
      await screenshot(person, `p1-session-${i + 1}.png`);
    }
    const outsider = await browser.newContext({ baseURL: origin });
    try { expect((await outsider.request.post(`${endpoint}/participants`, { headers, data: { displayName: "After closure" } })).status()).toBe(409); }
    finally { await outsider.close(); }
    return { checkedAt: new Date().toISOString(), roomId: id, title, participantCount: 3, distinctIdentities: 3, raceOrder, rejectedStaleFinish: staleFinish.status(), rejectedJoinAfterClosure: true, privatePreferencesIsolated: true, result: outcomes[0].result };
  } finally { await Promise.all(contexts.map((context) => context.close())); }
}
