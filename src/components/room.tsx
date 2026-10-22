"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { errorDetails, formatDate, formatTime } from "@/lib/client";
import { PRICE_LABELS, type ApiErrorBody, type MealOption, type RoomSnapshot } from "@/lib/contracts";
import { CopyButton } from "./copy-button";
import { emptyOption, Field, FormError, OptionFields } from "./forms";
import { PreferenceForm } from "./preferences";
import { useRoom, type Mutate } from "./use-room";

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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    const displayName = new FormData(event.currentTarget).get("displayName");
    try { await mutate("/participants", "POST", { displayName }); }
    catch (error) { setError(errorDetails(error)); }
  }
  return <section className="panel join-panel"><h2>Pull up a chair</h2><p className="muted">Add your name to vote, share preferences, or suggest a meal.</p><form onSubmit={submit}><fieldset disabled={busy}><Field label="Your name" name="displayName" autoComplete="given-name" maxLength={40} placeholder="What should we call you?" required error={error?.fieldErrors?.displayName} /><FormError error={error} /><button className="button primary" type="submit">Join the table</button></fieldset></form></section>;
}

function AddOption({ data, busy, mutate }: { data: RoomSnapshot; busy: boolean; mutate: Mutate }) {
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
  return <details className="panel add-option"><summary><span>+ Add a meal idea</span><span className="small">Everyone gets a say</span></summary><form onSubmit={submit}><p className="muted small">For {formatDate(data.room.mealDate)} · {data.room.timeZone.replaceAll("_", " ")}. Details stay fixed after adding.</p><fieldset disabled={busy}><OptionFields value={value} onChange={(value) => { setValue(value); setSaved(false); }} errors={error?.fieldErrors} /><FormError error={error} /><div className="save-row"><button type="submit" className="button primary">Add option</button><span role="status" className="saved">{saved ? "Idea added ✓" : ""}</span></div></fieldset></form></details>;
}

function MealDetails({ option, timeZone }: { option: MealOption; timeZone: string }) {
  return <><div className="meal-tags"><span>{option.cuisine}</span><span>{"$".repeat(option.priceLevel)} · {PRICE_LABELS[option.priceLevel]}</span><span>{formatTime(option.startAt, timeZone)}</span></div><p className="meal-location"><span aria-hidden="true">↳</span> {option.location}</p>{option.link && <a className="place-link" href={option.link} target="_blank" rel="noopener noreferrer">View place ↗</a>}</>;
}

function Result({ data }: { data: RoomSnapshot }) {
  const result = data.result!;
  const winner = result.winner;
  const summary = () => winner ? `${data.room.title}: ${winner.placeName}, ${winner.location} — ${formatDate(data.room.mealDate)} at ${formatTime(winner.startAt, data.room.timeZone)} (${data.room.timeZone}). ${result.message}\n${window.location.href}` : `${data.room.title}: No meal could be selected. ${result.message}\n${window.location.href}`;
  return <section className={`result-panel ${winner ? "" : "no-winner"}`} aria-labelledby="result-title" data-testid="result"><span className="eyebrow">{winner ? "IT'S A PLAN" : "NO WINNER THIS ROUND"}</span><h2 id="result-title">{winner ? winner.placeName : "Let’s try a few different ideas."}</h2>{winner && <MealDetails option={winner} timeZone={data.room.timeZone} />}<p className="result-reason">{result.message}</p><div className="result-stats"><span>{result.participantCount} people joined</span><span>{result.voterCount} approved</span><span>{result.preferenceCount} shared preferences</span>{result.groupMatchPercent !== null && <span>{Math.round(result.groupMatchPercent)}% preference match</span>}</div><div className="result-actions"><CopyButton label="Copy meal summary" getText={summary} /><Link href="/" className="text-button">Plan another meal ↗</Link></div><p className="small result-note">A lack of blocks doesn&apos;t mean everyone confirmed. Check in with anyone who hasn&apos;t responded.</p></section>;
}

