import { App } from '@slack/bolt';
import { IDataService } from './services/dataServiceInterface';
import { CommandService } from './services/commandService';
import { HomeViewService } from './services/homeViewService';
import { StateLoader } from './services/stateLoader';

export async function loadState(dataService: IDataService, workspaceId?: string) {
  const loader = new StateLoader(dataService);
  return loader.loadState(workspaceId);
}

export async function getAdminUsers(client: any): Promise<string[]> {
  try {
    const result = await client.users.list();
    if (!result.ok || !result.members) {
      console.error('Failed to fetch users:', result.error);
      return [];
    }
    return result.members
      .filter((u: any) => (u.is_admin || u.is_owner || u.is_primary_owner) && !u.deleted)
      .map((u: any) => u.id);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    return [];
  }
}

export async function joinAllChannels(client: any) {
  try {
    let cursor: string | undefined;
    do {
      const res = await client.conversations.list({ exclude_archived: true, limit: 1000, cursor });
      if (!res.ok || !res.channels) { console.error('Failed to fetch channels:', res.error); return; }
      for (const ch of res.channels) {
        if (!ch.is_member) {
          try { await client.conversations.join({ channel: ch.id }); } catch {}
        }
      }
      cursor = res.response_metadata?.next_cursor;
    } while (cursor);
  } catch (error) {
    console.error('Error in joinAllChannels:', error);
  }
}

export async function publishHomeView(
  client: any,
  userId: string,
  dataService: IDataService,
  commandService: CommandService,
  workspaceId?: string
) {
  const homeViewService = new HomeViewService();
  const loader = new StateLoader(dataService);
  const { users, config, rewards, currentUser } = await loader.loadHomeState(userId, workspaceId);
  const { values, dailyLimit, label } = config;
  const isAdmin = commandService.isAdmin(userId, workspaceId);
  if (!/^U[A-Z0-9]+$/.test(userId) || !users[userId]) {
    console.error(`Invalid or missing userId: ${userId}`);
    return;
  }
  try {
    await client.views.publish({
      user_id: userId,
      view: homeViewService.buildHomeView({
        userId,
        section: 'Home',
        users,
        rewards,
        config: { values, dailyLimit, label },
        isAdmin,
        currentUser
      })
    });
  } catch (error) {
    console.error('Error publishing home view:', error);
  }
}
