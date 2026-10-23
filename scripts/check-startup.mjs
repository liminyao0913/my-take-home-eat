import Sqlite from "better-sqlite3";
import { checkDatabase, schemaVersion, validateEnvironment } from "./runtime.mjs";

let sqlite;
let phase = "configuration";
try {
  const { origin, databasePath } = validateEnvironment();
  phase = "database";
  sqlite = new Sqlite(databasePath, { fileMustExist: true, timeout: 1000 });
  checkDatabase(sqlite, true);
  const commit = /^[a-f0-9]{40}$/i.test(process.env.RENDER_GIT_COMMIT ?? "") ? process.env.RENDER_GIT_COMMIT : null;
  console.log(JSON.stringify({ event: "startup", status: "ready", commit, schema: schemaVersion, origin }));
} catch (error) {
  console.error(JSON.stringify({ event: "startup", status: "failed", code: phase === "configuration" ? "CONFIG_INVALID" : "DATABASE_UNAVAILABLE", message: phase === "configuration" ? error.message : "Check the database path, disk permissions, and migrations." }));
  process.exitCode = 1;
} finally { sqlite?.close(); }
