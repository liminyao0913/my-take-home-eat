import { readyInput } from "@/lib/contracts";
import { NextRequest } from "next/server";
import { body, handle, json, roomService, type RoomContext } from "@/server/http";
import { identity } from "@/server/identity";

export const runtime = "nodejs";
export async function PUT(request: NextRequest, context: RoomContext) {
  return handle(request, async () => {
    const input = await body(request, readyInput);
    const { roomId } = await context.params;
    const hash = identity(request).hash;
    const service = roomService(request);
    service.setReady(roomId, hash, input);
    return json(service.get(roomId, hash));
  });
}
