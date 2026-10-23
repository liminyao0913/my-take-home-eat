import { monitorEventLoopDelay } from "node:perf_hooks";
import { appendFileSync, statSync } from "node:fs";

// Opt-in preload for the isolated capacity runner; never an HTTP diagnostics endpoint.
const destination = process.env.CAPACITY_METRICS_FILE;
if (!destination) throw new Error("CAPACITY_METRICS_FILE is required for the capacity preload.");
const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
let cpu = process.cpuUsage();
const size = (file) => { try { return statSync(file).size; } catch { return 0; } };
setInterval(() => {
  const next = process.cpuUsage();
  appendFileSync(destination, JSON.stringify({ at: Date.now(), pid: process.pid, rss: process.memoryUsage().rss,
    cpuMs: (next.user + next.system - cpu.user - cpu.system) / 1000,
    eventLoopP95Ms: delay.percentile(95) / 1e6, eventLoopMaxMs: delay.max / 1e6,
    databaseBytes: size(process.env.DATABASE_PATH), walBytes: size(`${process.env.DATABASE_PATH}-wal`),
  }) + "\n", { mode: 0o600 });
  cpu = next; delay.reset();
}, 5000).unref();