export function Room({ roomId }: { roomId: string }) {
  const { data, receivedAt, error, busy, refresh, mutate } = useRoom(roomId);
  const [actionError, setActionError] = useState<ApiErrorBody | null>(null);
  async function action(suffix: string, method: string, value?: unknown) {
    setActionError(null);
    try { await mutate(suffix, method, value); }
    catch (error) { setActionError(errorDetails(error)); }
  }
  if (!data) return <main className="room-shell"><div className="panel loading">{error ? <><p role="alert">{error}</p><button className="button secondary" onClick={() => void refresh()}>Try again</button><Link href="/">Start a new room</Link></> : <p role="status">Getting the table ready…</p>}</div></main>;
  const open = data.state === "open";
  return <main className="room-shell">
    <div className="room-topline"><Link href="/" className="back-link">← New meal</Link><Countdown data={data} receivedAt={receivedAt} refresh={refresh} /></div>
    <div className="room-heading"><div><span className="eyebrow">THE GROUP TABLE</span><h1>{data.room.title}</h1><p className="muted">{formatDate(data.room.mealDate)} <span aria-hidden="true">·</span> {data.room.area} <span aria-hidden="true">·</span> Times in {data.room.timeZone.replaceAll("_", " ")}</p></div><CopyButton label="Copy invite link" primary getText={() => window.location.href} /></div>
    {error && <div role="status" className="error-box">Shared updates are paused: {error} <button className="text-button" onClick={() => void refresh()}>Retry now</button></div>}
    <FormError error={actionError} />
    {data.result && <Result data={data} />}
    <div className="room-layout">
      <section className="options-section" aria-labelledby="options-title"><div className="options-heading"><h2 id="options-title">On the table <span>{data.options.length}</span></h2>{open && <span className="small muted">Vote for as many as you like</span>}</div>
        {open && <p className="voting-note">“Can&apos;t do this” rules an option out for everyone.</p>}
        <div className="option-list">{data.options.map((option, index) => <article className={`panel meal-card ${option.blockCount ? "blocked" : ""}`} key={option.id} aria-labelledby={`meal-${option.id}`}>
          <div className="meal-title"><span className="meal-number">{String(index + 1).padStart(2, "0")}</span><h3 id={`meal-${option.id}`}>{option.placeName}</h3>{open && option.authorId === data.me?.id && <button className="text-button remove-option" disabled={busy} onClick={() => void action(`/options/${option.id}`, "DELETE")} aria-label={`Remove ${option.placeName}`}>Remove</button>}</div>
          <MealDetails option={option} timeZone={data.room.timeZone} />
          {option.blockCount > 0 && <p className="blocked-label">Excluded · {option.blockCount} can&apos;t do this</p>}
          <div className="vote-row">
            <button type="button" className={`vote-button approve ${data.me?.choices[option.id] === "approve" ? "selected" : ""}`} disabled={!open || !data.me || busy} aria-pressed={data.me?.choices[option.id] === "approve"} onClick={() => void action(`/options/${option.id}/response`, "PUT", { choice: data.me?.choices[option.id] === "approve" ? null : "approve" })}><span aria-hidden="true">✓</span> I&apos;d go <span className="vote-count">{option.approvalCount}</span></button>
            <button type="button" className={`vote-button block ${data.me?.choices[option.id] === "block" ? "selected" : ""}`} disabled={!open || !data.me || busy} aria-pressed={data.me?.choices[option.id] === "block"} onClick={() => void action(`/options/${option.id}/response`, "PUT", { choice: data.me?.choices[option.id] === "block" ? null : "block" })}>Can&apos;t do this <span className="vote-count">{option.blockCount}</span></button>
          </div>
        </article>)}</div>
        {!data.options.length && <div className="panel empty-state">The table is empty. {open ? "Add a meal idea to get things started." : "No options remained at the deadline."}</div>}
        {open && data.me && <AddOption data={data} busy={busy} mutate={mutate} />}
      </section>
      <aside className="room-sidebar">
        {open && !data.me && <JoinForm busy={busy} mutate={mutate} />}
        <section className="panel people-panel"><h2>At the table <span>{data.participants.length}</span></h2><ul>{data.participants.map((p) => <li key={p.id}><span className="avatar" aria-hidden="true">{Array.from(p.displayName)[0].toUpperCase()}</span><span>{p.displayName}{p.id === data.me?.id && <small> you</small>}</span></li>)}</ul>{data.participants.length === 0 && <p className="muted small">No one has joined yet.</p>}{open && data.me && <button className="text-button leave-button" disabled={busy} onClick={() => void action("/participants/me", "DELETE")}>Leave this meal</button>}<p className="small muted">Anyone with the link can join. Your name is remembered in this browser.</p></section>
        {open && data.me && <PreferenceForm key={data.me.id} initial={data.me.preferences} busy={busy} mutate={mutate} />}
        <section className="how-it-works"><span className="eyebrow">HOW WE PICK</span><p>Most approvals, then preference match, then the first idea proposed.</p><p>“Can&apos;t do this” rules out an option for the group. Use it for something that really won&apos;t work.</p><p className="small">Check dietary needs and availability with the place. Prices are the group&apos;s estimates.</p></section>
      </aside>
    </div>
  </main>;
}
