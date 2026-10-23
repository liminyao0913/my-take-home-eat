import { describe, expect, it } from "vitest";
import { recommend } from "@/lib/recommendations";
import { PROFILE_IDLE_MS, type MealSignal, type PersonalRound } from "@/lib/contracts";

const now = Date.parse("2027-06-01T10:00:00Z");
const thai: MealSignal = { sourceOptionId: 1, placeName: "Little Thai", location: "12 Main", cuisine: "Thai", priceLevel: 1, link: null, approved: true, groupPick: false };
const pasta: MealSignal = { ...thai, sourceOptionId: 2, placeName: "Pasta", location: "14 Main", cuisine: "Italian", priceLevel: 2 };
const round = (n: number, signals: MealSignal[], area = "Downtown"): PersonalRound => ({ roomId: `room-${n}`, round: 1, closedAt: now - n * 1000, area, signals });
const empty = { cuisines: [], maxPriceLevel: null };

describe("personal recommendations", () => {
  it("ranks current preferences before history popularity and distinguishes unknown fields", () => {
    const result = recommend([round(1, [pasta]), round(2, [pasta]), round(3, [thai]), round(4, [{ ...thai, sourceOptionId: 3, placeName: "Unknown", location: "", cuisine: null, priceLevel: null }])], { cuisines: ["Thai"], maxPriceLevel: 1 }, "", false, now);
    expect(result.suggestions.map((item) => item.placeName)).toEqual(["Little Thai", "Pasta", "Unknown"]);
    expect(result.suggestions[0].matchPercent).toBe(100);
    expect(result.suggestions[2].matchPercent).toBe(0);
    expect(result.suggestions[0].reason).toContain("You approved this in 1 round");
  });
  it("counts one approval and group pick per distinct round and uses the latest details", () => {
    const old = round(2, [thai, { ...thai, sourceOptionId: 8, groupPick: true }]);
    const recent = round(1, [{ ...thai, sourceOptionId: 9, priceLevel: 2, groupPick: true }]);
    const result = recommend([old, old, recent], empty, "", false, now).suggestions;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ approvalRounds: 2, groupPickRounds: 2, priceLevel: 2, sourceOptionId: 9 });
  });
  it("does not equate equal names with different or unknown locations", () => {
    const result = recommend([round(1, [thai, { ...thai, sourceOptionId: 2, location: "13 Main" }, { ...thai, sourceOptionId: 3, location: "" }, { ...thai, sourceOptionId: 4, location: "" }])], empty, "", false, now);
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions.map((item) => item.sourceOptionId)).toEqual([1, 2, 3]);
  });
  it("filters recorded areas until the user explicitly asks for other areas", () => {
    const rounds = [round(1, [thai], "  DownTown "), round(2, [pasta], "Uptown")];
    expect(recommend(rounds, empty, "downtown", false, now)).toMatchObject({ suggestions: [{ placeName: "Little Thai" }], otherAreaCount: 1 });
    expect(recommend(rounds, empty, "Elsewhere", false, now)).toMatchObject({ suggestions: [], otherAreaCount: 2 });
    expect(recommend(rounds, empty, "Elsewhere", true, now).suggestions).toHaveLength(2);
  });
  it("uses approved group picks without claiming a personal approval", () => {
    const result = recommend([round(1, [{ ...thai, approved: false, groupPick: true }, { ...pasta, approved: false, groupPick: false }])], empty, "", false, now).suggestions;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ approvalRounds: 0, groupPickRounds: 1, matchPercent: null });
    expect(result[0].reason).toContain("A previous group pick");
    expect(result[0].reason).not.toContain("You approved");
  });
  it("counts empty participation rounds in the latest twenty and excludes stale rounds", () => {
    const rounds = Array.from({ length: 20 }, (_, n) => round(n + 1, []));
    rounds.push(round(21, [thai]), { ...round(0, [pasta]), closedAt: now - PROFILE_IDLE_MS - 1 });
    expect(recommend(rounds, empty, "", false, now).suggestions).toEqual([]);
    expect(recommend([], empty, "", false, now).suggestions).toEqual([]);
  });
  it("uses personal approvals, group picks, recency, and source order for successive ties", () => {
    const groupOnly = { ...thai, sourceOptionId: 3, placeName: "Group", location: "9 Main", approved: false, groupPick: true };
    const first = recommend([round(1, [pasta, thai, groupOnly]), round(2, [thai])], empty, "", false, now).suggestions;
    expect(first.map((item) => item.placeName)).toEqual(["Little Thai", "Pasta", "Group"]);
    expect(recommend([round(1, [pasta, thai])], empty, "", false, now).suggestions[0].sourceOptionId).toBe(1);
    expect(recommend([round(1, [pasta]), round(2, [thai])], empty, "", false, now).suggestions[0].sourceOptionId).toBe(2);
  });
});
