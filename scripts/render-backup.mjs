import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, createReadStream, existsSync, linkSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Sqlite from "better-sqlite3";

const host = process.env.RENDER_SSH_HOST;
if (!host || !/^srv-[a-z0-9]+@ssh\.[a-z0-9-]+\.render\.com$/.test(host)) throw new Error("Set RENDER_SSH_HOST to the owning Render service's SSH address.");
const directory = resolve(process.env.BACKUP_DIRECTORY || ".data/backups/render");
mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
const date = new Date().toISOString().slice(0, 10);
const destination = join(directory, `lets-eat-${date}.sqlite`);
if (existsSync(destination)) {
  console.log(JSON.stringify({ event: "render-backup", status: "already-saved-today", date }));
  process.exit(0);
}
const remote = `/var/data/.lets-eat-backup-${randomUUID()}.sqlite`;
const partial = `${destination}.${randomUUID()}.partial`;
const sshOptions = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "UpdateHostKeys=no"];
function ssh(script) { return execFileSync("ssh", [...sshOptions, host, "node --input-type=module"], { input: script, encoding: "utf8", timeout: 120_000 }); }
let backedUp = false;
try {
  const info = JSON.parse(ssh(`
    import Sqlite from 'better-sqlite3';
    import { createReadStream, statfsSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    const db = new Sqlite(process.env.DATABASE_PATH, { readonly: true, fileMustExist: true });
    try {
      const disk = statfsSync('/var/data');
      const size = db.pragma('page_count', { simple: true }) * db.pragma('page_size', { simple: true });
      if (disk.bavail * disk.bsize < size + 16 * 1024 * 1024) throw new Error('Insufficient disk headroom for a consistent backup.');
      await db.backup(${JSON.stringify(remote)});
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(${JSON.stringify(remote)})) hash.update(chunk);
      console.log(JSON.stringify({ sha256: hash.digest('hex'), databaseBytes: size, diskUsedPercent: 100 * (1 - disk.bavail / disk.blocks) }));
    } finally { db.close(); }
  `));
  backedUp = true;
  execFileSync("scp", ["-s", ...sshOptions, `${host}:${remote}`, partial], { timeout: 120_000, stdio: "pipe" });
  chmodSync(partial, 0o600);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(partial)) hash.update(chunk);
  if (hash.digest("hex") !== info.sha256) throw new Error("The off-host backup checksum did not match.");
  const restored = new Sqlite(partial, { readonly: true, fileMustExist: true });
  let rooms;
  try {
    if (restored.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Backup integrity check failed.");
    if (restored.pragma("foreign_key_check").length) throw new Error("Backup foreign-key check failed.");
    rooms = restored.prepare("SELECT count(*) AS count FROM rooms").get().count;
  } finally { restored.close(); }
  // Publish only a fully copied and verified file, without overwriting another successful run.
  linkSync(partial, destination);
  const saved = readdirSync(directory).filter((name) => /^lets-eat-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name)).sort();
  for (const old of saved.slice(0, Math.max(0, saved.length - 7))) rmSync(join(directory, old));
  const diskLevel = info.diskUsedPercent >= 85 ? "critical" : info.diskUsedPercent >= 70 ? "warning" : "ok";
  console.log(JSON.stringify({ event: "render-backup", status: "verified", date, rooms, sha256: info.sha256, databaseBytes: info.databaseBytes, diskUsedPercent: info.diskUsedPercent, diskLevel, retainedDailyCopies: Math.min(saved.length, 7) }));
  if (diskLevel !== "ok") process.exitCode = 2; // Surfaces in the external scheduler's status/logs.
} finally {
  rmSync(partial, { force: true });
  if (backedUp) ssh(`import { unlinkSync } from 'node:fs'; unlinkSync(${JSON.stringify(remote)});`);
}
