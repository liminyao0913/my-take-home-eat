import "server-only";
import type { Database } from "./db";
import { pruneExpiredProfiles } from "./profile-store";
import { isSqliteBusy } from "./errors";

const cache = globalThis as typeof globalThis & { letsEatMaintenance?: ReturnType<typeof setInterval> };
export function startMaintenance(db: Database) {
  if (cache.letsEatMaintenance) return;
  cache.letsEatMaintenance = setInterval(() => {
    try { db.transaction((tx) => pruneExpiredProfiles(tx, Date.now()), { behavior: "immediate" }); }
    catch (error) { if (!isSqliteBusy(error)) console.error(JSON.stringify({ event: "maintenance", code: "FAILED" })); }
  }, 60_000);
  cache.letsEatMaintenance.unref();
}
