import { AppState, Recognition, UserRecord, Reward } from '../types';

/**
 * Common interface for data storage implementations
 */
export interface IDataService {
  /**
   * Retrieve application configuration
   */
  getConfig(): AppState['config'];

  /**
   * Update multiple config fields
   */
  updateConfig(newConfig: Partial<AppState['config']>): Promise<void>;

  /**
   * Set the daily limit for recognitions
   */
  setDailyLimit(limit: number): Promise<void>;

  /**
   * Add a company value
   */
  addValue(value: string): Promise<void>;

  /**
   * Remove a company value
   */
  removeValue(value: string): Promise<void>;

  /**
   * Add a reward option
   */
  addReward(name: string, cost: number): Promise<void>;

  /**
   * Remove a reward option
   */
  removeReward(name: string): Promise<void>;

  /**
   * List all rewards
   */
  getRewards(): Reward[];

  /**
   * Get a specific reward
   */
  getReward(name: string): Reward | undefined;

  /**
   * Fetch or initialize a user record
   */
  getUserRecord(userId: string): UserRecord;

  /**
   * List all user records
   */
  getAllUsers(): Record<string, UserRecord>;

  /**
   * Reset a specific user's points
   */
  resetUserPoints(userId: string): Promise<void>;

  /**
   * Record a recognition event
   */
  recordRecognition(recognition: Recognition): Promise<void>;

  /**
   * Check if user can give points
   */
  canGivePoints(userId: string, points: number): boolean;

  /**
   * Redeem a reward
   */
  redeemReward(userId: string, rewardName: string): Promise<boolean>;

  /**
   * Persist any pending data operations
   */
  saveData(): Promise<void>;

  /**
   * Normalize user IDs based on Slack API
   */
  normalizeUserIds(client: any): Promise<void>;

  /**
   * Reset all rewards to empty
   */
  resetRewards(): Promise<void>;

  /**
   * Reset company values to defaults
   */
  resetValues(): Promise<void>;

  /**
   * Update the points label
   */
  setLabel(label: string): Promise<void>;
}

/**
 * Factory signature for dataService implementations
 */
export type CreateDataService = (pathOrUrl?: string) => IDataService;
