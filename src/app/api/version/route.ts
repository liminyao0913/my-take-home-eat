import { serviceVersion } from "@/server/version";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(serviceVersion(), { headers: { "Cache-Control": "no-store" } });
}
