import { IDataService } from './dataServiceInterface';
import { PlanTier, SubscriptionRecord } from '../types';
import { SubscriptionService } from './subscriptionService';

const upTo25Tier = 'up_to_25';
const from25To100Tier = '25_to_100';
const above100Tier = '100_plus';

export const mapUserCountToPlanTier = (userCount: number): PlanTier => {
  if (userCount <= 25) return upTo25Tier;
  if (userCount <= 100) return from25To100Tier;
  return above100Tier;
};

const computeGracePeriodEndsAt = (currentPeriodEndsAt?: string) => {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (currentPeriodEndsAt) {
    const currentEnds = new Date(currentPeriodEndsAt).getTime();
    if (!Number.isNaN(currentEnds)) {
      const remainingMs = currentEnds - now;
      if (remainingMs > sevenDaysMs) {
        return new Date(currentEnds).toISOString();
      }
    }
  }
  return new Date(now + sevenDaysMs).toISOString();
};

export class WorkspaceUsageService {
  private dataService: IDataService;
  private subscriptionService: SubscriptionService;

  constructor(dataService: IDataService, subscriptionService: SubscriptionService) {
    this.dataService = dataService;
    this.subscriptionService = subscriptionService;
  }

  async refreshWorkspaceUserCount(workspaceId: string, client: any, token?: string) {
    await this.subscriptionService.ensureTrial(workspaceId);
    let response: any;
    try {
      response = await client.team.info({ team: workspaceId, ...(token ? { token } : {}) });
    } catch (error: any) {
      if (error?.data?.error === 'missing_scope') {
        console.warn(
          `Workspace usage refresh missing scope for ${workspaceId}. ` +
            `needed=${error?.data?.needed} provided=${error?.data?.provided || 'unknown'}. ` +
            `Ensure SLACK_SCOPES includes team:read, reinstall the app, and avoid SLACK_BOT_TOKEN when using OAuth installs.`
        );
      }
      throw error;
    }
    const userCount = response?.team?.num_members;
    if (typeof userCount !== 'number') {
      throw new Error('Failed to determine workspace user count');
    }
    const planTier = mapUserCountToPlanTier(userCount);
    const current = (await this.dataService.getWorkspaceSubscription(workspaceId)) || ({
      workspaceId,
      status: 'trialing'
    } as SubscriptionRecord);
    const previousTier = current.requiredPlanTier;
    const isTierMismatch = current.planTier &&
      [upTo25Tier, from25To100Tier, above100Tier].indexOf(current.planTier) <
        [upTo25Tier, from25To100Tier, above100Tier].indexOf(planTier);
    const gracePeriodEndsAt = isTierMismatch
      ? computeGracePeriodEndsAt(current.currentPeriodEndsAt)
      : current.gracePeriodEndsAt;
    const nextStatus = isTierMismatch ? 'past_due' : current.status;

    await this.dataService.upsertWorkspaceSubscription({
      ...current,
      workspaceId,
      lastUserCount: userCount,
      requiredPlanTier: planTier,
      gracePeriodEndsAt,
      status: nextStatus,
      reauthRequired: false,
      reauthReason: undefined,
      reauthNeededAt: undefined,
      updatedAt: new Date().toISOString()
    });
    if (previousTier && previousTier !== planTier) {
      await this.notifyAdminsOfTierChange(workspaceId, previousTier, planTier, client, token);
    }
    return { userCount, planTier };
  }

  async refreshAllWorkspaceUserCounts(client: any, tokenByWorkspace: Map<string, string>) {
    const installs = await this.dataService.listWorkspaceInstalls();
    const results = [] as Array<{ workspaceId: string; userCount: number; planTier: PlanTier }>;
    for (const install of installs) {
      const token = tokenByWorkspace.get(install.workspaceId);
      try {
        const result = await this.refreshWorkspaceUserCount(install.workspaceId, client, token);
        results.push({ workspaceId: install.workspaceId, ...result });
      } catch (error: any) {
        if (error?.data?.error === 'missing_scope') {
          const existing = await this.dataService.getWorkspaceSubscription(install.workspaceId);
          await this.dataService.upsertWorkspaceSubscription({
            workspaceId: install.workspaceId,
            status: existing?.status || 'trialing',
            planTier: existing?.planTier,
            requiredPlanTier: existing?.requiredPlanTier,
            billingPeriod: existing?.billingPeriod,
            provider: existing?.provider,
            providerCustomerId: existing?.providerCustomerId,
            providerSubscriptionId: existing?.providerSubscriptionId,
            trialEndsAt: existing?.trialEndsAt,
            currentPeriodEndsAt: existing?.currentPeriodEndsAt,
            gracePeriodEndsAt: existing?.gracePeriodEndsAt,
            lastUserCount: existing?.lastUserCount,
            reauthRequired: true,
            reauthReason: error?.data?.needed ? `missing_scope:${error.data.needed}` : 'missing_scope',
            reauthNeededAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }
    }
    return results;
  }

  private async notifyAdminsOfTierChange(
    workspaceId: string,
    previousTier: PlanTier,
    nextTier: PlanTier,
    client: any,
    token?: string
  ) {
    const admins = await this.fetchAdmins(client, token);
    if (admins.length === 0) return;
    const text = `Billing tier updated from ${previousTier} to ${nextTier} based on workspace size.`;
    await Promise.all(
      admins.map((adminId) =>
        client.chat.postMessage({ channel: adminId, text, ...(token ? { token } : {}) })
      )
    );
  }

  private async fetchAdmins(client: any, token?: string): Promise<string[]> {
    try {
      const result = await client.users.list({ ...(token ? { token } : {}) });
      if (!result.ok || !result.members) return [];
      return result.members
        .filter((u: any) => (u.is_admin || u.is_owner || u.is_primary_owner) && !u.deleted)
        .map((u: any) => u.id);
    } catch {
      return [];
    }
  }
}
