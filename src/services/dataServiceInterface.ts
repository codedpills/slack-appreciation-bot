import { AppState, Recognition, UserRecord, Reward, WorkspaceInstall } from '../types';

/**
 * Read-only interface for data access
 */
export interface IDataReader {
  /**
   * Retrieve application configuration
   */
  getConfig(workspaceId?: string): Promise<AppState['config']>;

  /**
   * List all rewards
   */
  getRewards(workspaceId?: string): Promise<Reward[]>;

  /**
   * Get a specific reward
   */
  getReward(name: string, workspaceId?: string): Promise<Reward | undefined>;

  /**
   * Fetch or initialize a user record
   */
  getUserRecord(userId: string, workspaceId?: string): Promise<UserRecord>;

  /**
   * List all user records
   */
  getAllUsers(workspaceId?: string): Promise<Record<string, UserRecord>>;

  /**
   * Check if user can give points
   */
  canGivePoints(userId: string, points: number, workspaceId?: string): Promise<boolean>;

  /**
   * Fetch workspace install details
   */
  getWorkspaceInstall(workspaceId: string): Promise<WorkspaceInstall | null>;
}

/**
 * Write-only interface for data mutations
 */
export interface IDataWriter {
  /**
   * Update multiple config fields
   */
  updateConfig(newConfig: Partial<AppState['config']>, workspaceId?: string): Promise<void>;

  /**
   * Set the daily limit for recognitions
   */
  setDailyLimit(limit: number, workspaceId?: string): Promise<void>;

  /**
   * Add a company value
   */
  addValue(value: string, workspaceId?: string): Promise<void>;

  /**
   * Remove a company value
   */
  removeValue(value: string, workspaceId?: string): Promise<void>;

  /**
   * Add a reward option
   */
  addReward(name: string, cost: number, workspaceId?: string): Promise<void>;

  /**
   * Remove a reward option
   */
  removeReward(name: string, workspaceId?: string): Promise<void>;

  /**
   * Reset a specific user's points
   */
  resetUserPoints(userId: string, workspaceId?: string): Promise<void>;

  /**
   * Record a recognition event
   */
  recordRecognition(recognition: Recognition, workspaceId?: string): Promise<void>;

  /**
   * Redeem a reward
   */
  redeemReward(userId: string, rewardName: string, workspaceId?: string): Promise<boolean>;

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
  resetRewards(workspaceId?: string): Promise<void>;

  /**
   * Reset company values to defaults
   */
  resetValues(workspaceId?: string): Promise<void>;

  /**
   * Update the points label
   */
  setLabel(label: string, workspaceId?: string): Promise<void>;

  /**
   * Store or update workspace install details
   */
  upsertWorkspaceInstall(install: WorkspaceInstall): Promise<void>;
}

/**
 * Common interface for data storage implementations
 */
export interface IDataService extends IDataReader, IDataWriter {}

/**
 * Factory signature for dataService implementations
 */
export type CreateDataService = (options?: { pool?: any }) => IDataService;
