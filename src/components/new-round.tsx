"use client";

import { useState, type FormEvent } from "react";
import { errorDetails } from "@/lib/client";
import type { ApiErrorBody, OptionInput, RoomSnapshot } from "@/lib/contracts";
import { emptyOption, Field, FormError, OptionFields } from "./forms";
import type { Mutate } from "./use-room";

export function NewRound({ data, busy, mutate }: { data: RoomSnapshot; busy: boolean; mutate: Mutate }) {
  const suggested = data.serverNow + 60 * 60 * 1000;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: data.room.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(suggested);
  const [mealDate, setMealDate] = useState(data.room.mealDate > today ? data.room.mealDate : today);
  const [options, setOptions] = useState<OptionInput[]>(() => [{ ...emptyOption(), startTime: new Intl.DateTimeFormat("en-GB", { timeZone: data.room.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(suggested) }]);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    try { await mutate("/rounds", "POST", { mealDate, options }); }
    catch (error) { setError(errorDetails(error)); }
  }
  return <details className="panel new-round"><summary>Start another round in this room</summary><p className="muted small">Keep this link, everyone&apos;s name, and saved preferences. Start with new ideas and clear votes, constraints, and readiness. The previous result stays in round history.</p>
    <form onSubmit={submit}><fieldset disabled={busy}>
      <Field label="New meal date" type="date" value={mealDate} onChange={(event) => setMealDate(event.target.value)} required error={error?.fieldErrors?.mealDate} />
      <p className="hint">Times in {data.room.timeZone.replaceAll("_", " ")}. Review saved time preferences if the date changes.</p>
      {options.map((option, index) => <fieldset key={index} className="initial-option"><legend>New meal option {index + 1}</legend><OptionFields value={option} onChange={(value) => setOptions((old) => old.map((item, i) => i === index ? value : item))} errors={error?.fieldErrors} prefix={`options.${index}.`} />{options.length > 1 && <button type="button" className="text-button remove-draft" onClick={() => setOptions((old) => old.filter((_, i) => i !== index))}>Remove option {index + 1}</button>}</fieldset>)}
      <button type="button" className="add-draft" onClick={() => setOptions((old) => [...old, { ...emptyOption(), startTime: old[0].startTime }])}>+ Add another idea</button>
      <FormError error={error} /><button type="submit" className="button primary">Start a new 10-minute round</button>
    </fieldset></form>
  </details>;
}
