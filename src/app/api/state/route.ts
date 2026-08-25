import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { initClock, simNow, getSpeed } from "@/lib/simclock";

export const dynamic = "force-dynamic";

export async function GET() {
  initClock();
  const leaks = db
    .prepare(
      `SELECT l.*, c.name AS customer_name, c.phone_mask AS phone
       FROM leaks l JOIN customers c ON c.id = l.customer_id
       ORDER BY l.opened_sim_ms DESC LIMIT 400`
    )
    .all();
  return NextResponse.json({ leaks });
}
