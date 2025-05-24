import { App, LogLevel, GenericMessageEvent } from '@slack/bolt';
import dotenv from 'dotenv';
import path from 'path';

import { createDataService } from './services/dataService';
import { createRecognitionService } from './services/recognitionService';
import { createCommandService } from './services/commandService';
import {
  buildHomeView,
  buildRedeemModal,
  buildRedemptionConfirmation,
  buildAdminRedemptionNotification
} from './views/homeView';

dotenv.config();

const dataFilePath = process.env.DATA_FILE_PATH || path.join(__dirname, '../data/store.json');

const dataService = createDataService(dataFilePath);
const recognitionService = createRecognitionService(dataService);

let commandService = createCommandService(dataService, []);

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: false,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: LogLevel.INFO,
});

app.use(async ({ payload, next }) => {
  console.log("🚀 ~ Incoming event payload:", payload);
  await next();
});

async function getAdminUsers(client: any): Promise<string[]> {
  try {
    const result = await client.users.list();
    if (!result.ok || !result.members) {
      console.error('Failed to fetch users:', result.error);
      return [];
    }

    const adminUsers = result.members
      .filter((user: any) => (user.is_admin || user.is_owner || user.is_primary_owner) && !user.deleted)
      .map((user: any) => user.id);

    return adminUsers;
  } catch (error) {
    console.error('Error fetching admin users:', error);
    return [];
  }
}

async function joinAllChannels(client: any) {
  try {
    let cursor: string | undefined;
    do {
      const result = await client.conversations.list({
        exclude_archived: true,
        limit: 1000,
        cursor,
      });

      if (!result.ok || !result.channels) {
        console.error("Failed to fetch channels:", result.error);
        return;
      }

      for (const channel of result.channels) {
        if (channel.is_member) {
          continue;
        }

        try {
          await client.conversations.join({ channel: channel.id });
        } catch (error) {
          console.error(`Failed to join channel ${channel.name}:`, error);
        }
      }

      cursor = result.response_metadata?.next_cursor;
    } while (cursor);
  } catch (error) {
    console.error("Error in joinAllChannels:", error);
  }
}

app.message(async ({ message, say, client }) => {
  if (!('text' in message) || !('user' in message) || message.subtype === 'bot_message') return;

  const messageEvent = message as GenericMessageEvent;

  if (!messageEvent.text || !messageEvent.user) return;

  const recognitions = await recognitionService.parseRecognitionsWithGroups(messageEvent.text, messageEvent.user, client);

  for (const recognition of recognitions) {
    await say({
      text: `:tada: <@${recognition.receiver}> +${recognition.points} pts for *${recognition.value}*!`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:tada: <@${recognition.receiver}> *+${recognition.points} pts* for *${recognition.value}*!`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Recognized by <@${recognition.giver}> for: ${recognition.reason}`
            }
          ]
        }
      ]
    });
  }

  if (recognitions.length > 0) {
    try {
      await publishHomeView(client, recognitions[0].receiver);
      await publishHomeView(client, recognitions[0].giver);
    } catch (error) {
      console.error('Error publishing home view:', error);
    }
  }
});

async function publishHomeView(client: any, userId: string) {
  const users = dataService.getAllUsers();
  const config = dataService.getConfig();

  // Validate userId format (Slack user IDs start with 'U' and are alphanumeric)
  if (!/^U[A-Z0-9]+$/.test(userId)) {
    console.error(`Invalid user_id format: ${userId}`);
    return;
  }

  // Validate userId exists in the database
  if (!users[userId]) {
    console.error(`User ID not found in database: ${userId}`);
    return;
  }

  try {
    await client.views.publish({
      user_id: userId,
      view: buildHomeView(users, config.values, userId)
    });
  } catch (error) {
    console.error('Error publishing home view:', error);
  }
}

app.event('app_home_opened', async ({ event, client }) => {
  await publishHomeView(client, event.user);
});

