import { NextRequest } from "next/server";
import { finishInput } from "@/lib/contracts";
import { body, handle, json, roomService, type RoomContext } from "@/server/http";
import { identity } from "@/server/identity";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: RoomContext) {
  return handle(request, async () => {
    const input = !request.body || request.headers.get("content-length") === "0" ? {} : await body(request, finishInput);
    const { roomId } = await context.params;
    const hash = identity(request).hash;
    const service = roomService(request);
    service.finish(roomId, hash, input);
    return json(service.get(roomId, hash));
  });
}
