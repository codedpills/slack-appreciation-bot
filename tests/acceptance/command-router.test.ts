import { CommandRouter } from '../../src/services/commandRouter';
import { CommandResult } from '../../src/types';

describe('CommandRouter', () => {
  test('routes config label with multi-word label', async () => {
    const commandService = {
      setLabel: jest.fn().mockResolvedValue({ success: true, message: 'ok' })
    } as any;

    const router = new CommandRouter(commandService);

    const result = await router.handlePoints('config label Team Kudos', 'U1', 'T1', {} as any);

    expect(commandService.setLabel).toHaveBeenCalledWith('U1', 'Team Kudos', 'T1');
    expect(result).toEqual<CommandResult>({ success: true, message: 'ok' });
  });

  test('routes reward add with quoted name', async () => {
    const commandService = {
      addReward: jest.fn().mockResolvedValue({ success: true, message: 'ok' })
    } as any;

    const router = new CommandRouter(commandService);

    const result = await router.handlePoints('reward add "Coffee Voucher" 50', 'U1', 'T1', {} as any);

    expect(commandService.addReward).toHaveBeenCalledWith('U1', 'Coffee Voucher', '50', 'T1');
    expect(result).toEqual<CommandResult>({ success: true, message: 'ok' });
  });

  test('routes reset all', async () => {
    const commandService = {
      resetAllPoints: jest.fn().mockResolvedValue({ success: true, message: 'ok' })
    } as any;

    const router = new CommandRouter(commandService);

    const result = await router.handlePoints('reset all', 'U1', 'T1', {} as any);

    expect(commandService.resetAllPoints).toHaveBeenCalledWith('U1', 'T1');
    expect(result).toEqual<CommandResult>({ success: true, message: 'ok' });
  });
});
