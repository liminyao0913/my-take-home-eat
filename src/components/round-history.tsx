"use client";

import { useEffect, useRef, useState } from "react";
import { errorDetails, formatDate, request } from "@/lib/client";
import type { RoundPage } from "@/lib/contracts";

export function RoundHistory({ roomId, count, className = "history-rounds" }: { roomId: string; count: number; className?: string }) {
  const [data, setData] = useState<RoundPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load() {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort; setBusy(true);
    try {
      const next = await request<RoundPage>(`/api/rooms/${roomId}/rounds${data?.nextBeforeRound ? `?beforeRound=${data.nextBeforeRound}` : ""}`, "GET", undefined, abort.signal);
      if (!abort.signal.aborted) { setData((old) => ({ rounds: [...(old?.rounds ?? []), ...next.rounds], nextBeforeRound: next.nextBeforeRound })); setError(null); }
    } catch (error) { if (!abort.signal.aborted) setError(errorDetails(error).message); }
    finally { if (controller.current === abort) { controller.current = null; if (!abort.signal.aborted) setBusy(false); } }
  }
  return <details className={className} onToggle={(event) => { if (event.currentTarget.open && !data) void load(); }}>
    <summary>Previous rounds · {count}</summary>
    {data?.rounds.map(({ round, mealDate, result }) => <div key={round}><h3>Round {round} · {formatDate(mealDate)}</h3><p>{result.winner?.placeName ?? "No winner"}</p><p className="small muted">{result.message}</p></div>)}
    {busy && <p role="status">Loading rounds…</p>}
    {error && <p role="status">{error} <button className="text-button" disabled={busy} onClick={() => void load()}>Retry rounds</button></p>}
    {data?.nextBeforeRound && !error && <button className="text-button" disabled={busy} onClick={() => void load()}>Load older rounds</button>}
  </details>;
}
