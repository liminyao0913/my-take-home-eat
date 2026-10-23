import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { and, asc, count, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { LIMITS } from "@/lib/limits";
import {
  BLOCK_REASONS, createRoomInput, joinInput, optionInput, roomPreferencesInput, readyInput, responseInput, roundInput, ROUND_MS,
  type MealOption, type OptionInput, type Preferences, type RoomSnapshot, type RoundPage,
} from "@/lib/contracts";
import { decide } from "@/lib/decision";
import { minuteOfDay, minuteToTime, toInstant } from "@/lib/time";
import type { Database } from "./db";
import { ApiError, parseInput } from "./errors";
import { options, participants, profileRooms, responses, roomRounds, rooms } from "./schema";
import { capturePersonalRound, credentialFor, requireCredential, ensureProfile, linkProfileRoom, saveDefaults } from "./profile-store";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Query = Database | Transaction;
type Room = typeof rooms.$inferSelect;
type Participant = typeof participants.$inferSelect;

function requireOpenCapacity(db: Query, now: number) {
  const open = db.select({ count: count() }).from(rooms).where(and(isNull(rooms.result), gt(rooms.deadlineAt, now))).get()!.count;
  if (open >= LIMITS.openRounds) throw new ApiError(409, "OPEN_ROOM_LIMIT", "The service has 100 open rounds. Try again after a round ends.");
}

function preferencesOf(person: Participant): Preferences {
  return {
    cuisines: person.cuisines as Preferences["cuisines"], maxPriceLevel: person.maxPriceLevel,
    startTime: minuteToTime(person.preferredStartMinute), endTime: minuteToTime(person.preferredEndMinute),
  };
}

function getRoom(db: Query, roomId: string) {
  const room = db.select().from(rooms).where(eq(rooms.id, roomId)).get();
  if (!room) throw new ApiError(404, "NOT_FOUND", "This meal room could not be found. Check the shared link.");
  return room;
}

function getParticipant(db: Query, roomId: string, tokenHash: string | null) {
  const person = tokenHash ? db.select().from(participants).where(and(eq(participants.roomId, roomId), eq(participants.tokenHash, tokenHash), eq(participants.active, true))).get() : undefined;
  if (!person) throw new ApiError(401, "JOIN_REQUIRED", "Join this room before contributing.");
  return person;
}

function getOption(db: Query, roomId: string, optionId: number) {
  const option = db.select().from(options).where(and(eq(options.id, optionId), eq(options.roomId, roomId))).get();
  if (!option) throw new ApiError(404, "NOT_FOUND", "This meal option is no longer available.");
  return option;
}

function validateDate(mealDate: string, timeZone: string, now: number) {
  let date;
  try { date = Temporal.PlainDate.from(mealDate, { overflow: "reject" }); }
  catch { throw new ApiError(400, "INVALID_INPUT", "Choose a valid meal date.", { mealDate: ["Choose a valid date."] }); }
  const today = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timeZone).toPlainDate();
  if (Temporal.PlainDate.compare(date, today) < 0) throw new ApiError(400, "INVALID_INPUT", "Choose today or a future meal date.", { mealDate: ["The meal date is in the past."] });
}

function resetReadiness(db: Query, roomId: string) {
  db.update(participants).set({ ready: false }).where(eq(participants.roomId, roomId)).run();
}

function optionValues(input: OptionInput, room: Pick<Room, "mealDate" | "timeZone" | "deadlineAt">, field = "startTime") {
  let startAt: number;
  try { startAt = toInstant(room.mealDate, input.startTime, room.timeZone); }
  catch { throw new ApiError(400, "INVALID_TIME", "Choose an unambiguous time in the room's time zone.", { [field]: ["This time is skipped or repeated by a clock change. Choose a different time."] }); }
  if (startAt <= room.deadlineAt) throw new ApiError(400, "INVALID_TIME", "The meal must start after this ten-minute round ends.", { [field]: ["Choose a time after the decision deadline."] });
  return { placeName: input.placeName, location: input.location, startAt, cuisine: input.cuisine, priceLevel: input.priceLevel, link: input.link || null };
}

