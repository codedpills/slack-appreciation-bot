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

describe('Reward Redemption Acceptance Tests', () => {
  let dataService: DataService;
  let commandService: CommandService;
  const testDataPath = '/tmp/test-data.json';
  const userId = 'USER123';
  
  beforeEach(() => {
    // Setup mock filesystem
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
    
    // Create test services
    dataService = new DataService(testDataPath);
    commandService = new CommandService(dataService, ['ADMIN123']);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  test('should verify point balance before redemption', async () => {
    // Mock methods
    const getRewardSpy = jest.spyOn(dataService, 'getReward')
      .mockReturnValue({ name: 'Coffee Voucher', cost: 50 });
    
    // User with insufficient points
    jest.spyOn(dataService, 'getUserRecord')
      .mockReturnValue({
        total: 30, // Less than the 50 required
        byValue: {},
        dailyGiven: 0,
        lastReset: '2025-01-01'
      });
    
    const result = await commandService.redeemReward(userId, 'Coffee Voucher');
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('don\'t have enough points');
    expect(result.message).toContain('costs 50 points');
    expect(result.message).toContain('only have 30');
  });
  
  test('should deduct points after successful redemption', async () => {
    // Mock methods
    const getRewardSpy = jest.spyOn(dataService, 'getReward')
      .mockReturnValue({ name: 'Coffee Voucher', cost: 50 });
    
    // User with sufficient points
    jest.spyOn(dataService, 'getUserRecord')
      .mockReturnValue({
        total: 100, // More than the 50 required
        byValue: {},
        dailyGiven: 0,
        lastReset: '2025-01-01'
      });
    
    // Mock redeemReward
    const redeemSpy = jest.spyOn(dataService, 'redeemReward')
      .mockResolvedValue(true);
    
    const result = await commandService.redeemReward(userId, 'Coffee Voucher');
    
    expect(result.success).toBe(true);
    expect(redeemSpy).toHaveBeenCalledWith(userId, 'Coffee Voucher');
    expect(result.message).toContain('redeemed "Coffee Voucher"');
    expect(result.message).toContain('50 points');
    expect(result.data).toBeDefined();
    expect(result.data.reward.name).toBe('Coffee Voucher');
    expect(result.data.reward.cost).toBe(50);
  });
  
  test('should fail if reward does not exist', async () => {
    // Mock getReward to return undefined
    jest.spyOn(dataService, 'getReward').mockReturnValue(undefined);
    
    const result = await commandService.redeemReward(userId, 'Nonexistent Reward');
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });
  
  test('should handle redemption failure gracefully', async () => {
    // Mock methods
    jest.spyOn(dataService, 'getReward')
      .mockReturnValue({ name: 'Coffee Voucher', cost: 50 });
    
    // User with sufficient points
    jest.spyOn(dataService, 'getUserRecord')
      .mockReturnValue({
        total: 100,
        byValue: {},
        dailyGiven: 0,
        lastReset: '2025-01-01'
      });
    
    // Mock redeemReward to fail
    jest.spyOn(dataService, 'redeemReward').mockResolvedValue(false);
    
    const result = await commandService.redeemReward(userId, 'Coffee Voucher');
    
    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to redeem');
  });
});