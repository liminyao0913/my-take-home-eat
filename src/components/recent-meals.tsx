"use client";

import Link from "next/link";
import { useMealHistory } from "./use-meal-history";

export function RecentMeals() {
  const { data, error, busy, refresh } = useMealHistory(3);
  return <div className="recent-meals"><Link href="/me">My meals →</Link>{data && data.rooms.length > 0 && <ul>{data.rooms.map((room) => <li key={room.roomId}><Link href={`/r/${room.roomId}`}>{room.title}</Link><span>{room.state === "open" ? "Open" : room.result?.winner ? "Decided" : "No winner"}</span></li>)}</ul>}{error && <p role="status">Recent meals could not refresh. <button className="text-button" disabled={busy} onClick={() => void refresh()}>Retry recent meals</button></p>}</div>;
}
