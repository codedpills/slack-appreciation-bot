import { App } from '@slack/bolt';
import { IDataService } from './services/dataServiceInterface';
import { CommandService } from './services/commandService';
import { HomeViewService } from './services/homeViewService';
import { StateLoader } from './services/stateLoader';
import { logger } from './logger';

/**
 * Extract workspace ID from various Slack payload shapes.
 * Throws if no workspace ID can be determined.
 */
export function extractWorkspaceId(payload: { team_id?: string; team?: { id?: string } } | any): string {
  const id = payload?.team_id || payload?.team?.id || payload?.context?.teamId;
  if (!id) {
    throw new Error('Unable to determine workspace ID from request');
  }
  return id;
}

export async function loadState(dataService: IDataService, workspaceId?: string) {
  const loader = new StateLoader(dataService);
  return loader.loadState(workspaceId);
}

export async function getAdminUsers(client: any): Promise<string[]> {
  try {
    const result = await client.users.list();
    if (!result.ok || !result.members) {
      logger.error({ error: result.error }, 'Failed to fetch users');
      return [];
    }
    return result.members
      .filter((u: any) => (u.is_admin || u.is_owner || u.is_primary_owner) && !u.deleted)
      .map((u: any) => u.id);
  } catch (error) {
    logger.error({ error }, 'Error fetching admin users');
    return [];
  }
}

export async function joinAllChannels(client: any) {
  try {
    let cursor: string | undefined;
    do {
      const res = await client.conversations.list({
        exclude_archived: true,
        types: 'public_channel',
        limit: 200,
        cursor
      });
      if (!res.ok || !res.channels) { logger.error({ error: res.error }, 'Failed to fetch channels'); return; }
      for (const ch of res.channels) {
        if (!ch.is_member) {
          try { await client.conversations.join({ channel: ch.id }); } catch {}
        }
      }
      cursor = res.response_metadata?.next_cursor;
    } while (cursor);
  } catch (error) {
    logger.error({ error }, 'Error in joinAllChannels');
  }
}

export async function sendWelcomeMessage(client: any, userId: string) {
  const message = [
    '🎉 *Welcome to Reecog!* Your team is all set to start recognizing great work.',
    '',
    '🚀 *Quick Setup Guide:*',
    '',
    '✅ *Auto-joined channels* — I\'ve already joined all public channels so your team can start recognizing each other right away!',
    '',
    '➕ *Add me to private channels* — Want recognition in a private channel? Just invite me with `/invite @Reecog`',
    '',
    '🙌 *How to give recognition:*',
    '> `@teammate +++ Great job on the presentation! #teamwork`',
    '> `@alice @bob ++ Thanks for the help #collaboration`',
    '> More `+` signs = more points!',
    '',
    '⚙️ *Admin setup* — Head to the *Home* tab and open *Settings* to:',
    '• Set your company values (used as hashtags)',
    '• Configure rewards your team can redeem',
    '• Adjust daily point limits',
    '',
    '💡 *Pro tips:*',
    '• Use `/points` to check your balance and manage settings',
    '• Use `/redeem` to claim rewards',
    '• Recognition works in any channel I\'m in!',
    '',
    'Let\'s build a culture of appreciation together! 🌟'
  ].join('\n');

  await client.chat.postMessage({
    channel: userId,
    text: message
  });
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
  const { values, dailyLimit, label, gifEnabled, gifMinPoints } = config;
  const isAdmin = commandService.isAdmin(userId, workspaceId);
  if (!/^U[A-Z0-9]+$/.test(userId) || !users[userId]) {
    logger.error({ userId }, 'Invalid or missing userId');
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
        config: { values, dailyLimit, label, gifEnabled, gifMinPoints },
        isAdmin,
        currentUser
      })
    });
  } catch (error) {
    logger.error({ error }, 'Error publishing home view');
  }
}
