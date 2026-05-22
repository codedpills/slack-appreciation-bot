import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createDataService } from './services/dataServicePg';
import { createRecognitionService } from './services/recognitionService';
import { createCommandService } from './services/commandService';
import { AdminCacheService } from './services/adminCacheService';
import { createSubscriptionService } from './services/subscriptionService';
import { registerBillingWebhookRoutes } from './services/billingWebhook';
import { WorkspaceUsageService } from './services/workspaceUsageService';
import { AuditLogService } from './services/auditLogService';
import { registerRecognitionHandlers } from './handlers/recognitionHandlers';
import { registerCommandHandlers } from './handlers/commandHandlers';
import { registerHomeHandlers } from './handlers/homeHandlers';
import { registerSettingsHandlers } from './handlers/settingsHandlers';
import { getAdminUsers, joinAllChannels, sendWelcomeMessage } from './utils';
import { validateConfig, parseNumber } from './config';
import { logger } from './logger';

// Validate required environment variables before anything else
validateConfig();

const dataService = createDataService();
const recognitionService = createRecognitionService(dataService);
let commandService = createCommandService(dataService, []);
const adminCacheMinutes = parseNumber(process.env.ADMIN_CACHE_TTL_MINUTES, 60);
const adminCacheService = new AdminCacheService(adminCacheMinutes * 60 * 1000);
const subscriptionService = createSubscriptionService(dataService);
const workspaceUsageService = new WorkspaceUsageService(dataService, subscriptionService);
const auditLogService = new AuditLogService();

const scopes = (process.env.SLACK_SCOPES || '')
  .split(',')
  .map(scope => scope.trim())
  .filter(Boolean);

const tokenEncryptionKey = process.env.SLACK_INSTALL_ENCRYPTION_KEY;
const deriveKey = (secret: string) => crypto.createHash('sha256').update(secret).digest();
const encryptToken = (token: string) => {
  if (!tokenEncryptionKey) {
    throw new Error('SLACK_INSTALL_ENCRYPTION_KEY is required for token encryption');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(tokenEncryptionKey), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
};
const decryptToken = (payload: string) => {
  if (!tokenEncryptionKey) {
    throw new Error('SLACK_INSTALL_ENCRYPTION_KEY is required for token decryption');
  }
  if (!payload.startsWith('enc:')) return payload;
  const parts = payload.split(':');
  if (parts.length !== 4) {
    throw new Error('Malformed encrypted token payload');
  }
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

            // Auto-join all public channels on install for easier onboarding
            const { WebClient } = await import('@slack/web-api');
            const installClient = new WebClient(botToken);
            joinAllChannels(installClient).catch(err =>
              logger.warn({ err, workspaceId }, 'Non-blocking: failed to auto-join channels on install')
            );

            // Send welcome DM to the installer
            const installerId = installation.user?.id;
            if (installerId) {
              sendWelcomeMessage(installClient, installerId).catch(err =>
                logger.warn({ err, workspaceId }, 'Non-blocking: failed to send welcome message')
              );
            }
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
  logger.info('Using SLACK_BOT_TOKEN single-workspace mode. OAuth installs are ignored.');
} else {
  logger.info('Using OAuth install mode (installationStore).');
}

// Security headers
receiver.app.use(helmet());

// Rate limiting on billing webhook endpoint
const billingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false
});
receiver.app.use('/billing', billingLimiter);

registerBillingWebhookRoutes(receiver.app, dataService);

receiver.app.get('/health', (_req: any, res: any) => {
  res.status(200).json({ status: 'ok' });
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
      logger.warn({ workspaceId }, 'account_inactive - removed install');
      return;
    }
    throw error;
  }
});

registerRecognitionHandlers(app, recognitionService, dataService, commandService, subscriptionService);
registerHomeHandlers(app, dataService, commandService, adminCacheService, subscriptionService);
registerCommandHandlers(app, dataService, commandService, adminCacheService, subscriptionService, auditLogService);
registerSettingsHandlers(app, dataService, commandService, adminCacheService, auditLogService);

app.event('app_uninstalled', async ({ context }) => {
  const workspaceId = context.teamId;
  if (!workspaceId) return;
  // Full data purge on uninstall (GDPR compliance)
  await dataService.deleteAllWorkspaceData(workspaceId);
  logger.info({ workspaceId }, 'app_uninstalled - purged all workspace data');
});

app.event('channel_created' as any, async ({ event, client }) => {
  const channelId = (event as any)?.channel?.id;
  if (channelId) {
    try {
      await client.conversations.join({ channel: channelId });
    } catch (err) {
      logger.warn({ err, channelId }, 'Failed to auto-join new channel');
    }
  }
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
  logger.info({ port }, 'Slack app is running');

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
          logger.error({ error }, 'Failed to refresh workspace usage');
        }
      };
      await runRefresh();
      setInterval(runRefresh, refreshMs);
    }
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal, draining...');
    try {
      await app.stop();
      await dataService.close();
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();