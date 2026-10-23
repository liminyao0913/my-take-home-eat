"use client";

import { useState, type FormEvent, type RefObject } from "react";
import { type ApiErrorBody, type Preferences } from "@/lib/contracts";
import { errorDetails } from "@/lib/client";
import { CuisineBudgetFields, Field, FormError } from "./forms";
import type { Mutate } from "./use-room";

export function PreferenceForm({ initial, busy, mutate, detailsRef }: { initial: Preferences; busy: boolean; mutate: Mutate; detailsRef: RefObject<HTMLDetailsElement | null> }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const [saved, setSaved] = useState(false);
  const [remember, setRemember] = useState(false);
  function change(next: Preferences) { setValue(next); setSaved(false); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setSaved(false);
    try { await mutate("/preferences", "PUT", { ...value, remember }); setSaved(true); }
    catch (error) { setError(errorDetails(error)); }
  }
  return <details className="panel preference-panel" ref={detailsRef}><summary><span>My preferences <small>optional & private</small></span><span className="expand-icon" aria-hidden="true">+</span></summary>
    <form onSubmit={submit}><p className="muted small">Your preferences help if votes tie or nobody votes. Leave anything blank to stay flexible.</p>
      <fieldset disabled={busy}>
        <CuisineBudgetFields value={value} onChange={(next) => change({ ...value, ...next })} />
        <p className="field-label window-label">Preferred start window</p>
        <div className="form-grid"><Field label="From" type="time" value={value.startTime ?? ""} onChange={(e) => change({ ...value, startTime: e.target.value || null })} error={error?.fieldErrors?.startTime} /><Field label="Until" type="time" value={value.endTime ?? ""} onChange={(e) => change({ ...value, endTime: e.target.value || null })} error={error?.fieldErrors?.endTime} /></div>
        <label className="remember-choice"><input type="checkbox" checked={remember} onChange={(event) => { setRemember(event.target.checked); setSaved(false); }} /> Remember cuisine and budget for future meals</label>
        <p className="hint">Your time window stays with this meal.</p>
        <FormError error={error} /><div className="save-row"><button className="button secondary" type="submit">Save preferences</button><span role="status" className="saved">{saved ? "Saved ✓" : ""}</span></div>
      </fieldset>
    </form>
  </details>;
}
