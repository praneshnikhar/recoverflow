import { db, setMeta, getMeta } from "./db";
import type { AuditRow, CauseClass, Customer, LeakRow, Step } from "./types";
import { CAUSES } from "./taxonomy";
import { mulberry32, pick, rngFor, weighted } from "./rng";
import { initClock, simNow } from "./simclock";
import { PLAYBOOKS, MAX_ATTEMPTS, CONTROL_PLAYBOOK, CONTROL_MAX_ATTEMPTS } from "./playbooks";
import { checkGuardrails } from "./guardrails";
import { successProb, controlProb } from "./outcomes";
import { diagnose } from "./diagnose";
import crypto from "crypto";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/* ---------------------------------- audit ---------------------------------- */

const insAudit = db.prepare(
  "INSERT INTO audit (sim_ms, leak_id, actor, event, detail) VALUES (?, ?, ?, ?, ?)"
);

export function audit(
  simMs: number,
  leakId: string | null,
  actor: AuditRow["actor"],
  event: string,
  detail: Record<string, unknown> = {}
) {
  insAudit.run(simMs, leakId, actor, event, JSON.stringify(detail));
}

/* ------------------------------- message copy ------------------------------ */

function composeMessage(leak: LeakRow, cust: Customer, step: Step): string {
  const amt = `₹${(leak.amount_paise / 100).toLocaleString("en-IN")}`;
  const first = cust.name.split(" ")[0];
  switch (step.kind) {
    case "upi_link_nudge":
      return `${first}, aapka ${amt} ka payment pending hai. Pay instantly via UPI: pay.rzp.io/x${leak.id.slice(-6)} — takes 10 seconds.`;
    case "cart_recovery_link":
      return `Hi ${first}, your cart (${amt}) is saved! Complete checkout before items sell out: pay.rzp.io/c${leak.id.slice(-6)}`;
    case "secure_auth_link":
      return `${first}, your bank needs one extra verification for the ${amt} payment. Resume securely: pay.rzp.io/a${leak.id.slice(-6)}`;
    case "mandate_reauth_link":
    case "mandate_reauth_email":
      return `Hi ${first}, your auto-pay mandate for ${amt} was cancelled. Re-activate in 30 seconds to keep your subscription running: pay.rzp.io/m${leak.id.slice(-6)}`;
    case "auth_reminder":
    case "final_auth_nudge":
      return `Reminder: ${amt} payment awaiting your bank verification. Link: pay.rzp.io/a${leak.id.slice(-6)}`;
    case "cart_reminder":
    case "final_cart_nudge":
      return `Still thinking it over, ${first}? Your ${amt} cart is reserved for a few more hours: pay.rzp.io/c${leak.id.slice(-6)}`;
    case "voice_recovery":
      return `[Hinglish voice agent] "Namaste ${first}! Main [Merchant] se bol rahi hoon. Aapka ${amt} ka payment fail ho gaya tha — salary aa gayi hogi, ab pay karna easy hai. Ek missed call ya SMS se confirm kar dijiye."`;
    default:
      return step.channel === "retry"
        ? `Smart retry scheduled on ${leak.cause_class === "soft_decline" ? "optimal payday window" : "same rail"}`
        : `Payment link sent to ${cust.phoneMask}`;
  }
}

/* --------------------------------- seeding --------------------------------- */

const FIRST = ["Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Meera", "Karthik", "Divya", "Arjun", "Neha", "Sandeep", "Pooja", "Imran", "Lakshmi", "Rahul", "Sneha", "Aditya", "Kavya", "Manish", "Ishita", "Farhan", "Deepa", "Nikhil", "Riya"];
const LAST = ["Sharma", "Patel", "Reddy", "Iyer", "Khan", "Gupta", "Nair", "Joshi", "Verma", "Menon", "Das", "Kulkarni"];

interface SeedSpec {
  vector: string;
  code: string;
}

