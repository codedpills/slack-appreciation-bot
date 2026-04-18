import { IDataService } from './dataServiceInterface';
import { PlanTier, SubscriptionRecord } from '../types';
import { SubscriptionService } from './subscriptionService';

export const mapUserCountToPlanTier = (userCount: number): PlanTier => {
  if (userCount <= 25) return 'up_to_25';
  if (userCount <= 100) return '25_to_100';
  return '100_plus';
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
    const response = await client.team.info({ team: workspaceId, ...(token ? { token } : {}) });
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
      ['up_to_25', '25_to_100', '100_plus'].indexOf(current.planTier) <
        ['up_to_25', '25_to_100', '100_plus'].indexOf(planTier);
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
      const result = await this.refreshWorkspaceUserCount(install.workspaceId, client, token);
      results.push({ workspaceId: install.workspaceId, ...result });
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
