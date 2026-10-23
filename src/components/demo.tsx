"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BlockReason, Choice, MealOption, Preferences } from "@/lib/contracts";
import { decide } from "@/lib/decision";
import { MealCard, MealResult } from "./meal";

type Scenario = "votes" | "preferences" | "excluded";
const mealDate = "2026-10-22";
const timeZone = "UTC";
const sampleOptions: MealOption[] = [
  { id: 1, authorId: "sam", placeName: "Little Thai", location: "Sample place · 10 minutes away", cuisine: "Thai", priceLevel: 1, startAt: Date.parse(`${mealDate}T12:30:00Z`), link: null, approvalCount: 0, blockCount: 0, blockReasons: [] },
  { id: 2, authorId: "jamie", placeName: "Pasta House", location: "Sample place · 5 minutes away", cuisine: "Italian", priceLevel: 2, startAt: Date.parse(`${mealDate}T12:30:00Z`), link: null, approvalCount: 0, blockCount: 0, blockReasons: [] },
  { id: 3, authorId: "sam", placeName: "Taco Garden", location: "Sample place · 15 minutes away", cuisine: "Mexican", priceLevel: 1, startAt: Date.parse(`${mealDate}T13:00:00Z`), link: null, approvalCount: 0, blockCount: 0, blockReasons: [] },
];
const preferences: Preferences[] = [
  { cuisines: ["Thai"], maxPriceLevel: 1, startTime: null, endTime: null },
  { cuisines: ["Italian"], maxPriceLevel: 2, startTime: null, endTime: null },
];
const sampleReasons: BlockReason[] = ["Dietary restriction", "Over budget", "Time conflict"];

export function Demo() {
  const [scenario, setScenario] = useState<Scenario>("votes");
  const [responses, setResponses] = useState<Record<number, { choice: Choice; reason?: BlockReason | null }>>({});
  const [closed, setClosed] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (closed) { resultRef.current?.focus(); resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }, [closed]);
  function reset(next: Scenario) { setScenario(next); setResponses({}); setClosed(false); }
  const options = sampleOptions.map((option, index) => {
    const response = responses[option.id];
    const reasons: BlockReason[] = scenario === "excluded" ? [sampleReasons[index]] : [];
    if (response?.choice === "block" && response.reason) reasons.push(response.reason);
    return { ...option,
      approvalCount: Number(scenario === "votes" && option.id <= 2) + Number(response?.choice === "approve"),
      blockCount: Number(scenario === "excluded") + Number(response?.choice === "block"),
      blockReasons: [...new Set(reasons)].map((reason) => ({ reason, count: reasons.filter((tag) => tag === reason).length })),
    };
  });
  const result = decide({ options, preferences, participantCount: 3, voterCount: (scenario === "votes" ? 2 : 0) + Number(Object.values(responses).some((response) => response.choice === "approve")), deadlineAt: 0, timeZone });
  return <main className="room-shell demo-shell">
    <div className="room-topline"><Link href="/" className="back-link">← Create a real room</Link><span className="pill">INTERACTIVE DEMO</span></div>
    <div className="room-heading"><div><span className="eyebrow">A QUICK LUNCH WALKTHROUGH</span><h1>Try a vote. See the result.</h1><p className="muted">Fictional places and people, using the real decision rules. Nothing is saved or sent to a real room.</p></div></div>
    <section className="panel demo-controls" aria-label="Demo controls"><div className="demo-scenarios"><button className="button secondary" aria-pressed={scenario === "votes"} onClick={() => reset("votes")}>Sample votes</button><button className="button secondary" aria-pressed={scenario === "preferences"} onClick={() => reset("preferences")}>No votes: use preferences</button><button className="button secondary" aria-pressed={scenario === "excluded"} onClick={() => reset("excluded")}>All options excluded</button></div><p className="small muted">{scenario === "votes" ? "Sam approved Little Thai; Jamie approved Pasta House. You’re the third person. Try approving Pasta House, or choose any idea below." : scenario === "preferences" ? "Nobody has approved anything. Show the result to see how saved preferences suggest a meal, or add your own vote." : "Sam cannot attend any of these options. Even approvals cannot override a hard constraint."}</p><div className="save-row"><button className="button primary" disabled={closed} onClick={() => setClosed(true)}>Show result</button>{closed && <button className="text-button" onClick={() => setClosed(false)}>Try voting again</button>}<span className="hint">Instant in this demo. Real rooms have a 10-minute limit and can finish early when everyone is ready.</span></div></section>
    {closed && <div ref={resultRef} tabIndex={-1}><MealResult result={result} title="Demo lunch" mealDate={mealDate} timeZone={timeZone} demo />{!result.winner && <div className="demo-recovery"><p>In a real room, propose an alternative while voting is open, or start a new round with the same people and link after it closes.</p><button className="button secondary" onClick={() => reset("votes")}>Try a fresh set of responses</button></div>}</div>}
    {!closed && options.every((option) => option.blockCount > 0) && <section className="conflict-banner" role="status"><h2>No viable options right now</h2><p>Every sample idea is excluded. Show the result to explore the no-winner outcome.</p></section>}
    <div className="room-layout"><section className="options-section" aria-label="Sample meal options"><div className="options-heading"><h2>On the sample table</h2><span className="small muted">You can approve several</span></div><p className="voting-note">“Can&apos;t do this” rules an option out for everyone.</p><div className="option-list">{options.map((option, index) => <MealCard key={option.id} option={option} index={index} timeZone={timeZone} choice={responses[option.id]?.choice} reason={responses[option.id]?.reason ?? undefined} disabled={closed} onRespond={(choice, reason) => setResponses((old) => { const next = { ...old }; if (choice) next[option.id] = { choice, reason }; else delete next[option.id]; return next; })} />)}</div></section><aside className="room-sidebar"><section className="panel demo-people"><h2>Sample preferences</h2><p><strong>Sam</strong> likes Thai and budget meals.</p><p><strong>Jamie</strong> likes Italian, up to mid-range.</p><p><strong>You</strong> have no saved preferences in this demo.</p><p className="small muted">In real rooms, your preferences stay private. Most approvals wins; preferences break ties or suggest a meal when no eligible option has approvals.</p></section></aside></div>
    <p className="demo-footer">Ready for your own group? <Link href="/">Create a meal room →</Link></p>
  </main>;
}
