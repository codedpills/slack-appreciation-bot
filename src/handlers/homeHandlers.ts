import { App } from '@slack/bolt';
import { IDataService } from '../services/dataServiceInterface';
import { CommandService } from '../services/commandService';
import { loadState, publishHomeView } from '../utils';
import { AdminCacheService } from '../services/adminCacheService';
import { buildHomeView } from '../views/homeView';

export function registerHomeHandlers(
  app: App,
  dataService: IDataService,
  commandService: CommandService,
  adminCacheService: AdminCacheService
) {
  app.event('app_home_opened', async ({ event, client }) => {
    const userId = (event as any).user;
    const workspaceId = (event as any).team || (event as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    const isAdmin = commandService.isAdmin(userId, workspaceId);
    const { users, config, rewards } = await loadState(dataService, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({
      user_id: userId,
      view: buildHomeView(users, values, userId, 'Home', rewards, isAdmin, dailyLimit, label)
    });
  });

  app.action('home_section_select', async ({ action, body, ack, client }) => {
    await ack();
    const selectedSection = (action as any).selected_option.value;
    const userId = (body as any).user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    const isAdmin = commandService.isAdmin(userId, workspaceId);
    const { users, config, rewards } = await loadState(dataService, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({
      user_id: userId,
      view: buildHomeView(users, values, userId, selectedSection, rewards, isAdmin, dailyLimit, label)
    });
  });
}
