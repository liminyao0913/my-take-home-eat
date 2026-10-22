import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Choice, DecisionResult } from "../lib/contracts";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  mealDate: text("meal_date").notNull(),
  area: text("area").notNull(),
  timeZone: text("time_zone").notNull(),
  createdAt: integer("created_at").notNull(),
  deadlineAt: integer("deadline_at").notNull(),
  result: text("result_json", { mode: "json" }).$type<DecisionResult>(),
  resolvedAt: integer("resolved_at"),
});

export const participants = sqliteTable("participants", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  displayName: text("display_name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  cuisines: text("cuisines_json", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  maxPriceLevel: integer("max_price_level"),
  preferredStartMinute: integer("preferred_start_minute"),
  preferredEndMinute: integer("preferred_end_minute"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("participant_identity").on(table.roomId, table.tokenHash),
  check("participant_price", sql`${table.maxPriceLevel} IS NULL OR ${table.maxPriceLevel} BETWEEN 1 AND 3`),
  check("participant_window", sql`(${table.preferredStartMinute} IS NULL AND ${table.preferredEndMinute} IS NULL) OR (${table.preferredStartMinute} IS NOT NULL AND ${table.preferredEndMinute} IS NOT NULL AND ${table.preferredStartMinute} >= 0 AND ${table.preferredEndMinute} <= 1439 AND ${table.preferredStartMinute} <= ${table.preferredEndMinute})`),
]);

export const options = sqliteTable("options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => participants.id),
  placeName: text("place_name").notNull(),
  location: text("location").notNull(),
  startAt: integer("start_at").notNull(),
  cuisine: text("cuisine").notNull(),
  priceLevel: integer("price_level").notNull(),
  link: text("link"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("option_room").on(table.roomId),
  check("option_price", sql`${table.priceLevel} BETWEEN 1 AND 3`),
]);

export const responses = sqliteTable("responses", {
  participantId: text("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
  optionId: integer("option_id").notNull().references(() => options.id, { onDelete: "cascade" }),
  choice: text("choice").$type<Choice>().notNull(),
}, (table) => [
  primaryKey({ columns: [table.participantId, table.optionId] }),
  index("response_option").on(table.optionId),
  check("response_choice", sql`${table.choice} IN ('approve', 'block')`),
]);
