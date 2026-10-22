import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { and, asc, eq } from "drizzle-orm";
import {
  createRoomInput, joinInput, optionInput, preferencesInput, responseInput, ROUND_MS,
  type MealOption, type OptionInput, type Preferences, type RoomSnapshot,
} from "@/lib/contracts";
import { decide } from "@/lib/decision";
import { minuteOfDay, minuteToTime, toInstant } from "@/lib/time";
import type { Database } from "./db";
import { ApiError, parseInput } from "./errors";
import { options, participants, responses, rooms } from "./schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Query = Database | Transaction;
type Room = typeof rooms.$inferSelect;
type Participant = typeof participants.$inferSelect;

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

function optionValues(input: OptionInput, room: Pick<Room, "mealDate" | "timeZone" | "deadlineAt">, field = "startTime") {
  let startAt: number;
  try { startAt = toInstant(room.mealDate, input.startTime, room.timeZone); }
  catch { throw new ApiError(400, "INVALID_TIME", "Choose an unambiguous time in the room's time zone.", { [field]: ["This time is skipped or repeated by a clock change. Choose a different time."] }); }
  if (startAt <= room.deadlineAt) throw new ApiError(400, "INVALID_TIME", "The meal must start after this ten-minute round ends.", { [field]: ["Choose a time after the decision deadline."] });
  return { placeName: input.placeName, location: input.location, startAt, cuisine: input.cuisine, priceLevel: input.priceLevel, link: input.link || null };
}

function loadInputs(db: Query, room: Room) {
  const people = db.select().from(participants).where(and(eq(participants.roomId, room.id), eq(participants.active, true))).orderBy(asc(participants.createdAt), asc(participants.id)).all();
  const votes = db.select({ participantId: responses.participantId, optionId: responses.optionId, choice: responses.choice }).from(responses)
    .innerJoin(participants, eq(participants.id, responses.participantId)).innerJoin(options, eq(options.id, responses.optionId))
    .where(and(eq(participants.roomId, room.id), eq(options.roomId, room.id), eq(participants.active, true))).all();
  const meals: MealOption[] = db.select().from(options).where(eq(options.roomId, room.id)).orderBy(asc(options.id)).all().map((o) => ({
    id: o.id, authorId: o.authorId, placeName: o.placeName, location: o.location, startAt: o.startAt, cuisine: o.cuisine,
    priceLevel: o.priceLevel, link: o.link,
    approvalCount: votes.filter((v) => v.optionId === o.id && v.choice === "approve").length,
    blockCount: votes.filter((v) => v.optionId === o.id && v.choice === "block").length,
  }));
  return { people, votes, meals };
}

function finalize(db: Query, room: Room, now: number): Room {
  if (room.result) return room;
  const { people, votes, meals } = loadInputs(db, room);
  const result = decide({
    options: meals, preferences: people.map(preferencesOf), participantCount: people.length,
    voterCount: new Set(votes.filter((v) => v.choice === "approve").map((v) => v.participantId)).size,
    deadlineAt: room.deadlineAt, timeZone: room.timeZone,
  });
  db.update(rooms).set({ result, resolvedAt: now }).where(eq(rooms.id, room.id)).run();
  return { ...room, result, resolvedAt: now };
}

function snapshot(db: Query, room: Room, tokenHash: string | null, now: number): RoomSnapshot {
  const { people, votes, meals } = loadInputs(db, room);
  const me = people.find((p) => p.tokenHash === tokenHash);
  return {
    room: { id: room.id, title: room.title, mealDate: room.mealDate, area: room.area, timeZone: room.timeZone, createdAt: room.createdAt, deadlineAt: room.deadlineAt },
    state: room.result ? "closed" : "open", serverNow: now,
    participants: people.map((p) => ({ id: p.id, displayName: p.displayName })), options: meals, result: room.result,
    me: me ? { id: me.id, displayName: me.displayName, preferences: preferencesOf(me), choices: Object.fromEntries(votes.filter((v) => v.participantId === me.id).map((v) => [v.optionId, v.choice])) } : null,
  };
}

export class RoomService {
  constructor(private db: Database, private now: () => number = Date.now) {}

