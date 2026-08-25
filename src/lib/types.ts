export type Vector = "payment_failure" | "checkout_abandonment" | "subscription_mandate";

export type CauseClass =
  | "soft_decline"
  | "transient_error"
  | "auth_required"
  | "dead_mandate"
  | "abandonment";

export type LeakStatus =
  | "open"
  | "in_recovery"
  | "recovered"
  | "lost"
  | "stopped_dnc"
  | "promise_pending"
  | "human_queue";

export type Channel =
  | "retry"
  | "whatsapp"
  | "sms"
  | "email"
  | "voice";

export interface Step {
  id: string;
  delayMin: number;
  channel: Channel;
  kind: string;
  costPaise: number;
}

export interface Customer {
  id: string;
  name: string;
  phoneMask: string;
  emailMask: string;
  dnc: number;
  segment: string;
  payday: number;
}

export interface LeakRow {
  id: string;
  batch_id: number;
  customer_id: string;
  vector: Vector;
  amount_paise: number;
  cause_code: string;
  cause_class: CauseClass;
  planted_truth: string;
  status: LeakStatus;
  is_control: number;
  attempts: number;
  max_attempts: number;
  stage: string;
  next_action_sim_ms: number | null;
  recovered_paise: number;
  spent_paise: number;
  opened_sim_ms: number;
  closed_sim_ms: number | null;
  last_diagnosis: string | null;
  meta: string | null;
  [key: string]: unknown;
}

export interface TouchRow {
  id: number;
  leak_id: string;
  seq: number;
  channel: Channel;
  kind: string;
  scheduled_sim_ms: number;
  sent_sim_ms: number | null;
  status: string;
  outcome: string | null;
  amount_paise: number;
  cost_paise: number;
  note: string | null;
}

export interface AuditRow {
  id: number;
  sim_ms: number;
  leak_id: string | null;
  actor: "rules" | "llm" | "engine" | "guardrail" | "customer" | "system";
  event: string;
  detail: string;
}

export interface Diagnosis {
  cause_class: CauseClass;
  confidence: number;
  reasoning: string;
  source: "rules" | "llm";
}
