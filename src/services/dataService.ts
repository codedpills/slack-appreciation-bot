import fs from 'fs';
import path from 'path';
import { AppState, Recognition, UserRecord, Reward } from '../types';

/**
 * Service for data storage and retrieval
 */
export class DataService {
  private dataFilePath: string;
  private state: AppState;

  constructor(dataFilePath: string) {
    this.dataFilePath = dataFilePath;
    this.state = this.loadInitialState();
  }

  /**
   * Load initial state from disk or create default
   */
  private loadInitialState(): AppState {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.dataFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Try to load existing data
      if (fs.existsSync(this.dataFilePath)) {
        const data = fs.readFileSync(this.dataFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }

    // Return default state if no data exists or error occurred
    return {
      config: {
        dailyLimit: 5,
        values: ['integrity', 'innovation', 'teamwork'],
        rewards: [
          { name: 'Coffee Voucher', cost: 50 },
          { name: 'Half-day Off', cost: 100 }
        ]
      },
      users: {}
    };
  }

  /**
   * Save current state to disk
   */
  private async saveState(): Promise<void> {
    try {
      await fs.promises.writeFile(
        this.dataFilePath,
        JSON.stringify(this.state, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Error saving data:', error);
      throw new Error('Failed to save data');
    }
  }

  /**
   * Get app configuration
   */
  getConfig() {
    return { ...this.state.config };
  }

  /**
   * Update app configuration
   */
  async updateConfig(newConfig: Partial<AppState['config']>): Promise<void> {
    this.state.config = { ...this.state.config, ...newConfig };
    await this.saveState();
  }

  /**
   * Set daily limit
   */
  async setDailyLimit(limit: number): Promise<void> {
    this.state.config.dailyLimit = limit;
    await this.saveState();
  }

  /**
   * Add company value
   */
  async addValue(value: string): Promise<void> {
    const normalizedValue = value.toLowerCase().trim();
    if (!this.state.config.values.includes(normalizedValue)) {
      this.state.config.values.push(normalizedValue);
      await this.saveState();
    }
  }

  /**
   * Remove company value
   */
  async removeValue(value: string): Promise<void> {
    const normalizedValue = value.toLowerCase().trim();
    this.state.config.values = this.state.config.values.filter(
      v => v !== normalizedValue
    );
    await this.saveState();
  }

  /**
   * Add reward
   */
  async addReward(name: string, cost: number): Promise<void> {
    const existingIndex = this.state.config.rewards.findIndex(
      r => r.name === name
    );
    
    if (existingIndex >= 0) {
      this.state.config.rewards[existingIndex].cost = cost;
    } else {
      this.state.config.rewards.push({ name, cost });
    }
    
    await this.saveState();
  }

  /**
   * Remove reward
   */
  async removeReward(name: string): Promise<void> {
    this.state.config.rewards = this.state.config.rewards.filter(
      r => r.name !== name
    );
    await this.saveState();
  }

  /**
   * Get all rewards
   */
  getRewards(): Reward[] {
    return [...this.state.config.rewards];
  }

  /**
   * Get reward by name
   */
  getReward(name: string): Reward | undefined {
    return this.state.config.rewards.find(r => r.name === name);
  }

  /**
   * Get user record
   */
  getUserRecord(userId: string): UserRecord {
    // If user doesn't exist, create a new record
    if (!this.state.users[userId]) {
      const today = new Date().toISOString().split('T')[0];
      this.state.users[userId] = {
        total: 0,
        byValue: {},
        dailyGiven: 0,
        lastReset: today
      };
    }
    
    return { ...this.state.users[userId] };
  }

  /**
   * Get all user records
   */
  getAllUsers(): Record<string, UserRecord> {
    return { ...this.state.users };
  }

  /**
   * Reset user's points
   */
  async resetUserPoints(userId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    // Ensure user record exists
    if (!this.state.users[userId]) {
      this.state.users[userId] = { total: 0, byValue: {}, dailyGiven: 0, lastReset: today };
    }
    // Reset the user's point data
    this.state.users[userId].total = 0;
    this.state.users[userId].byValue = {};
    // Also reset daily given and last reset date
    this.state.users[userId].dailyGiven = 0;
    this.state.users[userId].lastReset = today;
    await this.saveState();
  }

  /**
   * Record a recognition
   */
  async recordRecognition(recognition: Recognition): Promise<void> {
    const { giver, receiver, value, points } = recognition;
    const today = new Date().toISOString().split('T')[0];
    
    // Update giver's daily given
    if (!this.state.users[giver]) {
      this.state.users[giver] = {
        total: 0,
        byValue: {},
        dailyGiven: 0,
        lastReset: today
      };
    }
    
    // Check if we need to reset the daily limit
    if (this.state.users[giver].lastReset !== today) {
      this.state.users[giver].dailyGiven = 0;
      this.state.users[giver].lastReset = today;
    }
    
    // Increment daily given
    this.state.users[giver].dailyGiven += points;
    
    // Update receiver's points
    if (!this.state.users[receiver]) {
      this.state.users[receiver] = {
        total: 0,
        byValue: {},
        dailyGiven: 0,
        lastReset: today
      };
    }
    
    // Increment total
    this.state.users[receiver].total += points;
    
    // Increment value-specific points
    if (!this.state.users[receiver].byValue[value]) {
      this.state.users[receiver].byValue[value] = 0;
    }
    this.state.users[receiver].byValue[value] += points;
    
    await this.saveState();
  }

  /**
   * Check if a user can give points
   */
  canGivePoints(userId: string, points: number): boolean {
    const today = new Date().toISOString().split('T')[0];
    const user = this.getUserRecord(userId);
    
    // Reset daily given if it's a new day
    if (user.lastReset !== today) {
      return true;
    }
    
    return user.dailyGiven + points <= this.state.config.dailyLimit;
  }

  /**
   * Redeem reward for a user
   */
  async redeemReward(userId: string, rewardName: string): Promise<boolean> {
    const reward = this.getReward(rewardName);
    if (!reward) return false;
    
    const user = this.getUserRecord(userId);
    if (user.total < reward.cost) return false;
    
    // Deduct points
    this.state.users[userId].total -= reward.cost;
    await this.saveState();
    
    return true;
  }

  /**
   * Save data to disk
   */
  async saveData(): Promise<void> {
    await this.saveState();
  }

  /**
   * Normalize user IDs based on Slack API
   */
  async normalizeUserIds(client: any): Promise<void> {
    const users = this.getAllUsers();
    const result = await client.users.list();

    if (!result.ok || !result.members) {
      console.error('Failed to fetch users from Slack API:', result.error);
      return;
    }

    const slackUsers = result.members.reduce((map: Record<string, string>, member: any) => {
      map[member.name] = member.id;
      return map;
    }, {});

    for (const [key, value] of Object.entries(users)) {
      if (!/^U[A-Z0-9]+$/.test(key)) {
        const resolvedId = slackUsers[key] || slackUsers[key.replace('@', '')];
        if (resolvedId) {
          this.state.users[resolvedId] = value;
          delete this.state.users[key];
        }
      }
    }

    await this.saveState();
  }

  /**
   * Reset all configured rewards
   */
  async resetRewards(): Promise<void> {
    this.state.config.rewards = [];
    await this.saveState();
  }

  /**
   * Reset company values to defaults
   */
  async resetValues(): Promise<void> {
    // Default values as initialized
    this.state.config.values = ['integrity', 'innovation', 'teamwork'];
    await this.saveState();
  }
}

export const createDataService = (dataFilePath: string): DataService => {
  return new DataService(dataFilePath);
};