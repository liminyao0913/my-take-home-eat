import { getDatabase } from "@/server/db";

export const runtime = "nodejs";

export function GET() {
  try {
    getDatabase().sqlite.prepare("SELECT id FROM rooms LIMIT 1").get();
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
