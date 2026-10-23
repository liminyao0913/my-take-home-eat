"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { errorDetails, formatDate } from "@/lib/client";
import { type ApiErrorBody, type RoomSnapshot, type SavedPreferences } from "@/lib/contracts";
import { RoundHistory } from "./round-history";
import { CopyButton } from "./copy-button";
import { emptyOption, Field, FormError, OptionFields } from "./forms";
import { MealCard, MealResult } from "./meal";
import { NewRound } from "./new-round";
import { PreferenceForm } from "./preferences";
import { useRoom, type Mutate } from "./use-room";
import { useProfile } from "./use-profile";
import { blankPreferences, hasSavedPreferences, SavedPreferenceChoice } from "./saved-preferences";

function Countdown({ data, receivedAt, refresh }: { data: RoomSnapshot; receivedAt: number; refresh: () => Promise<void> }) {
  const [clock, setClock] = useState({ receivedAt: 0, elapsed: 0 });
  useEffect(() => {
    if (data.state === "closed") return;
    const timer = setInterval(() => {
      const elapsed = Date.now() - receivedAt;
      setClock({ receivedAt, elapsed });
      if (document.visibilityState === "visible" && data.serverNow + elapsed >= data.room.deadlineAt) void refresh();
    }, 1000);
    return () => clearInterval(timer);
  }, [data.room.deadlineAt, data.serverNow, data.state, receivedAt, refresh]);
  const elapsed = clock.receivedAt === receivedAt ? clock.elapsed : 0;
  const seconds = Math.max(0, Math.ceil((data.room.deadlineAt - data.serverNow - elapsed) / 1000));
  return <div className="countdown"><span className={data.state === "closed" ? "closed-dot" : "live-dot"} /><span>{data.state === "closed" ? "Round closed" : seconds ? <><strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</strong> to decide</> : "Choosing your meal…"}</span></div>;
}

function JoinForm({ busy, mutate }: { busy: boolean; mutate: Mutate }) {
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const { data } = useProfile();
  const [chosen, setChosen] = useState<SavedPreferences | null>(null);
  const [useSaved, setUseSaved] = useState<boolean | null>(null);
  const selected = chosen ?? data?.profile?.preferences ?? blankPreferences;
  const enabled = useSaved ?? hasSavedPreferences(selected);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    const displayName = new FormData(event.currentTarget).get("displayName");
    try { await mutate("/participants", "POST", { displayName, preferences: data?.profile && enabled ? selected : undefined }); }
    catch (error) { setError(errorDetails(error)); }
  }
  return <section id="join" className="panel join-panel"><h2>Pull up a chair</h2><p className="muted">Add your name to vote, share preferences, or suggest a meal.</p><form onSubmit={submit}><fieldset disabled={busy}><Field label="Your name" name="displayName" defaultValue={data?.profile?.displayName ?? ""} autoComplete="given-name" maxLength={40} placeholder="What should we call you?" required error={error?.fieldErrors?.displayName} />{data?.profile && <SavedPreferenceChoice value={selected} enabled={enabled} onToggle={setUseSaved} onChange={setChosen} />}<FormError error={error} /><button className="button primary" type="submit">Join the table</button><p className="hint">Your meals are remembered in this browser.</p></fieldset></form></section>;
}

function AddOption({ data, busy, mutate, detailsRef }: { data: RoomSnapshot; busy: boolean; mutate: Mutate; detailsRef: RefObject<HTMLDetailsElement | null> }) {
  const [value, setValue] = useState(() => {
    const time = data.options[0]?.startAt ?? data.room.deadlineAt + 60 * 60 * 1000;
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: data.room.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(time);
    return { ...emptyOption(), startTime: parts };
  });
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null); setSaved(false);
    try { await mutate("/options", "POST", value); setValue({ ...emptyOption(), startTime: value.startTime }); setSaved(true); }
    catch (error) { setError(errorDetails(error)); }
  }
  return <details className="panel add-option" ref={detailsRef}><summary><span>+ Add a meal idea</span><span className="small">Everyone gets a say</span></summary><form onSubmit={submit}><p className="muted small">For {formatDate(data.room.mealDate)} · {data.room.timeZone.replaceAll("_", " ")}. Details stay fixed after adding.</p><fieldset disabled={busy}><OptionFields value={value} onChange={(value) => { setValue(value); setSaved(false); }} errors={error?.fieldErrors} /><FormError error={error} /><div className="save-row"><button type="submit" className="button primary">Add option</button><span role="status" className="saved">{saved ? "Idea added ✓" : ""}</span></div></fieldset></form></details>;
}

