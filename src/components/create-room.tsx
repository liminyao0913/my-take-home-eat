"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { errorDetails, request } from "@/lib/client";
import type { ApiErrorBody, OptionInput } from "@/lib/contracts";
import { emptyOption, Field, FormError, OptionFields } from "./forms";

export function CreateRoom() {
  const router = useRouter();
  const [defaults, setDefaults] = useState<{ date: string; zone: string } | null>(null);
  const [options, setOptions] = useState<OptionInput[]>([emptyOption()]);
  const [addTogether, setAddTogether] = useState(false);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const date = new Date(Date.now() + 60 * 60 * 1000);
    const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const timer = setTimeout(() => {
      setDefaults({ date: local, zone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      setOptions([{ ...emptyOption(), startTime: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` }]);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      const room = await request<{ path: string }>("/api/rooms", "POST", {
        displayName: data.get("displayName"), title: String(data.get("title") || "").trim() || "Let's grab a bite", area: data.get("area"), mealDate: data.get("mealDate"), timeZone: data.get("timeZone"), options: addTogether ? [] : options,
      });
      router.push(room.path);
    } catch (error) { setError(errorDetails(error)); setBusy(false); }
  }

  if (!defaults) return <div className="panel loading" role="status">Getting the table ready…</div>;
  return <form className="panel create-form" onSubmit={submit}>
    <div className="section-heading"><span className="eyebrow">YOUR NEXT MEAL</span><h2>Get the group together</h2><p className="muted">Start with an idea. Everyone can add their own.</p></div>
    <fieldset disabled={busy}>
      <div className="form-grid">
        <Field label="Your name" name="displayName" autoComplete="given-name" placeholder="What should we call you?" maxLength={40} required error={error?.fieldErrors?.displayName} />
        <Field label="Meal date" name="mealDate" type="date" defaultValue={defaults.date} required error={error?.fieldErrors?.mealDate} />
      </div>
      <p className="hint">Times in {defaults.zone.replaceAll("_", " ")}</p>
      <div className="divider" />
      <label className="together-choice"><input type="checkbox" checked={addTogether} onChange={(e) => setAddTogether(e.target.checked)} /> Create the room first; add ideas together</label>
      {!addTogether && options.map((option, index) => <fieldset key={index} className="initial-option"><legend>Meal option {index + 1}</legend>
        <OptionFields value={option} onChange={(value) => setOptions((old) => old.map((o, i) => i === index ? value : o))} errors={error?.fieldErrors} prefix={`options.${index}.`} />
        {options.length > 1 && <button type="button" className="text-button remove-draft" onClick={() => setOptions((old) => old.filter((_, i) => i !== index))}>Remove option {index + 1}</button>}
      </fieldset>)}
      {!addTogether && <button type="button" className="add-draft" onClick={() => setOptions((old) => [...old, { ...emptyOption(), startTime: old[0].startTime }])}>+ Add another idea</button>}
      <details className="optional-details" open={["title", "area", "timeZone"].some((field) => error?.fieldErrors?.[field]) ? true : undefined} onInvalidCapture={(event) => { event.currentTarget.open = true; }}><summary>Meal details (optional)</summary><div className="form-grid">
        <Field label="Meal title" name="title" defaultValue="Let's grab a bite" maxLength={100} error={error?.fieldErrors?.title} />
        <Field label="Area" name="area" placeholder="e.g. Downtown" maxLength={120} error={error?.fieldErrors?.area} />
        <Field label="Room time zone" name="timeZone" value={defaults.zone} onChange={(e) => setDefaults({ ...defaults, zone: e.target.value })} required maxLength={100} hint="Everyone sees meal times in this zone." error={error?.fieldErrors?.timeZone} />
      </div></details>
      <FormError error={error} />
      <button type="submit" className="button primary create-button">{busy ? "Setting the table…" : "Create a meal room"}<span aria-hidden="true">↗</span></button>
      <p className="form-footnote">The 10-minute round starts when you create the room.<br />Finish sooner when everyone is ready. No accounts needed.</p>
    </fieldset>
  </form>;
}
