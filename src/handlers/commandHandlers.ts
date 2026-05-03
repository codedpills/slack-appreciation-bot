import { App } from '@slack/bolt';
import { IDataService } from '../services/dataServiceInterface';
import { CommandService } from '../services/commandService';
import { loadState, publishHomeView } from '../utils';
import { AdminCacheService } from '../services/adminCacheService';
import { CommandRouter } from '../services/commandRouter';
import { RedemptionService } from '../services/redemptionService';
import { SubscriptionService } from '../services/subscriptionService';

const buildBillingMessage = (upgradeUrl?: string) => {
  if (upgradeUrl) {
    return `This workspace needs an active subscription to use this feature. Subscribe here: ${upgradeUrl}`;
  }
  return 'This workspace needs an active subscription to use this feature.';
};

export function registerCommandHandlers(
  app: App,
  dataService: IDataService,
  commandService: CommandService,
  adminCacheService: AdminCacheService,
  subscriptionService: SubscriptionService
) {
  const router = new CommandRouter(commandService);
  const redemptionService = new RedemptionService(dataService, commandService);

  app.command('/points', async ({ command, ack, respond, client }) => {
    await ack();
    const { text, user_id } = command;
    const workspaceId = command.team_id || 'default';
    const access = await subscriptionService.checkAccess(workspaceId);
    if (!access.allowed) {
      await respond({ text: buildBillingMessage(access.upgradeUrl), response_type: 'ephemeral' });
      return;
    }
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
    const access = await subscriptionService.checkAccess(workspaceId);
    if (!access.allowed) {
      await respond({ text: buildBillingMessage(access.upgradeUrl), response_type: 'ephemeral' });
      return;
    }
    const adminUsers = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, adminUsers);
    if (!text.trim()) {
      const opened = await redemptionService.openRedeemModal(client, user_id, command.trigger_id, workspaceId);
      if (!opened) {
        await respond({ text: 'Could not open redeem modal.', response_type: 'ephemeral' });
      }
      return;
    }
    const result = await redemptionService.redeemRewardFromText(client, user_id, text, workspaceId, adminUsers);
    await respond({ text: result.message, response_type: 'ephemeral' });
    if (result.success && result.data) {
      await publishHomeView(client, user_id, dataService, commandService, workspaceId);
    }
  });

  app.view('redeem_modal_submission', async ({ ack, body, view, client }) => {
    await ack();
    const userId = body.user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const access = await subscriptionService.checkAccess(workspaceId);
    if (!access.allowed) {
      await client.chat.postMessage({ channel: userId, text: buildBillingMessage(access.upgradeUrl) });
      return;
    }
    const selected = view.state.values.reward_select.reward_selection.selected_option;
    if (!selected) {
      await client.chat.postMessage({ channel: userId, text: 'No selection made' });
      return;
    }
    const adminUsers = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, adminUsers);
    const result = await redemptionService.redeemReward(client, userId, selected.value, workspaceId, adminUsers);
    if (result.success && result.data) {
      await publishHomeView(client, userId, dataService, commandService, workspaceId);
    } else {
      await client.chat.postMessage({ channel: userId, text: result.message });
    }
  });

  app.action(/redeem_store_.+/, async ({ body, ack, client }) => {
    await ack();
    const userId = (body as any).user?.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    if (!userId) return;
    const access = await subscriptionService.checkAccess(workspaceId);
    if (!access.allowed) {
      await client.chat.postEphemeral({ channel: userId, user: userId, text: buildBillingMessage(access.upgradeUrl) });
      return;
    }
    const opened = await redemptionService.openRedeemModal(client, userId, (body as any).trigger_id, workspaceId);
    if (!opened) {
      await client.chat.postEphemeral({ channel: userId, user: userId, text: 'Could not open redeem modal.' });
    }
  });

  app.action('fulfill_reward', async ({ body, ack, client }) => {
    await ack();
    const userId = (body as any).user?.id;
    if (!userId) return;
    await client.chat.postEphemeral({
      channel: userId,
      user: userId,
      text: 'Thanks! Reward marked as fulfilled.'
    });
  });
}
