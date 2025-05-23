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
  
  beforeEach(() => {
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
    
    const adminResult = await commandService.resetPoints(adminUserId, 'USER789');
    expect(adminResult.success).toBe(true);
    expect(resetSpy).toHaveBeenCalledWith('USER789');
    
    const userResult = await commandService.resetPoints(regularUserId, 'USER789');
    expect(userResult.success).toBe(false);
    
    const formattedResult = await commandService.resetPoints(adminUserId, '<@USER789>');
    expect(formattedResult.success).toBe(true);
    expect(resetSpy).toHaveBeenCalledWith('USER789');
  });
});