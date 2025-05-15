import { DataService } from '../../src/services/dataService';
import fs from 'fs';
import path from 'path';

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
    // Mock file does not exist
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    
    const dataService = new DataService(testDataPath);
    const config = dataService.getConfig();
    
    // Verify default values were created
    expect(config.dailyLimit).toBe(5);
    expect(config.values).toContain('integrity');
    expect(config.rewards.length).toBeGreaterThan(0);
  });
  
  test('should load existing data from file', () => {
    // Mock file exists
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    
    // Mock file content
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
    
    // Set up mock for readFileSync
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockData));
    
    const dataService = new DataService(testDataPath);
    const config = dataService.getConfig();
    const user = dataService.getUserRecord('TEST123');
    
    // Verify loaded values match mock data
    expect(config.dailyLimit).toBe(10);
    expect(config.values).toEqual(['custom1', 'custom2']);
    expect(config.rewards[0].name).toBe('Custom Reward');
    
    expect(user.total).toBe(42);
    expect(user.byValue.custom1).toBe(30);
  });
  
  test('should save data to file after updates', async () => {
    // Mock filesystem
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);
    
    const dataService = new DataService(testDataPath);
    
    // Make some updates
    await dataService.setDailyLimit(7);
    await dataService.addValue('newvalue');
    await dataService.addReward('New Reward', 60);
    
    // Record a recognition
    await dataService.recordRecognition({
      giver: 'GIVER123',
      receiver: 'RECEIVER123',
      reason: 'test recognition',
      value: 'newvalue',
      points: 3,
      timestamp: Date.now()
    });
    
    // Verify writeFile was called
    expect(fs.promises.writeFile).toHaveBeenCalledTimes(4);
    
    // Verify the latest saved data contains our updates
    const lastCall = (fs.promises.writeFile as jest.Mock).mock.calls.slice(-1)[0];
    const savedData = JSON.parse(lastCall[1]);
    
    expect(savedData.config.dailyLimit).toBe(7);
    expect(savedData.config.values).toContain('newvalue');
    expect(savedData.config.rewards.find((r: any) => r.name === 'New Reward')).toBeDefined();
    expect(savedData.users.RECEIVER123.total).toBe(3);
  });
  
  test('should handle file system errors gracefully', async () => {
    // Mock filesystem with error
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.promises.writeFile as jest.Mock).mockRejectedValue(new Error('Mock IO error'));
    
    // Spy on console.error
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    const dataService = new DataService(testDataPath);
    
    // Attempt an update that should fail
    await expect(dataService.setDailyLimit(7)).rejects.toThrow('Failed to save data');
    
    // Verify error was logged
    expect(console.error).toHaveBeenCalled();
  });
});