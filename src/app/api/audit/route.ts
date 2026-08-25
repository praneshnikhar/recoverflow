import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { initClock } from "@/lib/simclock";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  initClock();
  const url = new URL(req.url);
  const limit = Math.min(500, Number(url.searchParams.get("limit") ?? 120));
  const entries = db
    .prepare("SELECT * FROM audit ORDER BY id DESC LIMIT ?")
    .all(limit);
  return NextResponse.json({ ok: true, entries });
}
