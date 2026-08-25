# RecoverFlow — AI Revenue Recovery OS

**Razorpay AI Buildathon · Track 03 (AI Revenue Recovery)**

A self-driving recovery engine that detects revenue leaking out of a merchant account, diagnoses *why* each leak happened, and executes **bounded** recovery playbooks — proving every rupee it recovers against a naive-baseline control cohort running on the same batch.

```
detect ──▶ diagnose ──▶ decide ──▶ guardrail ──▶ execute ──▶ measure
(webhook/   decline-code   bounded      deterministic    retries,     ₹ recovered vs
 batch)     → root cause   playbook     policy engine    nudges,      naive baseline,
            (+ LLM story)  per cause    + audit ledger   promises     net of channel cost
```

## The bar, hit explicitly

| Track requirement | Where it lives |
|---|---|
| Measured money recovered across a batch | Hero metric: treatment vs control cohorts seeded from the same distribution; cumulative recovery chart; per-intervention success rates |
| Compliant escalation | Quiet hours (21:30–08:00 IST), cross-channel frequency cap (2 comms / 48 h / customer), channel-cost accounting |
| Stopping rules | Max-touch caps per playbook, 14-day expiry, hard stop on DNC, dead mandates are **never retried** (blocked by guardrail), exhausted cases escalate to a human queue instead of being silently dropped |
| Audit trail | Append-only `audit` table: every detection, diagnosis, guardrail verdict, touch, outcome and customer reply — visible live in the UI and per-leak |
| One failure handled gracefully | Two: (1) customer replies STOP → DNC enforced instantly across every open leak for that customer; (2) simulated payment-rail outage → retries back off exponentially while comms continue |

## Why the numbers are honest

- ~28% of every batch is assigned to a **control cohort** that runs the naive policy most merchants use: blind fixed-interval retries regardless of cause.
- Response outcomes come from a planted ground-truth model (liquidity failures recover after payday, gateway blips recover on quick retry, dead mandates don't recover at all…).
- Every leak carries hidden ground truth (`planted_truth`) so diagnosis accuracy is scoreable, not vibes.
- Channel costs (WhatsApp ₹0.35, SMS ₹0.20, email ₹0.05, voice ₹2.50) are netted out of the headline number.
- Batches are **seeded & reproducible** (`seed=42`) — judges can replay the exact world.

## Architecture

- **Next.js 14 + TypeScript + Tailwind** — single app, dashboard-first UI
- **SQLite (better-sqlite3)** — embedded, zero-service, WAL mode
- **Sim clock** — virtual time with speed control (pause → 1800×); the whole ladder plays out in minutes during a pitch
- **Guardrails are deterministic code**; the LLM (optional Gemini free tier) only enriches diagnosis narratives — it can never move money or change timing/channel
- **Razorpay-native**: HMAC-verified webhook receiver (`payment.failed`, `payment_link.paid`) ingests real test-mode events into the same pipeline when keys are set; otherwise pure simulator

### Playbooks (bounded, cause-aware)

| Root cause | Strategy |
|---|---|
| Soft decline (insufficient funds) | Smart retry timed to customer's payday window → WhatsApp UPI link → post-payday retry → Hinglish voice stub |
| Transient error (gateway/network) | Immediate retry → delayed retry → payment link |
| Auth required | Resume-session link (retries are useless here) |
| Dead mandate (cancelled/closed) | **No retries ever** — re-registration link only, then human queue |
| Checkout abandonment | WhatsApp cart link within the hour (value decays fast) → email → final SMS |

Promise-to-pay replies pause the ladder until the promised day; kept promises auto-recover, broken ones get one final polite touch then close.

## Run it

```bash
npm install
npm run dev        # http://localhost:3100
```

Click **Seed batch & start engine**, set speed 120×–600×, watch money get recovered.

Optional env (all free-tier): `.env.example` — `GEMINI_API_KEY` for LLM-enriched narratives, Razorpay test keys + webhook secret for live ingestion.

## 5-minute demo script

1. Seed 80 leaks @ seed 42 → point out the two cohorts in the leak table.
2. Speed 600×. Watch stat cards + cumulative chart separate: smart policy vs naive baseline.
3. Open any dead-mandate leak → show the guardrail block ("never_retry_dead_mandate") and its audit entry.
4. Click "Replies STOP" on an active leak → show instant global DNC enforcement in the audit ledger.
5. Toggle "Simulate rail outage" → retries back off exponentially, comms continue, nothing corrupts.
6. Close on the hero number: net incremental ₹ = treatment − naive control − channel cost.
