/**
 * Core types for the appreciation bot
 */

export interface AppConfig {
  dailyLimit: number;
  values: string[];
  rewards: Reward[];
}

export interface Reward {
  name: string;
  cost: number;
}

export interface UserRecord {
  total: number;
  byValue: Record<string, number>;
  dailyGiven: number;
  lastReset: string;
}

export interface AppState {
  config: AppConfig;
  users: Record<string, UserRecord>;
}

export interface Recognition {
  giver: string;
  receiver: string;
  reason: string;
  value: string;
  points: number;
  timestamp: number;
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
}

export type CommandHandler = (...args: string[]) => Promise<CommandResult>;