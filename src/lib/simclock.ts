import { getMeta, setMeta } from "./db";

const ANCHOR_REAL = "sim_anchor_real_ms";
const ANCHOR_SIM = "sim_anchor_sim_ms";
const SPEED_KEY = "speed";

const DAY_MS = 24 * 60 * 60 * 1000;

function anchor(): { real: number; sim: number; speed: number } {
  const real = Number(getMeta(ANCHOR_REAL) ?? Date.now());
  const sim = Number(getMeta(ANCHOR_SIM) ?? Date.now());
  const speed = Number(getMeta(SPEED_KEY) ?? 120);
  return { real, sim, speed };
}

export function initClock() {
  if (getMeta(ANCHOR_REAL) == null) {
    setMeta(ANCHOR_REAL, String(Date.now()));
    setMeta(ANCHOR_SIM, String(Date.now()));
    setMeta(SPEED_KEY, "120");
  }
}

/** Current simulated wall-clock in ms. At speed=120, 1 real sec = 2 sim minutes. */
export function simNow(): number {
  const { real, sim, speed } = anchor();
  return Math.round(sim + (Date.now() - real) * speed);
}

export function getSpeed(): number {
  return anchor().speed;
}

export function setSpeed(next: number): number {
  const nowSim = simNow();
  setMeta(SPEED_KEY, String(next));
  setMeta(ANCHOR_REAL, String(Date.now()));
  setMeta(ANCHOR_SIM, String(nowSim));
  return next;
}

export function hourOfDay(simMs: number): number {
  return Math.floor((simMs / 3600000) % 24);
}

/** RBI-style quiet hours for outbound comms: 21:30–08:00. Returns next allowed ms if quiet. */
export function quietHoursReschedule(simMs: number): number | null {
  const h = (simMs / 3600000) % 24;
  if (h >= 21.5) {
    return simMs + (24 - h + 8) * 3600000;
  }
  if (h < 8) {
    return simMs + (8 - h) * 3600000;
  }
  return null;
}

export function daysUntilPayday(simMs: number, paydayDom: number): number {
  const d = new Date(simMs);
  const today = d.getDate();
  let diff = paydayDom - today;
  while (diff < -3) diff += 30;
  while (diff > 27) diff -= 30;
  void DAY_MS;
  return diff;
}