export function seedBatch(size: number, seed: number): { batchId: number; leakIds: string[] } {
  initClock();
  const rng = mulberry32(seed);
  const nowSim = simNow();

  const batchInfo = db
    .prepare("INSERT INTO batches (created_sim_ms, seed, size, note) VALUES (?, ?, ?, ?)")
    .run(nowSim, seed, size, "synthetic");
  const batchId = Number(batchInfo.lastInsertRowid);

  const custCount = db.prepare("SELECT COUNT(*) AS n FROM customers").get() as { n: number };
  const insCust = db.prepare(
    "INSERT INTO customers (id, name, phone_mask, email_mask, segment, payday) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insLeak = db.prepare(
    `INSERT INTO leaks (id, batch_id, customer_id, vector, amount_paise, cause_code, cause_class, planted_truth, status, is_control, max_attempts, opened_sim_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`
  );

  const leakIds: string[] = [];
  const customersById = new Map<string, Customer>();

  for (let i = 0; i < size; i++) {
    // ~55% of leaks reuse an existing customer (repeat failure history matters)
    let cust: Customer;
    if (customersById.size > 0 && rng() < 0.55) {
      const ids = [...customersById.keys()];
      cust = customersById.get(pick(rng, ids))!;
    } else {
      const name = `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
      const id = `C${custCount.n + customersById.size + 1}`;
      cust = {
        id,
        name,
        phoneMask: `+91 ••••• ${Math.floor(10000 + rng() * 89999)}`,
        emailMask: `${name.toLowerCase().replace(/[^a-z]/g, ".").slice(0, 12)}•••@gmail.com`,
        dnc: 0,
        segment: pick(rng, ["salaried", "gig_worker", "smb", "subscriber"]),
        payday: pick(rng, [1, 1, 2, 5, 7, 10, 10, 15, 25, 28]),
      };
      insCust.run(cust.id, cust.name, cust.phoneMask, cust.emailMask, cust.segment, cust.payday);
      customersById.set(id, cust);
    }

    const spec: SeedSpec = weighted(rng, [
      [{ vector: "payment_failure", code: "INSUFFICIENT_FUNDS" }, 26],
      [{ vector: "payment_failure", code: "GATEWAY_ERROR" }, 12],
      [{ vector: "payment_failure", code: "NETWORK_ERROR" }, 6],
      [{ vector: "payment_failure", code: "AUTHENTICATION_REQUIRED" }, 8],
      [{ vector: "payment_failure", code: "MANDATE_CANCELLED" }, 7],
      [{ vector: "subscription_mandate", code: "MANDATE_CANCELLED" }, 8],
      [{ vector: "checkout_abandonment", code: "ABANDONED_CHECKOUT" }, 33],
    ]);

    const amount =
      spec.vector === "subscription_mandate"
        ? Math.round((199 + rng() * rng() * 1800)) * 100
        : Math.round((500 + rng() * rng() * 24000) / 10) * 100;

    const truth = pick(rng, [
      "will_pay_after_salary",
      "transient_bank_issue",
      "needs_nudge_only",
      "mandate_dead_wont_recover",
      "high_intent_shopper",
      "browsing_never_buys",
    ]);

    const leakId = `LK-${batchId}${String(i + 1).padStart(3, "0")}-${crypto.randomBytes(2).toString("hex")}`;
    const cls = CAUSES[spec.code].cause_class;
    const isControl = rng() < 0.28 ? 1 : 0;
    // stagger openings over the last 48 sim hours so the engine has live work immediately
    const opened = nowSim - Math.floor(rng() * 48) * HOUR - Math.floor(rng() * 50) * MIN;

    insLeak.run(
      leakId, batchId, cust.id, spec.vector, amount, spec.code, cls, truth,
      isControl,
      isControl ? CONTROL_MAX_ATTEMPTS : MAX_ATTEMPTS[cls],
      opened
    );
    leakIds.push(leakId);

    const diag = classifySync(spec.code);
    db.prepare("UPDATE leaks SET last_diagnosis = ? WHERE id = ?").run(JSON.stringify(diag), leakId);
    audit(opened, leakId, "system", "leak.detected", {
      vector: spec.vector,
      decline_code: spec.code,
      cause_class: cls,
      amount_inr: amount / 100,
      cohort: isControl ? "control_naive_baseline" : "treatment_smart_policy",
    });
    audit(opened, leakId, "rules", "diagnosis.completed", {
      cause_class: cls,
      source: "rules",
      reasoning: diag.reasoning,
    });

    scheduleFirstStep(leakId, opened);
  }

  return { batchId, leakIds };
}

function classifySync(code: string): { cause_class: CauseClass; reasoning: string; source: string } {
  const def = CAUSES[code];
  const cls = def.cause_class;
  const r: Record<CauseClass, string> = {
    soft_decline: "Temporary liquidity issue — timing beats persistence.",
    transient_error: "Bank-side blip — quick retry converts.",
    auth_required: "Auth dropped mid-flight — only a resume link works.",
    dead_mandate: "Mandate dead — retrying burns money and trust.",
    abandonment: "Intent decays hourly — speed wins.",
  };
  return { cause_class: cls, reasoning: r[cls], source: "rules" };
}

function stepsFor(leak: LeakRow): Step[] {
  return leak.is_control
    ? CONTROL_PLAYBOOK
    : PLAYBOOKS[leak.cause_class as CauseClass] ?? PLAYBOOKS.transient_error;
}

function scheduleFirstStep(leakId: string, opened: number) {
  const leak = db.prepare("SELECT * FROM leaks WHERE id = ?").get(leakId) as LeakRow;
  const steps = stepsFor(leak);
  db.prepare("UPDATE leaks SET next_action_sim_ms = ?, stage = ? WHERE id = ?").run(
    opened + steps[0].delayMin * MIN,
    steps[0].id,
    leakId
  );
}

/** Public variant for webhook-ingested leaks. */
export function scheduleFirstStepExternal(leakId: string, openedSimMs: number) {
  scheduleFirstStep(leakId, openedSimMs);
}

/* --------------------------------- the loop -------------------------------- */

const globalLock = globalThis as unknown as { __recoverflow_ticking?: boolean };

export function tick(maxLeaks = 250): { processed: number; simNow: number } {
  if (globalLock.__recoverflow_ticking) return { processed: 0, simNow: simNow() };
  globalLock.__recoverflow_ticking = true;
  try {
    initClock();
    const now = simNow();
    const due = db
      .prepare(
        `SELECT * FROM leaks
         WHERE next_action_sim_ms IS NOT NULL AND next_action_sim_ms <= ?
           AND status IN ('open','in_recovery','promise_pending')
         ORDER BY next_action_sim_ms LIMIT ?`
      )
      .all(now, maxLeaks) as LeakRow[];

    let processed = 0;
    for (const leak of due) {
      try {
        stepLeak(leak, now);
        processed++;
      } catch (e) {
        audit(now, leak.id, "system", "engine.error", { error: String(e).slice(0, 200) });
      }
    }

    // promises that came due
    const promDue = db
      .prepare(
        `SELECT l.*, c.name AS cust_name FROM leaks l JOIN customers c ON c.id = l.customer_id
         WHERE l.status = 'promise_pending'
           AND json_extract(l.meta, '$.promise_due') IS NOT NULL
           AND CAST(json_extract(l.meta, '$.promise_due') AS INTEGER) <= ?`
      )
      .all(now) as (LeakRow & { cust_name?: string })[];
    for (const leak of promDue) {
      resolvePromise(leak, now);
      processed++;
    }

    return { processed, simNow: now };
  } finally {
    globalLock.__recoverflow_ticking = false;
  }
}

function stepLeak(leak: LeakRow, now: number) {
  const cust = db.prepare("SELECT * FROM customers WHERE id = ?").get(leak.customer_id) as Customer;
  const steps = stepsFor(leak);
  const idx = leak.attempts;
  const step = steps[Math.min(idx, steps.length - 1)];

  if (!step || idx >= leak.max_attempts || idx >= steps.length) {
    closeLeak(leak, "lost", "playbook_exhausted", now);
    return;
  }

  // graceful degradation: payment rails down -> retries back off exponentially, comms continue
  if (step.channel === "retry" && getMeta("outage") === "1") {
    const backoffMin = Math.min(240, 15 * Math.pow(2, leak.attempts));
    const target = now + backoffMin * MIN;
    db.prepare("UPDATE leaks SET next_action_sim_ms = ? WHERE id = ?").run(target, leak.id);
    addTouch(leak.id, leak.attempts, step, "skipped_outage", null, null, now,
      `rails degraded — backing off ${backoffMin}m (exponential)`);
    audit(now, leak.id, "system", "retry.backoff_outage", {
      step: step.id,
      backoff_minutes: backoffMin,
      comms_channel_unaffected: true,
    });
    return;
  }

  const verdict = checkGuardrails(leak, step, cust);

  if (!verdict.allowed) {
    handleBlocked(leak, step, verdict, cust, now);
    return;
  }

  executeStep(leak, step, cust, now);
}

function handleBlocked(
  leak: LeakRow,
  step: Step,
  verdict: ReturnType<typeof checkGuardrails>,
  cust: Customer,
  now: number
) {
  switch (verdict.action) {
    case "reschedule": {
      const target = verdict.rescheduleTo ?? now + 12 * HOUR;
      db.prepare("UPDATE leaks SET next_action_sim_ms = ? WHERE id = ?").run(target, leak.id);
      addTouch(leak.id, leak.attempts, step, "rescheduled", null, null, now, verdict.reason ?? "");
      audit(now, leak.id, "guardrail", "action.rescheduled", {
        step: step.id,
        reason: verdict.reason,
        retry_at_hours_ahead: Math.round((target - now) / HOUR),
      });
      return;
    }
    case "skip_step": {
      addTouch(leak.id, leak.attempts, step, "guardrail_blocked", null, 0, now, verdict.reason ?? "");
      audit(now, leak.id, "guardrail", "action.blocked", { step: step.id, reason: verdict.reason });
      const nextIdx = leak.attempts + 1;
      const steps = stepsFor(leak);
      if (nextIdx >= Math.min(leak.max_attempts, steps.length)) {
        if (verdict.action === "skip_step" && leak.cause_class === "dead_mandate") {
          queueForHuman(leak, now, "dead mandate exhausted automated options");
          return;
        }
        closeLeak(leak, "lost", "playbook_exhausted", now);
        return;
      }
      db.prepare("UPDATE leaks SET attempts = ?, next_action_sim_ms = ?, stage = ? WHERE id = ?").run(
        nextIdx, now, steps[nextIdx].id, leak.id
      );
      return;
    }
    case "human_queue": {
      queueForHuman(leak, now, verdict.reason ?? "needs_human_decision");
      return;
    }
    case "stop_leak":
    default: {
      const reason = verdict.reason ?? "stopped";
      const status = reason.includes("dnc") ? "stopped_dnc" : "lost";
      cancelFutureTouches(leak.customer_id, leak.id, now);
      closeLeak(leak, status as LeakRow["status"], reason, now);
      return;
    }
  }
}

function executeStep(leak: LeakRow, step: Step, cust: Customer, now: number) {
  const msg = composeMessage(leak, cust, step);
  const rng = rngFor(leak.id, `step${leak.attempts}`);
  const p = leak.is_control
    ? controlProb(leak)
    : successProb(leak, step, cust, now);
  const paid = rng() < p;

  addTouch(leak.id, leak.attempts, step, "executed", paid ? "paid" : outcomeLabel(step, rng), step.costPaise, now, msg);

  db.prepare("UPDATE leaks SET spent_paise = spent_paise + ? WHERE id = ?").run(step.costPaise, leak.id);

  if (paid) {
    db.prepare(
      "UPDATE leaks SET status = 'recovered', recovered_paise = ?, closed_sim_ms = ?, next_action_sim_ms = NULL, attempts = attempts + 1 WHERE id = ?"
    ).run(leak.amount_paise, now, leak.id);
    audit(now, leak.id, "engine", "recovery.succeeded", {
      step: step.id,
      channel: step.channel,
      attempt: leak.attempts + 1,
      recovered_inr: leak.amount_paise / 100,
      cohort: leak.is_control ? "control" : "treatment",
    });
    return;
  }

  audit(now, leak.id, "engine", "attempt.failed", {
    step: step.id,
    channel: step.channel,
    attempt: leak.attempts + 1,
  });

  const nextIdx = leak.attempts + 1;
  const steps = stepsFor(leak);
  if (nextIdx >= Math.min(leak.max_attempts, steps.length)) {
    if (leak.cause_class === "dead_mandate") {
      queueForHuman(leak, now, "reauth links unanswered — human decision needed");
      return;
    }
    closeLeak(leak, "lost", "playbook_exhausted", now);
    return;
  }
  const nextStep = steps[nextIdx];
  db.prepare("UPDATE leaks SET attempts = ?, next_action_sim_ms = ?, stage = ?, status = 'in_recovery' WHERE id = ?").run(
    nextIdx, now + nextStep.delayMin * MIN, nextStep.id, leak.id
  );
}

function outcomeLabel(step: Step, rng: () => number): string {
  if (step.channel === "retry") {
    return rng() < 0.85 ? "declined_again" : "gateway_timeout";
  }
  return rng() < 0.6 ? "no_response" : rng() < 0.5 ? "opened_not_paid" : "ignored";
}

function addTouch(
  leakId: string,
  seq: number,
  step: Step,
  status: string,
  outcome: string | null,
  cost: number | null,
  now: number,
  note: string
) {
  db.prepare(
    `INSERT INTO touches (leak_id, seq, channel, kind, scheduled_sim_ms, sent_sim_ms, status, outcome, cost_paise, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(leakId, seq, step.channel, step.kind, now, now, status, outcome, cost ?? step.costPaise, note);
}

function cancelFutureTouches(customerId: string, exceptLeakId: string, _now: number) {
  db.prepare(
    `UPDATE touches SET status = 'cancelled', outcome = COALESCE(outcome, 'cancelled')
     WHERE sent_sim_ms IS NULL AND leak_id IN
       (SELECT id FROM leaks WHERE customer_id = ? AND id != ?
          AND status IN ('open','in_recovery','promise_pending'))`
  ).run(customerId, exceptLeakId || "-");
}

function queueForHuman(leak: LeakRow, now: number, reason: string) {
  db.prepare("UPDATE leaks SET status = 'human_queue', closed_sim_ms = ?, next_action_sim_ms = NULL WHERE id = ?").run(now, leak.id);
  audit(now, leak.id, "engine", "escalation.human_queue", { reason, unresolved: true });
}

function closeLeak(leak: LeakRow, status: LeakRow["status"], reason: string, now: number) {
  db.prepare("UPDATE leaks SET status = ?, closed_sim_ms = ?, next_action_sim_ms = NULL WHERE id = ?").run(status, now, leak.id);
  audit(now, leak.id, "engine", `leak.closed`, { status, reason });
}

/* ----------------------------- customer replies ---------------------------- */

export function applyReply(
  leakId: string,
  kind: "stop" | "promise" | "pay_now",
  promiseDays = 3
): { ok: boolean; error?: string } {
  initClock();
  const now = simNow();
  const leak = db.prepare("SELECT * FROM leaks WHERE id = ?").get(leakId) as LeakRow | undefined;
  if (!leak) return { ok: false, error: "leak not found" };
  const cust = db.prepare("SELECT * FROM customers WHERE id = ?").get(leak.customer_id) as Customer;

  if (kind === "stop") {
    db.prepare("UPDATE customers SET dnc = 1 WHERE id = ?").run(cust.id);
    audit(now, leak.id, "customer", "reply.stop_received", { channel: "whatsapp" });
    cancelFutureTouches(cust.id, "", now);
    db.prepare(
      `UPDATE touches SET status = 'cancelled_dnc' WHERE leak_id IN
        (SELECT id FROM leaks WHERE customer_id = ? AND status NOT IN ('recovered','lost','stopped_dnc','human_queue'))
        AND sent_sim_ms IS NULL`
    ).run(cust.id);
    const open = db
      .prepare(
        `SELECT id FROM leaks WHERE customer_id = ? AND status IN ('open','in_recovery','promise_pending')`
      )
      .all(cust.id) as { id: string }[];
    for (const l of open) {
      closeLeak({ id: l.id } as LeakRow, "stopped_dnc", "customer_opted_out_honored", now);
    }
    audit(now, null, "guardrail", "dnc.enforced_globally", {
      customer_id: cust.id,
      affected_leaks: open.map((l) => l.id),
      latency_ms: 0,
    });
    return { ok: true };
  }

  if (kind === "promise") {
    const due = now + promiseDays * DAY;
    db.prepare(
      "UPDATE leaks SET status = 'promise_pending', next_action_sim_ms = NULL, meta = json_set(COALESCE(meta,'{}'), '$.promise_due', ?) WHERE id = ?"
    ).run(String(due), leakId);
    audit(now, leakId, "customer", "reply.promise_to_pay", {
      promised_on: new Date(due).toISOString().slice(0, 10),
      extracted_by: "ptp_intent_classifier",
      ladder_paused: true,
    });
    return { ok: true };
  }

  // pay_now — customer completes payment via link
  if (["open", "in_recovery", "promise_pending"].includes(leak.status)) {
    db.prepare(
      "UPDATE leaks SET status = 'recovered', recovered_paise = ?, closed_sim_ms = ?, next_action_sim_ms = NULL WHERE id = ?"
    ).run(leak.amount_paise, now, leakId);
    audit(now, leakId, "customer", "reply.paid_via_link", { recovered_inr: leak.amount_paise / 100 });
    return { ok: true };
  }

  return { ok: false, error: `leak in status ${leak.status} cannot be force-paid` };
}

function resolvePromise(leak: LeakRow, now: number) {
  const rng = rngFor(leak.id, "promise_resolve");
  const kept = rng() < 0.68;
  if (kept) {
    db.prepare(
      "UPDATE leaks SET status = 'recovered', recovered_paise = ?, closed_sim_ms = ?, next_action_sim_ms = NULL WHERE id = ?"
    ).run(leak.amount_paise, now, leak.id);
    audit(now, leak.id, "engine", "promise.honored", { recovered_inr: leak.amount_paise / 100 });
  } else {
    audit(now, leak.id, "customer", "promise.broken", {});
    const step: Step = { id: "post_promise_final", delayMin: 0, channel: "sms", kind: "final_polite_sms", costPaise: 20 };
    const cust = db.prepare("SELECT * FROM customers WHERE id = ?").get(leak.customer_id) as Customer;
    const v = checkGuardrails({ ...leak, status: "in_recovery" }, step, cust);
    if (!v.allowed && v.action !== "execute") {
      closeLeak(leak, "lost", "post_promise_stopped_by_guardrail", now);
      return;
    }
    const paid = rngFor(leak.id, "post_promise_pay")() < 0.25;
    addTouch(leak.id, leak.max_attempts, step, "executed", paid ? "paid" : "no_response", step.costPaise, now, composeMessage({ ...leak, cause_class: "abandonment" } as LeakRow, cust, step));
    db.prepare("UPDATE leaks SET spent_paise = spent_paise + ? WHERE id = ?").run(step.costPaise, leak.id);
    if (paid) {
      db.prepare(
        "UPDATE leaks SET status = 'recovered', recovered_paise = ?, closed_sim_ms = ?, next_action_sim_ms = NULL WHERE id = ?"
      ).run(leak.amount_paise, now, leak.id);
      audit(now, leak.id, "engine", "recovery.succeeded", { step: "post_promise_final" });
    } else {
      closeLeak(leak, "lost", "broken_promise_final_touch_done", now);
    }
  }
}

/* --------------------------------- controls -------------------------------- */

export function resetAll() {
  db.exec("DELETE FROM touches; DELETE FROM audit; DELETE FROM leaks; DELETE FROM batches; DELETE FROM customers;");
  setMeta("sim_anchor_real_ms", String(Date.now()));
  setMeta("sim_anchor_sim_ms", String(Date.now()));
  setMeta("speed", "120");
  setMeta("outage", "0");
}

export function toggleOutage(on?: boolean): boolean {
  const cur = getMeta("outage") === "1";
  const next = on ?? !cur;
  setMeta("outage", next ? "1" : "0");
  audit(simNow(), null, "system", next ? "outage.started" : "outage.resolved", {
    effect: next ? "payment rails degraded: retries back off exponentially, comms continue" : "rails healthy again",
  });
  return next;
}
