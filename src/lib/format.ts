export function formatINR(paise: number): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`;
  return `${sign}₹${abs.toFixed(abs % 1 === 0 ? 0 : 2)}`;
}

export function formatINRFull(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function fmtSimTime(simMs: number): string {
  const d = new Date(simMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relDelay(fromSim: number, toSim: number): string {
  const mins = Math.round((toSim - fromSim) / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `+${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `+${hrs}h`;
  return `+${Math.floor(hrs / 24)}d`;
}
