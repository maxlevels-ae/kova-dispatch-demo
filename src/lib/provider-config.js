import { z } from "zod";
export const providerRegistry = {
  paymob: {
    name: "Paymob",
    kind: "payment",
    credential: "PAYMOB_API_KEY",
    webhookSecret: "PAYMOB_HMAC_SECRET",
    docs: "https://developers.paymob.com/",
  },
  fawry: {
    name: "Fawry",
    kind: "payment",
    credential: "FAWRY_SECURE_KEY",
    webhookSecret: "FAWRY_SECURE_KEY",
    docs: "https://developer.fawrystaging.com/",
  },
  stripe: {
    name: "Stripe",
    kind: "payment",
    credential: "STRIPE_SECRET_KEY",
    webhookSecret: "STRIPE_WEBHOOK_SECRET",
    docs: "https://docs.stripe.com/",
  },
  email: {
    name: "Email",
    kind: "notification",
    credential: "NOTIFICATION_EMAIL_API_KEY",
  },
  sms: {
    name: "SMS",
    kind: "notification",
    credential: "NOTIFICATION_SMS_API_KEY",
  },
  whatsapp: {
    name: "WhatsApp Business",
    kind: "notification",
    credential: "WHATSAPP_ACCESS_TOKEN",
  },
  push: { name: "Push", kind: "notification", credential: "PUSH_PRIVATE_KEY" },
};
export const providerSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    active: z.literal(false),
    mode: z.enum(["sandbox", "live"]),
    accountId: z.string().trim().max(120),
    currency: z.literal("EGP"),
    methods: z.array(z.enum(["card", "wallet", "cash_reference"])).max(3),
    webhookUrl: z.union([
      z.literal(""),
      z.url().refine((v) => v.startsWith("https://"), "HTTPS required"),
    ]),
  })
  .strict();
export function providerReadiness(id, env = process.env) {
  const p = providerRegistry[id];
  if (!p) throw Error("Unknown provider");
  return {
    credentialConfigured: Boolean(env[p.credential]),
    webhookSecretConfigured: Boolean(p.webhookSecret && env[p.webhookSecret]),
    active: false,
    status: env[p.credential] ? "Verification required" : "Not configured",
    connection: "Not tested",
    reason:
      "Adapter eligibility and sandbox delivery/payment flow are not verified. No external request was sent.",
  };
}
