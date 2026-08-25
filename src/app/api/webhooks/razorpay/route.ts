import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { audit, scheduleFirstStepExternal } from "@/lib/engine";
import { initClock, simNow } from "@/lib/simclock";
import { CAUSES } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

/**
 * Real Razorpay test-mode webhook receiver.
 * Configure in Dashboard -> Settings -> Webhooks with events:
 *   payment.failed, payment_link.paid, subscription.charged
 * Verifies X-Razorpay-Signature (HMAC SHA256 of raw body with webhook secret).
 */
export async function POST(req: Request) {
  initClock();
  const raw = await req.text();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const sig = req.headers.get("x-razorpay-signature");

  if (!secret || !sig) {
    return NextResponse.json({ ok: false, error: "webhook secret not configured" }, { status: 400 });
  }
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    audit(simNow(), null, "system", "webhook.signature_invalid", {});
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let evt: {
    event?: string;
    payload?: {
      payment?: { entity?: Record<string, unknown> };
      payment_link?: { entity?: Record<string, unknown> };
    };
  };
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const now = simNow();
  const payment = evt.payload?.payment?.entity;
  const link = evt.payload?.payment_link?.entity;

  if (evt.event === "payment.failed" && payment) {
    const code = String(payment.error_code ?? "GATEWAY_ERROR");
    const def = CAUSES[code] ?? CAUSES.GATEWAY_ERROR;
    const amount = Number(payment.amount ?? 0);
    const contact = String((payment.contact as string) ?? "");
    const leakId = `LK-RZP-${String(payment.id ?? crypto.randomBytes(4).toString("hex")).slice(-10)}`;
    const exists = db.prepare("SELECT id FROM leaks WHERE id = ?").get(leakId);
    if (!exists) {
      db.prepare(
        `INSERT INTO leaks (id, batch_id, customer_id, vector, amount_paise, cause_code, cause_class, planted_truth, status, is_control, max_attempts, opened_sim_ms)
         VALUES (?, 0, ?, 'payment_failure', ?, ?, ?, ?, 'open', 0, ?, ?)`
      ).run(leakId, `RZP-${contact || crypto.randomBytes(3).toString("hex")}`, amount, def.code, def.cause_class, "live_webhook", 4, now);
      db.prepare("UPDATE leaks SET last_diagnosis = ? WHERE id = ?").run(
        JSON.stringify({ cause_class: def.cause_class, reasoning: "Ingested from live Razorpay webhook", source: "rules", confidence: 0.9 }),
        leakId
      );
      audit(now, leakId, "system", "webhook.payment_failed", {
        razorpay_event: evt.event,
        decline_code: def.code,
        amount_inr: amount / 100,
        signature_verified: true,
      });
      scheduleFirstStepExternal(leakId, now);
    }
  } else if (evt.event === "payment_link.paid" && link) {
    const ref = String(link.reference_id ?? "");
    if (ref.startsWith("LK-")) {
      db.prepare(
        "UPDATE leaks SET status='recovered', recovered_paise=amount_paise, closed_sim_ms=? WHERE id=? AND status NOT IN ('recovered')"
      ).run(now, ref);
      audit(now, ref, "customer", "reply.paid_via_link", { via: "razorpay_webhook" });
    }
  }

  return NextResponse.json({ ok: true });
}