function loadInputs(db: Query, room: Room) {
  const people = db.select().from(participants).where(and(eq(participants.roomId, room.id), eq(participants.active, true))).orderBy(asc(participants.createdAt), asc(participants.id)).all();
  const votes = db.select({ participantId: responses.participantId, optionId: responses.optionId, choice: responses.choice, reason: responses.reason }).from(responses)
    .innerJoin(participants, eq(participants.id, responses.participantId)).innerJoin(options, eq(options.id, responses.optionId))
    .where(and(eq(participants.roomId, room.id), eq(options.roomId, room.id), eq(participants.active, true))).all();
  const counts = new Map<number, { approvalCount: number; blockCount: number; reasons: Map<string, number> }>();
  const responded = new Set<string>();
  const approved = new Set<string>();
  const personal = new Map<string, { choices: NonNullable<RoomSnapshot["me"]>["choices"]; blockReasons: NonNullable<RoomSnapshot["me"]>["blockReasons"] }>();
  for (const vote of votes) {
    const tally = counts.get(vote.optionId) ?? { approvalCount: 0, blockCount: 0, reasons: new Map() };
    const own = personal.get(vote.participantId) ?? { choices: {}, blockReasons: {} };
    responded.add(vote.participantId); own.choices[vote.optionId] = vote.choice;
    if (vote.choice === "approve") { tally.approvalCount++; approved.add(vote.participantId); }
    else {
      tally.blockCount++;
      if (vote.reason) { tally.reasons.set(vote.reason, (tally.reasons.get(vote.reason) ?? 0) + 1); own.blockReasons[vote.optionId] = vote.reason; }
    }
    counts.set(vote.optionId, tally); personal.set(vote.participantId, own);
  }
  const meals: MealOption[] = db.select().from(options).where(eq(options.roomId, room.id)).orderBy(asc(options.id)).all().map((o) => ({
    id: o.id, authorId: o.authorId, placeName: o.placeName, location: o.location, startAt: o.startAt, cuisine: o.cuisine,
    priceLevel: o.priceLevel, link: o.link,
    approvalCount: counts.get(o.id)?.approvalCount ?? 0,
    blockCount: counts.get(o.id)?.blockCount ?? 0,
    blockReasons: BLOCK_REASONS.map((reason) => ({ reason, count: counts.get(o.id)?.reasons.get(reason) ?? 0 })).filter((r) => r.count),
  }));
  return { people, meals, responded, approved, personal };
}

function finalize(db: Query, room: Room, now: number, early = false): Room {
  if (room.result) return room;
  const { people, approved, meals } = loadInputs(db, room);
  const result = { ...decide({
    options: meals, preferences: people.map(preferencesOf), participantCount: people.length,
    voterCount: approved.size,
    deadlineAt: early ? now : room.deadlineAt, timeZone: room.timeZone,
  }), closedEarly: early };
  db.update(rooms).set({ result, resolvedAt: now }).where(eq(rooms.id, room.id)).run();
  capturePersonalRound(db, room, result, now);
  return { ...room, result, resolvedAt: now };
}

function snapshot(db: Query, room: Room, tokenHash: string | null, now: number): RoomSnapshot {
  const { people, responded, personal, meals } = loadInputs(db, room);
  const me = credentialFor(db, tokenHash, now) ? people.find((p) => p.tokenHash === tokenHash) : undefined;
  return {
    room: { id: room.id, title: room.title, mealDate: room.mealDate, area: room.area, timeZone: room.timeZone, createdAt: room.createdAt, deadlineAt: room.deadlineAt, round: room.round },
    state: room.result ? "closed" : "open", serverNow: now,
    participants: people.map((p) => ({ id: p.id, displayName: p.displayName, ready: p.ready, responded: p.ready || responded.has(p.id) || p.cuisines.length > 0 || p.maxPriceLevel !== null || p.preferredStartMinute !== null })), options: meals, result: room.result,
    me: me ? { id: me.id, displayName: me.displayName, ready: me.ready, preferences: preferencesOf(me), ...(personal.get(me.id) ?? { choices: {}, blockReasons: {} }) } : null,
    archiveCount: db.select({ count: count() }).from(roomRounds).where(eq(roomRounds.roomId, room.id)).get()!.count,
  };
}

