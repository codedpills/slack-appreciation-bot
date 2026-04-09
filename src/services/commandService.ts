import { IDataService } from './dataServiceInterface';
import { CommandResult } from '../types';

export class CommandService {
  private dataService: IDataService;
  private adminUsers: string[];
  private workspaceAdmins: Map<string, string[]>;
  
  constructor(dataService: IDataService, adminUsers: string[] = []) {
    this.dataService = dataService;
    this.adminUsers = adminUsers;
    this.workspaceAdmins = new Map();
  }

  setWorkspaceAdmins(workspaceId: string, admins: string[]): void {
    this.workspaceAdmins.set(workspaceId, admins);
  }

  isAdmin(userId: string, workspaceId?: string): boolean {
    if (workspaceId) {
      const admins = this.workspaceAdmins.get(workspaceId);
      if (admins) {
        return admins.includes(userId);
      }
    }
    return this.adminUsers.includes(userId);
  }

  async setDailyLimit(userId: string, limitStr: string, workspaceId?: string): Promise<CommandResult> {
    if (!this.isAdmin(userId, workspaceId)) {
      return { 
        success: false, 
        message: 'Only admins can change the daily limit'
      };
    }
    
    const limit = parseInt(limitStr, 10);
    if (isNaN(limit) || limit < 1) {
      return {
        success: false,
        message: 'Please provide a valid number for the daily limit'
      };
    }
    
    await this.dataService.setDailyLimit(limit, workspaceId);
    
    return {
      success: true,
      message: `Daily limit set to ${limit} points`
    };
  }

  async addValue(userId: string, value: string, workspaceId?: string): Promise<CommandResult> {
    if (!this.isAdmin(userId, workspaceId)) {
      return { 
        success: false, 
        message: 'Only admins can add company values'
      };
    }
    
    if (!value || value.trim() === '') {
      return {
        success: false,
        message: 'Please provide a valid value name'
      };
    }
    
    const normalizedValue = value.toLowerCase().trim();
    await this.dataService.addValue(normalizedValue, workspaceId);
    
    return {
      success: true,
      message: `Added "${normalizedValue}" to company values`
    };
  }

  async removeValue(userId: string, value: string, workspaceId?: string): Promise<CommandResult> {
    if (!this.isAdmin(userId, workspaceId)) {
      return { 
        success: false, 
        message: 'Only admins can remove company values'
      };
    }
    
    if (!value || value.trim() === '') {
      return {
        success: false,
        message: 'Please provide a valid value name'
      };
    }
    
    const normalizedValue = value.toLowerCase().trim();
    await this.dataService.removeValue(normalizedValue, workspaceId);
    
    return {
      success: true,
      message: `Removed "${normalizedValue}" from company values`
    };
  }

  async addReward(userId: string, name: string, costStr: string, workspaceId?: string): Promise<CommandResult> {
    if (!this.isAdmin(userId, workspaceId)) {
      return { 
        success: false, 
        message: 'Only admins can add rewards'
      };
    }
    
    if (!name || name.trim() === '') {
      return {
        success: false,
        message: 'Please provide a valid reward name'
      };
    }
    
    const cost = parseInt(costStr, 10);
    if (isNaN(cost) || cost < 1) {
      return {
        success: false,
        message: 'Please provide a valid cost for the reward'
      };
    }
    
    await this.dataService.addReward(name, cost, workspaceId);
    
    return {
      success: true,
      message: `Added reward "${name}" with cost ${cost} points`
    };
  }

  async removeReward(userId: string, name: string, workspaceId?: string): Promise<CommandResult> {
    if (!this.isAdmin(userId, workspaceId)) {
      return { 
        success: false, 
        message: 'Only admins can remove rewards'
      };
    }
    
    if (!name || name.trim() === '') {
      return {
        success: false,
        message: 'Please provide a valid reward name'
      };
    }
    
    await this.dataService.removeReward(name, workspaceId);
    
    return {
      success: true,
      message: `Removed reward "${name}"`
    };
  }

