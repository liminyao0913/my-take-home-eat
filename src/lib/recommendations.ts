import { PROFILE_IDLE_MS, type PersonalRound, type SavedPreferences, type Suggestion, type Suggestions } from "./contracts";

const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const placeKey = (place: { placeName: string; location: string; sourceOptionId: number }) => normalized(place.location)
  ? JSON.stringify([normalized(place.placeName), normalized(place.location)]) : `option:${place.sourceOptionId}`;

export function recommend(rounds: PersonalRound[], preferences: SavedPreferences, area: string, otherAreas: boolean, now: number): Suggestions {
  const seen = new Set<string>();
  const recent = rounds.filter((item) => item.closedAt >= now - PROFILE_IDLE_MS && item.closedAt <= now)
    .sort((a, b) => b.closedAt - a.closedAt || (a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0) || b.round - a.round)
    .filter((item) => { const key = `${item.roomId}:${item.round}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 20);
  function collect(input: PersonalRound[]) {
    const places = new Map<string, { suggestion: Suggestion; approvals: Set<string>; picks: Set<string> }>();
    for (const item of input) for (const signal of item.signals) {
      if (!signal.approved && !signal.groupPick) continue;
      const key = placeKey(signal);
      let entry = places.get(key);
      if (!entry) {
        const place = { sourceOptionId: signal.sourceOptionId, placeName: signal.placeName, location: signal.location, cuisine: signal.cuisine, priceLevel: signal.priceLevel, link: signal.link };
        entry = { suggestion: { ...place, approvalRounds: 0, groupPickRounds: 0, lastChosenAt: item.closedAt, matchPercent: null, reason: "", area: item.area }, approvals: new Set(), picks: new Set() };
        places.set(key, entry);
      }
      const roundKey = `${item.roomId}:${item.round}`;
      if (signal.approved) entry.approvals.add(roundKey);
      if (signal.groupPick) entry.picks.add(roundKey);
    }
    return places;
  }
  const matching = area ? recent.filter((item) => normalized(item.area) === normalized(area)) : recent;
  const localPlaces = collect(matching);
  const allPlaces = collect(recent);
  const otherAreaCount = [...allPlaces.keys()].filter((key) => !localPlaces.has(key)).length;
  const candidates = [...(otherAreas ? allPlaces : localPlaces).values()].map(({ suggestion, approvals, picks }) => {
    const matches: boolean[] = [];
    if (preferences.cuisines.length) matches.push(suggestion.cuisine !== null && preferences.cuisines.includes(suggestion.cuisine as SavedPreferences["cuisines"][number]));
    if (preferences.maxPriceLevel !== null) matches.push(suggestion.priceLevel !== null && suggestion.priceLevel <= preferences.maxPriceLevel);
    suggestion.matchPercent = matches.length ? 100 * matches.filter(Boolean).length / matches.length : null;
    suggestion.approvalRounds = approvals.size; suggestion.groupPickRounds = picks.size;
    suggestion.reason = approvals.size ? `You approved this in ${approvals.size} round${approvals.size === 1 ? "" : "s"}.` : `A previous group pick in ${picks.size} round${picks.size === 1 ? "" : "s"}.`;
    if (suggestion.matchPercent === 100) suggestion.reason += " Matches your selected preferences.";
    return suggestion;
  });
  candidates.sort((a, b) => (b.matchPercent ?? 0) - (a.matchPercent ?? 0) || b.approvalRounds - a.approvalRounds || b.groupPickRounds - a.groupPickRounds || b.lastChosenAt - a.lastChosenAt || a.sourceOptionId - b.sourceOptionId);
  return { suggestions: candidates.slice(0, 3), otherAreaCount };
}
