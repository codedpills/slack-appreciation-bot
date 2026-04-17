import { IDataService } from './dataServiceInterface';
import { SubscriptionRecord, SubscriptionStatus } from '../types';

export type BillingProvider = 'lemonsqueezy' | 'none';

export type BillingConfig = {
  enabled: boolean;
  provider: BillingProvider;
  upgradeUrl?: string;
  trialDays: number;
};

export type AccessCheckResult = {
  allowed: boolean;
  reason?: string;
  upgradeUrl?: string;
  subscription?: SubscriptionRecord | null;
};

const parseBoolean = (value?: string) => {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const parseNumber = (value?: string, fallback = 0) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const buildUpgradeUrl = (baseUrl: string | undefined, workspaceId: string) => {
  if (!baseUrl) return undefined;
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('workspace_id', workspaceId);
    return url.toString();
  } catch {
    return baseUrl;
  }
};

const buildPortalUrl = (baseUrl: string | undefined, customerId?: string) => {
  if (!baseUrl || !customerId) return undefined;
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('customer_id', customerId);
    return url.toString();
  } catch {
    return baseUrl;
  }
};

const toIsoDate = (date: Date) => date.toISOString();

const isTrialActive = (trialEndsAt?: string) => {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt).getTime() >= Date.now();
};

export const getBillingConfig = (): BillingConfig => {
  const providerEnv = (process.env.BILLING_PROVIDER || 'lemonsqueezy').toLowerCase();
  const provider = providerEnv === 'lemonsqueezy' ? 'lemonsqueezy' : 'none';
  return {
    enabled: parseBoolean(process.env.BILLING_ENABLED),
    provider,
    upgradeUrl: process.env.BILLING_UPGRADE_URL,
    trialDays: parseNumber(process.env.BILLING_TRIAL_DAYS, 30)
  };
};

export class SubscriptionService {
  private dataService: IDataService;
  private config: BillingConfig;

  constructor(dataService: IDataService, config: BillingConfig = getBillingConfig()) {
    this.dataService = dataService;
    this.config = config;
  }

  isBillingEnabled() {
    return this.config.enabled && this.config.provider !== 'none';
  }

  getUpgradeUrl(workspaceId: string) {
    return buildUpgradeUrl(this.config.upgradeUrl, workspaceId);
  }

  getPortalUrl(customerId?: string) {
    return buildPortalUrl(process.env.BILLING_PORTAL_URL, customerId);
  }

  async ensureTrial(workspaceId: string) {
    if (!this.isBillingEnabled()) return;
    const existing = await this.dataService.getWorkspaceSubscription(workspaceId);
    if (existing) return;
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + this.config.trialDays * 24 * 60 * 60 * 1000);
    await this.dataService.upsertWorkspaceSubscription({
      workspaceId,
      status: 'trialing',
      trialEndsAt: toIsoDate(trialEndsAt),
      updatedAt: toIsoDate(now)
    });
  }

  async checkAccess(workspaceId: string): Promise<AccessCheckResult> {
    if (!this.isBillingEnabled()) {
      return { allowed: true };
    }
    let subscription = await this.dataService.getWorkspaceSubscription(workspaceId);
    if (!subscription) {
      await this.ensureTrial(workspaceId);
      subscription = await this.dataService.getWorkspaceSubscription(workspaceId);
    }
    const status = subscription?.status;
    if (status === 'trialing' && isTrialActive(subscription?.trialEndsAt)) {
      return { allowed: true, subscription };
    }
    if (status === 'active') {
      return { allowed: true, subscription };
    }
    return {
      allowed: false,
      reason: 'This workspace does not have an active subscription.',
      upgradeUrl: this.getUpgradeUrl(workspaceId),
      subscription
    };
  }
}

export const createSubscriptionService = (dataService: IDataService) => new SubscriptionService(dataService);
