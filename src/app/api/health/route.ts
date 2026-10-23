import { getDatabase } from "@/server/db";
import { checkDatabase } from "../../../../scripts/runtime.mjs";

export const runtime = "nodejs";

export function GET() {
  try {
    checkDatabase(getDatabase().sqlite);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
