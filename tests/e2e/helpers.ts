import { expect, type Locator, type Page } from "@playwright/test";
import Sqlite from "better-sqlite3";
import { dirname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { RoomSnapshot } from "../../src/lib/contracts";

export async function fillOption(scope: Locator, name: string, cuisine = "Thai", price = "1") {
  await scope.getByLabel("Place name", { exact: true }).fill(name);
  await scope.getByText("Restaurant details (optional)", { exact: true }).click();
  await scope.getByLabel("Location", { exact: true }).fill(`${name} on Main St`);
  await scope.getByLabel("Start time", { exact: true }).fill("12:30");
  await scope.getByLabel("Cuisine", { exact: true }).selectOption(cuisine);
  await scope.getByLabel("Price per person").selectOption(price);
}

export async function createRoom(page: Page, two = true, origin = "/") {
  await page.goto(origin);
  await page.getByLabel("Your name").fill("Alex");
  await page.getByText("Meal details (optional)", { exact: true }).click();
  await page.getByLabel("Meal title").fill("Lunch with the crew");
  await page.getByLabel("Meal date").fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  await page.getByLabel("Area", { exact: true }).fill("Downtown");
  await fillOption(page.getByRole("group", { name: "Meal option 1", exact: true }), "Little Thai");
  if (two) {
    await page.getByRole("button", { name: "Add another idea" }).click();
    await fillOption(page.getByRole("group", { name: "Meal option 2", exact: true }), "Pasta House", "Italian", "2");
  }
  await page.getByRole("button", { name: "Create a meal room" }).click();
  await expect(page).toHaveURL(/\/r\/[\w-]+$/);
  await expect(page.getByRole("heading", { name: "Lunch with the crew" })).toBeVisible();
  return page.url();
}

export async function joinRoom(page: Page, url: string, name: string) {
  await page.goto(url);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join the table" }).click();
  await expect(page.getByRole("button", { name: "I'm done", exact: true })).toBeVisible();
}

export function apiUrl(url: string) {
  return url.replace("/r/", "/api/rooms/");
}

export async function snapshot(page: Page, url = page.url()): Promise<RoomSnapshot> {
  const response = await page.request.get(apiUrl(url));
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export function deadline(url: string, value = Date.now() - 1, filename = process.env.LETS_EAT_E2E_DB!) {
  const path = resolve(filename);
  if (!dirname(path).startsWith(`${resolve(tmpdir())}${sep}lets-eat-e2e-`) || !path.endsWith(`${sep}test.sqlite`)) throw new Error("Refusing to change a non-test database");
  const sqlite = new Sqlite(path, { timeout: 5000 });
  try {
    const result = sqlite.prepare("UPDATE rooms SET deadline_at = ? WHERE id = ? AND result_json IS NULL").run(value, new URL(url).pathname.split("/").pop());
    expect(result.changes).toBe(1);
  } finally { sqlite.close(); }
}

export const card = (page: Page, name: string) => page.getByRole("article", { name, exact: true });
export async function expectWinner(page: Page, name: string) {
  await expect(page.getByTestId("result").getByRole("heading", { name, exact: true })).toBeVisible();
}
