import { createRoomInput } from "@/lib/contracts";
import { NextRequest } from "next/server";
import { body, handle, json, roomService } from "@/server/http";
import { identity, setIdentity } from "@/server/identity";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return handle(request, async () => {
    const input = await body(request, createRoomInput);
    const guest = identity(request, true);
    const room = roomService().create(guest.hash!, input);
    const response = json(room, 201);
    setIdentity(response, guest.token!);
    return response;
  });
}
