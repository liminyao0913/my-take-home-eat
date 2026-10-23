"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { errorDetails, request } from "@/lib/client";
import type { ApiErrorBody, OptionInput, PastPlace, SavedPreferences } from "@/lib/contracts";
import { emptyOption, Field, FormError, OptionFields } from "./forms";
import { useProfile } from "./use-profile";
import { blankPreferences, hasSavedPreferences, SavedPreferenceChoice } from "./saved-preferences";
import { Suggestions } from "./suggestions";
import { RecentMeals } from "./recent-meals";

export function CreateRoom() {
  const router = useRouter();
  const { data: personal, error: profileError, refresh: reloadProfile } = useProfile();
  const profile = personal?.profile;
  const [area, setArea] = useState("");
  const [chosenPreferences, setChosenPreferences] = useState<SavedPreferences | null>(null);
  const [useSaved, setUseSaved] = useState<boolean | null>(null);
  const selected = chosenPreferences ?? profile?.preferences ?? blankPreferences;
  const enabled = useSaved ?? hasSavedPreferences(selected);
  const [reuseStatus, setReuseStatus] = useState("");
  const [reuseError, setReuseError] = useState(false);
  const [reuseAttempt, setReuseAttempt] = useState(0);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("reuse"); const optionId = params.get("option");
    if (!roomId || !optionId || !defaults) return;
    const controller = new AbortController();
    void request<PastPlace>(`/api/profile/rooms/${encodeURIComponent(roomId)}/ideas/${encodeURIComponent(optionId)}`, "GET", undefined, controller.signal).then((place) => {
      if (controller.signal.aborted) return;
      setOptions((old) => {
        const value = { ...emptyOption(), ...place, cuisine: place.cuisine as OptionInput["cuisine"], link: place.link ?? "", startTime: old[0].startTime };
        const blank = old.length === 1 && !old[0].placeName && !old[0].location && !old[0].cuisine && old[0].priceLevel === null && !old[0].link;
        return blank ? [value] : [...old, value];
      });
      setReuseError(false);
      setReuseStatus("Past idea loaded. Review its details and choose a new meal time.");
      // Reusing an idea is a one-time draft action, not something to repeat on refresh.
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }).catch((error) => {
      if (!controller.signal.aborted) {
        setReuseError(true);
        setReuseStatus(`${errorDetails(error).message} You can still add an idea manually.`);
      }
    });
    return () => controller.abort();
  }, [defaults, reuseAttempt]);

  function addPastPlace(place: PastPlace) {
    setAddTogether(false);
    setOptions((old) => {
      const value = { ...emptyOption(), ...place, cuisine: place.cuisine as OptionInput["cuisine"], link: place.link ?? "", startTime: old[0].startTime };
      const blank = old.length === 1 && !old[0].placeName && !old[0].location && !old[0].cuisine && old[0].priceLevel === null && !old[0].link;
      return blank ? [value] : [...old, value];
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      const room = await request<{ path: string }>("/api/rooms", "POST", {
        displayName: data.get("displayName"), title: String(data.get("title") || "").trim() || "Let's grab a bite", area, mealDate: data.get("mealDate"), timeZone: data.get("timeZone"), expectedParticipants: data.get("expectedParticipants") ? Number(data.get("expectedParticipants")) : null, options: addTogether ? [] : options, preferences: profile && enabled ? selected : undefined,
      });
      router.push(room.path);
    } catch (error) { setError(errorDetails(error)); setBusy(false); }
  }

  if (!defaults) return <div className="panel loading" role="status">Getting the table ready…</div>;
  return <form className="panel create-form" onSubmit={submit}>
    {profile && <div className="returning-profile"><p>Welcome back, <strong>{profile.displayName}</strong></p><Link href="/me#preferences">My saved preferences</Link><RecentMeals key={profile.id} /></div>}
    {personal?.canImportLegacy && <p className="legacy-note"><Link href="/me">Add existing meals from this browser →</Link></p>}
    {profileError && <p className="small muted" role="status">Remembered details could not load. You can still create a meal. <button type="button" className="text-button" onClick={() => void reloadProfile()}>Retry remembered details</button></p>}
    <div className="section-heading"><span className="eyebrow">YOUR NEXT MEAL</span><h2>Get the group together</h2><p className="muted">Start with an idea. Everyone can add their own.</p></div>
    <fieldset disabled={busy}>
      <div className="form-grid">
        <Field label="Your name" name="displayName" defaultValue={profile?.displayName ?? ""} autoComplete="given-name" placeholder="What should we call you?" maxLength={40} required error={error?.fieldErrors?.displayName} />
        <Field label="Meal date" name="mealDate" type="date" defaultValue={defaults.date} required error={error?.fieldErrors?.mealDate} />
      </div>
      <p className="hint">Times in {defaults.zone.replaceAll("_", " ")}</p>
      {profile && <><div className="area-choice"><Field label="Area" name="area" placeholder="Optional · narrow your past ideas" maxLength={120} value={area} onChange={(event) => setArea(event.target.value)} error={error?.fieldErrors?.area} /></div><SavedPreferenceChoice value={selected} enabled={enabled} onToggle={setUseSaved} onChange={setChosenPreferences} /><Suggestions preferences={enabled ? selected : blankPreferences} area={area} options={options} busy={busy} onAdd={addPastPlace} /></>}
      {reuseStatus && <p className="reuse-status" role="status">{reuseStatus}{reuseError && <> <button type="button" className="text-button" onClick={() => { setReuseError(false); setReuseStatus("Loading your past idea…"); setReuseAttempt((old) => old + 1); }}>Retry past idea</button></>}</p>}
      <div className="divider" />
      <label className="together-choice"><input type="checkbox" checked={addTogether} onChange={(e) => setAddTogether(e.target.checked)} /> Create the room first; add ideas together</label>
      {!addTogether && options.map((option, index) => <fieldset key={index} className="initial-option"><legend>Meal option {index + 1}</legend>
        <OptionFields value={option} onChange={(value) => setOptions((old) => old.map((o, i) => i === index ? value : o))} errors={error?.fieldErrors} prefix={`options.${index}.`} />
        {options.length > 1 && <button type="button" className="text-button remove-draft" onClick={() => setOptions((old) => old.filter((_, i) => i !== index))}>Remove option {index + 1}</button>}
      </fieldset>)}
      {!addTogether && <button type="button" className="add-draft" onClick={() => setOptions((old) => [...old, { ...emptyOption(), startTime: old[0].startTime }])}>+ Add another idea</button>}
      <details className="optional-details" open={["title", "area", "timeZone", "expectedParticipants"].some((field) => error?.fieldErrors?.[field]) ? true : undefined} onInvalidCapture={(event) => { event.currentTarget.open = true; }}><summary>Meal details (optional)</summary><div className="form-grid">
        <Field label="Meal title" name="title" defaultValue="Let's grab a bite" maxLength={100} error={error?.fieldErrors?.title} />
        <Field label="Expected people (including you)" name="expectedParticipants" type="number" min={1} max={32} step={1} placeholder="Optional · e.g. 4" hint="Before finishing early, we'll check who has joined. You can confirm if someone can't make it." error={error?.fieldErrors?.expectedParticipants} />
        {!profile && <Field label="Area" name="area" placeholder="e.g. Downtown" maxLength={120} value={area} onChange={(event) => setArea(event.target.value)} error={error?.fieldErrors?.area} />}
        <Field label="Room time zone" name="timeZone" value={defaults.zone} onChange={(e) => setDefaults({ ...defaults, zone: e.target.value })} required maxLength={100} hint="Everyone sees meal times in this zone." error={error?.fieldErrors?.timeZone} />
      </div></details>
      <FormError error={error} />
      <button type="submit" className="button primary create-button">{busy ? "Setting the table…" : "Create a meal room"}<span aria-hidden="true">↗</span></button>
      <p className="form-footnote">The 10-minute round starts when you create the room.<br />Your meals are remembered in this browser. <Link href="/me">Manage remembered details</Link>.</p>
    </fieldset>
  </form>;
}
