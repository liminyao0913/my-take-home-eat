import "server-only";
import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { profileInput, recommendationInput, type HistoryPage, type IdeasPage, type MealOption, type MealSignal, type PastPlace, type ProfileSnapshot, type SavedPreferences } from "@/lib/contracts";
import { recommend } from "@/lib/recommendations";
import type { Database } from "./db";
import { ApiError, parseInput } from "./errors";
import { capturePersonalRound, credentialFor, ensureProfile, pastPlace, profileFor } from "./profile-store";
import { RoomService } from "./rooms";
import { browserCredentials, options, participants, profileRooms, profileRounds, profiles, roomRounds, rooms } from "./schema";

type Query = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

function requireMembership(db: Query, profileId: string, roomId: string) {
  const membership = db.select({ roomId: profileRooms.roomId }).from(profileRooms)
    .where(and(eq(profileRooms.profileId, profileId), eq(profileRooms.roomId, roomId), eq(profileRooms.hidden, false))).get();
  if (!membership) throw new ApiError(404, "NOT_FOUND", "This meal is not in your history.");
}

export class ProfileService {
  constructor(private db: Database, private now: () => number = Date.now) {}

  get(hash: string | null): ProfileSnapshot {
    return this.db.transaction((tx) => {
      const now = this.now();
      const credential = credentialFor(tx, hash, now);
      const profile = profileFor(tx, hash, now);
      return {
        profile: profile ? { id: profile.id, displayName: profile.displayName, preferences: { cuisines: profile.cuisines as SavedPreferences["cuisines"], maxPriceLevel: profile.maxPriceLevel } } : null,
        canImportLegacy: credential?.legacyAvailable ?? false,
      };
    });
  }

  private requireProfile(hash: string | null, db: Query = this.db) {
    const profile = profileFor(db, hash, this.now());
    if (!profile) throw new ApiError(401, "PROFILE_REQUIRED", "Create or join a meal to remember meals in this browser.");
    return profile;
  }

  update(hash: string | null, value: unknown) {
    const input = parseInput(profileInput, value);
    this.db.transaction((tx) => {
      const profile = this.requireProfile(hash, tx);
      tx.update(profiles).set(input).where(eq(profiles.id, profile.id)).run();
    }, { behavior: "immediate" });
    return this.get(hash);
  }

  forget(hash: string | null) {
    this.db.transaction((tx) => {
      const credential = credentialFor(tx, hash, this.now());
      if (!credential) throw new ApiError(401, "PROFILE_REQUIRED", "This browser has no remembered identity.");
      if (credential.profileId) tx.delete(profiles).where(eq(profiles.id, credential.profileId)).run();
      tx.update(browserCredentials).set({ profileId: null, legacyAvailable: false, expiresAt: this.now() }).where(eq(browserCredentials.tokenHash, hash!)).run();
    }, { behavior: "immediate" });
  }

  importLegacy(hash: string | null) {
    this.db.transaction((tx) => {
      const now = this.now();
      const credential = credentialFor(tx, hash, now);
      if (!credential?.legacyAvailable) throw new ApiError(409, "IMPORT_UNAVAILABLE", "There are no older meals to import from this browser.");
      const people = tx.select().from(participants).where(eq(participants.tokenHash, hash!)).orderBy(asc(participants.createdAt), asc(participants.id)).all();
      const profile = ensureProfile(tx, hash!, people[0]?.displayName ?? "Guest", now);
      for (const person of people) {
        tx.insert(profileRooms).values({ profileId: profile.id, roomId: person.roomId, participantId: person.id, role: "joined" }).onConflictDoNothing().run();
        const room = tx.select().from(rooms).where(eq(rooms.id, person.roomId)).get()!;
        if (room.result) capturePersonalRound(tx, room, room.result, now, profile.id);
      }
      tx.update(browserCredentials).set({ legacyAvailable: false }).where(eq(browserCredentials.tokenHash, hash!)).run();
    }, { behavior: "immediate" });
    return this.get(hash);
  }

