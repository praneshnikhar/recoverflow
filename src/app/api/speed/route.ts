import { NextResponse } from "next/server";
import { setSpeed, getSpeed } from "@/lib/simclock";

export const dynamic = "force-dynamic";

const ALLOWED = [0, 1, 60, 120, 600, 1800];

export async function POST(req: Request) {
  let body: { speed?: number } = {};
  try {
    body = await req.json();
  } catch {}
  const requested = Number(body.speed);
  const next = ALLOWED.includes(requested) ? requested : getSpeed();
  setSpeed(next);
  return NextResponse.json({ ok: true, speed: next });
}
