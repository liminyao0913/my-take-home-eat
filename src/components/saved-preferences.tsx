"use client";

import { PRICE_LABELS, type SavedPreferences } from "@/lib/contracts";
import { CuisineBudgetFields } from "./forms";

export const blankPreferences: SavedPreferences = { cuisines: [], maxPriceLevel: null };
export const hasSavedPreferences = (value: SavedPreferences) => value.cuisines.length > 0 || value.maxPriceLevel !== null;

export function SavedPreferenceChoice({ value, enabled, onToggle, onChange }: {
  value: SavedPreferences; enabled: boolean; onToggle: (enabled: boolean) => void; onChange: (value: SavedPreferences) => void;
}) {
  const summary = [value.cuisines.join(", "), value.maxPriceLevel === null ? "" : `up to ${PRICE_LABELS[value.maxPriceLevel]}`].filter(Boolean).join(" · ") || "No cuisine or budget selected";
  return <div className="saved-preference-choice">
    <label className="together-choice"><input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} /> Use my saved preferences</label>
    <p className="hint">{enabled ? summary : "Starting this meal without saved preferences."}</p>
    {enabled && <details className="optional-details"><summary>Edit preferences for this meal</summary><CuisineBudgetFields value={value} onChange={onChange} /><p className="hint">Applies when you create or join. Your saved defaults stay unchanged.</p></details>}
  </div>;
}
