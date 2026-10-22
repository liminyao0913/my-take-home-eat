"use client";

import { useState, type FormEvent } from "react";
import { CUISINES, PRICE_LABELS, type ApiErrorBody, type Preferences } from "@/lib/contracts";
import { errorDetails } from "@/lib/client";
import { Field, FormError, Select } from "./forms";
import type { Mutate } from "./use-room";

export function PreferenceForm({ initial, busy, mutate }: { initial: Preferences; busy: boolean; mutate: Mutate }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const [saved, setSaved] = useState(false);
  function change(next: Preferences) { setValue(next); setSaved(false); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setSaved(false);
    try { await mutate("/preferences", "PUT", value); setSaved(true); }
    catch (error) { setError(errorDetails(error)); }
  }
  return <details className="panel preference-panel"><summary><span>My preferences <small>optional & private</small></span><span className="expand-icon" aria-hidden="true">+</span></summary>
    <form onSubmit={submit}><p className="muted small">Your preferences help if votes tie or nobody votes. Leave anything blank to stay flexible.</p>
      <fieldset disabled={busy}>
        <fieldset className="cuisine-picker"><legend>Cuisines you like</legend><div className="chips">{CUISINES.map((c) => <label key={c} className={value.cuisines.includes(c) ? "chip checked" : "chip"}><input type="checkbox" checked={value.cuisines.includes(c)} onChange={(e) => change({ ...value, cuisines: e.target.checked ? [...value.cuisines, c] : value.cuisines.filter((item) => item !== c) })} />{c}</label>)}</div></fieldset>
        <Select label="Preferred price ceiling" value={value.maxPriceLevel ?? ""} onChange={(e) => change({ ...value, maxPriceLevel: e.target.value ? Number(e.target.value) : null })}><option value="">Any price</option>{[1, 2, 3].map((n) => <option key={n} value={n}>{"$".repeat(n)} · {PRICE_LABELS[n]}</option>)}</Select>
        <p className="field-label window-label">Preferred start window</p>
        <div className="form-grid"><Field label="From" type="time" value={value.startTime ?? ""} onChange={(e) => change({ ...value, startTime: e.target.value || null })} error={error?.fieldErrors?.startTime} /><Field label="Until" type="time" value={value.endTime ?? ""} onChange={(e) => change({ ...value, endTime: e.target.value || null })} error={error?.fieldErrors?.endTime} /></div>
        <FormError error={error} /><div className="save-row"><button className="button secondary" type="submit">Save preferences</button><span role="status" className="saved">{saved ? "Saved ✓" : ""}</span></div>
      </fieldset>
    </form>
  </details>;
}
