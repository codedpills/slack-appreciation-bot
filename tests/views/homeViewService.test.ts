import { HomeViewService } from '../../src/services/homeViewService';
import { UserRecord } from '../../src/types';

describe('HomeViewService', () => {
  test('builds home view with stats and label', () => {
    const users: Record<string, UserRecord> = {
      U1: { total: 5, byValue: { integrity: 2, innovation: 3 }, dailyGiven: 0, lastReset: '' }
    };

    const service = new HomeViewService();
    const view = service.buildHomeView({
      userId: 'U1',
      users,
      rewards: [],
      config: { values: ['integrity', 'innovation'], dailyLimit: 10, label: 'coins' },
      isAdmin: false
    });

    const statsSection = view.blocks.find((b: any) => b.text?.text.includes('Your Stats'));
    expect(statsSection).toBeDefined();
    expect(statsSection.text.text).toContain('Total Coins: *5*');
  });
});
