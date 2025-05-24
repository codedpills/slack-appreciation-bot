import { DataService } from './dataService';
import { CommandResult } from '../types';

export class CommandService {
  private dataService: DataService;
  private adminUsers: string[];
  
  constructor(dataService: DataService, adminUsers: string[] = []) {
    this.dataService = dataService;
    this.adminUsers = adminUsers;
  }

  isAdmin(userId: string): boolean {
    return this.adminUsers.includes(userId);
  }

  async setDailyLimit(userId: string, limitStr: string): Promise<CommandResult> {
    if (!this.isAdmin(userId)) {
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
    
    await this.dataService.setDailyLimit(limit);
    
    return {
      success: true,
      message: `Daily limit set to ${limit} points`
    };
  }

  async addValue(userId: string, value: string): Promise<CommandResult> {
    if (!this.isAdmin(userId)) {
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
    await this.dataService.addValue(normalizedValue);
    
    return {
      success: true,
      message: `Added "${normalizedValue}" to company values`
    };
  }

  async removeValue(userId: string, value: string): Promise<CommandResult> {
    if (!this.isAdmin(userId)) {
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
    await this.dataService.removeValue(normalizedValue);
    
    return {
      success: true,
      message: `Removed "${normalizedValue}" from company values`
    };
  }

  async addReward(userId: string, name: string, costStr: string): Promise<CommandResult> {
    if (!this.isAdmin(userId)) {
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
    
    await this.dataService.addReward(name, cost);
    
    return {
      success: true,
      message: `Added reward "${name}" with cost ${cost} points`
    };
  }

  async removeReward(userId: string, name: string): Promise<CommandResult> {
    if (!this.isAdmin(userId)) {
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
    
    await this.dataService.removeReward(name);
    
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

  async resetPoints(requesterId: string, target: string, client: any): Promise<{ success: boolean; message: string }> {
    if (!this.adminUsers.includes(requesterId)) {
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

    const userRecord = this.dataService.getUserRecord(userId);
    
    if (!userRecord) {
      return { success: false, message: `User ${target} not found.` };
    }

    await this.dataService.resetUserPoints(userId);
    return { success: true, message: `Points for ${target} have been reset.` };
  }

  /**
   * Reset all users' points
   */
  async resetAllPoints(requesterId: string): Promise<CommandResult> {
    if (!this.isAdmin(requesterId)) {
      return { success: false, message: 'Only admins can reset all points.' };
    }

    const users = this.dataService.getAllUsers();
    for (const userId of Object.keys(users)) {
      await this.dataService.resetUserPoints(userId);
    }

    return { success: true, message: 'All user points have been reset.' };
  }

  async redeemReward(userId: string, rewardName: string): Promise<CommandResult> {
    const reward = this.dataService.getReward(rewardName);
    
    if (!reward) {
      return {
        success: false,
        message: `Reward "${rewardName}" not found`
      };
    }
    
    const user = this.dataService.getUserRecord(userId);
    
    if (user.total < reward.cost) {
      return {
        success: false,
        message: `You don't have enough points. This reward costs ${reward.cost} points, but you only have ${user.total}.`
      };
    }
    
    const success = await this.dataService.redeemReward(userId, rewardName);
    
    if (success) {
      return {
        success: true,
        message: `You've redeemed "${rewardName}" for ${reward.cost} points! Your new balance is ${user.total - reward.cost} points.`,
        data: { reward, user }
      };
    } else {
      return {
        success: false,
        message: 'Failed to redeem reward. Please try again.'
      };
    }
  }
}

export const createCommandService = (
  dataService: DataService,
  adminUsers: string[] = []
): CommandService => {
  return new CommandService(dataService, adminUsers);
};