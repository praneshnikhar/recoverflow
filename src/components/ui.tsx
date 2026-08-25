"use client";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.06] bg-ink-900/80 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]",
        className
      )}
    >
      {children}
    </div>
  );
}

const btnVariants = {
  primary: "bg-emerald-500 hover:bg-emerald-400 text-ink-950 font-semibold",
  ghost: "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06]",
  danger: "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30",
  warn: "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30",
};

export function Button({
  variant = "ghost",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof btnVariants;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors disabled:opacity-40 disabled:pointer-events-none",
        btnVariants[variant],
        className
      )}
      {...props}
    />
  );
}

const toneMap = {
  emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  rose: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  sky: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  violet: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  orange: "bg-orange-500/10 text-orange-300 border-orange-500/20",
  zinc: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
};

export type Tone = keyof typeof toneMap;

export function Badge({
  tone = "zinc",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] leading-tight whitespace-nowrap",
        toneMap[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
