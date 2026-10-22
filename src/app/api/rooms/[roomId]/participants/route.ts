import { NextRequest } from "next/server";
import { body, handle, json, roomService, type RoomContext } from "@/server/http";
import { identity, setIdentity } from "@/server/identity";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: RoomContext) {
  return handle(request, async () => {
    const { roomId } = await context.params;
    const guest = identity(request, true);
    const service = roomService();
    service.join(roomId, guest.hash!, await body(request));
    const response = json(service.get(roomId, guest.hash));
    setIdentity(response, guest.token!);
    return response;
  });
}
