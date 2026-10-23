import { isAbsolute } from "node:path";
import journal from "../drizzle/meta/_journal.json" with { type: "json" };

export const schemaVersion = journal.entries.at(-1).tag;

/** @param {Record<string, string | undefined>} env */
export function validateEnvironment(env = process.env) {
  const render = env.RENDER === "true" || Boolean(env.RENDER_SERVICE_ID);
  if (render && (!env.APP_ORIGIN || !env.DATABASE_PATH)) throw new Error("Render requires APP_ORIGIN and DATABASE_PATH.");
  const origin = env.APP_ORIGIN || "http://localhost:3000";
  let url;
  try { url = new URL(origin); } catch { throw new Error("APP_ORIGIN must be an exact http or https origin."); }
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) throw new Error("APP_ORIGIN must be an exact origin without a path or trailing slash.");
  const local = /^(localhost|.*\.localhost|.*\.local|127\..*|0\..*|10\..*|192\.168\..*|172\.(1[6-9]|2\d|3[01])\..*|169\.254\..*|\[::1\])$/i.test(url.hostname);
  if (render && (url.protocol !== "https:" || local)) throw new Error("Render requires an HTTPS non-local APP_ORIGIN.");
  const databasePath = env.DATABASE_PATH || ".data/lets-eat.sqlite";
  if (render && !isAbsolute(databasePath)) throw new Error("Render requires an absolute DATABASE_PATH on its persistent disk.");
  return { origin, databasePath };
}

/** @param {import('better-sqlite3').Database} sqlite */
export function checkDatabase(sqlite, write = false) {
  const applied = new Set(sqlite.prepare("SELECT created_at FROM __drizzle_migrations").all().map((row) => row.created_at));
  if (journal.entries.some((entry) => !applied.has(entry.when))) throw new Error("Required database migrations are missing.");
  // Preparing the union checks every required table/column; execution reads at most one row.
  sqlite.prepare(`SELECT id || round || deadline_at || result_json FROM rooms
    UNION ALL SELECT id || display_name || cuisines_json || max_price_level FROM profiles
    UNION ALL SELECT token_hash || profile_id || expires_at || legacy_available FROM browser_credentials
    UNION ALL SELECT profile_id || room_id || participant_id || role || hidden FROM profile_rooms
    UNION ALL SELECT profile_id || room_id || round || closed_at || signals_json FROM profile_rounds
    UNION ALL SELECT id || room_id || author_id || start_at FROM options
    UNION ALL SELECT id || room_id || token_hash || active || ready FROM participants
    UNION ALL SELECT participant_id || option_id || choice || reason FROM responses
    UNION ALL SELECT room_id || round || meal_date || result_json FROM room_rounds LIMIT 1`).get();
  const indexes = sqlite.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name IN ('room_open_deadline', 'personal_round_recency')").all();
  if (indexes.length !== 2) throw new Error("Required database indexes are missing.");
  if (write) {
    try {
      sqlite.exec("BEGIN IMMEDIATE");
      sqlite.prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('readiness-rollback-probe', -1)").run();
    } finally { if (sqlite.inTransaction) sqlite.exec("ROLLBACK"); }
  }
}
