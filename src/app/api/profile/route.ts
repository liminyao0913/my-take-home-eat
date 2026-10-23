import { profileInput } from "@/lib/contracts";
import { NextRequest } from "next/server";
import { body, handle, json, profileService } from "@/server/http";
import { clearIdentity, identity } from "@/server/identity";

export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return handle(request, () => json(profileService().get(identity(request).hash)));
}
export function PUT(request: NextRequest) {
  return handle(request, async () => {
    const input = await body(request, profileInput);
    return json(profileService().update(identity(request).hash, input));
  });
}
export function DELETE(request: NextRequest) {
  return handle(request, () => {
    profileService().forget(identity(request).hash);
    const response = json({ profile: null, canImportLegacy: false });
    clearIdentity(response);
    return response;
  });
}
