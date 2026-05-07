import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createDataService } from './services/dataServicePg';
import { createRecognitionService } from './services/recognitionService';
import { createCommandService } from './services/commandService';
import { AdminCacheService } from './services/adminCacheService';
import { createSubscriptionService } from './services/subscriptionService';
import { registerBillingWebhookRoutes } from './services/billingWebhook';
import { WorkspaceUsageService } from './services/workspaceUsageService';
import { registerRecognitionHandlers } from './handlers/recognitionHandlers';
import { registerCommandHandlers } from './handlers/commandHandlers';
import { registerHomeHandlers } from './handlers/homeHandlers';
import { registerSettingsHandlers } from './handlers/settingsHandlers';
import { getAdminUsers, joinAllChannels } from './utils';

dotenv.config();

const parseNumber = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const dataService = createDataService();
const recognitionService = createRecognitionService(dataService);
let commandService = createCommandService(dataService, []);
const adminCacheMinutes = parseNumber(process.env.ADMIN_CACHE_TTL_MINUTES, 60);
const adminCacheService = new AdminCacheService(adminCacheMinutes * 60 * 1000);
const subscriptionService = createSubscriptionService(dataService);
const workspaceUsageService = new WorkspaceUsageService(dataService, subscriptionService);

const scopes = (process.env.SLACK_SCOPES || '')
  .split(',')
  .map(scope => scope.trim())
  .filter(Boolean);

const tokenEncryptionKey = process.env.SLACK_INSTALL_ENCRYPTION_KEY;
const deriveKey = (secret: string) => crypto.createHash('sha256').update(secret).digest();
const encryptToken = (token: string) => {
  if (!tokenEncryptionKey) return token;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(tokenEncryptionKey), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
};
const decryptToken = (payload: string) => {
  if (!tokenEncryptionKey) return payload;
  if (!payload.startsWith('enc:')) return payload;
  const parts = payload.split(':');
  if (parts.length !== 4) return payload;
  const iv = Buffer.from(parts[1], 'base64');
  const encrypted = Buffer.from(parts[2], 'base64');
  const tag = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(tokenEncryptionKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

const isAccountInactiveError = (error: any) => {
  const slackError = error?.data?.error || error?.error;
  return slackError === 'account_inactive';
};

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET || '',
  endpoints: {
    events: '/slack/events',
    commands: '/slack/commands',
    actions: '/slack/actions'
  },
  ...(process.env.SLACK_BOT_TOKEN
    ? {}
    : {
        clientId: process.env.SLACK_CLIENT_ID,
        clientSecret: process.env.SLACK_CLIENT_SECRET,
        stateSecret: process.env.SLACK_STATE_SECRET,
        scopes,
        installerOptions: {
          directInstall: true
        },
        installationStore: {
          storeInstallation: async (installation: any) => {
            const workspaceId = installation.team?.id;
            const botUserId = installation.bot?.userId;
            const botToken = installation.bot?.token;
            if (!workspaceId || !botUserId || !botToken) {
              throw new Error('Missing installation data');
            }
            await dataService.upsertWorkspaceInstall({
              workspaceId,
              botUserId,
              botToken: encryptToken(botToken),
              installedAt: new Date().toISOString()
            });
            await subscriptionService.ensureTrial(workspaceId);
          },
          fetchInstallation: async (installQuery: any) => {
            const workspaceId = installQuery.teamId;
            if (!workspaceId) {
              throw new Error('Missing teamId for installation lookup');
            }
            const install = await dataService.getWorkspaceInstall(workspaceId);
            if (!install) {
              throw new Error(`No installation found for workspace ${workspaceId}`);
            }
            const token = decryptToken(install.botToken);
            return {
              enterprise: undefined,
              team: { id: install.workspaceId },
              user: {
                id: install.botUserId,
                token: undefined,
                scopes
              },
              bot: {
                id: install.botUserId,
                token,
                userId: install.botUserId,
                scopes
              }
            };
          }
        }
      })
});

const app = new App({
  receiver,
  logLevel: LogLevel.INFO,
  ...(process.env.SLACK_BOT_TOKEN ? { token: process.env.SLACK_BOT_TOKEN } : {})
});

if (process.env.SLACK_BOT_TOKEN) {
  console.log('[Startup] Using SLACK_BOT_TOKEN single-workspace mode. OAuth installs are ignored.');
} else {
  console.log('[Startup] Using OAuth install mode (installationStore).');
}

registerBillingWebhookRoutes(receiver.app, dataService);

receiver.app.get('/health', (_req: any, res: any) => {
  res.status(200).send('ok');
});

app.use(async ({ context, next }) => {
  try {
    await next();
  } catch (error) {
    if (isAccountInactiveError(error)) {
      const workspaceId = context.teamId;
      if (workspaceId) {
        await dataService.deleteWorkspaceInstall(workspaceId);
      }
      console.warn('[Slack] account_inactive - removed install for workspace', workspaceId);
      return;
    }
    throw error;
  }
});

registerRecognitionHandlers(app, recognitionService, dataService, commandService, subscriptionService);
registerHomeHandlers(app, dataService, commandService, adminCacheService, subscriptionService);
registerCommandHandlers(app, dataService, commandService, adminCacheService, subscriptionService);
registerSettingsHandlers(app, dataService, commandService, adminCacheService);

app.event('app_uninstalled', async ({ context }) => {
  const workspaceId = context.teamId;
  if (!workspaceId) return;
  await dataService.deleteWorkspaceInstall(workspaceId);
  console.log('[Slack] app_uninstalled - removed install for workspace', workspaceId);
});

(async () => {
  if (process.env.SLACK_BOT_TOKEN) {
    const adminUsers = await getAdminUsers(app.client);
    commandService = createCommandService(dataService, adminUsers);

    await dataService.normalizeUserIds(app.client);

    await joinAllChannels(app.client);
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.start(port);
  console.log(`⚡️ Slack app is running on port ${port}`);

  if (subscriptionService.isBillingEnabled()) {
    const refreshDays = parseNumber(process.env.BILLING_REFRESH_DAYS, 7);
    if (refreshDays > 0) {
      const refreshMs = refreshDays * 24 * 60 * 60 * 1000;
      const runRefresh = async () => {
        try {
          const installs = await dataService.listWorkspaceInstalls();
          const tokenByWorkspace = new Map(
            installs.map(install => [install.workspaceId, decryptToken(install.botToken)])
          );
          await workspaceUsageService.refreshAllWorkspaceUserCounts(app.client, tokenByWorkspace);
        } catch (error) {
          console.error('Failed to refresh workspace usage:', error);
        }
      };
      await runRefresh();
      setInterval(runRefresh, refreshMs);
    }
  }
})();