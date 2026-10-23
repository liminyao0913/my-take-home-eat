"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { errorDetails, formatDate, request } from "@/lib/client";
import type { ApiErrorBody, HistoryResult, HistoryRoom, ProfileSnapshot } from "@/lib/contracts";
import { CuisineBudgetFields, Field, FormError } from "./forms";
import { useProfile } from "./use-profile";
import { useMealHistory } from "./use-meal-history";
import { RoundHistory } from "./round-history";
import { PastIdeas } from "./past-ideas";

function Outcome({ result }: { result: HistoryResult }) {
  return <p className="history-outcome">{result.winner ? <><span className="small muted">{result.winner.approvalCount > 0 ? "The group's pick" : "Suggested meal"}</span><strong>{result.winner.placeName}</strong></> : "No winner this round"}</p>;
}

function HistoryCard({ room }: { room: HistoryRoom }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  async function remove() {
    setBusy(true); setError(null);
    try { await request(`/api/profile/rooms/${room.roomId}`, "DELETE"); setConfirm(false); }
    catch (error) { setError(errorDetails(error)); }
    finally { setBusy(false); }
  }
  return <article className="panel history-card" aria-label={room.title}>
    <div className="history-heading"><h2>{room.title}</h2><span className="history-status">{room.state === "open" ? "Open" : room.result?.winner ? "Decided" : "No winner"}</span></div>
    <p className="small muted">{formatDate(room.mealDate)}{room.area && ` · ${room.area}`} · Round {room.round}</p>
    <p className="hint">{room.role === "created" ? "Created by you" : "Joined by you"}{room.left && " · You left"}</p>
    {room.result && <Outcome result={room.result} />}
    <div className="history-actions"><Link className="button secondary" href={`/r/${room.roomId}`}>Open room</Link><button className="text-button" onClick={() => setConfirm(true)}>Remove from my history</button></div>
    <PastIdeas key={`ideas-${room.round}-${room.state}`} roomId={room.roomId} />
    {!!room.archiveCount && <RoundHistory key={`rounds-${room.round}`} roomId={room.roomId} count={room.archiveCount} />}
    {confirm && <div className="history-confirm" role="group" aria-label="Remove this history entry"><p>This removes the meal from your history and future suggestions. The shared room and everyone&apos;s contributions stay.</p><div className="save-row"><button className="button secondary" disabled={busy} onClick={() => void remove()}>Confirm removal</button><button className="text-button" disabled={busy} onClick={() => setConfirm(false)}>Keep in my history</button></div><FormError error={error} /></div>}
  </article>;
}

function MealHistory() {
  const { data, error, busy, refresh, loadMore } = useMealHistory();
  return <section className="meal-history" aria-label="Meal history">
    {!data && !error && <p role="status">Loading your meals…</p>}
    {data?.rooms.length === 0 && <div className="panel empty-state">No meals in your history yet. Create or join a room to remember it here.</div>}
    {data?.rooms.map((room) => <HistoryCard key={room.roomId} room={room} />)}
    {error && <div className="error-box" role="status">Your meals could not load. {error} <button className="text-button" disabled={busy} onClick={() => void refresh()}>Retry history</button></div>}
    {data?.hasMore && !error && <button className="button secondary" disabled={busy} onClick={() => void loadMore()}>{busy ? "Loading…" : "Load older meals"}</button>}
  </section>;
}

function ProfileSettings({ profile, onSave }: { profile: NonNullable<ProfileSnapshot["profile"]>; onSave: (value: ProfileSnapshot) => void }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [preferences, setPreferences] = useState(profile.preferences);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const [forget, setForget] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setSaved(false);
    try { onSave(await request<ProfileSnapshot>("/api/profile", "PUT", { displayName, ...preferences })); setSaved(true); }
    catch (error) { setError(errorDetails(error)); }
    finally { setBusy(false); }
  }
  async function forgetBrowser() {
    setBusy(true); setError(null);
    try {
      await request("/api/profile", "DELETE");
      // Discard all client state cached under the forgotten identity.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    }
    catch (error) { setError(errorDetails(error)); setBusy(false); }
  }
  return <section className="panel profile-settings" id="preferences" aria-label="Saved preferences"><h2>My saved preferences</h2><p className="small muted">Used for future meals; existing rooms keep their saved preferences. Your time window is always specific to a meal.</p>
    <form onSubmit={save}><fieldset disabled={busy}><Field label="Default name" maxLength={40} required value={displayName} onChange={(event) => { setDisplayName(event.target.value); setSaved(false); }} error={error?.fieldErrors?.displayName} /><CuisineBudgetFields value={preferences} onChange={(value) => { setPreferences(value); setSaved(false); }} /><div className="save-row"><button className="button primary" type="submit">Save defaults</button><span role="status" className="saved">{saved ? "Defaults saved ✓" : ""}</span></div></fieldset></form>
    <FormError error={error} /><div className="forget-browser"><p className="hint">Remembered in this browser for up to 180 days without activity. Another browser starts fresh. Clearing cookies can end access sooner.</p><button className="text-button" disabled={busy} onClick={() => setForget(true)}>Forget this browser</button>
      {forget && <div role="group" aria-label="Confirm forgetting this browser"><p className="small">This deletes your saved defaults, personal history, and suggestion records. Your shared-room contributions stay, but this browser will lose access to edit those old participant inputs. There is no recovery by name or email.</p><div className="save-row"><button className="button secondary" disabled={busy} onClick={() => void forgetBrowser()}>Confirm forget</button><button className="text-button" disabled={busy} onClick={() => setForget(false)}>Keep this browser</button></div></div>}
    </div>
  </section>;
}

export function MyMeals() {
  const { data, error, refresh, accept } = useProfile();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<ApiErrorBody | null>(null);
  const [importVersion, setImportVersion] = useState(0);
  async function importMeals() {
    setImporting(true); setImportError(null);
    try { accept(await request<ProfileSnapshot>("/api/profile/import", "POST")); setImportVersion((old) => old + 1); }
    catch (error) { setImportError(errorDetails(error)); }
    finally { setImporting(false); }
  }
  return <main className="personal-shell"><div className="personal-heading"><div><span className="eyebrow">REMEMBERED IN THIS BROWSER</span><h1>My meals</h1><p className="muted">Your tables, your preferences, and ideas worth proposing again.</p></div><Link className="button primary" href="/">Create a meal room</Link></div>
    {error && <div className="error-box" role="status">Remembered details could not load. {error} <button className="text-button" onClick={() => void refresh()}>Retry remembered details</button></div>}
    {!data && !error && <p role="status">Loading remembered details…</p>}
    {data?.canImportLegacy && <section className="panel legacy-import"><h2>Meals from before this update</h2><p>Add meals remembered by this browser before the update. Your saved preferences start fresh.</p><button className="button secondary" disabled={importing} onClick={() => void importMeals()}>{importing ? "Adding meals…" : "Add existing meals from this browser"}</button><FormError error={importError} /></section>}
    {data && !data.profile && <div className="panel empty-state"><h2>Your next meal starts here</h2><p>Create or join a meal and we&apos;ll remember it in this browser. No account or email needed.</p><p className="small">Using another computer, clearing cookies, or choosing Forget this browser starts a fresh history.</p></div>}
    {data?.profile && <div className="personal-layout"><MealHistory key={`${data.profile.id}-${importVersion}`} /><ProfileSettings key={data.profile.id} profile={data.profile} onSave={accept} /></div>}
  </main>;
}
