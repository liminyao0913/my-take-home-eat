import { NextRequest } from "next/server";
import { handle, json, roomService, type RoomContext } from "@/server/http";
import { identity } from "@/server/identity";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: RoomContext) {
  return handle(request, async () => json(roomService().get((await context.params).roomId, identity(request).hash)));
}
