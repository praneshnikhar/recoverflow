import type { CauseClass, Diagnosis, LeakRow, Step } from "./types";
import { CAUSES, CLASS_LABELS } from "./taxonomy";
import { chat, llmAvailable } from "./llm";

/** Deterministic rule-based classification from Razorpay-style decline codes. */
export function classifyRules(causeCode: string): Diagnosis {
  const def = CAUSES[causeCode];
  const cls: CauseClass = def?.cause_class ?? "transient_error";
  const reasoning: Record<CauseClass, string> = {
    soft_decline:
      "Decline code indicates temporary liquidity, not intent. Retry timing should follow the customer's payday cycle; a payment link gives them an easy self-serve path.",
    transient_error:
      "Bank/gateway-side failure. Money intent exists — immediate short-interval retry has historically high success.",
    auth_required:
      "Customer started but did not complete step-up authentication. Only a secure link that resumes THEIR session will convert; blind retries are useless.",
    dead_mandate:
      "Mandate is cancelled or account closed. Retrying this rail burns fees and erodes trust. The only honest paths are re-registration or human review.",
    abandonment:
      "High-intent shopper dropped at checkout. Recovery value decays within hours — speed and channel matter more than persistence.",
  };
  return {
    cause_class: cls,
    confidence: 0.9,
    reasoning: reasoning[cls],
    source: "rules",
  };
}

const ALLOWED_CLASSES: CauseClass[] = [
  "soft_decline",
  "transient_error",
  "auth_required",
  "dead_mandate",
  "abandonment",
];

/**
 * Optional LLM enrichment: narrative explanation + constrained class confirmation.
 * The LLM may only choose among the allowed classes and its output is validated.
 * It never selects channels, amounts or timings — those come from deterministic playbooks.
 */
export async function diagnose(leak: LeakRow): Promise<Diagnosis> {
  const base = classifyRules(leak.cause_code);
  if (!llmAvailable()) return base;

  const sys = `You are the diagnosis unit of a payments recovery engine. Classify why a payment failed into exactly one class: ${ALLOWED_CLASSES.join(", ")}. Reply ONLY with compact JSON: {"cause_class":"...","confidence":0.0-1.0,"reasoning":"one crisp sentence for a merchant dashboard"}.`;

  const history = leak.attempts
    ? ` Prior attempts so far: ${leak.attempts}, last outcome recorded.`
    : "";
  const user = `Failure event: vector=${leak.vector}, decline_code=${leak.cause_code}, amount_inr=${(leak.amount_paise / 100).toFixed(0)}, customer_segment=${leak.planted_truth}.${history}`;

  const out = await chat(sys, user);
  if (!out) return base;
  try {
    const match = out.match(/\{[\s\S]*\}/);
    if (!match) return base;
    const parsed = JSON.parse(match[0]) as {
      cause_class?: string;
      confidence?: number;
      reasoning?: string;
    };
    if (!parsed.cause_class || !ALLOWED_CLASSES.includes(parsed.cause_class as CauseClass)) {
      return base;
    }
    return {
      cause_class: parsed.cause_class as CauseClass,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0.1, Math.min(1, parsed.confidence))
          : 0.85,
      reasoning: (parsed.reasoning ?? base.reasoning).slice(0, 400),
      source: "llm",
    };
  } catch {
    return base;
  }
}

export function describeStep(step: Step): string {
  return `${step.kind} via ${step.channel}`;
}

export function classLabel(cls: CauseClass): string {
  return CLASS_LABELS[cls];
}
