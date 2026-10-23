import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lte } from "drizzle-orm";
import { PROFILE_IDLE_MS, type DecisionResult, type MealOption, type PastPlace, type SavedPreferences } from "@/lib/contracts";
import type { Database } from "./db";
import { ApiError } from "./errors";
import { browserCredentials, options, participants, profileRooms, profileRounds, profiles, responses, rooms } from "./schema";

type Query = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export function pruneExpiredProfiles(db: Query, now: number) {
  db.delete(profiles).where(inArray(profiles.id, db.select({ id: browserCredentials.profileId }).from(browserCredentials).where(lte(browserCredentials.expiresAt, now)))).run();
  db.update(browserCredentials).set({ legacyAvailable: false }).where(and(lte(browserCredentials.expiresAt, now), eq(browserCredentials.legacyAvailable, true))).run();
}

export function credentialFor(db: Query, hash: string | null, now: number, renew = false) {
  if (!hash) return null;
  const credential = db.select().from(browserCredentials).where(and(eq(browserCredentials.tokenHash, hash), gt(browserCredentials.expiresAt, now))).get();
  if (!credential || (!credential.profileId && !credential.legacyAvailable)) return null;
  if (renew && credential.profileId && credential.expiresAt < now + PROFILE_IDLE_MS - 86400000) {
    credential.expiresAt = now + PROFILE_IDLE_MS;
    db.update(browserCredentials).set({ expiresAt: credential.expiresAt }).where(eq(browserCredentials.tokenHash, hash)).run();
  }
  return credential;
}

export function profileFor(db: Query, hash: string | null, now: number) {
  const credential = credentialFor(db, hash, now);
  return credential?.profileId ? db.select().from(profiles).where(eq(profiles.id, credential.profileId)).get() ?? null : null;
}

export function ensureProfile(db: Query, hash: string, displayName: string, now: number) {
  const credential = db.select().from(browserCredentials).where(eq(browserCredentials.tokenHash, hash)).get();
  if (credential && !credentialFor(db, hash, now)) throw new ApiError(401, "IDENTITY_EXPIRED", "This browser identity has expired. Refresh to start fresh.");
  const existing = profileFor(db, hash, now);
  if (existing) return existing;
  const profile = db.insert(profiles).values({ id: randomUUID(), displayName, createdAt: now }).returning().get();
  if (credential) db.update(browserCredentials).set({ profileId: profile.id, expiresAt: now + PROFILE_IDLE_MS }).where(eq(browserCredentials.tokenHash, hash)).run();
  else db.insert(browserCredentials).values({ tokenHash: hash, profileId: profile.id, expiresAt: now + PROFILE_IDLE_MS }).run();
  return profile;
}

export function linkProfileRoom(db: Query, profileId: string, roomId: string, participantId: string, role: "created" | "joined") {
  db.insert(profileRooms).values({ profileId, roomId, participantId, role }).onConflictDoUpdate({ target: [profileRooms.profileId, profileRooms.roomId], set: { hidden: false, participantId } }).run();
}

export function saveDefaults(db: Query, profileId: string, preferences: SavedPreferences) {
  db.update(profiles).set({ cuisines: preferences.cuisines, maxPriceLevel: preferences.maxPriceLevel }).where(eq(profiles.id, profileId)).run();
}

export function pastPlace(option: Pick<MealOption, "id" | "placeName" | "location" | "cuisine" | "priceLevel" | "link">): PastPlace {
  return { sourceOptionId: option.id, placeName: option.placeName, location: option.location, cuisine: option.cuisine, priceLevel: option.priceLevel, link: option.link };
}

export function capturePersonalRound(db: Query, room: typeof rooms.$inferSelect, result: DecisionResult, now: number, onlyProfile?: string) {
  const memberships = db.select({ profileId: profileRooms.profileId, participantId: profileRooms.participantId }).from(profileRooms)
    .innerJoin(participants, eq(participants.id, profileRooms.participantId))
    .innerJoin(browserCredentials, eq(browserCredentials.profileId, profileRooms.profileId))
    .where(and(eq(profileRooms.roomId, room.id), eq(profileRooms.hidden, false), eq(participants.active, true), gt(browserCredentials.expiresAt, now), onlyProfile ? eq(profileRooms.profileId, onlyProfile) : undefined)).all();
  if (!memberships.length) return;
  const meals = db.select().from(options).where(eq(options.roomId, room.id)).all();
  for (const member of memberships) {
    const votes = db.select().from(responses).where(eq(responses.participantId, member.participantId)).all();
    const signals = meals.flatMap((meal) => {
      const choice = votes.find((vote) => vote.optionId === meal.id)?.choice;
      const approved = choice === "approve";
      const groupPick = result.winner?.id === meal.id && result.winner.approvalCount > 0 && choice !== "block";
      return approved || groupPick ? [{ ...pastPlace(meal), approved, groupPick }] : [];
    });
    db.insert(profileRounds).values({ profileId: member.profileId, roomId: room.id, round: room.round, closedAt: result.closedAt, area: room.area, signals }).onConflictDoNothing().run();
  }
}
