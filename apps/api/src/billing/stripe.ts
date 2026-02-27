/**
 * xShield Stripe Billing
 *
 * Handles subscription checkout, customer portal, and webhook processing.
 * Tied to XShieldApiKey tier — B2B API access billing.
 *
 * Plans:
 *   STARTER  — $99/month   — 500 scans/month, domain watch, playbooks
 *   PRO      — $499/month  — unlimited scans, all features, SLA
 *   ENTERPRISE — custom    — volume pricing, dedicated support
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   STRIPE_STARTER_PRICE_ID
 *   STRIPE_PRO_PRICE_ID
 *   XSHIELD_BASE_URL  (e.g. https://xshieldai.com)
 */

import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

// ── Stripe client ─────────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key, { apiVersion: '2024-12-18.acacia' });
}

// ── Plan config ───────────────────────────────────────────────────────────────

export const PLANS = {
  STARTER: {
    name: 'xShield Starter',
    price: 99,
    currency: 'usd',
    interval: 'month' as const,
    scans: 500,
    features: [
      '500 domain scans/month',
      'Domain Watch (up to 10 domains)',
      'Remediation Playbooks',
      'MITRE ATT&CK mapping',
      'Email alerts',
      'API access',
    ],
    priceId: () => process.env.STRIPE_STARTER_PRICE_ID ?? '',
  },
  PRO: {
    name: 'xShield Pro',
    price: 499,
    currency: 'usd',
    interval: 'month' as const,
    scans: -1, // unlimited
    features: [
      'Unlimited domain scans',
      'Unlimited Domain Watch',
      'Remediation Playbooks',
      'MITRE ATT&CK + Navigator export',
      'All alert channels (Slack, WhatsApp, PagerDuty)',
      'Supply chain scanning',
      'SLA 99.9% uptime',
      'Priority support',
    ],
    priceId: () => process.env.STRIPE_PRO_PRICE_ID ?? '',
  },
} as const;

export type PlanKey = keyof typeof PLANS;

// ── Quota limits per tier ─────────────────────────────────────────────────────

export const TIER_QUOTAS: Record<string, number> = {
  FREE: 10,
  STARTER: 500,
  PRO: Infinity,
  ENTERPRISE: Infinity,
};

// ── Rate limit headers helper ─────────────────────────────────────────────────

export interface QuotaInfo {
  limit: number;
  used: number;
  remaining: number;
  resetAt: Date;
}

export function quotaHeaders(info: QuotaInfo): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(info.limit === Infinity ? 999999 : info.limit),
    'X-RateLimit-Remaining': String(
      Math.max(0, info.remaining === Infinity ? 999999 : info.remaining)
    ),
    'X-RateLimit-Reset': String(Math.floor(info.resetAt.getTime() / 1000)),
    'X-RateLimit-Resource': 'xshield-scans',
  };
}

// ── Checkout session ──────────────────────────────────────────────────────────

export interface CheckoutResult {
  sessionId: string;
  url: string;
}

export async function createCheckoutSession(opts: {
  plan: PlanKey;
  email: string;
  apiKeyId: string;
  stripeCustomerId?: string;
}): Promise<CheckoutResult> {
  const stripe = getStripe();
  const plan = PLANS[opts.plan];
  const priceId = plan.priceId();
  const base = process.env.XSHIELD_BASE_URL ?? 'https://xshieldai.com';

  if (!priceId) {
    throw new Error(`STRIPE_${opts.plan}_PRICE_ID is not configured`);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    // Pre-fill email if known
    customer_email: opts.stripeCustomerId ? undefined : opts.email,
    customer: opts.stripeCustomerId,
    success_url: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/pricing`,
    metadata: {
      apiKeyId: opts.apiKeyId,
      plan: opts.plan,
      email: opts.email,
    },
    subscription_data: {
      metadata: {
        apiKeyId: opts.apiKeyId,
        plan: opts.plan,
      },
    },
    allow_promotion_codes: true,
  });

  return { sessionId: session.id, url: session.url! };
}

// ── Customer portal ───────────────────────────────────────────────────────────

export async function createPortalSession(stripeCustomerId: string): Promise<string> {
  const stripe = getStripe();
  const base = process.env.XSHIELD_BASE_URL ?? 'https://xshieldai.com';

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${base}/dashboard`,
  });

  return session.url;
}

// ── Webhook processing ────────────────────────────────────────────────────────

export async function handleWebhookEvent(
  rawBody: Buffer,
  signature: string,
  prisma: PrismaClient
): Promise<{ processed: boolean; event: string }> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await onCheckoutComplete(session, stripe, prisma);
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      await onSubscriptionUpdated(sub, stripe, prisma);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await onSubscriptionDeleted(sub, prisma);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await onPaymentFailed(invoice, prisma);
      break;
    }
    default:
      return { processed: false, event: event.type };
  }

  return { processed: true, event: event.type };
}

// ── Webhook handlers ──────────────────────────────────────────────────────────

async function onCheckoutComplete(
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  prisma: PrismaClient
): Promise<void> {
  const apiKeyId = session.metadata?.apiKeyId;
  const plan = session.metadata?.plan as PlanKey | undefined;
  if (!apiKeyId || !plan) return;

  // Get the subscription to store stripeCustomerId + subscriptionId
  const subscriptionId = session.subscription as string;
  const customerId = session.customer as string;

  // Update the API key tier
  await (prisma as any).xShieldApiKey.update({
    where: { id: apiKeyId },
    data: {
      tier: plan,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      monthlyQuota: TIER_QUOTAS[plan] === Infinity ? 999999 : TIER_QUOTAS[plan],
      usedThisMonth: 0,
      quotaResetAt: nextMonthStart(),
    },
  });
}

async function onSubscriptionUpdated(
  sub: Stripe.Subscription,
  stripe: Stripe,
  prisma: PrismaClient
): Promise<void> {
  const apiKeyId = sub.metadata?.apiKeyId;
  if (!apiKeyId) return;

  // Determine the new plan from the price ID
  const priceId = sub.items.data[0]?.price.id;
  const plan = resolvePlanFromPriceId(priceId);
  if (!plan) return;

  await (prisma as any).xShieldApiKey.update({
    where: { id: apiKeyId },
    data: {
      tier: plan,
      monthlyQuota: TIER_QUOTAS[plan] === Infinity ? 999999 : TIER_QUOTAS[plan],
    },
  });
}

async function onSubscriptionDeleted(
  sub: Stripe.Subscription,
  prisma: PrismaClient
): Promise<void> {
  const apiKeyId = sub.metadata?.apiKeyId;
  if (!apiKeyId) return;

  // Downgrade to FREE on cancellation
  await (prisma as any).xShieldApiKey.update({
    where: { id: apiKeyId },
    data: {
      tier: 'FREE',
      monthlyQuota: TIER_QUOTAS.FREE,
      stripeSubscriptionId: null,
    },
  });
}

async function onPaymentFailed(invoice: Stripe.Invoice, prisma: PrismaClient): Promise<void> {
  // Find the API key by stripeCustomerId
  const customerId = invoice.customer as string;
  if (!customerId) return;

  const key = await (prisma as any).xShieldApiKey.findFirst({
    where: { stripeCustomerId: customerId },
  });
  if (!key) return;

  // Don't downgrade immediately on first failure — Stripe will retry
  // Just log it. After 3 retries Stripe fires subscription.deleted.
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

function resolvePlanFromPriceId(priceId: string | undefined): PlanKey | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return 'STARTER';
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'PRO';
  return null;
}
