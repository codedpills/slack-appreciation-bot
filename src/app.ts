import { App, LogLevel, GenericMessageEvent } from '@slack/bolt';
import dotenv from 'dotenv';
import { createDataService } from './services/dataServicePg';
import { createRecognitionService } from './services/recognitionService';
import { createCommandService } from './services/commandService';
import { registerRecognitionHandlers } from './handlers/recognitionHandlers';
import { registerCommandHandlers } from './handlers/commandHandlers';
import { registerHomeHandlers } from './handlers/homeHandlers';
import { registerSettingsHandlers } from './handlers/settingsHandlers';
import { getAdminUsers, joinAllChannels } from './utils';

dotenv.config();

const dataService = createDataService();
const recognitionService = createRecognitionService(dataService);
let commandService = createCommandService(dataService, []);

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: false,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: LogLevel.INFO,
});

app.use(async ({ next }) => {
  await next();
});

registerRecognitionHandlers(app, recognitionService, dataService, commandService);
registerHomeHandlers(app, dataService, commandService);
registerCommandHandlers(app, dataService, commandService);
registerSettingsHandlers(app, dataService, commandService);

(async () => {
  const adminUsers = await getAdminUsers(app.client);
  commandService = createCommandService(dataService, adminUsers);

  await dataService.normalizeUserIds(app.client);

  await joinAllChannels(app.client);

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.start(port);
  console.log(`⚡️ Slack app is running on port ${port}`);
})();