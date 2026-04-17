import { App } from '@slack/bolt';
import { IDataService } from '../services/dataServiceInterface';
import { CommandService } from '../services/commandService';
import { AdminCacheService } from '../services/adminCacheService';
import { StateLoader } from '../services/stateLoader';
import { HomeViewService } from '../services/homeViewService';
import { SubscriptionService } from '../services/subscriptionService';

export function registerHomeHandlers(
  app: App,
  dataService: IDataService,
  commandService: CommandService,
  adminCacheService: AdminCacheService,
  subscriptionService: SubscriptionService
) {
  const stateLoader = new StateLoader(dataService);
  const homeViewService = new HomeViewService();

  app.event('app_home_opened', async ({ event, client }) => {
    const userId = (event as any).user;
    const workspaceId = (event as any).team || (event as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    const isAdmin = commandService.isAdmin(userId, workspaceId);
    const { users, config, rewards, currentUser } = await stateLoader.loadHomeState(userId, workspaceId);
    const { values, dailyLimit, label, gifEnabled, gifMinPoints } = config;
    let billing;
    if (isAdmin && subscriptionService.isBillingEnabled()) {
      await subscriptionService.ensureTrial(workspaceId);
      const subscription = await dataService.getWorkspaceSubscription(workspaceId);
      billing = {
        enabled: true,
        upgradeUrl: subscriptionService.getUpgradeUrl(workspaceId),
        portalUrl: subscriptionService.getPortalUrl(subscription?.providerCustomerId),
        ...(subscription ?? {})
      };
    }
    await client.views.publish({
      user_id: userId,
      view: homeViewService.buildHomeView({
        userId,
        section: 'Home',
        users,
        rewards,
        config: { values, dailyLimit, label, gifEnabled, gifMinPoints },
        isAdmin,
        currentUser,
        billing
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
    const { values, dailyLimit, label, gifEnabled, gifMinPoints } = config;
    let billing;
    if (isAdmin && subscriptionService.isBillingEnabled()) {
      await subscriptionService.ensureTrial(workspaceId);
      const subscription = await dataService.getWorkspaceSubscription(workspaceId);
      billing = {
        enabled: true,
        upgradeUrl: subscriptionService.getUpgradeUrl(workspaceId),
        portalUrl: subscriptionService.getPortalUrl(subscription?.providerCustomerId),
        ...(subscription ?? {})
      };
    }
    await client.views.publish({
      user_id: userId,
      view: homeViewService.buildHomeView({
        userId,
        section: selectedSection,
        users,
        rewards,
        config: { values, dailyLimit, label, gifEnabled, gifMinPoints },
        isAdmin,
        currentUser,
        billing
      })
    });
  });
}
