import type { Customer, LeakRow, Step } from "./types";
import { db } from "./db";
import { isCommChannel } from "./taxonomy";
import { hourOfDay, quietHoursReschedule, simNow } from "./simclock";

export interface GuardrailVerdict {
  allowed: boolean;
  action: "execute" | "reschedule" | "skip_step" | "stop_leak" | "human_queue";
  reason?: string;
  rescheduleTo?: number;
}

const COMMS_PER_48H = 2;

/**
 * Deterministic guardrails. The playbook proposes, this disposes.
 * Nothing reaches a customer or a payment rail without passing every check.
 */
export function checkGuardrails(leak: LeakRow, step: Step, cust: Customer): GuardrailVerdict {
  const now = simNow();

  if (cust.dnc) {
    return { allowed: false, action: "stop_leak", reason: "customer_dnc_registry" };
  }

  const ageDays = (now - leak.opened_sim_ms) / (24 * 3600000);
  if (ageDays > 14) {
    return { allowed: false, action: "stop_leak", reason: "expired_14d_window" };
  }

  if (isCommChannel(step.channel)) {
    const h = hourOfDay(now);
    if (h >= 21.5 || h < 8) {
      const target = quietHoursReschedule(now);
      return {
        allowed: false,
        action: "reschedule",
        reason: `quiet_hours (${h.toFixed(1)}h IST)`,
        rescheduleTo: target ?? now + 12 * 3600000,
      };
    }
    const recent = db
      .prepare(
        `SELECT COUNT(*) AS n FROM touches t JOIN leaks l ON t.leak_id = l.id
         WHERE l.customer_id = ? AND t.sent_sim_ms IS NOT NULL AND t.sent_sim_ms > ?
           AND t.channel IN ('whatsapp','sms','email','voice')`
      )
      .get(cust.id, now - 48 * 3600000) as { n: number };
    if (recent.n >= COMMS_PER_48H) {
      return {
        allowed: false,
        action: "reschedule",
        reason: `cross_channel_frequency_cap (${recent.n}/${COMMS_PER_48H} comms in 48h)`,
        rescheduleTo: now + 24 * 3600000,
      };
    }
  }

  if (step.channel === "retry" && leak.cause_class === "dead_mandate" && !step.kind.startsWith("reauth")) {
    return {
      allowed: false,
      action: "skip_step",
      reason: "never_retry_dead_mandate (would burn fees + confuse customer)",
    };
  }

  if (leak.attempts >= leak.max_attempts) {
    if (leak.cause_class === "dead_mandate") {
      return { allowed: false, action: "human_queue", reason: "playbook_exhausted_needs_reauth_decision" };
    }
    return { allowed: false, action: "stop_leak", reason: "playbook_exhausted" };
  }

  return { allowed: true, action: "execute" };
}
