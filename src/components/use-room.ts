"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomSnapshot } from "@/lib/contracts";
import { errorDetails, request, RequestError } from "@/lib/client";

export function useRoom(roomId: string) {
  const [data, setData] = useState<RoomSnapshot | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useRef<RoomSnapshot | null>(null);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const base = `/api/rooms/${roomId}`;
  const accept = useCallback((snapshot: RoomSnapshot) => {
    current.current = snapshot; setData(snapshot); setReceivedAt(Date.now()); setError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (pending.current || controller.current) return;
    const abort = new AbortController();
    const version = generation.current;
    controller.current = abort;
    try {
      const snapshot = await request<RoomSnapshot>(base, "GET", undefined, abort.signal);
      if (version === generation.current && !abort.signal.aborted) accept(snapshot);
    } catch (error) { if (!abort.signal.aborted) setError(errorDetails(error).message); }
    finally { if (controller.current === abort) controller.current = null; }
  }, [accept, base]);

  useEffect(() => {
    // State is set only after the network request resolves, not synchronously in this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 3000);
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus);
      controller.current?.abort(); controller.current = null;
    };
  }, [refresh]);

  const mutate = useCallback(async (suffix: string, method: string, value?: unknown) => {
    if (pending.current) throw new RequestError({ code: "PENDING", message: "Wait for your previous change to finish." });
    pending.current = true; setBusy(true); generation.current++;
    controller.current?.abort(); controller.current = null;
    try { accept(await request<RoomSnapshot>(`${base}${suffix}`, method, value, undefined, current.current?.room.round)); }
    catch (error) {
      if (error instanceof RequestError && ["ROOM_CLOSED", "STALE_ROUND", "NOT_READY", "MISSING_INVITEES"].includes(error.details.code)) { pending.current = false; await refresh(); }
      throw error;
    } finally { pending.current = false; setBusy(false); }
  }, [accept, base, refresh]);

  return { data, receivedAt, error, busy, refresh, mutate };
}

export type Mutate = ReturnType<typeof useRoom>["mutate"];
