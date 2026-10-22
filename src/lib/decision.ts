import type { DecisionResult, MealOption, Preferences } from "./contracts";
import { localMinute, minuteOfDay } from "./time";

export function preferenceUnits(option: MealOption, preference: Preferences, timeZone: string): number | null {
  const matches: boolean[] = [];
  if (preference.cuisines.length) matches.push(preference.cuisines.includes(option.cuisine as Preferences["cuisines"][number]));
  if (preference.maxPriceLevel !== null) matches.push(option.priceLevel <= preference.maxPriceLevel);
  if (preference.startTime !== null && preference.endTime !== null) {
    const minute = localMinute(option.startAt, timeZone);
    matches.push(minute >= minuteOfDay(preference.startTime) && minute <= minuteOfDay(preference.endTime));
  }
  return matches.length ? 6 * matches.filter(Boolean).length / matches.length : null;
}

export function decide(input: {
  options: MealOption[]; preferences: Preferences[]; participantCount: number;
  voterCount: number; deadlineAt: number; timeZone: string;
}): DecisionResult {
  const preferences = input.preferences.filter((p) => p.cuisines.length || p.maxPriceLevel !== null || p.startTime !== null);
  const excludedApprovalCount = input.options.filter((o) => o.blockCount > 0).reduce((sum, o) => sum + o.approvalCount, 0);
  const ranked = input.options.filter((o) => o.blockCount === 0).map((option) => ({
    option, units: preferences.reduce((sum, p) => sum + (preferenceUnits(option, p, input.timeZone) ?? 0), 0),
  })).sort((a, b) => b.option.approvalCount - a.option.approvalCount || b.units - a.units || a.option.id - b.option.id);
  const first = ranked[0];
  let basis: DecisionResult["basis"] = "no-options";
  let message = input.options.length ? "Every option has a ‘Can't do this’ response. Start a new room with some different ideas." : "No meal options remain. Start a new room to try again.";
  if (first) {
    const voteTied = ranked.filter((r) => r.option.approvalCount === first.option.approvalCount);
    const scoreTied = voteTied.filter((r) => r.units === first.units);
    if (first.option.approvalCount > 0 && voteTied.length === 1) {
      basis = "votes";
      message = "This meal has the most approvals among options everyone can still consider.";
    } else if (preferences.length && scoreTied.length === 1) {
      basis = first.option.approvalCount > 0 ? "preference-tiebreak" : "preferences";
      message = first.option.approvalCount > 0 ? "Approvals tied. This meal matches the group's preferences best." : "No eligible option received an approval. This meal matches the group's preferences best.";
    } else {
      basis = "first-proposed";
      message = first.option.approvalCount === 0 && preferences.length === 0
        ? "No votes or preferences to rank these options; first proposed option selected."
        : "The leading options tied on approvals and preference match. The first proposed option was selected.";
    }
  }
  if (excludedApprovalCount) message += ` ${excludedApprovalCount} approval${excludedApprovalCount === 1 ? " was" : "s were"} on excluded options and could not count toward a winner.`;
  return {
    winner: first?.option ?? null, basis, message,
    participantCount: input.participantCount, voterCount: input.voterCount, preferenceCount: preferences.length,
    excludedApprovalCount, groupMatchPercent: first && preferences.length ? 100 * first.units / (6 * preferences.length) : null,
    closedAt: input.deadlineAt,
  };
}
