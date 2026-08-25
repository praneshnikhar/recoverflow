import type { CauseClass, Step } from "./types";
import { CHANNEL_COST_PAISE } from "./taxonomy";

function s(
  id: string,
  delayMin: number,
  channel: Step["channel"],
  kind: string
): Step {
  return { id, delayMin, channel, kind, costPaise: CHANNEL_COST_PAISE[channel] ?? 0 };
}

/** Bounded ladders — max 3-4 touches per leak, then stop. Delays in simulated minutes. */
export const PLAYBOOKS: Record<CauseClass, Step[]> = {
  soft_decline: [
    s("retry_payday_window", 360, "retry", "smart_retry"),
    s("wa_upi_link", 1080, "whatsapp", "upi_link_nudge"),
    s("retry_post_payday", 2520, "retry", "smart_retry"),
    s("voice_hinglish", 3960, "voice", "voice_recovery"),
  ],
  transient_error: [
    s("quick_retry", 10, "retry", "immediate_retry"),
    s("retry_2h", 120, "retry", "delayed_retry"),
    s("wa_link", 300, "whatsapp", "pay_link_nudge"),
  ],
  auth_required: [
    s("wa_auth_link", 30, "whatsapp", "secure_auth_link"),
    s("email_reminder", 720, "email", "auth_reminder"),
    s("sms_final", 1800, "sms", "final_auth_nudge"),
  ],
  dead_mandate: [
    s("reauth_wa", 240, "whatsapp", "mandate_reauth_link"),
    s("reauth_email", 1440, "email", "mandate_reauth_email"),
  ],
  abandonment: [
    s("wa_cart_recovery", 45, "whatsapp", "cart_recovery_link"),
    s("email_reminder", 360, "email", "cart_reminder"),
    s("sms_final", 1560, "sms", "final_cart_nudge"),
  ],
};

export const MAX_ATTEMPTS: Record<CauseClass, number> = {
  soft_decline: 4,
  transient_error: 3,
  auth_required: 3,
  dead_mandate: 2,
  abandonment: 3,
};

/** Naive baseline: what a merchant without intelligence does — fixed daily retries regardless of cause. */
export const CONTROL_PLAYBOOK: Step[] = [
  s("naive_retry_1", 1440, "retry", "blind_retry"),
  s("naive_retry_2", 2880, "retry", "blind_retry"),
  s("naive_retry_3", 4320, "retry", "blind_retry"),
];

export const CONTROL_MAX_ATTEMPTS = 3;
