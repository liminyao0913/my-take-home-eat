import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import Sqlite from "better-sqlite3";

// Own the process and database so this cannot turn into an abuse test of the live site.
const origin = "http://localhost:3200";
const build = resolve(process.env.CAPACITY_BUILD_DIR || ".");
readFileSync(join(build, ".next/BUILD_ID"));
const directory = mkdtempSync(join(tmpdir(), "lets-eat-capacity-"));
const filename = join(directory, "test.sqlite");
const artifacts = resolve(`.data/capacity/${new Date().toISOString().replaceAll(":", "-")}`);
const commit = process.env.CAPACITY_COMMIT || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
mkdirSync(artifacts, { recursive: true, mode: 0o700 });
const metricsFile = join(artifacts, "runtime.jsonl");
const unit = `lets-eat-capacity-${randomBytes(4).toString("hex")}`;
const env = { ...process.env, DATABASE_PATH: filename, APP_ORIGIN: origin, RENDER: "", RENDER_SERVICE_ID: "" };
const samples = { setup: [], ordinary: [], deadline: [], health: [] };
const statuses = {};
const failures = [];
let stage = "setup", acceptedWrites = 0, started = false, missedPolls = 0;
const percentile = (values, fraction) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0; };
const stats = (values) => ({ count: values.length, p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95), p99Ms: percentile(values, 0.99), maxMs: Math.max(0, ...values) });

async function send(client, path, method = "GET", value, category = stage) {
  const before = performance.now();
  try {
    const response = await fetch(`${origin}${path}`, { method, signal: AbortSignal.timeout(10_000), headers: { Origin: origin, ...(client?.cookie ? { Cookie: client.cookie } : {}), ...(value === undefined ? {} : { "Content-Type": "application/json" }) }, body: value === undefined ? undefined : JSON.stringify(value) });
    const result = await response.json();
    samples[category].push(performance.now() - before);
    statuses[response.status] = (statuses[response.status] ?? 0) + 1;
    if (!response.ok) throw new Error(`${method} ${response.status} ${result.code ?? "unavailable"}`);
    if (method !== "GET") acceptedWrites++;
    const cookie = response.headers.getSetCookie()[0];
    if (cookie && client) client.cookie = cookie.split(";")[0];
    return result;
  } catch (error) { failures.push(String(error)); throw error; }
}

