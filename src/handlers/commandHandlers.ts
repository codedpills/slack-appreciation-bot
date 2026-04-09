import { App } from '@slack/bolt';
import { IDataService } from '../services/dataServiceInterface';
import { CommandService } from '../services/commandService';
import { loadState, publishHomeView } from '../utils';
import { AdminCacheService } from '../services/adminCacheService';
import { CommandRouter } from '../services/commandRouter';
import {
  buildRedeemModal,
  buildRedemptionConfirmation,
  buildAdminRedemptionNotification
} from '../views/homeView';

export function registerCommandHandlers(
  app: App,
  dataService: IDataService,
  commandService: CommandService,
  adminCacheService: AdminCacheService
) {
  const router = new CommandRouter(commandService);

  app.command('/points', async ({ command, ack, respond, client }) => {
    await ack();
    const { text, user_id } = command;
    const workspaceId = command.team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    const result = await router.handlePoints(text, user_id, workspaceId, client);
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
    const adminUsers = await adminCacheService.getAdmins(client, workspaceId);
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
      const adminUsers = await adminCacheService.getAdmins(client, workspaceId);
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