function FinishVoting({ data, busy, mutate }: { data: RoomSnapshot; busy: boolean; mutate: Mutate }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const readyCount = data.participants.filter((person) => person.ready).length;
  const allReady = data.participants.length > 0 && readyCount === data.participants.length;
  async function change(suffix: string, value?: unknown) {
    setError(null);
    try { await mutate(suffix, value ? "PUT" : "POST", value); setConfirm(false); }
    catch (error) { setError(errorDetails(error)); }
  }
  return <section className="panel finish-panel" aria-label="Finish voting">
    <div className="finish-status"><div><h3>{allReady ? "Everyone at the table is ready" : "Happy with your choices?"}</h3><p className="muted small">{readyCount} of {data.participants.length} people are ready to finish.</p></div><button className="button secondary" disabled={busy} aria-pressed={data.me!.ready} onClick={() => void change("/participants/me/ready", { ready: !data.me!.ready })}>{data.me!.ready ? "Keep deciding" : "I'm done"}</button></div>
    <p className="hint">Save any preference changes first. New ideas mean everyone reviews again.</p>
    {allReady && data.options.length > 0 && (!confirm ? <button className="button primary finish-button" disabled={busy} onClick={() => setConfirm(true)}>Finish voting early</button> : <div className="finish-confirm" role="group" aria-label="Confirm early finish"><p>All {data.participants.length} joined people are ready. Only people who joined count; invited friends may still be missing.</p><p className="small">This will freeze the result now. {data.options.every((option) => option.blockCount > 0) && "All options are excluded, so this round will have no winner."}</p><div className="save-row"><button className="button primary" disabled={busy} onClick={() => void change("/finish")}>Confirm and show result</button><button className="text-button" disabled={busy} onClick={() => setConfirm(false)}>Keep the round open</button></div></div>)}
    <FormError error={error} />
  </section>;
}