try {
  await new Promise((resolve, reject) => {
    const probe = createServer(); probe.once("error", reject);
    probe.listen(3200, "localhost", () => probe.close(resolve));
  });
  execFileSync(process.execPath, [join(build, "scripts/migrate.mjs")], { cwd: build, env, stdio: "pipe" });
  execFileSync(process.execPath, [join(build, "scripts/check-startup.mjs")], { cwd: build, env, stdio: "pipe" });
  execFileSync("systemd-run", ["--user", `--unit=${unit}`, "--property=CPUQuota=100%", "--property=MemoryMax=2147483648", "--property=MemorySwapMax=0", `--property=WorkingDirectory=${build}`,
    `--setenv=DATABASE_PATH=${filename}`, `--setenv=APP_ORIGIN=${origin}`, `--setenv=CAPACITY_METRICS_FILE=${metricsFile}`, "--setenv=NODE_ENV=production",
    process.execPath, "--import", fileURLToPath(new URL("./measure-runtime.mjs", import.meta.url)), join(build, "node_modules/next/dist/bin/next"), "start", "--hostname", "localhost", "--port", "3200"], { encoding: "utf8", stdio: "pipe" });
  started = true;
  for (let i = 0; ; i++) {
    try { const health = await fetch(`${origin}/api/health`); if (health.ok) break; } catch {}
    if (i >= 30) throw new Error("Isolated capacity service did not become ready.");
    await sleep(1000);
  }
  const properties = Object.fromEntries(execFileSync("systemctl", ["--user", "show", unit, "--property=ControlGroup", "--property=MainPID", "--property=NRestarts"], { encoding: "utf8" }).trim().split("\n").map((line) => line.split("=")));
  const cgroup = `/sys/fs/cgroup${properties.ControlGroup}`;
  const cpuMax = readFileSync(`${cgroup}/cpu.max`, "utf8").trim();
  const memoryMax = Number(readFileSync(`${cgroup}/memory.max`, "utf8"));
  const [quota, period] = cpuMax.split(" ").map(Number);
  if (quota / period !== 1 || memoryMax !== 2147483648) throw new Error("The required 1 CPU / 2 GiB limits were not applied.");
  const clients = [], groups = [];
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  for (let group = 0; group < 20; group++) {
    const owner = {};
    const created = await send(owner, "/api/rooms", "POST", { displayName: "Person 0", title: `Capacity group ${group}`, mealDate: date, timeZone: "UTC", options: ["Thai", "Italian", "Mexican"].map((cuisine) => ({ placeName: cuisine, cuisine, priceLevel: 1, startTime: "12:30" })) });
    const first = await send(owner, `/api/rooms/${created.id}`);
    const members = [owner];
    for (let person = 1; person < 8; person++) {
      await sleep(55);
      const client = {};
      await send(client, `/api/rooms/${created.id}/participants`, "POST", { displayName: `Person ${person}` }); members.push(client);
    }
    for (const client of members) {
      client.roomId = created.id; client.optionIds = first.options.map((option) => option.id); client.choices = { [client.optionIds[0]]: "approve" };
      client.preferences = { cuisines: ["Thai"], maxPriceLevel: 1, startTime: null, endTime: null };
      await sleep(55); await send(client, `/api/rooms/${created.id}/options/${client.optionIds[0]}/response`, "PUT", { choice: "approve" });
      await sleep(55); await send(client, `/api/rooms/${created.id}/preferences`, "PUT", client.preferences);
      clients.push(client);
    }
    groups.push(members);
  }
  const loadStart = Date.now(), deadline = loadStart + 600_000;
  const db = new Sqlite(filename);
  try {
    // Align deadlines in this owned fixture for the simultaneous burst, never in a hosted database.
    db.transaction(() => { for (const members of groups) {
      const changed = db.prepare("UPDATE rooms SET deadline_at = ? WHERE id = ? AND result_json IS NULL").run(deadline, members[0].roomId);
      if (changed.changes !== 1) throw new Error("Capacity HTTP server does not own the fixture database.");
    } })();
  } finally { db.close(); }
  stage = "ordinary";
  console.log(JSON.stringify({ phase: "load", groups: 20, participants: clients.length, durationSeconds: 600, cpuMax, memoryMax, artifacts }));
  const polls = clients.map(async (client, i) => {
    let next = loadStart + i * 3000 / clients.length;
    while (next < deadline) {
      await sleep(Math.max(0, next - Date.now()));
      if (Date.now() >= deadline) break;
      if (Date.now() - next >= 3000) missedPolls++;
      await send(client, `/api/rooms/${client.roomId}`).catch(() => {});
      next += 3000;
    }
  });
  const writes = (async () => {
    for (let cycle = 0; ; cycle++) {
      await sleep(Math.max(0, loadStart + (cycle + 1) * 15_000 - Date.now()));
      if (Date.now() >= deadline - 10_000) break;
      await Promise.all(groups.map(async (members) => {
        const client = members[cycle % 8], option = client.optionIds[1];
        const choice = client.choices[option] ? null : "approve";
        try {
          await send(client, `/api/rooms/${client.roomId}/options/${option}/response`, "PUT", { choice });
          if (choice) client.choices[option] = choice; else delete client.choices[option];
          const preferences = { ...client.preferences, maxPriceLevel: cycle % 2 + 1 };
          await send(client, `/api/rooms/${client.roomId}/preferences`, "PUT", preferences); client.preferences = preferences;
        } catch {}
      }));
    }
  })();
  const health = (async () => {
    while (Date.now() < deadline) {
      await send(null, "/api/health", "GET", undefined, "health").catch(() => {});
      await sleep(10_000);
    }
  })();
  const progress = setInterval(() => console.log(JSON.stringify({ phase: "load", elapsedSeconds: Math.round((Date.now() - loadStart) / 1000), requests: samples.ordinary.length, failures: failures.length })), 60_000);
  await Promise.all([...polls, writes, health]); clearInterval(progress);
  stage = "deadline";
  const results = await Promise.all(clients.map((client) => send(client, `/api/rooms/${client.roomId}`)));
  let lostWrites = 0;
  for (const [i, result] of results.entries()) {
    const client = clients[i];
    if (result.state !== "closed" || result.result.closedAt !== deadline || result.result.winner?.id !== client.optionIds[0] || result.result.winner?.approvalCount !== 8) throw new Error("A group produced an incorrect deadline result.");
    if (JSON.stringify(result.me.choices) !== JSON.stringify(client.choices) || JSON.stringify(result.me.preferences) !== JSON.stringify(client.preferences)) lostWrites++;
  }
  const metrics = readFileSync(metricsFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const steady = metrics.filter((sample) => sample.at >= loadStart + 120_000);
  const earlyRss = percentile(steady.filter((sample) => sample.at < loadStart + 240_000).map((sample) => sample.rss), 0.5);
  const lateRss = percentile(steady.filter((sample) => sample.at > deadline - 120_000).map((sample) => sample.rss), 0.5);
  const memoryEvents = readFileSync(`${cgroup}/memory.events`, "utf8");
  const service = execFileSync("systemctl", ["--user", "show", unit, "--property=NRestarts", "--property=MainPID"], { encoding: "utf8" });
  const report = {
    checkedAt: new Date().toISOString(), commit, groups: 20, participants: clients.length, durationSeconds: 600,
    resources: { cpuMax, memoryMax, memoryEvents, service }, requests: Object.fromEntries(Object.entries(samples).map(([kind, values]) => [kind, stats(values)])),
    statuses, acceptedWrites, lostWrites, missedPolls, errors: failures.slice(0, 30),
    runtime: { steadyRssMax: Math.max(...steady.map((sample) => sample.rss)), earlySteadyRssMedian: earlyRss, lateSteadyRssMedian: lateRss,
      eventLoopP95Ms: percentile(steady.map((sample) => sample.eventLoopP95Ms), 0.95), eventLoopMaxMs: Math.max(...steady.map((sample) => sample.eventLoopMaxMs)),
      cpuP95Percent: percentile(steady.map((sample) => sample.cpuMs / 50), 0.95), databaseBytes: metrics.at(-1).databaseBytes, walBytes: metrics.at(-1).walBytes },
  };
  report.passed = failures.length === 0 && lostWrites === 0 && missedPolls === 0 && report.requests.ordinary.p95Ms < 1000 && report.requests.health.maxMs < 1000 && report.runtime.steadyRssMax < memoryMax * 0.75 && lateRss <= earlyRss + 16 * 1024 * 1024 && service.includes("NRestarts=0") && service.includes(`MainPID=${properties.MainPID}`) && /oom_kill 0\b/.test(memoryEvents);
  writeFileSync(join(artifacts, "summary.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  if (started) execFileSync("systemctl", ["--user", "stop", unit], { stdio: "pipe" });
  rmSync(directory, { recursive: true, force: true });
}
