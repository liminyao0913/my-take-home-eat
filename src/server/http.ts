import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "./db";
import { ApiError } from "./errors";
import { appOrigin } from "./identity";
import { RoomService } from "./rooms";

export const roomService = (request?: NextRequest) => {
  const round = Number(request?.headers.get("X-Room-Round") ?? 1);
  if (!Number.isSafeInteger(round) || round < 1) throw new ApiError(400, "INVALID_ROUND", "Send a valid round number.");
  return new RoomService(getDatabase().db, Date.now, round);
};
export const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

export async function handle(request: NextRequest, action: () => Promise<NextResponse> | NextResponse) {
  try {
    if (request.method !== "GET" && request.headers.get("origin") !== appOrigin()) throw new ApiError(403, "WRONG_ORIGIN", "Open this room on its original site before making changes.");
    return await action();
  } catch (error) {
    if (error instanceof ApiError) return json({ code: error.code, message: error.message, fieldErrors: error.fieldErrors }, error.status);
    console.error("Room request failed", error);
    return json({ code: "SERVER_ERROR", message: "Something went wrong. Please try again." }, 500);
  }
}

export async function body(request: NextRequest) {
  try { return await request.json(); }
  catch { throw new ApiError(400, "INVALID_JSON", "Send a valid JSON request."); }
}

export function optionId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(404, "NOT_FOUND", "This meal option could not be found.");
  return id;
}

export type RoomContext = { params: Promise<{ roomId: string }> };
export type OptionContext = { params: Promise<{ roomId: string; optionId: string }> };