export class RoomService {
  constructor(private db: Database, private now: () => number = Date.now, private expectedRound = 1) {}

  private checkRound(room: Room) {
    if (room.round !== this.expectedRound) throw new ApiError(409, "STALE_ROUND", "A new round has started. Review the new ideas before trying again.");
  }

  create(tokenHash: string, value: unknown) {
    const input = parseInput(createRoomInput, value);
    try {
      if (/^[+-]/.test(input.timeZone)) throw new Error("offset");
      new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format();
    } catch { throw new ApiError(400, "INVALID_INPUT", "Choose a valid time zone.", { timeZone: ["Use a time zone such as America/Los_Angeles."] }); }
    return this.db.transaction((tx) => {
      const now = this.now();
      requireCredential(tx, tokenHash, now, true);
      if (tx.select({ count: count() }).from(rooms).get()!.count >= LIMITS.rooms) throw new ApiError(409, "ROOM_LIMIT", "The service has reached its room capacity. Contact the organizer.");
      requireOpenCapacity(tx, now);
      validateDate(input.mealDate, input.timeZone, now);
      const id = randomBytes(18).toString("base64url");
      const personId = randomUUID();
      const room = { id, title: input.title, area: input.area, mealDate: input.mealDate, timeZone: input.timeZone, createdAt: now, deadlineAt: now + ROUND_MS };
      const meals = input.options.map((o, i) => ({ ...optionValues(o, room, `options.${i}.startTime`), roomId: id, authorId: personId, createdAt: now }));
      tx.insert(rooms).values(room).run();
      tx.insert(participants).values({ id: personId, roomId: id, tokenHash, displayName: input.displayName, createdAt: now, ...input.preferences }).run();
      if (meals.length) tx.insert(options).values(meals).run();
      const profile = ensureProfile(tx, tokenHash, input.displayName, now);
      linkProfileRoom(tx, profile.id, id, personId, "created");
      return { id, path: `/r/${id}` };
    }, { behavior: "immediate" });
  }

  get(roomId: string, tokenHash: string | null): RoomSnapshot {
    const result = this.db.transaction((tx) => {
      const room = getRoom(tx, roomId);
      const now = this.now();
      if (!room.result && now >= room.deadlineAt) return null;
      return snapshot(tx, room, tokenHash, now);
    });
    if (result) return result;
    return this.db.transaction((tx) => {
      const room = getRoom(tx, roomId);
      const now = this.now();
      const closed = now >= room.deadlineAt ? finalize(tx, room, now) : room;
      return snapshot(tx, closed, tokenHash, now);
    }, { behavior: "immediate" });
  }

  archive(roomId: string, beforeRound?: number): RoundPage {
    if (beforeRound !== undefined && (!Number.isSafeInteger(beforeRound) || beforeRound < 1)) throw new ApiError(400, "INVALID_PAGE", "Use a valid round number.");
    return this.db.transaction((tx) => {
      getRoom(tx, roomId);
      const page = tx.select({ round: roomRounds.round, mealDate: roomRounds.mealDate, result: roomRounds.result }).from(roomRounds)
        .where(and(eq(roomRounds.roomId, roomId), beforeRound === undefined ? undefined : lt(roomRounds.round, beforeRound))).orderBy(desc(roomRounds.round)).limit(11).all();
      return { rounds: page.slice(0, 10), nextBeforeRound: page.length > 10 ? page[9].round : null };
    });
  }

  settleForProfile(roomId: string, hash: string, profileId: string) {
    this.db.transaction((tx) => {
      const now = this.now();
      const credential = requireCredential(tx, hash, now);
      if (credential?.profileId !== profileId) throw new ApiError(401, "PROFILE_REQUIRED", "This browser identity is no longer available.");
      const membership = tx.select({ roomId: profileRooms.roomId }).from(profileRooms).where(and(eq(profileRooms.profileId, profileId), eq(profileRooms.roomId, roomId), eq(profileRooms.hidden, false))).get();
      if (!membership) throw new ApiError(404, "NOT_FOUND", "This meal is not in your history.");
      const room = getRoom(tx, roomId);
      if (!room.result && now >= room.deadlineAt) finalize(tx, room, now);
    }, { behavior: "immediate" });
  }

