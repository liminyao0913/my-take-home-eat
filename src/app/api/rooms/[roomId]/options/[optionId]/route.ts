import { NextRequest } from "next/server";
import { handle, json, optionId, roomService, type OptionContext } from "@/server/http";
import { identity } from "@/server/identity";

export const runtime = "nodejs";
export async function DELETE(request: NextRequest, context: OptionContext) {
  return handle(request, async () => {
    const params = await context.params;
    const hash = identity(request).hash;
    const service = roomService();
    service.removeOption(params.roomId, hash, optionId(params.optionId));
    return json(service.get(params.roomId, hash));
  });
}