  async resolveUserId(client: any, username: string): Promise<string | null> {
    try {
      const result = await client.users.list();
      if (!result.ok || !result.members) {
        console.error('Failed to fetch users:', result.error);
        return null;
      }

      const user = result.members.find((member: any) => member.name === username.replace('@', ''));
      return user ? user.id : null;
    } catch (error) {
      console.error('Error resolving user ID:', error);
      return null;
    }
  }

  async resetPoints(requesterId: string, target: string, client: any, workspaceId?: string): Promise<{ success: boolean; message: string }> {
    if (!this.isAdmin(requesterId, workspaceId)) {
      return { success: false, message: 'Only admins can reset points.' };
    }

    const match = target.match(/^<@([A-Z0-9]+)>$/);
    let userId = match ? match[1] : null;

    if (!userId) {
      userId = await this.resolveUserId(client, target);
      if (!userId || !/^U[A-Z0-9]+$/.test(userId)) {
        console.error(`Invalid user identifier provided: ${target}`);
        return { success: false, message: `Invalid user identifier: ${target}` };
      }
    }

    const userRecord = await this.dataService.getUserRecord(userId, workspaceId);
    
    if (!userRecord) {
      return { success: false, message: `User ${target} not found.` };
    }

    await this.dataService.resetUserPoints(userId, workspaceId);
    return { success: true, message: `Points for ${target} have been reset.` };
  }

  /**
   * Reset all users' points
   */
  async resetAllPoints(requesterId: string, workspaceId?: string): Promise<CommandResult> {
    if (!this.isAdmin(requesterId, workspaceId)) {
      return { success: false, message: 'Only admins can reset all points.' };
    }

    const users = await this.dataService.getAllUsers(workspaceId);
    for (const userId of Object.keys(users)) {
      await this.dataService.resetUserPoints(userId, workspaceId);
    }

    return { success: true, message: 'All user points have been reset.' };
  }

  async redeemReward(userId: string, rewardName: string, workspaceId?: string): Promise<CommandResult> {
    const reward = await this.dataService.getReward(rewardName, workspaceId);
    
    if (!reward) {
      return {
        success: false,
        message: `Reward "${rewardName}" not found`
      };
    }
    
    const user = await this.dataService.getUserRecord(userId, workspaceId);
    
    if (user.total < reward.cost) {
      return {
        success: false,
        message: `You don't have enough points. This reward costs ${reward.cost} points, but you only have ${user.total}.`
      };
    }
    
    const success = await this.dataService.redeemReward(userId, rewardName, workspaceId);
    
    if (success) {
      const updatedUser = { ...user, total: user.total - reward.cost };
      return {
        success: true,
        message: `You've redeemed "${rewardName}" for ${reward.cost} points! Your new balance is ${user.total - reward.cost} points.`,
        data: { reward, user: updatedUser }
      };
    } else {
      return {
        success: false,
        message: 'Failed to redeem reward. Please try again.'
      };
    }
  }

  /**
   * Reset all configured rewards
   */
  async resetRewards(userId: string, workspaceId?: string): Promise<CommandResult> {
    if (!this.isAdmin(userId, workspaceId)) {
      return { success: false, message: 'Only admins can reset rewards.' };
    }
    await this.dataService.resetRewards(workspaceId);
    return { success: true, message: 'All rewards have been reset.' };
  }

  /**
   * Reset company values to defaults
   */
  async resetValues(userId: string, workspaceId?: string): Promise<CommandResult> {
    if (!this.isAdmin(userId, workspaceId)) {
      return { success: false, message: 'Only admins can reset company values.' };
    }
    await this.dataService.resetValues(workspaceId);
    return { success: true, message: 'Company values have been reset.' };
  }

  /**
   * Set custom label for points
   */
  async setLabel(userId: string, label: string, workspaceId?: string): Promise<CommandResult> {
    if (!this.isAdmin(userId, workspaceId)) {
      return { success: false, message: 'Only admins can set the points label.' };
    }
    if (!label || label.trim() === '') {
      return { success: false, message: 'Please provide a valid label.' };
    }
    await this.dataService.setLabel(label.trim(), workspaceId);
    return { success: true, message: `Points label set to "${label.trim()}".` };
  }
}

export const createCommandService = (
  dataService: IDataService,
  adminUsers: string[] = []
): CommandService => {
  return new CommandService(dataService, adminUsers);
};