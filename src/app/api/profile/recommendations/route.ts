import { recommendationInput } from "@/lib/contracts";
import { NextRequest } from "next/server";
import { body, handle, json, profileService } from "@/server/http";
import { identity } from "@/server/identity";

export const runtime = "nodejs";
export function POST(request: NextRequest) {
  return handle(request, async () => {
    const input = await body(request, recommendationInput);
    return json(profileService().recommendations(identity(request).hash, input));
  });
}
