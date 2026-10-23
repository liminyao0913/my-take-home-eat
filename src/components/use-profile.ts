"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorDetails, request } from "@/lib/client";
import type { ProfileSnapshot } from "@/lib/contracts";

export function useProfile() {
  const [data, setData] = useState<ProfileSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const accept = useCallback((value: ProfileSnapshot) => {
    controller.current?.abort(); controller.current = null;
    setData(value); setError(null);
  }, []);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    try {
      const value = await request<ProfileSnapshot>("/api/profile", "GET", undefined, abort.signal);
      if (!abort.signal.aborted) { setData(value); setError(null); }
    } catch (error) { if (!abort.signal.aborted) setError(errorDetails(error).message); }
    finally { if (controller.current === abort) controller.current = null; }
  }, []);
  useEffect(() => {
    // The network response updates state asynchronously, as in useRoom.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    return () => { controller.current?.abort(); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [refresh]);
  return { data, error, refresh, accept };
}
