import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecoverFlow — AI Revenue Recovery OS",
  description:
    "Detect revenue at risk, diagnose why, execute bounded recovery workflows. Measured money recovered, compliant escalation, stopping rules, audit trail.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