  history(hash: string | null, offset = 0, limit = 20): HistoryPage {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new ApiError(400, "INVALID_PAGE", "Use a valid history page of up to 20 meals.");
    const selected = this.db.transaction((tx) => {
      const profile = this.requireProfile(hash, tx);
      const now = this.now();
      const page = tx.select({ roomId: rooms.id, deadlineAt: rooms.deadlineAt, result: rooms.result }).from(profileRooms).innerJoin(rooms, eq(rooms.id, profileRooms.roomId))
        .where(and(eq(profileRooms.profileId, profile.id), eq(profileRooms.hidden, false)))
        .orderBy(sql`CASE WHEN ${rooms.result} IS NULL AND ${rooms.deadlineAt} > ${now} THEN 0 ELSE 1 END`, desc(sql`COALESCE(json_extract(${rooms.result}, '$.closedAt'), ${rooms.deadlineAt})`), asc(rooms.id)).limit(limit + 1).offset(offset).all();
      return { profileId: profile.id, page: page.slice(0, limit), hasMore: page.length > limit, now };
    });
    const service = new RoomService(this.db, this.now);
    for (const room of selected.page) if (!room.result && room.deadlineAt <= selected.now) service.settleForProfile(room.roomId, hash!, selected.profileId);
    return this.db.transaction((tx) => {
      const profile = this.requireProfile(hash, tx);
      if (!selected.page.length) return { rooms: [], hasMore: false };
      const summaries = tx.select({ roomId: rooms.id, title: rooms.title, mealDate: rooms.mealDate, area: rooms.area, round: rooms.round, result: rooms.result, role: profileRooms.role, active: participants.active,
        archiveCount: sql<number>`(SELECT count(*) FROM room_rounds WHERE room_id = ${rooms.id})`,
      }).from(profileRooms).innerJoin(rooms, eq(rooms.id, profileRooms.roomId)).innerJoin(participants, eq(participants.id, profileRooms.participantId))
        .where(and(eq(profileRooms.profileId, profile.id), eq(profileRooms.hidden, false), inArray(rooms.id, selected.page.map((room) => room.roomId)))).all();
      const byId = new Map(summaries.map((room) => [room.roomId, room]));
      return { rooms: selected.page.flatMap(({ roomId }) => {
        const room = byId.get(roomId);
        if (!room) return [];
        const { result, active, ...summary } = room;
        return [{ ...summary, state: result ? "closed" as const : "open" as const, left: !active,
          result: result ? { closedAt: result.closedAt, winner: result.winner ? { placeName: result.winner.placeName, approvalCount: result.winner.approvalCount } : null } : null }];
      }), hasMore: selected.hasMore };
    });
  }

  removeRoom(hash: string | null, roomId: string) {
    this.db.transaction((tx) => {
      const profile = this.requireProfile(hash, tx);
      const changed = tx.update(profileRooms).set({ hidden: true }).where(and(eq(profileRooms.profileId, profile.id), eq(profileRooms.roomId, roomId))).run();
      if (!changed.changes) throw new ApiError(404, "NOT_FOUND", "This meal is not in your history.");
      tx.delete(profileRounds).where(and(eq(profileRounds.profileId, profile.id), eq(profileRounds.roomId, roomId))).run();
    }, { behavior: "immediate" });
  }

  ideas(hash: string | null, roomId: string, beforeRound?: number): IdeasPage {
    if (beforeRound !== undefined && (!Number.isSafeInteger(beforeRound) || beforeRound < 1)) throw new ApiError(400, "INVALID_PAGE", "Use a valid round number.");
    return this.db.transaction((tx) => {
      const profile = this.requireProfile(hash, tx);
      requireMembership(tx, profile.id, roomId);
      const room = tx.select({ round: rooms.round }).from(rooms).where(eq(rooms.id, roomId)).get()!;
      const includeCurrent = beforeRound === undefined || room.round < beforeRound;
      const archived = tx.select({ round: roomRounds.round, result: roomRounds.result }).from(roomRounds)
        .where(and(eq(roomRounds.roomId, roomId), beforeRound === undefined ? undefined : lt(roomRounds.round, beforeRound))).orderBy(desc(roomRounds.round)).limit(includeCurrent ? 10 : 11).all();
      const rounds = [...(includeCurrent ? [room.round] : []), ...archived.map((old) => old.round)];
      const selected = rounds.slice(0, 10);
      const ideas = new Map<number, IdeasPage["ideas"][number]>();
      if (includeCurrent) for (const option of tx.select().from(options).where(eq(options.roomId, roomId)).all()) ideas.set(option.id, { round: room.round, place: pastPlace(option) });
      for (const old of archived) if (selected.includes(old.round) && old.result.winner) ideas.set(old.result.winner.id, { round: old.round, place: pastPlace(old.result.winner) });
      if (selected.length) {
        const personal = tx.select({ round: profileRounds.round, signals: profileRounds.signals }).from(profileRounds)
          .where(and(eq(profileRounds.profileId, profile.id), eq(profileRounds.roomId, roomId), inArray(profileRounds.round, selected))).all();
        for (const round of personal) for (const signal of round.signals) {
          ideas.set(signal.sourceOptionId, { round: round.round, place: { sourceOptionId: signal.sourceOptionId, placeName: signal.placeName, location: signal.location, cuisine: signal.cuisine, priceLevel: signal.priceLevel, link: signal.link } });
        }
      }
      return { ideas: [...ideas.values()].sort((a, b) => b.round - a.round || a.place.sourceOptionId - b.place.sourceOptionId), nextBeforeRound: rounds.length > 10 ? selected[9] : null };
    });
  }

