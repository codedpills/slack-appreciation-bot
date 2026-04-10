import { StateLoader } from '../../src/services/stateLoader';
import { AppConfig, Reward, UserRecord } from '../../src/types';

describe('StateLoader', () => {
  test('loads home state with current user', async () => {
    const users: Record<string, UserRecord> = {
      U1: { total: 5, byValue: { teamwork: 5 }, dailyGiven: 0, lastReset: '2024-01-01' }
    };
    const config: AppConfig = {
      dailyLimit: 10,
      values: ['teamwork'],
      rewards: [],
      label: 'points',
      gifEnabled: true,
      gifMinPoints: 3
    };
    const rewards: Reward[] = [{ name: 'Coffee', cost: 50 }];

    const dataService = {
      getAllUsers: jest.fn().mockResolvedValue(users),
      getConfig: jest.fn().mockResolvedValue(config),
      getRewards: jest.fn().mockResolvedValue(rewards)
    } as any;

    const loader = new StateLoader(dataService);

    const state = await loader.loadHomeState('U1', 'T1');

    expect(state.users).toEqual(users);
    expect(state.config).toEqual(config);
    expect(state.rewards).toEqual(rewards);
    expect(state.currentUser).toEqual(users.U1);

    expect(dataService.getAllUsers).toHaveBeenCalledWith('T1');
    expect(dataService.getConfig).toHaveBeenCalledWith('T1');
    expect(dataService.getRewards).toHaveBeenCalledWith('T1');
  });

  test('loads base state without current user', async () => {
    const users: Record<string, UserRecord> = {
      U1: { total: 5, byValue: { teamwork: 5 }, dailyGiven: 0, lastReset: '2024-01-01' }
    };
    const config: AppConfig = {
      dailyLimit: 10,
      values: ['teamwork'],
      rewards: [],
      label: 'points',
      gifEnabled: true,
      gifMinPoints: 3
    };
    const rewards: Reward[] = [{ name: 'Coffee', cost: 50 }];

    const dataService = {
      getAllUsers: jest.fn().mockResolvedValue(users),
      getConfig: jest.fn().mockResolvedValue(config),
      getRewards: jest.fn().mockResolvedValue(rewards)
    } as any;

    const loader = new StateLoader(dataService);

    const state = await loader.loadState('T1');

    expect(state.users).toEqual(users);
    expect(state.config).toEqual(config);
    expect(state.rewards).toEqual(rewards);

    expect(dataService.getAllUsers).toHaveBeenCalledWith('T1');
    expect(dataService.getConfig).toHaveBeenCalledWith('T1');
    expect(dataService.getRewards).toHaveBeenCalledWith('T1');
  });
});
