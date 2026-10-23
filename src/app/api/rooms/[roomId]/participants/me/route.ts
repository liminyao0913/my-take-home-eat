import { NextRequest } from "next/server";
import { handle, json, roomService, type RoomContext } from "@/server/http";
import { identity } from "@/server/identity";

export const runtime = "nodejs";
export async function DELETE(request: NextRequest, context: RoomContext) {
  return handle(request, async () => {
    const { roomId } = await context.params;
    const hash = identity(request).hash;
    const service = roomService(request);
    service.leave(roomId, hash);
    return json(service.get(roomId, hash));
  });
}
