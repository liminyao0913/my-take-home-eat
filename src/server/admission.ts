import { ApiError } from "./errors";

class Bucket {
  private tokens: number;
  private updated: number;
  constructor(private rate: number, private period: number, now: number) {
    this.tokens = rate * 2; this.updated = now;
  }
  take(now: number) {
    this.tokens = Math.min(this.rate * 2, this.tokens + Math.max(0, now - this.updated) * this.rate / this.period);
    this.updated = now;
    if (this.tokens < 1) throw new ApiError(429, "RATE_LIMIT", "Too many requests. Try again shortly.", undefined, Math.max(1, Math.ceil((1 - this.tokens) * this.period / this.rate / 1000)));
    this.tokens--;
  }
}

// Budgets are per process; durable room limits survive restarts. No IP header is trusted.
export class Admission {
  private reads: Bucket;
  private writes: Bucket;
  private creates: Bucket;
  private credentials = new Map<string, { writes: Bucket; creates: Bucket; seen: number }>();
  private swept = 0;
  constructor(private now: () => number = Date.now) {
    this.reads = new Bucket(300, 1000, now());
    this.writes = new Bucket(30, 1000, now());
    this.creates = new Bucket(10, 60_000, now());
  }
  global(method: string, create: boolean) {
    const now = this.now();
    (method === "GET" || method === "HEAD" ? this.reads : this.writes).take(now);
    if (create) this.creates.take(now);
  }
  credential(hash: string, create: boolean) {
    const now = this.now();
    if (now - this.swept >= 60_000) {
      for (const [key, value] of this.credentials) if (now - value.seen >= 300_000) this.credentials.delete(key);
      this.swept = now;
    }
    let entry = this.credentials.get(hash);
    if (!entry) {
      if (this.credentials.size >= 10_000) throw new ApiError(429, "IDENTITY_CAPACITY", "The service is busy. Try again shortly.", undefined, 60);
      entry = { writes: new Bucket(60, 60_000, now), creates: new Bucket(3, 60_000, now), seen: now };
      this.credentials.set(hash, entry);
    }
    entry.seen = now;
    entry.writes.take(now);
    if (create) entry.creates.take(now);
  }
}

const cache = globalThis as typeof globalThis & { letsEatAdmission?: Admission };
export const admission = () => cache.letsEatAdmission ??= new Admission();
export const isCreation = (request: Request) => request.method === "POST" && new URL(request.url).pathname === "/api/rooms";
const charged = new WeakSet<Request>();
export function admitCredential(request: Request, hash: string) {
  if (request.method === "GET" || request.method === "HEAD" || charged.has(request)) return;
  charged.add(request);
  admission().credential(hash, isCreation(request));
}
