import { publishHomeView } from '../../src/utils';
import { CommandService } from '../../src/services/commandService';

describe('Multi-tenant home view publishing', () => {
  test('loads state using workspaceId', async () => {
    const dataService = {
      getAllUsers: jest.fn().mockResolvedValue({ U1: { total: 0, byValue: {}, dailyGiven: 0, lastReset: '2024-01-01' } }),
      getConfig: jest.fn().mockResolvedValue({
        dailyLimit: 10,
        values: ['teamwork'],
        rewards: [{ name: 'Coffee Voucher', cost: 50 }],
        label: 'points'
      }),
      getRewards: jest.fn().mockResolvedValue([{ name: 'Coffee Voucher', cost: 50 }])
    } as any;

    const commandService = new CommandService(dataService, ['U1']);
    const client = {
      views: { publish: jest.fn().mockResolvedValue(undefined) }
    } as any;

    await publishHomeView(client, 'U1', dataService, commandService, 'T1');

    expect(dataService.getAllUsers).toHaveBeenCalledWith('T1');
    expect(dataService.getConfig).toHaveBeenCalledWith('T1');
    expect(dataService.getRewards).toHaveBeenCalledWith('T1');
    expect(client.views.publish).toHaveBeenCalled();
  });
});
