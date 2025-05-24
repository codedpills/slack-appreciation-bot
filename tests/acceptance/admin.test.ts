import { CommandService } from '../../src/services/commandService';
import { DataService } from '../../src/services/dataService';
import fs from 'fs';

// Mock the data service
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    writeFile: jest.fn()
  }
}));

describe('Admin Commands Acceptance Tests', () => {
  let dataService: DataService;
  let commandService: CommandService;
  const testDataPath = '/tmp/test-data.json';
  const adminUserId = 'ADMIN123';
  const regularUserId = 'USER456';
  let mockClient: any;
  
  beforeEach(() => {
    mockClient = {
      users: {
        list: jest.fn().mockResolvedValue({
          ok: true,
          members: [
            { id: 'USER789', name: 'USER789' },
            { id: 'USER456', name: 'regularuser' }
          ]
        })
      }
    };

    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
    
    dataService = new DataService(testDataPath);
    commandService = new CommandService(dataService, [adminUserId]);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  test('should allow admins to set daily limit', async () => {
    const setLimitSpy = jest.spyOn(dataService, 'setDailyLimit')
      .mockImplementation(async () => {});
    
    const adminResult = await commandService.setDailyLimit(adminUserId, '10');
    expect(adminResult.success).toBe(true);
    expect(setLimitSpy).toHaveBeenCalledWith(10);
    
    const userResult = await commandService.setDailyLimit(regularUserId, '10');
    expect(userResult.success).toBe(false);
    expect(userResult.message).toContain('Only admins');
    
    const invalidResult = await commandService.setDailyLimit(adminUserId, 'not-a-number');
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.message).toContain('valid number');
  });
  
  test('should allow admins to add company values', async () => {
    const addValueSpy = jest.spyOn(dataService, 'addValue')
      .mockImplementation(async () => {});
    
    const adminResult = await commandService.addValue(adminUserId, 'creativity');
    expect(adminResult.success).toBe(true);
    expect(addValueSpy).toHaveBeenCalledWith('creativity');
    
    const userResult = await commandService.addValue(regularUserId, 'creativity');
    expect(userResult.success).toBe(false);
    
    const emptyResult = await commandService.addValue(adminUserId, '');
    expect(emptyResult.success).toBe(false);
  });
  
  test('should allow admins to add and remove rewards', async () => {
    const addRewardSpy = jest.spyOn(dataService, 'addReward')
      .mockImplementation(async () => {});
    const removeRewardSpy = jest.spyOn(dataService, 'removeReward')
      .mockImplementation(async () => {});
    
    const addResult = await commandService.addReward(adminUserId, 'Coffee Voucher', '50');
    expect(addResult.success).toBe(true);
    expect(addRewardSpy).toHaveBeenCalledWith('Coffee Voucher', 50);
    
    const removeResult = await commandService.removeReward(adminUserId, 'Coffee Voucher');
    expect(removeResult.success).toBe(true);
    expect(removeRewardSpy).toHaveBeenCalledWith('Coffee Voucher');
    
    const userAddResult = await commandService.addReward(regularUserId, 'Coffee Voucher', '50');
    expect(userAddResult.success).toBe(false);
    
    const invalidCostResult = await commandService.addReward(adminUserId, 'Coffee Voucher', 'not-a-number');
    expect(invalidCostResult.success).toBe(false);
  });
  
  test('should allow admins to reset user points', async () => {
    const resetSpy = jest.spyOn(dataService, 'resetUserPoints')
      .mockImplementation(async () => {});
    
    const adminResult = await commandService.resetPoints(adminUserId, 'USER789', mockClient);
    expect(adminResult.success).toBe(true);
    expect(resetSpy).toHaveBeenCalledWith('USER789');
    
    const userResult = await commandService.resetPoints(regularUserId, 'USER789', mockClient);
    expect(userResult.success).toBe(false);
    
    const formattedResult = await commandService.resetPoints(adminUserId, '<@USER789>', mockClient);
    expect(formattedResult.success).toBe(true);
    expect(resetSpy).toHaveBeenCalledWith('USER789');
  });
  
  test('should reset user points and persist changes', async () => {
    const resetSpy = jest.spyOn(dataService, 'resetUserPoints')
      .mockImplementation(async (userId) => {
        const userRecord = dataService.getUserRecord(userId);
        userRecord.total = 0;
        userRecord.byValue = {};
        await dataService.saveData();
      });

    jest.spyOn(dataService, 'getUserRecord').mockReturnValue({
      total: 0,
      byValue: {},
      dailyGiven: 0,
      lastReset: '2025-05-23'
    });

    const adminResult = await commandService.resetPoints(adminUserId, 'USER789', mockClient);
    expect(adminResult.success).toBe(true);
    expect(adminResult.message).toContain('Points for USER789 have been reset.');
    expect(resetSpy).toHaveBeenCalledWith('USER789');

    const updatedUser = dataService.getUserRecord('USER789');
    expect(updatedUser.total).toBe(0);
    expect(updatedUser.byValue).toEqual({});
  });
  
  test('should resolve usernames to user IDs and reset points', async () => {
    const resolveUserIdSpy = jest.spyOn(commandService, 'resolveUserId')
      .mockResolvedValue('USER789');

    const resetSpy = jest.spyOn(dataService, 'resetUserPoints')
      .mockImplementation(async () => {});

    const result = await commandService.resetPoints(adminUserId, '@username', {} as any);
    expect(result.success).toBe(true);
    expect(resolveUserIdSpy).toHaveBeenCalledWith(expect.anything(), '@username');
    expect(resetSpy).toHaveBeenCalledWith('USER789');
  });

  test('should handle invalid usernames gracefully', async () => {
    jest.spyOn(commandService, 'resolveUserId').mockResolvedValue(null);

    const result = await commandService.resetPoints(adminUserId, '@invaliduser', {} as any);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid user identifier');
  });

  test('should allow admins to reset all user points', async () => {
    const users = { 'USER1': {}, 'USER2': {} } as any;
    jest.spyOn(dataService, 'getAllUsers').mockReturnValue(users);
    const resetSpy = jest.spyOn(dataService, 'resetUserPoints')
      .mockImplementation(async () => {});

    const result = await commandService.resetAllPoints(adminUserId);
    expect(result.success).toBe(true);
    expect(result.message).toContain('All user points have been reset.');
    expect(resetSpy).toHaveBeenCalledTimes(Object.keys(users).length);
    expect(resetSpy).toHaveBeenCalledWith('USER1');
    expect(resetSpy).toHaveBeenCalledWith('USER2');
  });

  test('should prevent non-admins from resetting all points', async () => {
    const resetSpy = jest.spyOn(dataService, 'resetUserPoints')
      .mockImplementation(async () => {});

    const result = await commandService.resetAllPoints(regularUserId);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Only admins');
    expect(resetSpy).not.toHaveBeenCalled();
  });
});