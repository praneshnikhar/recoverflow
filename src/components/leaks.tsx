"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  CalendarClock,
  CircleCheck,
  HandCoins,
  PhoneCall,
  X,
} from "lucide-react";
import { Badge, Button, Card } from "./ui";
import { formatINR, formatINRFull, fmtSimTime } from "@/lib/format";
import { STATUS_META, VECTOR_META, type AuditEntry, type Leak, type Touch } from "./types";

const FILTERS: { key: string; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "recovered", label: "Recovered" },
  { key: "lost", label: "Lost / stopped" },
  { key: "all", label: "All" },
];

export function LeakTable({
  leaks,
  selectedId,
  onSelect,
}: {
  leaks: Leak[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState("active");

  const counts = {
    active: leaks.filter((l) => ["open", "in_recovery", "promise_pending"].includes(l.status)).length,
    recovered: leaks.filter((l) => l.status === "recovered").length,
    lost: leaks.filter((l) => ["lost", "stopped_dnc", "human_queue"].includes(l.status)).length,
    all: leaks.length,
  };

  const filtered = leaks.filter((l) => {
    if (filter === "active") return ["open", "in_recovery", "promise_pending"].includes(l.status);
    if (filter === "recovered") return l.status === "recovered";
    if (filter === "lost") return ["lost", "stopped_dnc", "human_queue"].includes(l.status);
    return true;
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-1 border-b border-white/[0.06] px-3 py-2">
        <h3 className="mr-2 text-sm font-medium text-white">Leaks</h3>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${
              filter === f.key
                ? "bg-white/[0.07] font-medium text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {f.label}{" "}
            <span className="tabular text-slate-600">{counts[f.key as keyof typeof counts]}</span>
          </button>
        ))}
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-ink-900/95 backdrop-blur">
            <tr className="text-[11px] uppercase tracking-wider text-slate-600">
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Vector</th>
              <th className="px-3 py-2 font-medium">Cause</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Next</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => {
              const meta = STATUS_META[l.status] ?? STATUS_META.lost;
              const diag = safeParse(l.last_diagnosis);
              return (
                <tr
                  key={l.id}
                  onClick={() => onSelect(l.id)}
                  className={`cursor-pointer border-t border-white/[0.04] transition-colors hover:bg-white/[0.03] ${
                    selectedId === l.id ? "bg-emerald-500/[0.05]" : ""
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-200">{l.customer_name}</p>
                    <p className="font-mono text-[10px] text-slate-600">{l.phone}</p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    {VECTOR_META[l.vector]?.label ?? l.vector}
                    {l.is_control ? (
                      <Badge tone="zinc" className="ml-1.5">control</Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-mono text-[11px] text-slate-400">{l.cause_code}</span>
                    {diag && (
                      <p className="text-[10px] text-slate-600">{diag.cause_class}</p>
                    )}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right font-medium text-slate-200">
                    {formatINR(l.amount_paise)}
                    {l.recovered_paise > 0 && (
                      <CircleCheck className="ml-1 inline h-3.5 w-3.5 text-emerald-400" />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-500">
                    {l.next_action_sim_ms && ["open", "in_recovery"].includes(l.status)
                      ? `${fmtSimTime(l.next_action_sim_ms)} · ${l.stage.replace(/_/g, " ")}`
                      : l.closed_sim_ms
                        ? `closed ${fmtSimTime(l.closed_sim_ms)}`
                        : "—"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-xs text-slate-600">
                  No leaks in this view
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function safeParse(s: string | null | undefined): { cause_class?: string; source?: string; reasoning?: string } | null {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/* ------------------------------ detail drawer ------------------------------ */

interface DetailPayload {
  ok: boolean;
  leak: Leak & {
    customer_name: string;
    phone: string;
    email: string;
    segment: string;
    payday: number;
    cust_dnc: number;
  };
  touches: Touch[];
  trail: AuditEntry[];
  aiNarrative: string | null;
}

export function LeakDetailPanel({
  leakId,
  onChanged,
}: {
  leakId: string;
  onChanged: () => void;
}) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/leaks/${leakId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [leakId]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 2500);
    return () => clearInterval(iv);
  }, [load]);

  const act = async (kind: "stop" | "promise" | "pay_now") => {
    setActing(true);
    await fetch("/api/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leakId, kind }),
    });
    await new Promise((r) => setTimeout(r, 300));
    load();
    onChanged();
    setActing(false);
  };

  if (!data?.ok) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const l = data.leak;
  const diag = safeParse(l.last_diagnosis);
  const meta = STATUS_META[l.status] ?? STATUS_META.lost;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{l.customer_name}</h2>
          <p className="font-mono text-[11px] text-slate-500">
            {l.phone} · {l.email} · {l.segment} · payday {l.payday}
          </p>
        </div>
        <Button variant="ghost" onClick={() => onChanged()} className="!px-2" title="Close with Esc" >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <Badge tone={l.is_control ? "zinc" : "emerald"}>
          {l.is_control ? "naive control cohort" : "smart policy cohort"}
        </Badge>
        <span className="tabular ml-auto text-lg font-bold text-white">
          {formatINRFull(l.amount_paise)}
        </span>
      </div>

      {diag && (
        <Card className="mb-4 p-4">
          <div className="mb-1.5 flex items-center gap-2">
            <PhoneCall className="h-3.5 w-3.5 text-sky-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Diagnosis
            </h3>
            <Badge tone={diag.source === "llm" ? "violet" : "sky"} className="ml-auto">
              {diag.source === "llm" ? "LLM-enriched" : "rules engine"}
            </Badge>
          </div>
          <p className="font-mono text-[11px] text-emerald-300/90">{l.cause_code} → {diag.cause_class}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{diag.reasoning}</p>
        </Card>
      )}

      <Card className="mb-4 p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <HandCoins className="h-3.5 w-3.5 text-emerald-400" /> Simulate the customer
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => act("pay_now")} disabled={acting || !["open", "in_recovery", "promise_pending"].includes(l.status)}>
            <CircleCheck className="h-3.5 w-3.5" /> Pays via link now
          </Button>
          <Button variant="warn" onClick={() => act("promise")} disabled={acting || !["open", "in_recovery"].includes(l.status)}>
            <CalendarClock className="h-3.5 w-3.5" /> “I'll pay Friday”
          </Button>
          <Button variant="danger" onClick={() => act("stop")} disabled={acting || l.cust_dnc === 1}>
            <Ban className="h-3.5 w-3.5" /> Replies STOP
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
          STOP is honored instantly across every channel and cohort member for this
          customer — watch the audit ledger.
        </p>
      </Card>

      <Card className="mb-4 p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Recovery timeline
        </h3>
        <ol className="space-y-2.5">
          {data.touches.map((t) => {
            const failed = t.outcome && t.outcome !== "paid";
            const paid = t.outcome === "paid";
            return (
              <li key={t.id} className="relative pl-6">
                <span
                  className={`absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 ${
                    paid
                      ? "border-emerald-400 bg-emerald-400/30"
                      : t.status !== "executed"
                        ? "border-slate-600 bg-transparent"
                        : "border-rose-400 bg-rose-400/20"
                  }`}
                />
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium capitalize text-slate-300">
                    {t.kind.replace(/_/g, " ")}{" "}
                    <span className="font-normal text-slate-600">· {t.channel}</span>
                  </p>
                  <span className="shrink-0 font-mono text-[10px] text-slate-600">
                    {t.sent_sim_ms ? fmtSimTime(t.sent_sim_ms) : ""}
                  </span>
                </div>
                {t.note && <p className="mt-0.5 line-clamp-2 text-[11px] italic text-slate-500">“{t.note}”</p>}
                <p className={`mt-0.5 font-mono text-[10px] ${paid ? "text-emerald-400" : failed ? "text-rose-400/80" : "text-amber-400/80"}`}>
                  {t.status}
                  {t.outcome ? ` → ${t.outcome}` : ""}
                  {t.cost_paise > 0 ? ` · cost ₹${(t.cost_paise / 100).toFixed(2)}` : ""}
                </p>
              </li>
            );
          })}
          {data.touches.length === 0 && (
            <li className="py-4 text-center text-xs text-slate-600">First action scheduled…</li>
          )}
        </ol>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Decision trail ({data.trail.length})
        </h3>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {data.trail.slice().reverse().map((a) => {
            let d: Record<string, unknown> = {};
            try { d = JSON.parse(a.detail); } catch {}
            return (
              <li key={a.id} className="rounded-lg border border-white/[0.04] bg-ink-850/60 px-2.5 py-1.5">
                <div className="flex items-center gap-1.5">
                  <Badge tone={(a.actor === "guardrail" ? "amber" : a.actor === "engine" ? "emerald" : a.actor === "customer" ? "zinc" : a.actor === "llm" ? "violet" : "sky") as never}>
                    {a.actor}
                  </Badge>
                  <span className="truncate font-mono text-[11px] text-slate-300">{a.event}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-600">
                    {fmtSimTime(a.sim_ms)}
                  </span>
                </div>
                {Object.keys(d).length > 0 && (
                  <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-slate-600">
                    {JSON.stringify(d)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {l.planted_truth && (
        <p className="mt-3 text-center font-mono text-[10px] text-slate-700">
          hidden ground truth: {l.planted_truth} — compare against diagnosis above to score accuracy
        </p>
      )}
    </div>
  );
}
