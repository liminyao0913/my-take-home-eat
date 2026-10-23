import { NextRequest } from "next/server";
import { handle, json, profileService } from "@/server/http";
import { identity } from "@/server/identity";

export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return handle(request, () => json(profileService().history(identity(request).hash, Number(request.nextUrl.searchParams.get("offset") ?? 0), Number(request.nextUrl.searchParams.get("limit") ?? 20))));
}
