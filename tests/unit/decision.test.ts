import { describe, expect, it } from "vitest";
import { decide, preferenceUnits } from "@/lib/decision";
import { preferencesInput, type MealOption, type Preferences } from "@/lib/contracts";
import { toInstant } from "@/lib/time";

const blank = preferencesInput.parse({});
const meal = (id: number, changes: Partial<MealOption> = {}): MealOption => ({
  id, authorId: "one", placeName: `Meal ${id}`, location: "Main St", cuisine: "Thai", priceLevel: 2,
  startAt: toInstant("2027-06-01", "12:30", "UTC"), link: null, approvalCount: 0, blockCount: 0, ...changes,
});
const choose = (options: MealOption[], preferences: Preferences[] = []) => decide({ options, preferences, participantCount: Math.max(3, preferences.length), voterCount: 2, timeZone: "UTC", deadlineAt: 123 });

describe("decision order", () => {
  it("prioritizes a clear approval winner over a better preference match", () => {
    const result = choose([meal(1, { cuisine: "Italian", approvalCount: 2 }), meal(2, { approvalCount: 1 })], [{ ...blank, cuisines: ["Thai"] }]);
    expect(result).toMatchObject({ winner: { id: 1 }, basis: "votes", groupMatchPercent: 0, closedAt: 123 });
  });
  it.each([0, 2])("uses preferences with %i tied approvals", (approvalCount) => {
    const result = choose([meal(1, { cuisine: "Italian", approvalCount }), meal(2, { approvalCount })], [{ ...blank, cuisines: ["Thai"] }]);
    expect(result.winner?.id).toBe(2);
    expect(result.basis).toBe(approvalCount ? "preference-tiebreak" : "preferences");
  });
  it("omits blank preferences and gives each person equal influence", () => {
    const result = choose([meal(1)], [blank, { ...blank, cuisines: ["Thai"], maxPriceLevel: 1, startTime: "12:00", endTime: "13:00" }, { ...blank, cuisines: ["Thai"] }]);
    expect(result.preferenceCount).toBe(2);
    expect(result.groupMatchPercent).toBeCloseTo(100 * 5 / 6);
  });
  it("treats equal fractions as exact ties, then uses the earliest remaining proposal", () => {
    const prefs: Preferences[] = [
      { ...blank, cuisines: ["Thai"], maxPriceLevel: 1, startTime: "12:00", endTime: "13:00" },
      { ...blank, cuisines: ["Italian"], maxPriceLevel: 1, startTime: "12:00", endTime: "13:00" },
    ];
    const result = choose([meal(7, { cuisine: "Italian", priceLevel: 3 }), meal(4, { priceLevel: 2 })], prefs);
    expect(result.winner?.id).toBe(4);
    expect(result.basis).toBe("first-proposed");
    expect(result.groupMatchPercent).toBe(50);
  });
  it("ties six one-third matches with two full matches without floating-point drift", () => {
    const preferences: Preferences[] = [
      ...Array.from({ length: 2 }, () => ({ ...blank, cuisines: ["Italian"] as Preferences["cuisines"], maxPriceLevel: 3, startTime: "13:30", endTime: "13:30" })),
      ...Array.from({ length: 4 }, () => ({ ...blank, cuisines: ["Thai"] as Preferences["cuisines"], maxPriceLevel: 1, startTime: "14:00", endTime: "15:00" })),
    ];
    const result = choose([meal(1), meal(2, { cuisine: "Italian", priceLevel: 3, startAt: toInstant("2027-06-01", "13:30", "UTC") })], preferences);
    expect(result.winner?.id).toBe(1);
    expect(result.basis).toBe("first-proposed");
    expect(result.groupMatchPercent).toBeCloseTo(100 / 3);
  });
  it("excludes even the most popular blocked meal and explains excluded approvals", () => {
    const result = choose([meal(1, { blockCount: 1, approvalCount: 8 }), meal(2)]);
    expect(result).toMatchObject({ winner: { id: 2 }, excludedApprovalCount: 8, basis: "first-proposed" });
    expect(result.message).toContain("8 approvals were on excluded options");
  });
  it.each([{ options: [] }, { options: [meal(1, { blockCount: 1 })] }])("can close without a winner", ({ options }) => {
    expect(choose(options)).toMatchObject({ winner: null, basis: "no-options", groupMatchPercent: null });
  });
  it("honestly labels a no-input fallback", () => {
    expect(choose([meal(3), meal(1)])).toMatchObject({ winner: { id: 1 }, basis: "first-proposed", message: "No votes or preferences to rank these options; first proposed option selected." });
  });
});

describe("preference dimensions", () => {
  it("uses inclusive price and room-local time boundaries", () => {
    const option = meal(1, { startAt: toInstant("2027-06-01", "12:30", "America/Los_Angeles") });
    expect(preferenceUnits(option, { ...blank, maxPriceLevel: 2, startTime: "12:30", endTime: "12:30" }, "America/Los_Angeles")).toBe(6);
    expect(preferenceUnits(option, { ...blank, maxPriceLevel: 1, startTime: "12:31", endTime: "13:00" }, "America/Los_Angeles")).toBe(0);
    expect(preferenceUnits(option, blank, "UTC")).toBeNull();
  });
});
