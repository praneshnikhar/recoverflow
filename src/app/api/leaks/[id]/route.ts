import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/engine";
import { simNow } from "@/lib/simclock";
import { diagnose } from "@/lib/diagnose";
import { llmAvailable } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const leak = db
    .prepare(
      `SELECT l.*, c.name AS customer_name, c.phone_mask AS phone, c.email_mask AS email,
              c.segment, c.payday, c.dnc AS cust_dnc
       FROM leaks l JOIN customers c ON c.id = l.customer_id WHERE l.id = ?`
    )
    .get(params.id) as Record<string, unknown> | undefined;

  if (!leak) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const touches = db
    .prepare("SELECT * FROM touches WHERE leak_id = ? ORDER BY seq, id")
    .all(params.id);
  const trail = db
    .prepare("SELECT * FROM audit WHERE leak_id = ? ORDER BY id")
    .all(params.id);

  // on-demand LLM enrichment of the diagnosis narrative (never required)
  let aiNarrative: string | null = null;
  if (llmAvailable() && leak.last_diagnosis) {
    try {
      const diag = await diagnose(leak as never);
      aiNarrative = diag.reasoning;
      audit(simNow(), params.id, "llm", "diagnosis.enriched", {
        cause_class: diag.cause_class,
        source: "llm",
        confidence: diag.confidence,
      });
      db.prepare("UPDATE leaks SET last_diagnosis = ? WHERE id = ?").run(
        JSON.stringify(diag),
        params.id
      );
    } catch {
      aiNarrative = null;
    }
  }

  return NextResponse.json({ ok: true, leak, touches, trail, aiNarrative });
}
