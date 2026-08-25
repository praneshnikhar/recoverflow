import type { CauseClass } from "./types";

export interface CauseDef {
  code: string;
  label: string;
  cause_class: CauseClass;
  rail: string;
}

export const CAUSES: Record<string, CauseDef> = {
  INSUFFICIENT_FUNDS: {
    code: "INSUFFICIENT_FUNDS",
    label: "Insufficient balance",
    cause_class: "soft_decline",
    rail: "upi",
  },
  GATEWAY_ERROR: {
    code: "GATEWAY_ERROR",
    label: "Gateway / bank downtime",
    cause_class: "transient_error",
    rail: "card",
  },
  NETWORK_ERROR: {
    code: "NETWORK_ERROR",
    label: "Network timeout",
    cause_class: "transient_error",
    rail: "upi",
  },
  AUTHENTICATION_REQUIRED: {
    code: "AUTHENTICATION_REQUIRED",
    label: "Step-up auth not completed",
    cause_class: "auth_required",
    rail: "card",
  },
  MANDATE_CANCELLED: {
    code: "MANDATE_CANCELLED",
    label: "Mandate cancelled by customer",
    cause_class: "dead_mandate",
    rail: "nach",
  },
  ACCOUNT_CLOSED: {
    code: "ACCOUNT_CLOSED",
    label: "Bank account closed",
    cause_class: "dead_mandate",
    rail: "nach",
  },
  ABANDONED_CHECKOUT: {
    code: "ABANDONED_CHECKOUT",
    label: "Checkout abandoned",
    cause_class: "abandonment",
    rail: "any",
  },
};

export const CLASS_LABELS: Record<CauseClass, string> = {
  soft_decline: "Soft decline (liquidity)",
  transient_error: "Transient error",
  auth_required: "Auth pending",
  dead_mandate: "Dead mandate",
  abandonment: "Checkout abandonment",
};

export const CHANNEL_COST_PAISE: Record<string, number> = {
  retry: 0,
  whatsapp: 35,
  sms: 20,
  email: 5,
  voice: 250,
};

export function isCommChannel(channel: string): boolean {
  return channel === "whatsapp" || channel === "sms" || channel === "email" || channel === "voice";
}
