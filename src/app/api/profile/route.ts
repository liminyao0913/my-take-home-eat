import { NextRequest } from "next/server";
import { body, handle, json, profileService } from "@/server/http";
import { clearIdentity, identity } from "@/server/identity";

export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return handle(request, () => json(profileService().get(identity(request).hash)));
}
export function PUT(request: NextRequest) {
  return handle(request, async () => json(profileService().update(identity(request).hash, await body(request))));
}
export function DELETE(request: NextRequest) {
  return handle(request, () => {
    profileService().forget(identity(request).hash);
    const response = json({ profile: null, canImportLegacy: false });
    clearIdentity(response);
    return response;
  });
}
