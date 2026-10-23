"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorDetails, request } from "@/lib/client";
import type { HistoryPage } from "@/lib/contracts";

export function useMealHistory(limit = 20) {
  const [data, setData] = useState<HistoryPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useRef<HistoryPage | null>(null);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async (reset = true) => {
    if (!reset && controller.current) return;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const offset = reset ? 0 : current.current?.rooms.length ?? 0;
    setBusy(true);
    try {
      const next = await request<HistoryPage>(`/api/profile/rooms?offset=${offset}&limit=${limit}`, "GET", undefined, abort.signal);
      if (abort.signal.aborted) return;
      const rooms = reset ? next.rooms : [...(current.current?.rooms ?? []), ...next.rooms];
      const value = { rooms: [...new Map(rooms.map((room) => [room.roomId, room])).values()], hasMore: next.hasMore };
      current.current = value; setData(value); setError(null);
    } catch (error) { if (!abort.signal.aborted) setError(errorDetails(error).message); }
    finally { if (controller.current === abort) { controller.current = null; setBusy(false); } }
  }, [limit]);
  useEffect(() => {
    // Fetch completion updates data without remounting the separate preference form.
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("lets-eat:meals-changed", refresh);
    return () => {
      controller.current?.abort();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("lets-eat:meals-changed", refresh);
    };
  }, [load]);
  return { data, error, busy, refresh: () => load(), loadMore: () => load(false) };
}
