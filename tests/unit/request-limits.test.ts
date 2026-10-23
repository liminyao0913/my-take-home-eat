import { afterEach, expect, it, vi } from "vitest";
import { LIMITS } from "@/lib/limits";
import { readJson } from "@/server/request-body";
import { Admission } from "@/server/admission";

afterEach(() => vi.useRealTimers());
function upload(chunks: string[], headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/rooms", {
    method: "POST", headers,
    body: new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }),
    duplex: "half",
  } as RequestInit);
}
function stalled(signal?: AbortSignal) {
  const cancel = vi.fn();
  const request = new Request("http://localhost/api/rooms", { method: "POST", body: new ReadableStream({ cancel }), signal, duplex: "half" } as RequestInit);
  return { request, cancel };
}

it("counts streamed bytes with absent or misleading content length, including multibyte JSON", async () => {
  expect(await readJson(upload(['{"name":', '"🍜"}']))).toEqual({ name: "🍜" });
  for (const headers of [{}, { "content-length": "2" }] as Record<string, string>[]) {
    await expect(readJson(upload(['{"name":"', "🍜".repeat(LIMITS.bodyBytes / 4), '"}'], headers))).rejects.toMatchObject({ status: 413 });
  }
  await expect(readJson(upload(["{}"], { "content-length": String(LIMITS.bodyBytes + 1) }))).rejects.toMatchObject({ status: 413 });
  await expect(readJson(upload(["{}"], { "content-encoding": "gzip" }))).rejects.toMatchObject({ status: 415 });
  await expect(readJson(upload(["{"]))).rejects.toMatchObject({ status: 400 });
});

it("times out slow bodies, cancels disconnected uploads, and releases the 32-reader capacity", async () => {
  vi.useFakeTimers();
  const requests = Array.from({ length: LIMITS.bodyReaders }, () => stalled());
  const pending = requests.map(({ request }) => readJson(request).catch((error) => error));
  await expect(readJson(stalled().request)).rejects.toMatchObject({ status: 429, retryAfter: 1 });
  await vi.advanceTimersByTimeAsync(LIMITS.bodyTimeoutMs);
  for (const error of await Promise.all(pending)) expect(error).toMatchObject({ status: 408 });
  for (const { cancel } of requests) expect(cancel).toHaveBeenCalledOnce();
  const controller = new AbortController();
  const { request, cancel } = stalled(controller.signal);
  const aborted = readJson(request).catch((error) => error);
  controller.abort();
  expect(await aborted).toMatchObject({ code: "REQUEST_ABORTED" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(await readJson(upload(["{}"]))).toEqual({});
});

it("limits separate global read, write, and creation budgets with timed recovery", () => {
  let now = 1000;
  const limiter = new Admission(() => now);
  for (let i = 0; i < 600; i++) limiter.global("GET", false);
  expect(() => limiter.global("GET", false)).toThrowError(expect.objectContaining({ status: 429, retryAfter: 1 }));
  for (let i = 0; i < 60; i++) limiter.global("PUT", false);
  expect(() => limiter.global("PUT", false)).toThrow();
  now += 1000;
  limiter.global("GET", false); limiter.global("PUT", false);
  for (let i = 0; i < 20; i++) limiter.global("POST", true);
  expect(() => limiter.global("POST", true)).toThrowError(expect.objectContaining({ status: 429, retryAfter: 6 }));
  now += 6000; limiter.global("POST", true);
});

it("keeps eight coworkers' credential budgets independent and bounds identity churn", () => {
  let now = 0;
  const limiter = new Admission(() => now);
  for (let person = 0; person < 8; person++) for (let vote = 0; vote < 120; vote++) limiter.credential(`person-${person}`, false);
  expect(() => limiter.credential("person-0", false)).toThrow();
  for (let i = 0; i < 9992; i++) limiter.credential(`other-${i}`, false);
  expect(() => limiter.credential("new", false)).toThrowError(expect.objectContaining({ code: "IDENTITY_CAPACITY" }));
  now += 300_000;
  limiter.credential("new", false);
  for (let i = 0; i < 6; i++) limiter.credential("creator", true);
  expect(() => limiter.credential("creator", true)).toThrowError(expect.objectContaining({ status: 429, retryAfter: 20 }));
  now += 20_000; limiter.credential("creator", true);
});
