import { db } from "./db";
import { simNow } from "./simclock";

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

export function computeStats(): Stats {
  const now = simNow();

  const cohort = (control: number) =>
    db
      .prepare(
        `SELECT COUNT(*) AS n,
                COALESCE(SUM(amount_paise),0) AS risk,
                COALESCE(SUM(recovered_paise),0) AS rec,
                COALESCE(SUM(spent_paise),0) AS spent
         FROM leaks WHERE is_control = ?`
      )
      .get(control) as { n: number; risk: number; rec: number; spent: number };

  const t = cohort(0);
  const c = cohort(1);
  const rateT = t.risk > 0 ? t.rec / t.risk : 0;
  const rateC = c.risk > 0 ? c.rec / c.risk : 0;

  const statusRows = db
    .prepare("SELECT status, COUNT(*) AS n FROM leaks GROUP BY status")
    .all() as { status: string; n: number }[];
  const statusCounts: Record<string, number> = {};
  for (const r of statusRows) statusCounts[r.status] = r.n;

  const guardrailBlocks = (
    db.prepare(`SELECT COUNT(*) AS n FROM audit WHERE event LIKE 'action.blocked%' OR event LIKE 'retry.backoff%'`).get() as { n: number }
  ).n;
  const dncHonored = (
    db.prepare(`SELECT COUNT(*) AS n FROM audit WHERE event = 'dnc.enforced_globally'`).get() as { n: number }
  ).n;

  const avgTouchRow = db
    .prepare(
      `SELECT AVG(cnt) AS a FROM (
         SELECT leak_id, COUNT(*) AS cnt FROM touches
         WHERE outcome = 'paid' GROUP BY leak_id
       )`
    )
    .get() as { a: number | null };

  const promiseRows = db
    .prepare(
      `SELECT
         SUM(CASE WHEN detail LIKE '%"promise.honored"%' THEN 1 ELSE 0 END) AS kept
       FROM audit WHERE event IN ('promise.honored','leak.closed')
         AND (event != 'leak.closed' OR detail LIKE '%broken_promise%')`
    )
    .get() as { kept: number | null };
  void promiseRows;

  const promiseKept = (
    db.prepare(`SELECT COUNT(*) AS n FROM audit WHERE event='promise.honored'`).get() as { n: number }
  ).n;
  const promiseBroken = (
    db.prepare(`SELECT COUNT(*) AS n FROM audit WHERE event='promise.broken'`).get() as { n: number }
  ).n;
  const promiseKeptRate = promiseKept + promiseBroken > 0 ? promiseKept / (promiseKept + promiseBroken) : null;

  // cumulative recovered series bucketed by sim hour
  const paidTouches = db
    .prepare(
      `SELECT t.sent_sim_ms AS ts, l.is_control AS ctl, l.amount_paise AS amt
       FROM touches t JOIN leaks l ON l.id = t.leak_id
       WHERE t.outcome = 'paid' AND t.sent_sim_ms IS NOT NULL
       ORDER BY t.sent_sim_ms`
    )
    .all() as { ts: number; ctl: number; amt: number }[];

  const openedRow = db.prepare("SELECT MIN(opened_sim_ms) AS o FROM leaks").get() as { o: number | null };
  const start = Math.floor((openedRow.o ?? now) / 3600000) * 3600000;
  const endBuckets = Math.max(1, Math.ceil((now - start) / 3600000));
  const buckets = new Map<number, { t: number; c: number }>();
  for (let i = 0; i <= endBuckets; i++) buckets.set(start + i * 3600000, { t: 0, c: 0 });

  let accT = 0;
  let accC = 0;
  let bi = 0;
  const sorted = [...buckets.keys()].sort((a, b) => a - b);
  const series: { t: number; treated: number; control: number }[] = [];
  for (const k of sorted) {
    const nextK = k + 3600000;
    while (bi < paidTouches.length && paidTouches[bi].ts < nextK) {
      const p = paidTouches[bi];
      if (p.ctl) accC += p.amt;
      else accT += p.amt;
      bi++;
    }
    series.push({ t: k, treated: accT / 100, control: accC / 100 });
  }

  const byInterventionRows = db
    .prepare(
      `SELECT kind, channel,
              SUM(CASE WHEN status='executed' THEN 1 ELSE 0 END) AS executed,
              SUM(CASE WHEN outcome='paid' THEN 1 ELSE 0 END) AS paid
       FROM touches WHERE sent_sim_ms IS NOT NULL
       GROUP BY kind, channel ORDER BY executed DESC`
    )
    .all() as { kind: string; channel: string; executed: number; paid: number }[];

  return {
    simNow: now,
    speed: Number(
      (db.prepare("SELECT value FROM meta WHERE key='speed'").get() as { value?: string } | undefined)?.value ?? 120
    ),
    outage:
      ((db.prepare("SELECT value FROM meta WHERE key='outage'").get() as { value?: string } | undefined)
        ?.value ?? "0") === "1",
    totals: {
      atRiskPaiseTreated: t.risk,
      atRiskPaiseControl: c.risk,
      recoveredPaiseTreated: t.rec,
      recoveredPaiseControl: c.rec,
      recoveryRateTreated: rateT,
      recoveryRateControl: rateC,
      liftPct: rateC > 0 ? ((rateT - rateC) / rateC) * 100 : rateT > 0 ? Infinity : 0,
      incrementalPaise: t.rec - c.rec,
      spendPaise: t.spent,
      netIncrementalPaise: t.rec - c.rec - t.spent,
      leakCount: t.n + c.n,
    },
    statusCounts,
    guardrailBlocks,
    dncHonored,
    avgTouchesToRecovery: avgTouchRow.a ?? null,
    promiseKeptRate,
    series,
    byIntervention: byInterventionRows.map((r) => ({
      label: r.kind.replace(/_/g, " "),
      channel: r.channel,
      executed: r.executed,
      paid: r.paid,
      rate: r.executed > 0 ? r.paid / r.executed : 0,
    })),
  };
}
