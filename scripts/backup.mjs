import Sqlite from "better-sqlite3";
import { resolve } from "node:path";

const filename = resolve(process.env.DATABASE_PATH || ".data/lets-eat.sqlite");
const destination = process.argv[2];
if (!destination || resolve(destination) === filename) {
  throw new Error("Provide a distinct backup path: npm run db:backup -- /path/to/backup.sqlite");
}
const sqlite = new Sqlite(filename, { fileMustExist: true });
try {
  await sqlite.backup(resolve(destination));
  console.log("Consistent SQLite backup created.");
} finally { sqlite.close(); }