  idea(hash: string | null, roomId: string, optionId: number): PastPlace {
    return this.db.transaction((tx) => {
      const profile = this.requireProfile(hash, tx);
      requireMembership(tx, profile.id, roomId);
      const current = tx.select().from(options).where(and(eq(options.roomId, roomId), eq(options.id, optionId))).get();
      if (current) return pastPlace(current);
      const archived = tx.select({ winner: sql<string>`json_extract(${roomRounds.result}, '$.winner')` }).from(roomRounds)
        .where(and(eq(roomRounds.roomId, roomId), sql`json_extract(${roomRounds.result}, '$.winner.id') = ${optionId}`)).limit(1).get();
      if (archived) return pastPlace(JSON.parse(archived.winner) as MealOption);
      const personal = tx.get<{ place: string }>(sql`SELECT signal.value AS place FROM profile_rounds AS personal, json_each(personal.signals_json) AS signal
        WHERE personal.profile_id = ${profile.id} AND personal.room_id = ${roomId} AND json_extract(signal.value, '$.sourceOptionId') = ${optionId} LIMIT 1`);
      if (personal) {
        const signal = JSON.parse(personal.place) as MealSignal;
        return { sourceOptionId: signal.sourceOptionId, placeName: signal.placeName, location: signal.location, cuisine: signal.cuisine, priceLevel: signal.priceLevel, link: signal.link };
      }
      throw new ApiError(404, "NOT_FOUND", "That past idea is no longer available.");
    });
  }

  recommendations(hash: string | null, value: unknown) {
    const input = parseInput(recommendationInput, value);
    const now = this.now();
    const selected = this.db.transaction((tx) => {
      const profile = profileFor(tx, hash, now);
      if (!profile) return null;
      // Scan newest deadlines first and stop after 20 eligible memberships; avoid sorting every room in a profile.
      const expired = tx.all<{ roomId: string }>(sql`SELECT r.id AS roomId FROM rooms AS r INDEXED BY room_open_deadline
        CROSS JOIN profile_rooms AS m ON m.room_id = r.id CROSS JOIN participants AS p ON p.id = m.participant_id
        WHERE m.profile_id = ${profile.id} AND m.hidden = 0 AND p.active = 1 AND r.result_json IS NULL
          AND r.deadline_at <= ${now} AND r.deadline_at >= ${now - 180 * 86400000}
        ORDER BY r.deadline_at DESC, r.id ASC LIMIT 20`);
      return { profileId: profile.id, expired };
    });
    if (!selected) return { suggestions: [], otherAreaCount: 0 };
    const service = new RoomService(this.db, this.now);
    for (const room of selected.expired) service.settleForProfile(room.roomId, hash!, selected.profileId);
    return this.db.transaction((tx) => {
      const profile = this.requireProfile(hash, tx);
      const rounds = tx.select({ roomId: profileRounds.roomId, round: profileRounds.round, closedAt: profileRounds.closedAt, area: profileRounds.area, signals: profileRounds.signals }).from(profileRounds)
        .innerJoin(profileRooms, and(eq(profileRooms.profileId, profileRounds.profileId), eq(profileRooms.roomId, profileRounds.roomId)))
        .where(and(eq(profileRounds.profileId, profile.id), eq(profileRooms.hidden, false), gt(profileRounds.closedAt, now - 180 * 86400000 - 1)))
        .orderBy(desc(profileRounds.closedAt), asc(profileRounds.roomId), desc(profileRounds.round)).limit(20).all();
      return recommend(rounds, input.preferences, input.area, input.otherAreas, now);
    });
  }
}
