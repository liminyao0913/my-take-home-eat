import { roundInput } from "@/lib/contracts";
import { NextRequest } from "next/server";
import { body, handle, json, roomService, type RoomContext } from "@/server/http";
import { identity } from "@/server/identity";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: RoomContext) {
  return handle(request, async () => {
    const { roomId } = await context.params;
    const before = request.nextUrl.searchParams.get("beforeRound");
    return json(roomService().archive(roomId, before === null ? undefined : Number(before)));
  });
}
export async function POST(request: NextRequest, context: RoomContext) {
  return handle(request, async () => {
    const input = await body(request, roundInput);
    const { roomId } = await context.params;
    const hash = identity(request).hash;
    const service = roomService(request);
    service.startRound(roomId, hash, input);
    return json(service.get(roomId, hash), 201);
  });
}
