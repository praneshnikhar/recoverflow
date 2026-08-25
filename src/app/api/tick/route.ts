import { NextResponse } from "next/server";
import { tick } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = tick();
  return NextResponse.json({ ok: true, ...result });
}
