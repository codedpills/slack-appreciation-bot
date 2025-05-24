import { DataService } from '../../src/services/dataService';
import fs from 'fs';

// Mock the file system
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    writeFile: jest.fn()
  }
}));

describe('Data Persistence Acceptance Tests', () => {
  const testDataPath = '/tmp/test-data.json';
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('should create default data if no file exists', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    
    const dataService = new DataService(testDataPath);
    const config = dataService.getConfig();
    
    expect(config.dailyLimit).toBe(10);
    expect(config.values).toEqual(['teamwork']);
    expect(config.rewards.length).toBeGreaterThan(0);
  });
  
  test('should load existing data from file', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    
    const mockData = {
      config: {
        dailyLimit: 10,
        values: ['custom1', 'custom2'],
        rewards: [{ name: 'Custom Reward', cost: 75 }]
      },
      users: {
        'TEST123': {
          total: 42,
          byValue: { custom1: 30, custom2: 12 },
          dailyGiven: 3,
          lastReset: '2025-05-14'
        }
      }
    };
    
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockData));
    
    const dataService = new DataService(testDataPath);
    const config = dataService.getConfig();
    const user = dataService.getUserRecord('TEST123');
    
    expect(config.dailyLimit).toBe(10);
    expect(config.values).toEqual(['custom1', 'custom2']);
    expect(config.rewards[0].name).toBe('Custom Reward');
    
    expect(user.total).toBe(42);
    expect(user.byValue.custom1).toBe(30);
  });
  
  test('should save data to file after updates', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
    
    const dataService = new DataService(testDataPath);
    
    await dataService.setDailyLimit(7);
    await dataService.addValue('newvalue');
    await dataService.addReward('New Reward', 60);
    
    await dataService.recordRecognition({
      giver: 'GIVER123',
      receiver: 'RECEIVER123',
      reason: 'test recognition',
      value: 'newvalue',
      points: 3,
      timestamp: Date.now()
    });
    
    expect(fs.promises.writeFile).toHaveBeenCalledTimes(4);
    
    const lastCall = (fs.promises.writeFile as jest.Mock).mock.calls.slice(-1)[0];
    const savedData = JSON.parse(lastCall[1]);
    
    expect(savedData.config.dailyLimit).toBe(7);
    expect(savedData.config.values).toContain('newvalue');
    expect(savedData.config.rewards.find((r: any) => r.name === 'New Reward')).toBeDefined();
    expect(savedData.users.RECEIVER123.total).toBe(3);
  });
  
  test('should handle file system errors gracefully', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.promises.writeFile as jest.Mock).mockRejectedValue(new Error('Mock IO error'));
    
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    const dataService = new DataService(testDataPath);
    
    await expect(dataService.setDailyLimit(7)).rejects.toThrow('Failed to save data');
    
    expect(console.error).toHaveBeenCalled();
  });
  
  test('should reset a user’s points correctly', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    const writeSpy = (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

    const dataService = new DataService(testDataPath);
    // Manually set a user record
    const today = new Date().toISOString().split('T')[0];
    (dataService as any).state = {
      config: dataService.getConfig(),
      users: {
        'USER123': {
          total: 10,
          byValue: { integrity: 10 },
          dailyGiven: 5,
          lastReset: '2025-05-23'
        }
      }
    };

    await dataService.resetUserPoints('USER123');
    // After reset, the writeFile should be called
    expect(writeSpy).toHaveBeenCalled();

    const user = dataService.getUserRecord('USER123');
    expect(user.total).toBe(0);
    expect(user.byValue).toEqual({});
    expect(user.dailyGiven).toBe(0);
    expect(user.lastReset).toBe(today);
  });
});