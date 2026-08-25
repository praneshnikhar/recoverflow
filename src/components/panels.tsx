"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ShieldAlert,
  RotateCcw,
  TrendingUp,
  Gauge,
  ListChecks,
} from "lucide-react";
import { Badge, Button, Card } from "./ui";
import { formatINR, fmtSimTime } from "@/lib/format";
import type { Stats } from "./types";
import { useEffect, useState } from "react";

/* --------------------------------- hero ---------------------------------- */

export function HeroBand({ stats }: { stats: Stats | null }) {
  if (!stats) return null;
  const t = stats.totals;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Card className="relative overflow-hidden p-5 md:col-span-2">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/[0.07] blur-2xl" />
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Net incremental recovered
        </p>
        <p className="tabular mt-1 text-4xl font-bold tracking-tight text-emerald-400">
          {formatINR(t.netIncrementalPaise)}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          treatment cohort vs naive-baseline control · net of{" "}
          {formatINR(t.spendPaise)} channel cost
        </p>
      </Card>

      <MiniStat
        icon={<Gauge className="h-4 w-4" />}
        label="Recovery rate"
        value={`${(t.recoveryRateTreated * 100).toFixed(1)}%`}
        sub={`control ${(t.recoveryRateControl * 100).toFixed(1)}%`}
        tone="emerald"
      />
      <MiniStat
        icon={<TrendingUp className="h-4 w-4" />}
        label="Lift over baseline"
        value={
          Number.isFinite(t.liftPct) ? `${t.liftPct.toFixed(0)}%` : "∞"
        }
        sub={`${formatINR(t.incrementalPaise)} extra cash`}
        tone="sky"
      />
    </div>
  );
}

const toneRing = {
  emerald: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",
  sky: "text-sky-400 bg-sky-500/10 ring-sky-500/20",
  amber: "text-amber-400 bg-amber-500/10 ring-amber-500/20",
  rose: "text-rose-400 bg-rose-500/10 ring-rose-500/20",
};

function MiniStat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: keyof typeof toneRing;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${toneRing[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-slate-500">{label}</p>
        <p className="tabular text-lg font-semibold text-white">{value}</p>
        {sub && <p className="text-[11px] text-slate-600">{sub}</p>}
      </div>
    </Card>
  );
}

/* ------------------------------- controls -------------------------------- */

export function ControlsCard({
  speed,
  speeds,
  onSetSpeed,
  outage,
  onToggleOutage,
  onSeed,
  seedSize,
  setSeedSize,
  onReset,
  busy,
}: {
  speed: number;
  speeds: { v: number; label: string; icon?: React.ComponentType<{ className?: string }> }[];
  onSetSpeed: (v: number) => void;
  outage: boolean;
  onToggleOutage: () => void;
  onSeed: () => void;
  seedSize: number;
  setSeedSize: (n: number) => void;
  onReset: () => void;
  busy: boolean;
}) {
  return (
    <Card className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
      <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-ink-850 p-0.5">
        {speeds.map((s) => (
          <button
            key={s.v}
            onClick={() => onSetSpeed(s.v)}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
              speed === s.v
                ? "bg-emerald-500/15 font-semibold text-emerald-300"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {s.icon ? <s.icon className="h-3 w-3" /> : null}
            {s.label}
          </button>
        ))}
      </div>

      <Button variant={outage ? "danger" : "ghost"} onClick={onToggleOutage}>
        <ShieldAlert className="h-3.5 w-3.5" />
        Simulate rail outage
      </Button>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={10}
          max={300}
          value={seedSize}
          onChange={(e) => setSeedSize(Number(e.target.value))}
          className="w-16 rounded-lg border border-white/10 bg-ink-850 px-2 py-1.5 text-center text-xs text-white outline-none focus:border-emerald-500/50"
        />
        <Button onClick={onSeed} disabled={busy}>
          + Add batch
        </Button>
      </div>

      <Button variant="danger" onClick={onReset} disabled={busy} className="ml-auto">
        <RotateCcw className="h-3.5 w-3.5" /> Reset world
      </Button>
    </Card>
  );
}

