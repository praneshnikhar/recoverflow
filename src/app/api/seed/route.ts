import { NextResponse } from "next/server";
import { seedBatch } from "@/lib/engine";
import { initClock } from "@/lib/simclock";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  initClock();
  let body: { size?: number; seed?: number } = {};
  try {
    body = await req.json();
  } catch {
    // defaults
  }
  const size = Math.max(1, Math.min(500, Math.round(body.size ?? 60)));
  const seed = Number.isFinite(body.seed) ? Number(body.seed) : 42;
  const { batchId, leakIds } = seedBatch(size, seed);
  return NextResponse.json({ ok: true, batchId, seeded: leakIds.length, seed });
}
