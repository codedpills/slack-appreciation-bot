import { IDataService } from './dataServiceInterface';
import { CommandService } from './commandService';
import {
  buildRedeemModal,
  buildRedemptionConfirmation,
  buildAdminRedemptionNotification
} from '../views/homeView';
import { CommandResult } from '../types';

export class RedemptionService {
  private dataService: IDataService;
  private commandService: CommandService;

  constructor(dataService: IDataService, commandService: CommandService) {
    this.dataService = dataService;
    this.commandService = commandService;
  }

  async openRedeemModal(
    client: any,
    userId: string,
    triggerId: string,
    workspaceId?: string
  ): Promise<boolean> {
    const rewards = await this.dataService.getRewards(workspaceId);
    const userRecord = await this.dataService.getUserRecord(userId, workspaceId);
    try {
      await client.views.open({
        trigger_id: triggerId,
        view: buildRedeemModal(rewards, userRecord.total)
      });
      return true;
    } catch (error) {
      console.error('Error opening redeem modal:', error);
      return false;
    }
  }

  async redeemRewardFromText(
    client: any,
    userId: string,
    text: string,
    workspaceId: string,
    adminUsers: string[]
  ): Promise<CommandResult> {
    const rewardName = this.parseRewardName(text);
    return this.redeemReward(client, userId, rewardName, workspaceId, adminUsers);
  }

  async redeemReward(
    client: any,
    userId: string,
    rewardName: string,
    workspaceId: string,
    adminUsers: string[]
  ): Promise<CommandResult> {
    const result = await this.commandService.redeemReward(userId, rewardName, workspaceId);
    if (result.success && result.data) {
      const { reward, user } = result.data;
      const config = await this.dataService.getConfig(workspaceId);
      const label = config.label;
      try {
        await client.chat.postMessage({
          channel: userId,
          blocks: buildRedemptionConfirmation(reward.name, reward.cost, user.total - reward.cost),
          text: `Redemption confirmed: ${reward.name} for ${reward.cost} ${label}`
        });
      } catch {}
      for (const adminId of adminUsers) {
        try {
          await client.chat.postMessage({
            channel: adminId,
            blocks: buildAdminRedemptionNotification(userId, reward.name, reward.cost),
            text: `Notification: ${userId} redeemed ${reward.name}`
          });
        } catch {}
      }
    }
    return result;
  }

  private parseRewardName(text: string): string {
    const match = text.match(/"([^"]+)"/);
    return match ? match[1] : text.trim();
  }
}
