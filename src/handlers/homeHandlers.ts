import { App } from '@slack/bolt';
import { IDataService } from '../services/dataServiceInterface';
import { CommandService } from '../services/commandService';
import { AdminCacheService } from '../services/adminCacheService';
import { buildHomeViewFromContext } from '../views/homeView';
import { StateLoader } from '../services/stateLoader';

export function registerHomeHandlers(
  app: App,
  dataService: IDataService,
  commandService: CommandService,
  adminCacheService: AdminCacheService
) {
  const stateLoader = new StateLoader(dataService);

  app.event('app_home_opened', async ({ event, client }) => {
    const userId = (event as any).user;
    const workspaceId = (event as any).team || (event as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    const isAdmin = commandService.isAdmin(userId, workspaceId);
    const { users, config, rewards, currentUser } = await stateLoader.loadHomeState(userId, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({
      user_id: userId,
      view: buildHomeViewFromContext({
        userId,
        section: 'Home',
        users,
        rewards,
        config: { values, dailyLimit, label },
        isAdmin,
        currentUser
      })
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
    const { users, config, rewards, currentUser } = await stateLoader.loadHomeState(userId, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({
      user_id: userId,
      view: buildHomeViewFromContext({
        userId,
        section: selectedSection,
        users,
        rewards,
        config: { values, dailyLimit, label },
        isAdmin,
        currentUser
      })
    });
  });
}