app.command('/points', async ({ command, ack, respond, client }) => {
  await ack();

  const { text, user_id } = command;
  const args = text.trim().split(/\s+/);
  const subCommand = args[0]?.toLowerCase();

  let result;

  switch (subCommand) {
    case 'config':
      const configCommand = args[1]?.toLowerCase();

      switch (configCommand) {
        case 'daily_limit':
          result = await commandService.setDailyLimit(user_id, args[2]);
          break;

        case 'add_value':
          result = await commandService.addValue(user_id, args[2]);
          break;

        case 'remove_value':
          result = await commandService.removeValue(user_id, args[2]);
          break;

        default:
          result = {
            success: false,
            message: 'Invalid config command. Available commands: daily_limit, add_value, remove_value'
          };
      }
      break;

    case 'reward':
      const rewardCommand = args[1]?.toLowerCase();

      switch (rewardCommand) {
        case 'add':
          const match = text.match(/reward\s+add\s+"([^"]+)"\s+(\d+)/i);

          if (match) {
            result = await commandService.addReward(user_id, match[1], match[2]);
          } else {
            result = {
              success: false,
              message: 'Invalid format. Use: /points reward add "Reward Name" cost'
            };
          }
          break;

        case 'remove':
          const removeMatch = text.match(/reward\s+remove\s+"([^"]+)"/i);

          if (removeMatch) {
            result = await commandService.removeReward(user_id, removeMatch[1]);
          } else {
            result = {
              success: false,
              message: 'Invalid format. Use: /points reward remove "Reward Name"'
            };
          }
          break;

        default:
          result = {
            success: false,
            message: 'Invalid reward command. Available commands: add, remove'
          };
      }
      break;

    case 'reset':
      if (args[1]?.toLowerCase() === 'all') {
        result = await commandService.resetAllPoints(user_id);
      } else if (args.length < 2) {
        result = {
          success: false,
          message: 'Please specify a user to reset. Example: /points reset @user'
        };
      } else {
        result = await commandService.resetPoints(user_id, args[1], client);
      }
      break;

    default:
      result = {
        success: false,
        message: 'Invalid command. Available commands: config, reward, reset'
      };
  }

  await respond({
    text: result.message,
    response_type: 'ephemeral'
  });

  if (result.success) {
    const users = dataService.getAllUsers();
    for (const userId of Object.keys(users)) {
      try {
        await publishHomeView(client, userId);
      } catch (error) {
        console.error(`Error updating home view for ${userId}:`, error);
      }
    }
  }
});

app.command('/redeem', async ({ command, ack, respond, client }) => {
  await ack();

  const { text, user_id } = command;

  const adminUsers = await getAdminUsers(client);

  if (!text.trim()) {
    const rewards = dataService.getRewards();
    const userRecord = dataService.getUserRecord(user_id);

    try {
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildRedeemModal(rewards, userRecord.total)
      });
    } catch (error) {
      console.error('Error opening redeem modal:', error);
      await respond({
        text: 'Failed to open redemption modal. Please try again.',
        response_type: 'ephemeral'
      });
    }
    return;
  }

  const match = text.match(/"([^"]+)"/);
  const rewardName = match ? match[1] : text.trim();

  const result = await commandService.redeemReward(user_id, rewardName);

  await respond({
    text: result.message,
    response_type: 'ephemeral'
  });

  if (result.success && result.data) {
    const { reward, user } = result.data;

    try {
      await client.chat.postMessage({
        channel: user_id,
        blocks: buildRedemptionConfirmation(
          reward.name,
          reward.cost,
          user.total - reward.cost
        ),
        text: `Redemption confirmed: ${reward.name} for ${reward.cost} points`
      });
    } catch (error) {
      console.error('Error sending redemption confirmation:', error);
    }

    for (const adminId of adminUsers) {
      try {
        await client.chat.postMessage({
          channel: adminId,
          blocks: buildAdminRedemptionNotification(user_id, reward.name, reward.cost),
          text: `Redemption notification: ${user_id} redeemed ${reward.name}`
        });
      } catch (error) {
        console.error(`Error notifying admin ${adminId}:`, error);
      }
    }

    await publishHomeView(client, user_id);
  }
});

app.view('redeem_modal_submission', async ({ ack, body, view, client }) => {
  await ack();

  const userId = body.user.id;
  const selectedOption = view.state.values.reward_select.reward_selection.selected_option;

  if (!selectedOption) {
    await client.chat.postMessage({
      channel: userId,
      text: "No reward was selected. Please try again.",
    });
    return;
  }

  const rewardName = selectedOption.value;

  const result = await commandService.redeemReward(userId, rewardName);

  if (result.success && result.data) {
    const { reward, user } = result.data;

    try {
      await client.chat.postMessage({
        channel: userId,
        blocks: buildRedemptionConfirmation(
          reward.name,
          reward.cost,
          user.total - reward.cost
        ),
        text: `Redemption confirmed: ${reward.name} for ${reward.cost} points`
      });
    } catch (error) {
      console.error('Error sending redemption confirmation:', error);
    }

    const adminUsers = await getAdminUsers(client);
    for (const adminId of adminUsers) {
      try {
        await client.chat.postMessage({
          channel: adminId,
          blocks: buildAdminRedemptionNotification(userId, reward.name, reward.cost),
          text: `Redemption notification: ${userId} redeemed ${reward.name}`
        });
      } catch (error) {
        console.error(`Error notifying admin ${adminId}:`, error);
      }
    }

    await publishHomeView(client, userId);
  } else {
    try {
      await client.chat.postMessage({
        channel: userId,
        text: result.message,
      });
    } catch (error) {
      console.error('Error sending redemption error message:', error);
    }
  }
});

app.event('url_verification', async ({ event, ack }) => {
  if (event && 'challenge' in event) {
    await (ack as any)({ challenge: event.challenge });
  } else {
    console.error('URL verification event missing challenge property');
    await (ack as any)();
  }
});

(async () => {
  const adminUsers = await getAdminUsers(app.client);
  commandService = createCommandService(dataService, adminUsers);

  // Normalize user IDs in the database
  await dataService.normalizeUserIds(app.client);

  await joinAllChannels(app.client);

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.start(port);
  console.log(`⚡️ Appreciation bot is running on port ${port}`);
})();