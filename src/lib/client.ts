import type { ApiErrorBody } from "./contracts";

export class RequestError extends Error {
  constructor(public details: ApiErrorBody) { super(details.message); }
}

export async function request<T>(path: string, method = "GET", value?: unknown, signal?: AbortSignal, round?: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method, cache: "no-store", headers: { ...(value === undefined ? {} : { "Content-Type": "application/json" }), ...(round === undefined ? {} : { "X-Room-Round": String(round) }) }, body: value === undefined ? undefined : JSON.stringify(value), signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RequestError({ code: "NETWORK_ERROR", message: "We couldn't connect. Your draft is still here; please try again." });
  }
  if (!response.ok) {
    const details = await response.json().catch(() => ({ code: "SERVER_ERROR", message: "The server couldn't complete your request. Please try again." }));
    throw new RequestError(details);
  }
  return response.json();
}

export function errorDetails(error: unknown): ApiErrorBody {
  return error instanceof RequestError ? error.details : { code: "UNKNOWN", message: "Something went wrong. Please try again." };
}

export const formatTime = (instant: number, timeZone: string) => new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone }).format(instant);
export const formatDate = (date: string) => new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
