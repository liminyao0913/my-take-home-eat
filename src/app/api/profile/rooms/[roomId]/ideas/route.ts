import { NextRequest } from "next/server";
import { handle, json, profileService, type RoomContext } from "@/server/http";
import { identity } from "@/server/identity";

export const runtime = "nodejs";
export function GET(request: NextRequest, context: RoomContext) {
  return handle(request, async () => {
    const { roomId } = await context.params;
    const before = request.nextUrl.searchParams.get("beforeRound");
    return json(profileService().ideas(identity(request).hash, roomId, before === null ? undefined : Number(before)));
  });
}
