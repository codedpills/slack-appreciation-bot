/**
 * Core types for the appreciation bot
 */

export interface AppConfig {
  dailyLimit: number;
  values: string[];
  rewards: Reward[];
  label: string;
  gifEnabled: boolean;
  gifMinPoints: number;
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

export interface WorkspaceInstall {
  workspaceId: string;
  botUserId: string;
  botToken: string;
  installedAt: string;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'none';

export type BillingPeriod = 'monthly' | 'annual';

export type PlanTier = 'up_to_25' | '25_to_100' | '100_plus';

export interface SubscriptionRecord {
  workspaceId: string;
  status: SubscriptionStatus;
  planTier?: PlanTier;
  requiredPlanTier?: PlanTier;
  billingPeriod?: BillingPeriod;
  provider?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  trialEndsAt?: string;
  currentPeriodEndsAt?: string;
  gracePeriodEndsAt?: string;
  lastUserCount?: number;
  updatedAt?: string;
}

export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
}

export type CommandHandler = (...args: string[]) => Promise<CommandResult>;