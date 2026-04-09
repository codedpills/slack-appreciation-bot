import { App } from '@slack/bolt';
import { IDataService } from '../services/dataServiceInterface';
import { CommandService } from '../services/commandService';
import { getAdminUsersCached, loadState, publishHomeView } from '../utils';
import {
  buildRedeemModal,
  buildRedemptionConfirmation,
  buildAdminRedemptionNotification
} from '../views/homeView';

export function registerCommandHandlers(
  app: App,
  dataService: IDataService,
  commandService: CommandService
) {
  const adminCache = new Map<string, { admins: string[]; cachedAt: number }>();

  app.command('/points', async ({ command, ack, respond, client }) => {
    await ack();
    const { text, user_id } = command;
    const workspaceId = command.team_id || 'default';
    const admins = await getAdminUsersCached(client, workspaceId, adminCache);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    const args = text.trim().split(/\s+/);
    const subCommand = args[0]?.toLowerCase();
    let result;
    // dispatch subcommands
    switch (subCommand) {
      case 'config': {
        const cfgCmd = args[1]?.toLowerCase();
        switch (cfgCmd) {
          case 'daily_limit': result = await commandService.setDailyLimit(user_id, args[2], workspaceId); break;
          case 'add_value': result = await commandService.addValue(user_id, args[2], workspaceId); break;
          case 'remove_value': result = await commandService.removeValue(user_id, args[2], workspaceId); break;
          case 'label': {
            const newLabel = args.slice(2).join(' ');
            result = await commandService.setLabel(user_id, newLabel, workspaceId);
            break;
          }
          default:
            result = { success: false, message: 'Invalid config command. Available: daily_limit, add_value, remove_value, label' };
        }
        break;
      }
      case 'reward': {
        const rwCmd = args[1]?.toLowerCase();
        switch (rwCmd) {
          case 'add': {
            const m = text.match(/reward\s+add\s+"([^"]+)"\s+(\d+)/i);
            result = m ? await commandService.addReward(user_id, m[1], m[2], workspaceId) : { success: false, message: 'Invalid format. Use: /points reward add "Name" cost' };
            break;
          }
          case 'remove': {
            const rm = text.match(/reward\s+remove\s+"([^"]+)"/i);
            result = rm ? await commandService.removeReward(user_id, rm[1], workspaceId) : { success: false, message: 'Invalid format. Use: /points reward remove "Name"' };
            break;
          }
          default:
            result = { success: false, message: 'Invalid reward command. Available: add, remove' };
        }
        break;
      }
      case 'reset':
        if (args[1]?.toLowerCase() === 'all') {
          result = await commandService.resetAllPoints(user_id, workspaceId);
        } else if (args.length < 2) {
          result = { success: false, message: 'Please specify a user. Example: /points reset @user' };
        } else {
          result = await commandService.resetPoints(user_id, args[1], client, workspaceId);
        }
        break;
      default:
        result = { success: false, message: 'Invalid command. Available: config, reward, reset' };
    }
    await respond({ text: result.message, response_type: 'ephemeral' });
    if (result.success) {
      const users = await dataService.getAllUsers(workspaceId);
      for (const uid of Object.keys(users)) {
        try { await publishHomeView(client, uid, dataService, commandService, workspaceId); } catch {}
      }
    }
  });

  app.command('/redeem', async ({ command, ack, respond, client }) => {
    await ack();
    const { text, user_id } = command;
    const workspaceId = command.team_id || 'default';
    const adminUsers = await getAdminUsersCached(client, workspaceId, adminCache);
    commandService.setWorkspaceAdmins(workspaceId, adminUsers);
    if (!text.trim()) {
      const rewards = await dataService.getRewards(workspaceId);
      const userRecord = await dataService.getUserRecord(user_id, workspaceId);
      try {
        await client.views.open({ trigger_id: command.trigger_id, view: buildRedeemModal(rewards, userRecord.total) });
      } catch (e) {
        console.error('Error opening redeem modal:', e);
        await respond({ text: 'Could not open redeem modal.', response_type: 'ephemeral' });
      }
      return;
    }
    const match = text.match(/"([^"]+)"/);
    const rewardName = match ? match[1] : text.trim();
    const result = await commandService.redeemReward(user_id, rewardName, workspaceId);
    await respond({ text: result.message, response_type: 'ephemeral' });
    if (result.success && result.data) {
      const { reward, user } = result.data;
      const config = await dataService.getConfig(workspaceId);
      const label = config.label;
      try {
        await client.chat.postMessage({
          channel: user_id,
          blocks: buildRedemptionConfirmation(reward.name, reward.cost, user.total - reward.cost),
          text: `Redemption confirmed: ${reward.name} for ${reward.cost} ${label}`
        });
      } catch {}
      for (const aid of adminUsers) {
        try {
          await client.chat.postMessage({ channel: aid, blocks: buildAdminRedemptionNotification(user_id, reward.name, reward.cost), text: `Notification: ${user_id} redeemed ${reward.name}` });
        } catch {}
      }
      await publishHomeView(client, user_id, dataService, commandService, workspaceId);
    }
  });

  app.view('redeem_modal_submission', async ({ ack, body, view, client }) => {
    await ack();
    const userId = body.user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const selected = view.state.values.reward_select.reward_selection.selected_option;
    if (!selected) {
      await client.chat.postMessage({ channel: userId, text: 'No selection made' });
      return;
    }
    const result = await commandService.redeemReward(userId, selected.value, workspaceId);
    if (result.success && result.data) {
      const { reward, user } = result.data;
      const config = await dataService.getConfig(workspaceId);
      const label = config.label;
      await client.chat.postMessage({ channel: userId, blocks: buildRedemptionConfirmation(reward.name, reward.cost, user.total - reward.cost), text: `Redemption confirmed: ${reward.name} for ${reward.cost} ${label}` });
      const adminUsers = await getAdminUsersCached(client, workspaceId, adminCache);
      commandService.setWorkspaceAdmins(workspaceId, adminUsers);
      for (const aid of adminUsers) {
        await client.chat.postMessage({ channel: aid, blocks: buildAdminRedemptionNotification(userId, reward.name, reward.cost), text: `Notification: ${userId} redeemed ${reward.name}` });
      }
      await publishHomeView(client, userId, dataService, commandService, workspaceId);
    } else {
      await client.chat.postMessage({ channel: userId, text: result.message });
    }
  });
}
