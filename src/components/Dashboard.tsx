"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  RotateCcw,
  Waves,
  Zap,
  Pause,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, Card } from "./ui";
import { HeroBand, ControlsCard, ChartsRow, AuditFeed } from "./panels";
import { LeakTable, LeakDetailPanel } from "./leaks";
import type { Leak, Stats } from "./types";

const SPEEDS = [
  { v: 0, label: "Pause", icon: Pause },
  { v: 1, label: "1×" },
  { v: 60, label: "60×" },
  { v: 120, label: "120×" },
  { v: 600, label: "600×" },
];

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Stats | null>(null);
  const [leaks, setLeaks] = useState<Leak[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seedSize, setSeedSize] = useState(80);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      await fetch("/api/tick", { method: "POST" });
      const [m, l] = await Promise.all([
        fetch("/api/metrics").then((r) => r.json()),
        fetch("/api/state").then((r) => r.json()),
      ]);
      if (m.stats) setMetrics(m.stats);
      if (l.leaks) setLeaks(l.leaks);
    } catch {
      // server restarting — next poll will recover
    }
  }, []);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const seed = async () => {
    setBusy(true);
    await fetch("/api/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size: seedSize, seed: 42 }),
    });
    await refresh();
    setBusy(false);
  };

  const setSpeed = async (v: number) => {
    setMetrics((m) => (m ? { ...m, speed: v } : m));
    await fetch("/api/speed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speed: v }),
    });
  };

  const toggleOutage = async () => {
    const res = await fetch("/api/outage", { method: "POST" });
    const j = await res.json();
    setMetrics((m) => (m ? { ...m, outage: j.outage } : m));
  };

  const resetAll = async () => {
    setBusy(true);
    setSelectedId(null);
    await fetch("/api/reset", { method: "POST" });
    await refresh();
    setBusy(false);
  };

  const hasData = leaks.length > 0;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-5 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
            <Waves className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">
              RecoverFlow
            </h1>
            <p className="text-xs text-slate-500">
              AI Revenue Recovery OS · Track 03 · bounded, auditable, measured
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {metrics?.outage && (
            <Badge tone="rose" className="animate-pulse gap-1 px-2 py-1">
              <AlertTriangle className="h-3 w-3" /> Rails degraded — retry backoff active
            </Badge>
          )}
          <Badge tone={metrics && metrics.speed > 0 ? "emerald" : "zinc"} className="gap-1 px-2 py-1">
            <Activity className="h-3 w-3" />
            engine {metrics?.speed ? `${metrics.speed}×` : "paused"}
          </Badge>
        </div>
      </header>

      {!hasData ? (
        <EmptyState
          seedSize={seedSize}
          setSeedSize={setSeedSize}
          onSeed={seed}
          busy={busy}
        />
      ) : (
        <>
          <HeroBand stats={metrics} />
          <ControlsCard
            speed={metrics?.speed ?? 120}
            speeds={SPEEDS}
            onSetSpeed={setSpeed}
            outage={!!metrics?.outage}
            onToggleOutage={toggleOutage}
            onSeed={seed}
            seedSize={seedSize}
            setSeedSize={setSeedSize}
            onReset={resetAll}
            busy={busy}
          />
          <ChartsRow stats={metrics} />
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <LeakTable
                leaks={leaks}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
            <AuditFeed simNow={metrics?.simNow} />
          </div>
        </>
      )}

      {selectedId && (
        <DrawerShell onClose={() => setSelectedId(null)}>
          <LeakDetailPanel leakId={selectedId} onChanged={refresh} />
        </DrawerShell>
      )}
    </div>
  );
}

function EmptyState({
  seedSize,
  setSeedSize,
  onSeed,
  busy,
}: {
  seedSize: number;
  setSeedSize: (n: number) => void;
  onSeed: () => void;
  busy: boolean;
}) {
  return (
    <Card className="mx-auto mt-24 max-w-xl p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/25">
        <Zap className="h-7 w-7 text-emerald-400" />
      </div>
      <h2 className="text-xl font-semibold text-white">Run a recovery batch</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
        Seeds a synthetic merchant batch of failed payments, abandoned checkouts and
        broken mandates — each with a hidden ground-truth cause. The engine detects,
        diagnoses and executes bounded playbooks. A naive-baseline control cohort runs
        alongside so recovered money is honestly measured.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <input
          type="number"
          min={10}
          max={300}
          value={seedSize}
          onChange={(e) => setSeedSize(Number(e.target.value))}
          className="w-24 rounded-lg border border-white/10 bg-ink-850 px-3 py-2 text-center text-sm text-white outline-none focus:border-emerald-500/50"
        />
        <Button variant="primary" onClick={onSeed} disabled={busy}>
          {busy ? "Seeding…" : "Seed batch & start engine"}
        </Button>
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-600">
        <ShieldCheck className="h-3.5 w-3.5" /> Simulator mode — no real money moves. Razorpay
        test-mode webhooks supported.
      </p>
    </Card>
  );
}

function DrawerShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-ink-900 p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
