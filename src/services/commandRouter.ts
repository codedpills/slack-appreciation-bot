import { CommandResult } from '../types';
import { CommandService } from './commandService';

export class CommandRouter {
  private commandService: CommandService;

  constructor(commandService: CommandService) {
    this.commandService = commandService;
  }

  async handlePoints(
    text: string,
    userId: string,
    workspaceId: string,
    client: any
  ): Promise<CommandResult> {
    const args = text.trim().split(/\s+/);
    const subCommand = args[0]?.toLowerCase();

    switch (subCommand) {
      case 'config': {
        const cfgCmd = args[1]?.toLowerCase();
        switch (cfgCmd) {
          case 'daily_limit':
            return this.commandService.setDailyLimit(userId, args[2], workspaceId);
          case 'add_value':
            return this.commandService.addValue(userId, args[2], workspaceId);
          case 'remove_value':
            return this.commandService.removeValue(userId, args[2], workspaceId);
          case 'label': {
            const newLabel = args.slice(2).join(' ');
            return this.commandService.setLabel(userId, newLabel, workspaceId);
          }
          case 'gif_enabled':
            return this.commandService.setGifEnabled(userId, args[2] || '', workspaceId);
          case 'gif_min_points':
            return this.commandService.setGifMinPoints(userId, args[2] || '', workspaceId);
          default:
            return {
              success: false,
              message: 'Invalid config command. Available: daily_limit, add_value, remove_value, label, gif_enabled, gif_min_points'
            };
        }
      }
      case 'reward': {
        const rwCmd = args[1]?.toLowerCase();
        switch (rwCmd) {
          case 'add': {
            const match = text.match(/reward\s+add\s+"([^"]+)"\s+(\d+)/i);
            return match
              ? this.commandService.addReward(userId, match[1], match[2], workspaceId)
              : { success: false, message: 'Invalid format. Use: /points reward add "Name" cost' };
          }
          case 'remove': {
            const match = text.match(/reward\s+remove\s+"([^"]+)"/i);
            return match
              ? this.commandService.removeReward(userId, match[1], workspaceId)
              : { success: false, message: 'Invalid format. Use: /points reward remove "Name"' };
          }
          default:
            return { success: false, message: 'Invalid reward command. Available: add, remove' };
        }
      }
      case 'reset':
        if (args[1]?.toLowerCase() === 'all') {
          return this.commandService.resetAllPoints(userId, workspaceId);
        }
        if (args.length < 2) {
          return { success: false, message: 'Please specify a user. Example: /points reset @user' };
        }
        return this.commandService.resetPoints(userId, args[1], client, workspaceId);
      default:
        return { success: false, message: 'Invalid command. Available: config, reward, reset' };
    }
  }
}
