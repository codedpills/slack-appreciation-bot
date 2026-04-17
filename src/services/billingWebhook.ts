import crypto from 'crypto';
import { IDataService } from './dataServiceInterface';
import { SubscriptionStatus } from '../types';
import { getBillingConfig } from './subscriptionService';

const express = require('express');

const readWorkspaceId = (payload: any) => {
  return (
    payload?.meta?.custom_data?.workspace_id ||
    payload?.data?.attributes?.workspace_id ||
    payload?.data?.attributes?.custom_data?.workspace_id
  );
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
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return JSON.stringify(req.body ?? {});
};

const validateSignature = (secret: string, payload: string, signature: string) => {
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

export const registerBillingWebhookRoutes = (app: any, dataService: IDataService) => {
  const config = getBillingConfig();
  const rawParser = express.text({ type: '*/*' });

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
      payload = JSON.parse(rawBody || '{}');
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

    await dataService.upsertWorkspaceSubscription({
      workspaceId,
      status,
      provider: 'lemonsqueezy',
      providerSubscriptionId: subscriptionId,
      providerCustomerId: customerId,
      planTier: plan?.planTier,
      billingPeriod: plan?.billingPeriod,
      trialEndsAt: nextTrialEndsAt,
      currentPeriodEndsAt,
      updatedAt: new Date().toISOString()
    });

    res.status(200).send('ok');
  });
};
