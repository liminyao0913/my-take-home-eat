"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { request } from "@/lib/client";
import type { HistoryPage } from "@/lib/contracts";

export function RecentMeals() {
  const [data, setData] = useState<HistoryPage | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void request<HistoryPage>("/api/profile/rooms", "GET", undefined, abort.signal).then(setData).catch(() => {});
    return () => abort.abort();
  }, []);
  return <div className="recent-meals"><Link href="/me">My meals →</Link>{data && data.rooms.length > 0 && <ul>{data.rooms.slice(0, 3).map((room) => <li key={room.roomId}><Link href={`/r/${room.roomId}`}>{room.title}</Link><span>{room.state === "open" ? "Open" : room.result?.winner ? "Decided" : "No winner"}</span></li>)}</ul>}</div>;
}
