import { NextResponse } from "next/server";
import { computeStats } from "@/lib/stats";
import { getSpeed } from "@/lib/simclock";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = computeStats();
  return NextResponse.json({ stats, speed: getSpeed() });
}
