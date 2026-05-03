import crypto from 'crypto';
import { IDataService } from './dataServiceInterface';
import { SubscriptionStatus } from '../types';
import { getBillingConfig } from './subscriptionService';

const express = require('express');

const readWorkspaceId = (payload: any) => {
  const direct =
    payload?.meta?.custom_data?.workspace_id ||
    payload?.data?.attributes?.workspace_id ||
    payload?.data?.attributes?.custom_data?.workspace_id;
  if (direct) return direct;
  const userName = payload?.data?.attributes?.user_name;
  if (!userName || typeof userName !== 'string') return undefined;
  const match = userName.match(/\bT[A-Z0-9]+\b/);
  return match ? match[0] : undefined;
};

const mapStatus = (payload: any): SubscriptionStatus => {
  const status = payload?.data?.attributes?.status;
  if (status === 'active' || status === 'trialing' || status === 'past_due' || status === 'canceled') {
    return status;
  }
  const event = (payload?.meta?.event_name || '').toLowerCase();
  if (event.includes('cancel')) return 'canceled';
  if (event.includes('payment_failed')) return 'past_due';
  return 'active';
};

const getRawBody = (req: any) => {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody, 'utf8');
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  return Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
};

const validateSignature = (secret: string, payload: Buffer, signature: string) => {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

const readPlanFromVariant = (variantId?: string) => {
  if (!variantId) return undefined;
  const mapping = new Map<string, { planTier: 'up_to_25' | '25_to_100' | '100_plus'; billingPeriod: 'monthly' | 'annual' }>([
    [process.env.BILLING_PLAN_UP_TO_25_MONTHLY || '', { planTier: 'up_to_25', billingPeriod: 'monthly' }],
    [process.env.BILLING_PLAN_UP_TO_25_ANNUAL || '', { planTier: 'up_to_25', billingPeriod: 'annual' }],
    [process.env.BILLING_PLAN_25_TO_100_MONTHLY || '', { planTier: '25_to_100', billingPeriod: 'monthly' }],
    [process.env.BILLING_PLAN_25_TO_100_ANNUAL || '', { planTier: '25_to_100', billingPeriod: 'annual' }],
    [process.env.BILLING_PLAN_100_PLUS_MONTHLY || '', { planTier: '100_plus', billingPeriod: 'monthly' }],
    [process.env.BILLING_PLAN_100_PLUS_ANNUAL || '', { planTier: '100_plus', billingPeriod: 'annual' }]
  ]);
  return mapping.get(variantId);
};

const computeGracePeriodEndsAt = (currentPeriodEndsAt?: string) => {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (currentPeriodEndsAt) {
    const currentEnds = new Date(currentPeriodEndsAt).getTime();
    if (!Number.isNaN(currentEnds)) {
      const remainingMs = currentEnds - now;
      if (remainingMs > sevenDaysMs) {
        return new Date(currentEnds).toISOString();
      }
    }
  }
  return new Date(now + sevenDaysMs).toISOString();
};

export const registerBillingWebhookRoutes = (app: any, dataService: IDataService) => {
  const config = getBillingConfig();
  const rawParser = express.raw({ type: '*/*' });

  app.post('/billing/lemonsqueezy/webhook', rawParser, async (req: any, res: any) => {
    if (!config.enabled || config.provider !== 'lemonsqueezy') {
      res.status(404).send('Billing disabled');
      return;
    }
    const secret = process.env.BILLING_WEBHOOK_SECRET || '';
    if (!secret) {
      res.status(500).send('Missing webhook secret');
      return;
    }
    const signature = req.header('x-signature') || '';
    const rawBody = getRawBody(req);
    if (!validateSignature(secret, rawBody, signature)) {
      res.status(401).send('Invalid signature');
      return;
    }
    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8') || '{}');
    } catch {
      res.status(400).send('Invalid payload');
      return;
    }
    const workspaceId = readWorkspaceId(payload);
    if (!workspaceId) {
      res.status(400).send('Missing workspace id');
      return;
    }
    const status = mapStatus(payload);
    const dataType = payload?.data?.type;
    const attributes = payload?.data?.attributes || {};
    const subscriptionId = payload?.data?.id;
    const customerId = attributes.customer_id;
    const variantId = attributes.variant_id;
    const plan = readPlanFromVariant(variantId);
    const trialEndsAt = attributes.trial_ends_at || undefined;
    const currentPeriodEndsAt = attributes.renews_at || attributes.ends_at || undefined;
    const existing = await dataService.getWorkspaceSubscription(workspaceId);
    let nextTrialEndsAt = trialEndsAt;
    if (existing?.trialEndsAt) {
      const existingDate = new Date(existing.trialEndsAt).getTime();
      const incomingDate = trialEndsAt ? new Date(trialEndsAt).getTime() : NaN;
      if (!Number.isNaN(existingDate) && !Number.isNaN(incomingDate) && incomingDate > existingDate) {
        nextTrialEndsAt = existing.trialEndsAt;
      }
    }

    const requiredPlanTier = existing?.requiredPlanTier;
    const isTierMismatch = requiredPlanTier && plan?.planTier &&
      ['up_to_25', '25_to_100', '100_plus'].indexOf(plan.planTier) <
        ['up_to_25', '25_to_100', '100_plus'].indexOf(requiredPlanTier);
    const nextStatus = isTierMismatch ? 'past_due' : status;
    const gracePeriodEndsAt = isTierMismatch
      ? computeGracePeriodEndsAt(currentPeriodEndsAt)
      : existing?.gracePeriodEndsAt;

    const isInvoice = dataType === 'subscription-invoices';
    const lastInvoiceAmount = isInvoice ? attributes.total : existing?.lastInvoiceAmount;
    const lastInvoiceCurrency = isInvoice ? attributes.currency : existing?.lastInvoiceCurrency;
    const lastInvoiceAt = isInvoice ? attributes.updated_at || attributes.created_at : existing?.lastInvoiceAt;
    const resolvedSubscriptionId =
      (isInvoice ? attributes.subscription_id : subscriptionId) || existing?.providerSubscriptionId;

    await dataService.upsertWorkspaceSubscription({
      workspaceId,
      status: nextStatus,
      provider: 'lemonsqueezy',
      providerSubscriptionId: resolvedSubscriptionId,
      providerCustomerId: customerId || existing?.providerCustomerId,
      planTier: plan?.planTier || existing?.planTier,
      requiredPlanTier,
      billingPeriod: plan?.billingPeriod || existing?.billingPeriod,
      productName: attributes.product_name || existing?.productName,
      variantName: attributes.variant_name || existing?.variantName,
      statusLabel: attributes.status_formatted || existing?.statusLabel,
      trialEndsAt: nextTrialEndsAt || existing?.trialEndsAt,
      currentPeriodEndsAt: currentPeriodEndsAt || existing?.currentPeriodEndsAt,
      gracePeriodEndsAt,
      lastInvoiceAmount,
      lastInvoiceCurrency,
      lastInvoiceAt,
      updatedAt: new Date().toISOString()
    });

    res.status(200).send('ok');
  });
};
