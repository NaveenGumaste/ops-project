import { NextResponse } from "next/server";
import { getHealthStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getHealthStatus();
  return NextResponse.json(health, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Tier": "Tier-2-Nextjs-Kitchen",
    },
  });
}