  private mutate(roomId: string, tokenHash: string | null, action: (tx: Transaction, room: Room, now: number) => void, allowNew = false) {
    const accepted = this.db.transaction((tx) => {
      const room = getRoom(tx, roomId);
      this.checkRound(room);
      const now = this.now(); // Read after acquiring the write lock, including any lock wait.
      requireCredential(tx, tokenHash, now, allowNew);
      if (room.result || now >= room.deadlineAt) {
        finalize(tx, room, now);
        return false;
      }
      action(tx, room, now);
      return true;
    }, { behavior: "immediate" });
    // Throw only after committing a result materialized by a late request.
    if (!accepted) throw new ApiError(409, "ROOM_CLOSED", "The round has ended. Your change was not saved.");
  }

  join(roomId: string, tokenHash: string, value: unknown) {
    const input = parseInput(joinInput, value);
    this.mutate(roomId, tokenHash, (tx, room, now) => {
      const existing = tx.select().from(participants).where(and(eq(participants.roomId, room.id), eq(participants.tokenHash, tokenHash))).get();
      if (!existing && tx.select({ count: count() }).from(participants).where(eq(participants.roomId, roomId)).get()!.count >= LIMITS.participants) throw new ApiError(409, "PARTICIPANT_LIMIT", "This room already has 32 participants. Use another room for a larger group.");
      const personId = existing?.id ?? randomUUID();
      if (!existing?.active) {
        if (existing) tx.update(participants).set({ active: true, ready: false, displayName: input.displayName, ...input.preferences }).where(eq(participants.id, existing.id)).run();
        else tx.insert(participants).values({ id: personId, roomId, tokenHash, displayName: input.displayName, createdAt: now, ...input.preferences }).run();
      }
      const profile = ensureProfile(tx, tokenHash, input.displayName, now);
      linkProfileRoom(tx, profile.id, roomId, personId, "joined");
    }, true);
  }

  savePreferences(roomId: string, tokenHash: string | null, value: unknown) {
    const input = parseInput(roomPreferencesInput, value);
    this.mutate(roomId, tokenHash, (tx, room, now) => {
      const person = getParticipant(tx, roomId, tokenHash);
      tx.update(participants).set({ ready: false, cuisines: input.cuisines, maxPriceLevel: input.maxPriceLevel,
        preferredStartMinute: input.startTime === null ? null : minuteOfDay(input.startTime), preferredEndMinute: input.endTime === null ? null : minuteOfDay(input.endTime),
      }).where(eq(participants.id, person.id)).run();
      if (input.remember) {
        const profile = ensureProfile(tx, tokenHash!, person.displayName, now);
        saveDefaults(tx, profile.id, input);
        // Saving defaults is explicit opt-in, but must not restore a hidden history entry.
        tx.insert(profileRooms).values({ profileId: profile.id, roomId: room.id, participantId: person.id, role: "joined" }).onConflictDoNothing().run();
      }
    });
  }

  addOption(roomId: string, tokenHash: string | null, value: unknown) {
    const input = parseInput(optionInput, value);
    this.mutate(roomId, tokenHash, (tx, room, now) => {
      const person = getParticipant(tx, roomId, tokenHash);
      if (tx.select({ count: count() }).from(options).where(eq(options.roomId, roomId)).get()!.count >= LIMITS.options) throw new ApiError(409, "OPTION_LIMIT", "This round already has 20 ideas. Remove one before adding another.");
      tx.insert(options).values({ ...optionValues(input, room), roomId, authorId: person.id, createdAt: now }).run();
      resetReadiness(tx, roomId);
    });
  }

