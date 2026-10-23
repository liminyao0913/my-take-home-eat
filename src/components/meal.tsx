"use client";

import { formatDate, formatTime } from "@/lib/client";
import { BLOCK_REASONS, PRICE_LABELS, type BlockReason, type Choice, type DecisionResult, type MealOption } from "@/lib/contracts";
import { CopyButton } from "./copy-button";
import { Select } from "./forms";

export function MealDetails({ option, timeZone }: { option: MealOption; timeZone: string }) {
  return <><div className="meal-tags"><span>{option.cuisine ?? "Cuisine not specified"}</span><span>{option.priceLevel === null ? "Price not specified" : `${"$".repeat(option.priceLevel)} · ${PRICE_LABELS[option.priceLevel]}`}</span><span>{formatTime(option.startAt, timeZone)}</span></div><p className="meal-location"><span aria-hidden="true">↳</span> {option.location || "Location to confirm"}</p>{option.link && <a className="place-link" href={option.link} target="_blank" rel="noopener noreferrer">View place ↗</a>}</>;
}

export function MealCard({ option, index, timeZone, choice, reason, disabled, onRespond, onRemove }: {
  option: MealOption; index: number; timeZone: string; choice?: Choice; reason?: BlockReason;
  disabled: boolean; onRespond: (choice: Choice | null, reason?: BlockReason | null) => void; onRemove?: () => void;
}) {
  return <article className={`panel meal-card ${option.blockCount ? "blocked" : ""}`} aria-labelledby={`meal-${option.id}`}>
    <div className="meal-title"><span className="meal-number">{String(index + 1).padStart(2, "0")}</span><h3 id={`meal-${option.id}`}>{option.placeName}</h3>{onRemove && <button className="text-button remove-option" disabled={disabled} onClick={onRemove} aria-label={`Remove ${option.placeName}`}>Remove</button>}</div>
    <MealDetails option={option} timeZone={timeZone} />
    {option.blockCount > 0 && <p className="blocked-label">Excluded · {option.blockCount} can&apos;t do this</p>}
    {!!option.blockReasons?.length && <p className="constraint-reasons">{option.blockReasons.map(({ reason, count }) => `${reason}${count > 1 ? ` (${count})` : ""}`).join(" · ")}</p>}
    <div className="vote-row">
      <button type="button" className={`vote-button approve ${choice === "approve" ? "selected" : ""}`} disabled={disabled} aria-pressed={choice === "approve"} onClick={() => onRespond(choice === "approve" ? null : "approve")}><span aria-hidden="true">✓</span> I&apos;d go <span className="vote-count">{option.approvalCount}</span></button>
      <button type="button" className={`vote-button block ${choice === "block" ? "selected" : ""}`} disabled={disabled} aria-pressed={choice === "block"} onClick={() => onRespond(choice === "block" ? null : "block")}>Can&apos;t do this <span className="vote-count">{option.blockCount}</span></button>
    </div>
    {choice === "block" && <div className="block-reason"><Select label="What doesn't work? (optional)" disabled={disabled} value={reason ?? ""} onChange={(e) => onRespond("block", e.target.value as BlockReason || null)}><option value="">No reason shared</option>{BLOCK_REASONS.map((tag) => <option key={tag}>{tag}</option>)}</Select><p className="hint">Shared with the group to help find an alternative.</p></div>}
  </article>;
}

export function MealResult({ result, title, mealDate, timeZone, demo = false }: {
  result: DecisionResult; title: string; mealDate: string; timeZone: string; demo?: boolean;
}) {
  const winner = result.winner;
  const recommendation = winner?.approvalCount === 0;
  const attendance = result.expectedParticipantCount === undefined ? "" : result.invitationOverride ? `Organizer finished with ${result.participantCount} of ${result.expectedParticipantCount} expected people.` : `${result.participantCount} of ${result.expectedParticipantCount} expected people joined.`;
  const summary = () => `${title}: ${winner ? `${recommendation ? "Suggested meal: " : ""}${winner.placeName}${winner.location ? `, ${winner.location}` : ""} — ${formatDate(mealDate)} at ${formatTime(winner.startAt, timeZone)} (${timeZone}).` : "No meal could be selected."} ${result.message}${attendance ? ` ${attendance}` : ""}\n${window.location.href}`;
  return <section className={`result-panel ${winner ? "" : "no-winner"}`} aria-labelledby="result-title" data-testid="result">
    <span className="eyebrow">{winner ? recommendation ? "SUGGESTED MEAL" : "THE GROUP'S PICK" : "NO WINNER THIS ROUND"}</span>
    <h2 id="result-title">{winner ? winner.placeName : "Let’s try a few different ideas."}</h2>
    {winner && <MealDetails option={winner} timeZone={timeZone} />}
    <p className="result-reason">{result.message}</p>
    <div className="result-stats"><span>{result.participantCount} people joined</span><span>{result.voterCount} approved</span><span>{result.preferenceCount} shared preferences</span>{result.groupMatchPercent !== null && <span>{Math.round(result.groupMatchPercent)}% preference match</span>}{result.closedEarly && <span>Finished early · everyone who joined was ready</span>}</div>
    {attendance && <p className="result-note">{attendance}</p>}
    {recommendation && <p className="result-note">This is a recommendation: no eligible meal received an approval. Confirm with the group before heading out.</p>}
    {!demo && <div className="result-actions"><CopyButton label="Copy meal summary" getText={summary} /></div>}
    {winner && !recommendation && <p className="result-note">A lack of blocks doesn&apos;t mean everyone confirmed. Check in with anyone who hasn&apos;t responded.</p>}
    {demo && <p className="result-note">Sample result only. These fictional places and responses belong to this demo.</p>}
  </section>;
}
