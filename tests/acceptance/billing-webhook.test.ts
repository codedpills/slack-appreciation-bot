import { newDb } from 'pg-mem';
import { ExpressReceiver } from '@slack/bolt';
import crypto from 'crypto';
import http from 'http';
import { createDataService } from '../../src/services/dataServicePg';
import { registerBillingWebhookRoutes } from '../../src/services/billingWebhook';

const postJson = (
  server: http.Server,
  path: string,
  body: string,
  headers: Record<string, string>
) => new Promise<{ status: number; body: string }>((resolve, reject) => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    reject(new Error('Server not listening on a port'));
    return;
  }
  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: address.port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers
      }
    },
    res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, body: data });
      });
    }
  );
  req.on('error', reject);
  req.write(body);
  req.end();
});

describe('Billing webhook', () => {
  const webhookSecret = 'whsec-test';

  beforeEach(() => {
    process.env.BILLING_ENABLED = 'true';
    process.env.BILLING_WEBHOOK_SECRET = webhookSecret;
    process.env.BILLING_PLAN_UP_TO_25_MONTHLY = 'var_monthly_25';
  });

  afterEach(() => {
    delete process.env.BILLING_ENABLED;
    delete process.env.BILLING_WEBHOOK_SECRET;
    delete process.env.BILLING_PLAN_UP_TO_25_MONTHLY;
  });

  test('accepts valid webhook and stores subscription', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    const dataService = createDataService({ pool });

    const receiver = new ExpressReceiver({ signingSecret: 'test' });
    registerBillingWebhookRoutes(receiver.app, dataService);

    const server = receiver.app.listen(0);
    try {
      const payload = {
        meta: {
          event_name: 'subscription_created',
          custom_data: { workspace_id: 'T1' }
        },
        data: {
          id: 'sub_123',
          attributes: {
            status: 'active',
            customer_id: 'cus_123',
            variant_id: 'var_monthly_25',
            trial_ends_at: null,
            ends_at: null,
            renews_at: '2026-01-01T00:00:00Z'
          }
        }
      };
      const body = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');

      const response = await postJson(
        server,
        '/billing/lemonsqueezy/webhook',
        body,
        { 'x-signature': signature }
      );

      expect(response.status).toBe(200);

      const record = await dataService.getWorkspaceSubscription('T1');
      expect(record).toEqual(
        expect.objectContaining({
          workspaceId: 'T1',
          status: 'active',
          provider: 'lemonsqueezy',
          providerSubscriptionId: 'sub_123',
          providerCustomerId: 'cus_123',
          planTier: 'up_to_25',
          billingPeriod: 'monthly'
        })
      );
    } finally {
      server.close();
      await pool.end();
    }
  });

  test('rejects invalid signature', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    const dataService = createDataService({ pool });

    const receiver = new ExpressReceiver({ signingSecret: 'test' });
    registerBillingWebhookRoutes(receiver.app, dataService);

    const server = receiver.app.listen(0);
    try {
      const payload = {
        meta: {
          event_name: 'subscription_created',
          custom_data: { workspace_id: 'T1' }
        },
        data: {
          id: 'sub_123',
          attributes: {
            status: 'active',
            customer_id: 'cus_123',
            trial_ends_at: null,
            ends_at: null,
            renews_at: '2026-01-01T00:00:00Z'
          }
        }
      };
      const body = JSON.stringify(payload);

      const response = await postJson(
        server,
        '/billing/lemonsqueezy/webhook',
        body,
        { 'x-signature': 'bad-signature' }
      );

      expect(response.status).toBe(401);

      const record = await dataService.getWorkspaceSubscription('T1');
      expect(record).toBeNull();
    } finally {
      server.close();
      await pool.end();
    }
  });

  test('does not extend trial on upgrade', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    const dataService = createDataService({ pool });

    await dataService.upsertWorkspaceSubscription({
      workspaceId: 'T1',
      status: 'active',
      provider: 'lemonsqueezy',
      providerSubscriptionId: 'sub_123',
      trialEndsAt: '2026-01-01T00:00:00Z'
    });

    const receiver = new ExpressReceiver({ signingSecret: 'test' });
    registerBillingWebhookRoutes(receiver.app, dataService);

    const server = receiver.app.listen(0);
    try {
      const payload = {
        meta: {
          event_name: 'subscription_updated',
          custom_data: { workspace_id: 'T1' }
        },
        data: {
          id: 'sub_123',
          attributes: {
            status: 'active',
            customer_id: 'cus_123',
            trial_ends_at: '2026-03-01T00:00:00Z',
            ends_at: null,
            renews_at: '2026-02-01T00:00:00Z'
          }
        }
      };
      const body = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');

      const response = await postJson(
        server,
        '/billing/lemonsqueezy/webhook',
        body,
        { 'x-signature': signature }
      );

      expect(response.status).toBe(200);

      const record = await dataService.getWorkspaceSubscription('T1');
      expect(record?.trialEndsAt).toBe('2026-01-01T00:00:00Z');
    } finally {
      server.close();
      await pool.end();
    }
  });
});
