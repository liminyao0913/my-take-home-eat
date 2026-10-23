"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { errorDetails, request } from "@/lib/client";
import type { IdeasPage } from "@/lib/contracts";

export function PastIdeas({ roomId }: { roomId: string }) {
  const [data, setData] = useState<IdeasPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load() {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort; setBusy(true);
    try {
      const next = await request<IdeasPage>(`/api/profile/rooms/${roomId}/ideas${data?.nextBeforeRound ? `?beforeRound=${data.nextBeforeRound}` : ""}`, "GET", undefined, abort.signal);
      if (!abort.signal.aborted) { setData((old) => ({ ideas: [...(old?.ideas ?? []), ...next.ideas], nextBeforeRound: next.nextBeforeRound })); setError(null); }
    } catch (error) { if (!abort.signal.aborted) setError(errorDetails(error).message); }
    finally { if (controller.current === abort) { controller.current = null; if (!abort.signal.aborted) setBusy(false); } }
  }
  return <details className="history-ideas" onToggle={(event) => { if (event.currentTarget.open && !data) void load(); }}>
    <summary>Use a past idea</summary><p className="hint">Opens a new draft. Review the details and choose a new date and time.</p>
    <ul>{data?.ideas.map(({ round, place }) => <li key={place.sourceOptionId}><div><strong>{place.placeName}</strong><span className="hint">Round {round}{place.location && ` · ${place.location}`}</span></div><Link href={`/?reuse=${encodeURIComponent(roomId)}&option=${place.sourceOptionId}`} className="button secondary" aria-label={`Use ${place.placeName} from round ${round}`}>Use this idea</Link></li>)}</ul>
    {data?.ideas.length === 0 && !data.nextBeforeRound && <p className="hint">No reusable ideas in these rounds.</p>}
    {busy && <p role="status">Loading ideas…</p>}
    {error && <p role="status">{error} <button className="text-button" disabled={busy} onClick={() => void load()}>Retry ideas</button></p>}
    {data?.nextBeforeRound && !error && <button className="text-button" disabled={busy} onClick={() => void load()}>Load older ideas</button>}
  </details>;
}
