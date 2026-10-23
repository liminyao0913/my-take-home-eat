import { z } from "zod";
import { LIMITS } from "./limits";

export const ROUND_MS = 10 * 60 * 1000;
export const PROFILE_IDLE_MS = 180 * 24 * 60 * 60 * 1000;
export const CUISINES = ["Italian", "Thai", "Mexican", "Japanese", "Indian", "Mediterranean", "Chinese", "American", "Other"] as const;
export const PRICE_LABELS = ["", "Budget", "Mid-range", "Splurge"] as const;
export const BLOCK_REASONS = ["Time conflict", "Dietary restriction", "Too far", "Over budget"] as const;
const price = z.number().int().min(1).max(3);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time.");
const name = z.string().trim().min(1, "Enter your name.").max(40);
export const savedPreferencesInput = z.object({
  cuisines: z.array(z.enum(CUISINES)).max(CUISINES.length).default([]).transform((items) => [...new Set(items)]),
  maxPriceLevel: price.nullable().default(null),
});
export const profileInput = savedPreferencesInput.extend({ displayName: name });
export const recommendationInput = z.object({
  preferences: savedPreferencesInput, area: z.string().trim().max(120).default(""), otherAreas: z.boolean().default(false),
});

export const optionInput = z.object({
  placeName: z.string().trim().min(1, "Enter a place.").max(120),
  location: z.string().trim().max(200).default(""),
  startTime: time,
  cuisine: z.enum(CUISINES).nullable().default(null),
  priceLevel: price.nullable().default(null),
  link: z.string().trim().max(2048).default("").refine((value) => {
    if (!value) return true;
    try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
  }, "Use an http or https link."),
});

export const createRoomInput = z.object({
  displayName: name,
  title: z.string().trim().min(1, "Give your meal a title.").max(100).default("Let's grab a bite"),
  mealDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  area: z.string().trim().max(120).default(""),
  timeZone: z.string().min(1).max(100),
  options: z.array(optionInput).max(LIMITS.options, "Use at most 20 meal ideas.").default([]),
  preferences: savedPreferencesInput.optional(),
});

export const roundInput = z.object({
  mealDate: createRoomInput.shape.mealDate,
  options: z.array(optionInput).min(1, "Add a new idea for this round.").max(LIMITS.options, "Use at most 20 meal ideas."),
});
export const readyInput = z.object({ ready: z.boolean() });

export const joinInput = z.object({ displayName: name, preferences: savedPreferencesInput.optional() });
export const preferencesInput = z.object({
  cuisines: z.array(z.enum(CUISINES)).max(CUISINES.length).default([]).transform((items) => [...new Set(items)]),
  maxPriceLevel: price.nullable().default(null),
  startTime: time.nullable().default(null),
  endTime: time.nullable().default(null),
}).refine((value) => (value.startTime === null) === (value.endTime === null), {
  message: "Enter both ends of your preferred time window, or leave both empty.", path: ["endTime"],
}).refine((value) => !value.startTime || !value.endTime || value.startTime <= value.endTime, {
  message: "The end of the window must be at or after its start.", path: ["endTime"],
});

export const responseInput = z.object({
  choice: z.enum(["approve", "block"]).nullable(),
  reason: z.enum(BLOCK_REASONS).nullable().default(null),
}).refine((value) => value.choice === "block" || value.reason === null, { message: "A reason belongs to a ‘Can't do this’ response.", path: ["reason"] });
export type CreateRoomInput = z.infer<typeof createRoomInput>;
export type OptionInput = z.infer<typeof optionInput>;
export type Preferences = z.infer<typeof preferencesInput>;
export const roomPreferencesInput = preferencesInput.and(z.object({ remember: z.boolean().default(false) }));
export type SavedPreferences = z.infer<typeof savedPreferencesInput>;
export type PastPlace = Pick<MealOption, "placeName" | "location" | "cuisine" | "priceLevel" | "link"> & { sourceOptionId: number };
export type MealSignal = PastPlace & { approved: boolean; groupPick: boolean };
export type PersonalRound = { roomId: string; round: number; closedAt: number; area: string; signals: MealSignal[] };
export type Suggestion = PastPlace & { approvalRounds: number; groupPickRounds: number; lastChosenAt: number; matchPercent: number | null; reason: string; area: string };
export type Suggestions = { suggestions: Suggestion[]; otherAreaCount: number };
export type ProfileSnapshot = { profile: { id: string; displayName: string; preferences: SavedPreferences } | null; canImportLegacy: boolean };
export type HistoryRoom = {
  roomId: string; title: string; mealDate: string; area: string; round: number; state: "open" | "closed";
  role: "created" | "joined"; left: boolean; result: DecisionResult | null;
  previousRounds: RoomSnapshot["previousRounds"]; ideas: { round: number; place: PastPlace }[];
};
export type HistoryPage = { rooms: HistoryRoom[]; hasMore: boolean };
export type Choice = "approve" | "block";
export type BlockReason = typeof BLOCK_REASONS[number];

export type MealOption = {
  id: number; authorId: string; placeName: string; location: string;
  startAt: number; cuisine: string | null; priceLevel: number | null; link: string | null;
  approvalCount: number; blockCount: number;
  blockReasons: { reason: BlockReason; count: number }[];
};

export type DecisionResult = {
  winner: MealOption | null;
  basis: "votes" | "preferences" | "preference-tiebreak" | "first-proposed" | "no-options";
  message: string;
  participantCount: number; voterCount: number; preferenceCount: number;
  excludedApprovalCount: number; groupMatchPercent: number | null; closedAt: number;
  closedEarly?: boolean;
};

export type RoomSnapshot = {
  room: { id: string; title: string; mealDate: string; area: string; timeZone: string; createdAt: number; deadlineAt: number; round: number };
  serverNow: number;
  state: "open" | "closed";
  participants: { id: string; displayName: string; responded: boolean; ready: boolean }[];
  options: MealOption[];
  me: { id: string; displayName: string; preferences: Preferences; choices: Record<number, Choice>; blockReasons: Record<number, BlockReason>; ready: boolean } | null;
  result: DecisionResult | null;
  previousRounds: { round: number; mealDate: string; result: DecisionResult }[];
};

export type ApiErrorBody = { code: string; message: string; fieldErrors?: Record<string, string[]> };