  removeOption(roomId: string, tokenHash: string | null, optionId: number) {
    this.mutate(roomId, tokenHash, (tx) => {
      const person = getParticipant(tx, roomId, tokenHash);
      const option = getOption(tx, roomId, optionId);
      if (option.authorId !== person.id) throw new ApiError(403, "NOT_YOUR_OPTION", "Only the person who proposed this option can remove it.");
      tx.delete(options).where(eq(options.id, option.id)).run();
      resetReadiness(tx, roomId);
    });
  }

  respond(roomId: string, tokenHash: string | null, optionId: number, value: unknown) {
    const input = parseInput(responseInput, value);
    this.mutate(roomId, tokenHash, (tx) => {
      const person = getParticipant(tx, roomId, tokenHash);
      getOption(tx, roomId, optionId);
      if (input.choice === null) tx.delete(responses).where(and(eq(responses.participantId, person.id), eq(responses.optionId, optionId))).run();
      else tx.insert(responses).values({ participantId: person.id, optionId, choice: input.choice, reason: input.reason }).onConflictDoUpdate({ target: [responses.participantId, responses.optionId], set: { choice: input.choice, reason: input.reason } }).run();
      tx.update(participants).set({ ready: false }).where(eq(participants.id, person.id)).run();
    });
  }

  leave(roomId: string, tokenHash: string | null) {
    this.mutate(roomId, tokenHash, (tx) => {
      const person = getParticipant(tx, roomId, tokenHash);
      tx.delete(responses).where(eq(responses.participantId, person.id)).run();
      tx.update(participants).set({ active: false, ready: false, cuisines: [], maxPriceLevel: null, preferredStartMinute: null, preferredEndMinute: null }).where(eq(participants.id, person.id)).run();
      resetReadiness(tx, roomId);
    });
  }

  setReady(roomId: string, tokenHash: string | null, value: unknown) {
    const input = parseInput(readyInput, value);
    this.mutate(roomId, tokenHash, (tx) => {
      const person = getParticipant(tx, roomId, tokenHash);
      tx.update(participants).set({ ready: input.ready }).where(eq(participants.id, person.id)).run();
    });
  }

  finish(roomId: string, tokenHash: string | null) {
    this.mutate(roomId, tokenHash, (tx, room, now) => {
      getParticipant(tx, roomId, tokenHash);
      const { people, meals } = loadInputs(tx, room);
      if (!people.length || people.some((p) => !p.ready)) throw new ApiError(409, "NOT_READY", "Everyone who joined must mark ‘I'm done’ before finishing early.");
      if (!meals.length) throw new ApiError(409, "NO_OPTIONS", "Add a meal idea before finishing the round.");
      finalize(tx, room, now, true);
    });
  }

  startRound(roomId: string, tokenHash: string | null, value: unknown) {
    const input = parseInput(roundInput, value);
    this.db.transaction((tx) => {
      let room = getRoom(tx, roomId);
      this.checkRound(room);
      const now = this.now();
      requireCredential(tx, tokenHash, now);
      const person = getParticipant(tx, roomId, tokenHash);
      if (!room.result && now < room.deadlineAt) throw new ApiError(409, "ROUND_OPEN", "Finish the current round before starting another.");
      if (room.round >= LIMITS.rounds) throw new ApiError(409, "ROUND_LIMIT", "This room has reached 100 rounds. Create a new meal room.");
      requireOpenCapacity(tx, now);
      validateDate(input.mealDate, room.timeZone, now);
      const next = { ...room, round: room.round + 1, mealDate: input.mealDate, deadlineAt: now + ROUND_MS, result: null, resolvedAt: null };
      const meals = input.options.map((o, i) => ({ ...optionValues(o, next, `options.${i}.startTime`), roomId, authorId: person.id, createdAt: now }));
      room = finalize(tx, room, now);
      tx.insert(roomRounds).values({ roomId, round: room.round, mealDate: room.mealDate, result: room.result! }).run();
      tx.delete(options).where(eq(options.roomId, roomId)).run();
      resetReadiness(tx, roomId);
      tx.update(rooms).set({ round: next.round, mealDate: next.mealDate, deadlineAt: next.deadlineAt, result: null, resolvedAt: null }).where(eq(rooms.id, roomId)).run();
      tx.insert(options).values(meals).run();
    }, { behavior: "immediate" });
  }
}
