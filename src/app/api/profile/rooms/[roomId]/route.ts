import { NextRequest } from "next/server";
import { handle, json, profileService, type RoomContext } from "@/server/http";
import { identity } from "@/server/identity";

export const runtime = "nodejs";
export function DELETE(request: NextRequest, context: RoomContext) {
  return handle(request, async () => {
    profileService().removeRoom(identity(request).hash, (await context.params).roomId);
    return json({ removed: true });
  });
}
