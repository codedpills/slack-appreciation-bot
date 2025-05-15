import { DataService } from './dataService';
import { CommandResult } from '../types';

/**
 * Service for handling admin commands
 */
export class CommandService {
  private dataService: DataService;
  private adminUsers: string[];
  
  constructor(dataService: DataService, adminUsers: string[] = []) {
    this.dataService = dataService;
    this.adminUsers = adminUsers;
  }

  /**
   * Check if user is an admin
   */
  isAdmin(userId: string): boolean {
    return this.adminUsers.includes(userId);
  }

  /**
   * Set daily point limit
   */
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

  /**
   * Add a company value
   */
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

  /**
   * Remove a company value
   */
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

  /**
   * Add a reward
   */
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

  /**
   * Remove a reward
   */
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

  /**
   * Reset a user's points
   */
  async resetPoints(adminId: string, userId: string): Promise<CommandResult> {
    if (!this.isAdmin(adminId)) {
      return { 
        success: false, 
        message: 'Only admins can reset user points'
      };
    }
    
    // Clean up user ID format (remove <@ and >)
    const cleanUserId = userId.replace(/[<@>]/g, '');
    
    await this.dataService.resetUserPoints(cleanUserId);
    
    return {
      success: true,
      message: `Reset points for <@${cleanUserId}>`
    };
  }

  /**
   * Redeem a reward
   */
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