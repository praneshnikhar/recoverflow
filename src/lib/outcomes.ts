import type { CauseClass, Customer, LeakRow, Step } from "./types";
import { daysUntilPayday } from "./simclock";

/**
 * Planted ground-truth response model.
 * These probabilities encode realistic behaviour:
 * - liquidity failures recover best AFTER payday, and via retry/UPI link
 * - transient errors recover on quick retry
 * - auth-required recovers only when the customer completes the flow via a link
 * - dead mandates almost never recover by retry (only re-registration works)
 * - abandonment intent decays fast; WhatsApp within the first hour is king
 */
export function successProb(leak: LeakRow, step: Step, cust: Customer, nowSim: number): number {
  const cls = leak.cause_class as CauseClass;
  switch (cls) {
    case "soft_decline": {
      const dpd = daysUntilPayday(nowSim, cust.payday);
      const paydayBoost = dpd <= 1 ? 0.18 : dpd >= -2 && dpd < 1 ? 0.05 : -0.08;
      if (step.channel === "retry") {
        return clamp(0.42 + paydayBoost + (step.kind === "immediate_retry" ? 0 : 0));
      }
      if (step.channel === "whatsapp") return clamp(0.34 + Math.max(0, paydayBoost) / 2);
      if (step.channel === "voice") return clamp(0.22);
      return 0.1;
    }
    case "transient_error": {
      if (step.kind === "immediate_retry") return 0.78;
      if (step.kind === "delayed_retry") return 0.46;
      return 0.24;
    }
    case "auth_required": {
      if (step.channel === "whatsapp") return 0.44;
      if (step.channel === "email") return 0.2;
      return 0.09;
    }
    case "dead_mandate": {
      if (step.kind.startsWith("reauth")) return 0.11;
      return 0.02;
    }
    case "abandonment": {
      const ageH = (nowSim - leak.opened_sim_ms) / 3600000;
      const decay = Math.exp(-ageH / 20);
      if (step.channel === "whatsapp") return clamp(0.14 + 0.26 * decay);
      if (step.channel === "email") return clamp(0.06 + 0.16 * decay);
      return clamp(0.04 + 0.07 * decay);
    }
  }
}

/** Naive control policy outcome: blind retries ignore cause, so yield is poor and uniform-ish. */
export function controlProb(leak: LeakRow): number {
  if (leak.cause_class === "dead_mandate") return 0.01;
  if (leak.cause_class === "abandonment") return 0.03;
  return [0.14, 0.08, 0.04][Math.min(leak.attempts, 2)];
}

function clamp(p: number): number {
  return Math.max(0.01, Math.min(0.95, p));
}