  create(tokenHash: string, value: unknown) {
    const input = parseInput(createRoomInput, value);
    try { Temporal.PlainDate.from(input.mealDate, { overflow: "reject" }); }
    catch { throw new ApiError(400, "INVALID_INPUT", "Choose a valid meal date.", { mealDate: ["Choose a valid date."] }); }
    try {
      if (/^[+-]/.test(input.timeZone)) throw new Error("offset");
      new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format();
    } catch { throw new ApiError(400, "INVALID_INPUT", "Choose a valid time zone.", { timeZone: ["Use a time zone such as America/Los_Angeles."] }); }
    return this.db.transaction((tx) => {
      const now = this.now();
      const id = randomBytes(18).toString("base64url");
      const personId = randomUUID();
      const room = { id, title: input.title, area: input.area, mealDate: input.mealDate, timeZone: input.timeZone, createdAt: now, deadlineAt: now + ROUND_MS };
      const meals = input.options.map((o, i) => ({ ...optionValues(o, room, `options.${i}.startTime`), roomId: id, authorId: personId, createdAt: now }));
      tx.insert(rooms).values(room).run();
      tx.insert(participants).values({ id: personId, roomId: id, tokenHash, displayName: input.displayName, createdAt: now }).run();
      tx.insert(options).values(meals).run();
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

  private mutate(roomId: string, action: (tx: Transaction, room: Room, now: number) => void) {
    const accepted = this.db.transaction((tx) => {
      const room = getRoom(tx, roomId);
      const now = this.now(); // Read after acquiring the write lock, including any lock wait.
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
    this.mutate(roomId, (tx, room, now) => {
      const existing = tx.select().from(participants).where(and(eq(participants.roomId, room.id), eq(participants.tokenHash, tokenHash))).get();
      if (existing?.active) return;
      if (existing) tx.update(participants).set({ active: true, displayName: input.displayName }).where(eq(participants.id, existing.id)).run();
      else tx.insert(participants).values({ id: randomUUID(), roomId, tokenHash, displayName: input.displayName, createdAt: now }).run();
    });
  }

  savePreferences(roomId: string, tokenHash: string | null, value: unknown) {
    const input = parseInput(preferencesInput, value);
    this.mutate(roomId, (tx) => {
      const person = getParticipant(tx, roomId, tokenHash);
      tx.update(participants).set({ cuisines: input.cuisines, maxPriceLevel: input.maxPriceLevel,
        preferredStartMinute: input.startTime === null ? null : minuteOfDay(input.startTime), preferredEndMinute: input.endTime === null ? null : minuteOfDay(input.endTime),
      }).where(eq(participants.id, person.id)).run();
    });
  }

  addOption(roomId: string, tokenHash: string | null, value: unknown) {
    const input = parseInput(optionInput, value);
    this.mutate(roomId, (tx, room, now) => {
      const person = getParticipant(tx, roomId, tokenHash);
      tx.insert(options).values({ ...optionValues(input, room), roomId, authorId: person.id, createdAt: now }).run();
    });
  }

  removeOption(roomId: string, tokenHash: string | null, optionId: number) {
    this.mutate(roomId, (tx) => {
      const person = getParticipant(tx, roomId, tokenHash);
      const option = getOption(tx, roomId, optionId);
      if (option.authorId !== person.id) throw new ApiError(403, "NOT_YOUR_OPTION", "Only the person who proposed this option can remove it.");
      tx.delete(options).where(eq(options.id, option.id)).run();
    });
  }

  respond(roomId: string, tokenHash: string | null, optionId: number, value: unknown) {
    const input = parseInput(responseInput, value);
    this.mutate(roomId, (tx) => {
      const person = getParticipant(tx, roomId, tokenHash);
      getOption(tx, roomId, optionId);
      if (input.choice === null) tx.delete(responses).where(and(eq(responses.participantId, person.id), eq(responses.optionId, optionId))).run();
      else tx.insert(responses).values({ participantId: person.id, optionId, choice: input.choice }).onConflictDoUpdate({ target: [responses.participantId, responses.optionId], set: { choice: input.choice } }).run();
    });
  }

  leave(roomId: string, tokenHash: string | null) {
    this.mutate(roomId, (tx) => {
      const person = getParticipant(tx, roomId, tokenHash);
      tx.delete(responses).where(eq(responses.participantId, person.id)).run();
      tx.update(participants).set({ active: false, cuisines: [], maxPriceLevel: null, preferredStartMinute: null, preferredEndMinute: null }).where(eq(participants.id, person.id)).run();
    });
  }
}
