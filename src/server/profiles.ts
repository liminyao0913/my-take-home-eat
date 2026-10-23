import "server-only";
import { and, asc, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { profileInput, recommendationInput, type HistoryPage, type HistoryRoom, type ProfileSnapshot, type SavedPreferences } from "@/lib/contracts";
import { recommend } from "@/lib/recommendations";
import type { Database } from "./db";
import { ApiError, parseInput } from "./errors";
import { capturePersonalRound, credentialFor, ensureProfile, pastPlace, profileFor } from "./profile-store";
import { RoomService } from "./rooms";
import { browserCredentials, participants, profileRooms, profileRounds, profiles, rooms } from "./schema";

export class ProfileService {
  constructor(private db: Database, private now: () => number = Date.now) {}

  get(hash: string | null): ProfileSnapshot {
    const credential = credentialFor(this.db, hash, this.now());
    const profile = profileFor(this.db, hash, this.now());
    return {
      profile: profile ? { id: profile.id, displayName: profile.displayName, preferences: { cuisines: profile.cuisines as SavedPreferences["cuisines"], maxPriceLevel: profile.maxPriceLevel } } : null,
      canImportLegacy: credential?.legacyAvailable ?? false,
    };
  }

  private requireProfile(hash: string | null, db: Parameters<Parameters<Database["transaction"]>[0]>[0] | Database = this.db) {
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

  private settleRooms(profileId: string, hash: string) {
    const expired = this.db.select({ roomId: rooms.id }).from(profileRooms).innerJoin(rooms, eq(rooms.id, profileRooms.roomId))
      .where(and(eq(profileRooms.profileId, profileId), eq(profileRooms.hidden, false), isNull(rooms.result), lte(rooms.deadlineAt, this.now()))).all();
    const service = new RoomService(this.db, this.now);
    for (const room of expired) service.get(room.roomId, hash);
  }

  private historyRoom(profileId: string, roomId: string, hash: string): HistoryRoom {
    const membership = this.db.select({ role: profileRooms.role, active: participants.active }).from(profileRooms)
      .innerJoin(participants, eq(participants.id, profileRooms.participantId))
      .where(and(eq(profileRooms.profileId, profileId), eq(profileRooms.roomId, roomId), eq(profileRooms.hidden, false))).get();
    if (!membership) throw new ApiError(404, "NOT_FOUND", "This meal is not in your history.");
    const snapshot = new RoomService(this.db, this.now).get(roomId, hash);
    const ideas = new Map<number, HistoryRoom["ideas"][number]>();
    for (const option of snapshot.options) ideas.set(option.id, { round: snapshot.room.round, place: pastPlace(option) });
    for (const previous of snapshot.previousRounds) if (previous.result.winner) ideas.set(previous.result.winner.id, { round: previous.round, place: pastPlace(previous.result.winner) });
    const personal = this.db.select().from(profileRounds).where(and(eq(profileRounds.profileId, profileId), eq(profileRounds.roomId, roomId))).all();
    for (const round of personal) for (const signal of round.signals) {
      ideas.set(signal.sourceOptionId, { round: round.round, place: { sourceOptionId: signal.sourceOptionId, placeName: signal.placeName, location: signal.location, cuisine: signal.cuisine, priceLevel: signal.priceLevel, link: signal.link } });
    }
    return { roomId, title: snapshot.room.title, mealDate: snapshot.room.mealDate, area: snapshot.room.area, round: snapshot.room.round, state: snapshot.state, role: membership.role, left: !membership.active, result: snapshot.result, previousRounds: snapshot.previousRounds, ideas: [...ideas.values()].sort((a, b) => b.round - a.round || a.place.sourceOptionId - b.place.sourceOptionId) };
  }

  history(hash: string | null, offset = 0): HistoryPage {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new ApiError(400, "INVALID_PAGE", "Use a valid history page.");
    const profile = this.requireProfile(hash);
    this.settleRooms(profile.id, hash!);
    const page = this.db.select({ roomId: rooms.id }).from(profileRooms).innerJoin(rooms, eq(rooms.id, profileRooms.roomId))
      .where(and(eq(profileRooms.profileId, profile.id), eq(profileRooms.hidden, false)))
      .orderBy(sql`CASE WHEN ${rooms.result} IS NULL AND ${rooms.deadlineAt} > ${this.now()} THEN 0 ELSE 1 END`, desc(sql`COALESCE(json_extract(${rooms.result}, '$.closedAt'), ${rooms.deadlineAt})`), asc(rooms.id)).limit(21).offset(offset).all();
    return { rooms: page.slice(0, 20).map((room) => this.historyRoom(profile.id, room.roomId, hash!)), hasMore: page.length > 20 };
  }

  removeRoom(hash: string | null, roomId: string) {
    this.db.transaction((tx) => {
      const profile = this.requireProfile(hash, tx);
      const changed = tx.update(profileRooms).set({ hidden: true }).where(and(eq(profileRooms.profileId, profile.id), eq(profileRooms.roomId, roomId))).run();
      if (!changed.changes) throw new ApiError(404, "NOT_FOUND", "This meal is not in your history.");
      tx.delete(profileRounds).where(and(eq(profileRounds.profileId, profile.id), eq(profileRounds.roomId, roomId))).run();
    }, { behavior: "immediate" });
  }

  idea(hash: string | null, roomId: string, optionId: number) {
    const profile = this.requireProfile(hash);
    const idea = this.historyRoom(profile.id, roomId, hash!).ideas.find((idea) => idea.place.sourceOptionId === optionId);
    if (!idea) throw new ApiError(404, "NOT_FOUND", "That past idea is no longer available.");
    return idea.place;
  }

  recommendations(hash: string | null, value: unknown) {
    const input = parseInput(recommendationInput, value);
    const profile = this.get(hash).profile;
    if (!profile) return { suggestions: [], otherAreaCount: 0 };
    this.settleRooms(profile.id, hash!);
    const rounds = this.db.select({ roomId: profileRounds.roomId, round: profileRounds.round, closedAt: profileRounds.closedAt, area: profileRounds.area, signals: profileRounds.signals }).from(profileRounds)
      .innerJoin(profileRooms, and(eq(profileRooms.profileId, profileRounds.profileId), eq(profileRooms.roomId, profileRounds.roomId)))
      .where(and(eq(profileRounds.profileId, profile.id), eq(profileRooms.hidden, false), gt(profileRounds.closedAt, this.now() - 180 * 86400000 - 1)))
      .orderBy(desc(profileRounds.closedAt), asc(profileRounds.roomId), desc(profileRounds.round)).limit(20).all();
    return recommend(rounds, input.preferences, input.area, input.otherAreas, this.now());
  }
}
