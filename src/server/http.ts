import { NextRequest, NextResponse } from "next/server";
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

export async function handle(request: NextRequest, action: () => Promise<NextResponse> | NextResponse) {
  try {
    admission().global(request.method, isCreation(request));
    if (request.method !== "GET" && request.headers.get("origin") !== appOrigin()) throw new ApiError(403, "WRONG_ORIGIN", "Open this room on its original site before making changes.");
    const response = await action();
    refreshIdentity(request, response);
    return response;
  } catch (error) {
    if (isSqliteBusy(error)) {
      const response = json({ code: "DATABASE_BUSY", message: "The service is busy. Try again shortly." }, 503);
      response.headers.set("Retry-After", "1");
      return response;
    }
    if (error instanceof ApiError) {
      const response = json({ code: error.code, message: error.message, fieldErrors: error.fieldErrors }, error.status);
      if (error.retryAfter) response.headers.set("Retry-After", String(error.retryAfter));
      return response;
    }
    console.error("Room request failed", error);
    return json({ code: "SERVER_ERROR", message: "Something went wrong. Please try again." }, 500);
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
