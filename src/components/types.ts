export interface Leak {
  id: string;
  vector: string;
  amount_paise: number;
  cause_code: string;
  cause_class: string;
  planted_truth: string;
  status: string;
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
  customer_name: string;
  phone: string;
}

export interface Touch {
  id: number;
  leak_id: string;
  seq: number;
  channel: string;
  kind: string;
  scheduled_sim_ms: number;
  sent_sim_ms: number | null;
  status: string;
  outcome: string | null;
  cost_paise: number;
  note: string | null;
}

export interface AuditEntry {
  id: number;
  sim_ms: number;
  leak_id: string | null;
  actor: string;
  event: string;
  detail: string;
}

export interface Stats {
  simNow: number;
  speed: number;
  outage: boolean;
  totals: {
    atRiskPaiseTreated: number;
    atRiskPaiseControl: number;
    recoveredPaiseTreated: number;
    recoveredPaiseControl: number;
    recoveryRateTreated: number;
    recoveryRateControl: number;
    liftPct: number;
    incrementalPaise: number;
    spendPaise: number;
    netIncrementalPaise: number;
    leakCount: number;
  };
  statusCounts: Record<string, number>;
  guardrailBlocks: number;
  dncHonored: number;
  avgTouchesToRecovery: number | null;
  promiseKeptRate: number | null;
  series: { t: number; treated: number; control: number }[];
  byIntervention: { label: string; channel: string; executed: number; paid: number; rate: number }[];
}

export const STATUS_META: Record<
  string,
  { label: string; tone: "emerald" | "rose" | "amber" | "sky" | "violet" | "orange" | "zinc" }
> = {
  open: { label: "Open", tone: "sky" },
  in_recovery: { label: "In recovery", tone: "violet" },
  recovered: { label: "Recovered", tone: "emerald" },
  lost: { label: "Lost", tone: "rose" },
  stopped_dnc: { label: "Stopped · DNC", tone: "zinc" },
  promise_pending: { label: "Promise pending", tone: "amber" },
  human_queue: { label: "Human queue", tone: "orange" },
};

export const VECTOR_META: Record<string, { label: string }> = {
  payment_failure: { label: "Payment failed" },
  checkout_abandonment: { label: "Cart abandoned" },
  subscription_mandate: { label: "Mandate failed" },
};
