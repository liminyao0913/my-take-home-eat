import { NextRequest } from "next/server";
import { handle, json, optionId, profileService, type OptionContext } from "@/server/http";
import { identity } from "@/server/identity";

export const runtime = "nodejs";
export function GET(request: NextRequest, context: OptionContext) {
  return handle(request, async () => {
    const params = await context.params;
    return json(profileService().idea(identity(request).hash, params.roomId, optionId(params.optionId)));
  });
}
