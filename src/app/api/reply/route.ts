import { NextResponse } from "next/server";
import { applyReply } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { leakId?: string; kind?: string; promiseDays?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const kind = body.kind as "stop" | "promise" | "pay_now";
  if (!body.leakId || !["stop", "promise", "pay_now"].includes(kind)) {
    return NextResponse.json({ ok: false, error: "leakId and kind (stop|promise|pay_now) required" }, { status: 400 });
  }
  const res = applyReply(body.leakId, kind, body.promiseDays ?? 3);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
