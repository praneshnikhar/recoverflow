import { NextResponse } from "next/server";
import { toggleOutage } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST() {
  const outage = toggleOutage();
  return NextResponse.json({ ok: true, outage });
}
