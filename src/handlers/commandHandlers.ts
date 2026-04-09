import { App } from '@slack/bolt';
import { IDataService } from '../services/dataServiceInterface';
import { CommandService } from '../services/commandService';
import { loadState, publishHomeView } from '../utils';
import { AdminCacheService } from '../services/adminCacheService';
import { CommandRouter } from '../services/commandRouter';
import { RedemptionService } from '../services/redemptionService';

export function registerCommandHandlers(
  app: App,
  dataService: IDataService,
  commandService: CommandService,
  adminCacheService: AdminCacheService
) {
  const router = new CommandRouter(commandService);
  const redemptionService = new RedemptionService(dataService, commandService);

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
}