export function Room({ roomId }: { roomId: string }) {
  const { data, receivedAt, error, busy, refresh, mutate } = useRoom(roomId);
  const [actionError, setActionError] = useState<ApiErrorBody | null>(null);
  const addOption = useRef<HTMLDetailsElement>(null);
  const preferences = useRef<HTMLDetailsElement>(null);
  async function action(suffix: string, method: string, value?: unknown) {
    setActionError(null);
    try { await mutate(suffix, method, value); }
    catch (error) { setActionError(errorDetails(error)); }
  }
  function reveal(element: HTMLDetailsElement | null) {
    if (!element) return;
    element.open = true;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    element.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }
  if (!data) return <main className="room-shell"><div className="panel loading">{error ? <><p role="alert">{error}</p><button className="button secondary" onClick={() => void refresh()}>Try again</button><Link href="/">Start a new room</Link></> : <p role="status">Getting the table ready…</p>}</div></main>;
  const open = data.state === "open";
  const responded = data.participants.filter((person) => person.responded).length;
  const allExcluded = data.options.length > 0 && data.options.every((option) => option.blockCount > 0);
  return <main className="room-shell">
    <div className="room-topline"><Link href="/" className="back-link">← New meal</Link><Countdown data={data} receivedAt={receivedAt} refresh={refresh} /></div>
    <div className="room-heading"><div><span className="eyebrow">THE GROUP TABLE · ROUND {data.room.round}</span><h1>{data.room.title}</h1><p className="muted">{formatDate(data.room.mealDate)} {data.room.area && <>· {data.room.area} </>}· Times in {data.room.timeZone.replaceAll("_", " ")}</p></div><CopyButton label="Copy invite link" primary getText={() => window.location.href} /></div>
    {error && <div role="status" className="error-box">Shared updates are paused: {error} <button className="text-button" onClick={() => void refresh()}>Retry now</button></div>}
    <FormError error={actionError} />
    {data.result && <MealResult result={data.result} title={data.room.title} mealDate={data.room.mealDate} timeZone={data.room.timeZone} />}
    {!open && data.me && <NewRound key={data.room.round} data={data} busy={busy} mutate={mutate} />}
    {!open && !data.me && <p className="muted recovery-note">Someone who joined this meal can start another round here using the same link.</p>}
    {open && !data.me && <JoinForm busy={busy} mutate={mutate} />}
    <div className="participation-bar"><span role="status">{responded} of {data.participants.length} people have responded</span>{open && data.me && <button className="text-button" onClick={() => reveal(preferences.current)}>My preferences (optional)</button>}</div>
    {open && allExcluded && <section className="conflict-banner" role="status"><h2>No viable options right now</h2><p>Every idea has a “Can&apos;t do this” response. Try a different time or place using the reasons below.</p>{data.me ? <button className="button secondary" onClick={() => reveal(addOption.current)}>Add an alternative</button> : <a href="#join" className="text-button">Join to suggest an alternative ↑</a>}</section>}
    <div className="room-layout">
      <section className="options-section" aria-labelledby="options-title"><div className="options-heading"><h2 id="options-title">On the table <span>{data.options.length}</span></h2>{open && <span className="small muted">Vote for as many as you like</span>}</div>
        {open && <p className="voting-note">“Can&apos;t do this” rules an option out for everyone.</p>}
        <div className="option-list">{data.options.map((option, index) => <MealCard key={option.id} option={option} index={index} timeZone={data.room.timeZone} choice={data.me?.choices[option.id]} reason={data.me?.blockReasons[option.id]} disabled={!open || !data.me || busy} onRespond={(choice, reason) => void action(`/options/${option.id}/response`, "PUT", { choice, reason: reason ?? null })} onRemove={open && option.authorId === data.me?.id ? () => void action(`/options/${option.id}`, "DELETE") : undefined} />)}</div>
        {!data.options.length && <div className="panel empty-state">The table is empty. {open ? "Add a meal idea to get things started." : "No options remained when the round closed."}</div>}
        {open && data.me && <AddOption key={`add-${data.room.round}`} data={data} busy={busy} mutate={mutate} detailsRef={addOption} />}
        {open && data.me && <FinishVoting key={`finish-${data.room.round}`} data={data} busy={busy} mutate={mutate} />}
      </section>
      <aside className="room-sidebar">
        <details className="panel people-panel"><summary>At the table · {data.participants.length}<span className="small muted">See responses</span></summary><ul>{data.participants.map((person) => <li key={person.id}><span className="avatar" aria-hidden="true">{Array.from(person.displayName)[0].toUpperCase()}</span><span>{person.displayName}{person.id === data.me?.id && <small> you</small>}<small className="person-status">{person.ready ? "Ready to finish" : person.responded ? "Responded" : "No response yet"}</small></span></li>)}</ul>{data.participants.length === 0 && <p className="muted small">No one has joined yet.</p>}{open && data.me && <button className="text-button leave-button" disabled={busy} onClick={() => void action("/participants/me", "DELETE")}>Leave this meal</button>}<p className="small muted">Anyone with the link can join. Your name is remembered in this browser.</p></details>
        {open && data.me && <PreferenceForm key={`${data.me.id}-${data.room.round}`} initial={data.me.preferences} busy={busy} mutate={mutate} detailsRef={preferences} />}
        {!!data.archiveCount && <RoundHistory key={data.room.round} roomId={data.room.id} count={data.archiveCount} className="panel round-history" />}
        <section className="how-it-works"><span className="eyebrow">HOW WE PICK</span><p>Most approvals, then preference match, then the first idea proposed.</p><p>“Can&apos;t do this” rules out an option for the group. Use it for something that really won&apos;t work.</p><p className="small">Check dietary needs and availability with the place. Prices are the group&apos;s estimates.</p></section>
      </aside>
    </div>
  </main>;
}
