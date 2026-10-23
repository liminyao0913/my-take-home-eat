"use client";

import { useEffect, useState } from "react";
import { errorDetails, request } from "@/lib/client";
import type { OptionInput, PastPlace, SavedPreferences, Suggestions as SuggestionResult } from "@/lib/contracts";

export function Suggestions({ preferences, area, options, busy, onAdd }: {
  preferences: SavedPreferences; area: string; options: OptionInput[]; busy: boolean; onAdd: (place: PastPlace) => void;
}) {
  const [otherAreas, setOtherAreas] = useState("");
  const [retry, setRetry] = useState(0);
  const payload = JSON.stringify({ preferences, area, otherAreas: otherAreas === area && area !== "" });
  const [response, setResponse] = useState<{ payload: string; result?: SuggestionResult; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await request<SuggestionResult>("/api/profile/recommendations", "POST", JSON.parse(payload), controller.signal);
        if (!controller.signal.aborted) setResponse({ payload, result });
      } catch (error) { if (!controller.signal.aborted) setResponse({ payload, error: errorDetails(error).message }); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [payload, retry]);
  const current = response?.payload === payload ? response : null;
  return <section className="suggestions" aria-label="Ideas from your past meals"><h3>Ideas from your past meals</h3><p className="hint">Based on your previous choices. Details are past estimates; review them for this meal.</p>
    {area && <p className="hint">Matches the area label from your past meal, not a travel distance.</p>}
    {!current && <p className="hint" role="status">Finding your past ideas…</p>}
    {current?.error && <p className="small" role="status">Past ideas could not load. You can still add an idea below. <button type="button" className="text-button" onClick={() => setRetry((old) => old + 1)}>Retry suggestions</button></p>}
    {current?.result && <><div className="suggestion-list">{current.result.suggestions.map((place) => {
      const added = options.some((option) => option.placeName === place.placeName && option.location === place.location);
      return <article className="suggestion-card" key={place.sourceOptionId} aria-label={`Suggested ${place.placeName}`}><div><h4>{place.placeName}</h4><p className="small muted">{place.location || "Location to confirm"}{place.area ? ` · ${place.area}` : ""}</p><p className="hint">{place.cuisine ?? "Cuisine unknown"} · {place.priceLevel === null ? "Price unknown" : "$".repeat(place.priceLevel)}</p><p className="suggestion-reason">{place.reason}</p></div><button className="button secondary" type="button" disabled={busy || added} onClick={() => onAdd(place)}>{added ? "Added ✓" : "Add to this meal"}</button></article>;
    })}</div>{!current.result.suggestions.length && <p className="small muted">{area ? "No past ideas match this recorded area." : "No past approvals or approved group picks yet. Add your first idea below."}</p>}{current.result.otherAreaCount > 0 && otherAreas !== area && <button type="button" className="text-button" onClick={() => setOtherAreas(area)}>Show other past areas</button>}</>}
  </section>;
}
