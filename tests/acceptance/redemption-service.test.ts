import { RedemptionService } from '../../src/services/redemptionService';
import { CommandResult } from '../../src/types';

describe('RedemptionService', () => {
  test('posts confirmation message with label on success', async () => {
    const dataService = {
      getConfig: jest.fn().mockResolvedValue({ label: 'coins' })
    } as any;

    const commandService = {
      redeemReward: jest.fn().mockResolvedValue({
        success: true,
        message: 'ok',
        data: {
          reward: { name: 'Coffee Voucher', cost: 50 },
          user: { total: 100 }
        }
      })
    } as any;

    const client = {
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ok: true })
      }
    } as any;

    const service = new RedemptionService(dataService, commandService);

    const result = await service.redeemRewardFromText(
      client,
      'USER123',
      '"Coffee Voucher"',
      'T1',
      ['ADMIN1', 'ADMIN2']
    );

    expect(result).toEqual<CommandResult>({ success: true, message: 'ok', data: result.data });
    expect(dataService.getConfig).toHaveBeenCalledWith('T1');
    expect(client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'USER123',
      text: 'Redemption confirmed: Coffee Voucher for 50 coins'
    }));
    expect(client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'ADMIN1',
      text: 'Notification: USER123 redeemed Coffee Voucher'
    }));
    expect(client.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'ADMIN2',
      text: 'Notification: USER123 redeemed Coffee Voucher'
    }));
  });
});
