import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { llmAvailable } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  try {
    db.prepare("SELECT 1").get();
    dbOk = true;
  } catch {}
  return NextResponse.json({
    ok: dbOk,
    engine: "recoverflow",
    db: dbOk ? "sqlite" : "error",
    llmEnrichment: llmAvailable() ? "gemini" : "rules-only",
    razorpayWebhook: process.env.RAZORPAY_WEBHOOK_SECRET ? "configured" : "simulator-mode",
  });
}
