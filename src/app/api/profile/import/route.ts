import { NextRequest } from "next/server";
import { handle, json, profileService } from "@/server/http";
import { identity } from "@/server/identity";

export const runtime = "nodejs";
export function POST(request: NextRequest) {
  return handle(request, () => json(profileService().importLegacy(identity(request).hash)));
}
