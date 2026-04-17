import { newDb } from 'pg-mem';
import { createDataService } from '../../src/services/dataServicePg';
import { SubscriptionService } from '../../src/services/subscriptionService';
import { mapUserCountToPlanTier, WorkspaceUsageService } from '../../src/services/workspaceUsageService';

describe('WorkspaceUsageService', () => {
  test('maps user counts to plan tiers', () => {
    expect(mapUserCountToPlanTier(0)).toBe('up_to_25');
    expect(mapUserCountToPlanTier(25)).toBe('up_to_25');
    expect(mapUserCountToPlanTier(26)).toBe('25_to_100');
    expect(mapUserCountToPlanTier(100)).toBe('25_to_100');
    expect(mapUserCountToPlanTier(101)).toBe('100_plus');
  });

  test('refreshes workspace user count and updates subscription', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    const dataService = createDataService({ pool });
    const subscriptionService = new SubscriptionService(dataService, {
      enabled: true,
      provider: 'lemonsqueezy',
      trialDays: 30
    });
    const usageService = new WorkspaceUsageService(dataService, subscriptionService);

    const client = {
      team: {
        info: jest.fn().mockResolvedValue({ team: { num_members: 42 } })
      }
    } as any;

    try {
      const result = await usageService.refreshWorkspaceUserCount('T1', client);
      expect(result).toEqual({ userCount: 42, planTier: '25_to_100' });

      const subscription = await dataService.getWorkspaceSubscription('T1');
      expect(subscription).toEqual(
        expect.objectContaining({
          workspaceId: 'T1',
          status: 'trialing',
          lastUserCount: 42,
          planTier: '25_to_100'
        })
      );
    } finally {
      await pool.end();
    }
  });

  test('notifies admins when plan tier changes', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    const dataService = createDataService({ pool });
    const subscriptionService = new SubscriptionService(dataService, {
      enabled: true,
      provider: 'lemonsqueezy',
      trialDays: 30
    });
    const usageService = new WorkspaceUsageService(dataService, subscriptionService);

    await dataService.upsertWorkspaceSubscription({
      workspaceId: 'T1',
      status: 'active',
      planTier: 'up_to_25'
    });

    const client = {
      team: {
        info: jest.fn().mockResolvedValue({ team: { num_members: 120 } })
      },
      users: {
        list: jest.fn().mockResolvedValue({
          ok: true,
          members: [
            { id: 'U1', is_admin: true, deleted: false },
            { id: 'U2', is_owner: true, deleted: false }
          ]
        })
      },
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ok: true })
      }
    } as any;

    try {
      await usageService.refreshWorkspaceUserCount('T1', client, 'xoxb-test');
      expect(client.chat.postMessage).toHaveBeenCalledTimes(2);
      const sentText = client.chat.postMessage.mock.calls[0][0].text;
      expect(sentText).toContain('100_plus');
    } finally {
      await pool.end();
    }
  });
});
