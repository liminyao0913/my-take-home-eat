import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { getDatabase } from "./db";
import { ApiError, isSqliteBusy, parseInput } from "./errors";
import { readJson } from "./request-body";
import { admission, isCreation } from "./admission";
import { appOrigin, refreshIdentity } from "./identity";
import { RoomService } from "./rooms";
import { ProfileService } from "./profiles";

export const roomService = (request?: NextRequest) => {
  const round = Number(request?.headers.get("X-Room-Round") ?? 1);
  if (!Number.isSafeInteger(round) || round < 1) throw new ApiError(400, "INVALID_ROUND", "Send a valid round number.");
  return new RoomService(getDatabase().db, Date.now, round);
};
export const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
export const profileService = () => new ProfileService(getDatabase().db);

const routes = new Set([
  "/api/rooms", "/api/rooms/:roomId", "/api/rooms/:roomId/participants", "/api/rooms/:roomId/participants/me", "/api/rooms/:roomId/participants/me/ready",
  "/api/rooms/:roomId/preferences", "/api/rooms/:roomId/options", "/api/rooms/:roomId/options/:optionId", "/api/rooms/:roomId/options/:optionId/response", "/api/rooms/:roomId/finish", "/api/rooms/:roomId/rounds",
  "/api/profile", "/api/profile/import", "/api/profile/recommendations", "/api/profile/rooms", "/api/profile/rooms/:roomId", "/api/profile/rooms/:roomId/ideas", "/api/profile/rooms/:roomId/ideas/:optionId",
]);

export async function handle(request: NextRequest, action: () => Promise<NextResponse> | NextResponse) {
  const started = performance.now();
  const requestId = randomUUID();
  const path = request.nextUrl.pathname.replace(/^(\/api\/(?:profile\/)?rooms)\/[^/]+/, "$1/:roomId").replace(/(\/(?:options|ideas))\/[^/]+/, "$1/:optionId");
  const complete = (response: NextResponse, code: string | null = null) => {
    response.headers.set("X-Request-Id", requestId);
    console.info(JSON.stringify({ requestId, route: routes.has(path) ? path : "/api/unknown", status: response.status, durationMs: Math.round((performance.now() - started) * 100) / 100, code }));
    return response;
  };
  try {
    admission().global(request.method, isCreation(request));
    if (request.method !== "GET" && request.headers.get("origin") !== appOrigin()) throw new ApiError(403, "WRONG_ORIGIN", "Open this room on its original site before making changes.");
    const response = await action();
    refreshIdentity(request, response);
    return complete(response);
  } catch (error) {
    if (isSqliteBusy(error)) {
      const response = json({ code: "DATABASE_BUSY", message: "The service is busy. Try again shortly." }, 503);
      response.headers.set("Retry-After", "1");
      return complete(response, "DATABASE_BUSY");
    }
    if (error instanceof ApiError) {
      const response = json({ code: error.code, message: error.message, fieldErrors: error.fieldErrors }, error.status);
      if (error.retryAfter) response.headers.set("Retry-After", String(error.retryAfter));
      return complete(response, error.code);
    }
    return complete(json({ code: "SERVER_ERROR", message: "Something went wrong. Please try again." }, 500), "SERVER_ERROR");
  }
}

export async function body<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  return parseInput(schema, await readJson(request));
}

export function optionId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(404, "NOT_FOUND", "This meal option could not be found.");
  return id;
}

export type RoomContext = { params: Promise<{ roomId: string }> };
export type OptionContext = { params: Promise<{ roomId: string; optionId: string }> };