/* -------------------------------- charts ---------------------------------- */

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-ink-850 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 text-slate-500">{fmtSimTime(label)}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="tabular">
          {p.name}: {formatINR(Number(p.value) * 100)}
        </p>
      ))}
    </div>
  );
}

export function ChartsRow({ stats }: { stats: Stats | null }) {
  const [tick, setTick] = useState(0);
  useEffect(() => setTick((t) => t + 1), [stats?.simNow]);

  if (!stats) return null;
  const data = stats.series.map((s) => ({ ...s, time: s.t }));
  const interventions = stats.byIntervention.filter((i) => i.executed >= 3).slice(0, 8);
  const barColors = ["#34d399", "#38bdf8", "#a78bfa", "#fbbf24", "#fb7185", "#94a3b8"];

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">Cumulative money recovered</h3>
          <div className="flex gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-400" /> smart policy</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-slate-500" /> naive control</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
            <defs>
              <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#94a3b8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1c2942" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tickFormatter={(v) => fmtSimTime(v).split(" ")[1]}
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={{ stroke: "#1c2942" }}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatINR(v * 100)}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="control" name="Naive control" stroke="#94a3b8" fill="url(#gC)" strokeWidth={1.5} isAnimationActive={false} />
            <Area type="monotone" dataKey="treated" name="Smart policy" stroke="#34d399" fill="url(#gT)" strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-medium text-white">
          Success rate by intervention
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={interventions} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 30 }}>
            <CartesianGrid stroke="#1c2942" strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 1]}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={130}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v: number, _n: string, p: any) => [
                `${Math.round(v * 100)}% (${p.payload.paid}/${p.payload.executed})`,
                "paid",
              ]}
              contentStyle={{
                background: "#0e1524",
                border: "1px solid #27395c",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="rate" radius={[0, 4, 4, 0]} isAnimationActive={false} key={tick}>
              {interventions.map((_, i) => (
                <Cell key={i} fill={barColors[i % barColors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

/* ------------------------------- audit feed -------------------------------- */

const ACTOR_TONE: Record<string, "emerald" | "sky" | "violet" | "amber" | "rose" | "zinc"> = {
  rules: "sky",
  llm: "violet",
  engine: "emerald",
  guardrail: "amber",
  customer: "zinc",
  system: "rose",
};

interface AuditItem {
  id: number;
  sim_ms: number;
  leak_id: string | null;
  actor: string;
  event: string;
  detail: string;
}

export function AuditFeed({ simNow: _simNow }: { simNow?: number }) {
  const [items, setItems] = useState<AuditItem[]>([]);

  useEffect(() => {
    const load = () =>
      fetch("/api/audit")
        .then((r) => r.json())
        .then((j) => j.entries && setItems(j.entries))
        .catch(() => {});
    load();
    const iv = setInterval(load, 2000);
    return () => clearInterval(iv);
  }, []);

  return (
    <Card className="flex max-h-[520px] flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-white">
          <ListChecks className="h-4 w-4 text-emerald-400" /> Live audit ledger
        </h3>
        <span className="text-[11px] text-slate-600">append-only</span>
      </div>
      <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
        {items.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-600">No events yet</p>
        )}
        <ul className="space-y-1.5">
          {items.map((a) => (
            <li
              key={a.id}
              className="rounded-lg border border-white/[0.04] bg-ink-850/60 px-2.5 py-1.5"
            >
              <div className="flex items-center gap-1.5">
                <Badge tone={(ACTOR_TONE[a.actor] ?? "zinc") as never}>{a.actor}</Badge>
                <span className="truncate font-mono text-[11px] text-slate-300">{a.event}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-600">
                  {fmtSimTime(a.sim_ms)}
                </span>
              </div>
              {a.leak_id && (
                <p className="mt-0.5 truncate font-mono text-[10px] text-slate-600">{a.leak_id}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
