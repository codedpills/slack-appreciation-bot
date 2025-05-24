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

app.use(async ({ next }) => {
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

  // process and record recognitions, returning valid recognitions
  const recognitions = await recognitionService.processRecognitionsWithGroups(messageEvent.text, messageEvent.user, client);
  const label = dataService.getConfig().label;

  for (const recognition of recognitions) {
    await say({
      text: `:tada: <@${recognition.receiver}> +${recognition.points} ${label} for *${recognition.value}!`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:tada: <@${recognition.receiver}> *+${recognition.points} ${label}* for *${recognition.value}*!`
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
      // refresh Home views so persistence is shown
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
  const isAdmin = commandService.isAdmin(userId);

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
      view: buildHomeView(users, config.values, userId, 'Home', dataService.getRewards(), isAdmin, config.dailyLimit, config.label)
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

        case 'label':
          const newLabel = args.slice(2).join(' ');
          result = await commandService.setLabel(user_id, newLabel);
          break;

        default:
          result = {
            success: false,
            message: 'Invalid config command. Available commands: daily_limit, add_value, remove_value, label'
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
    const config = dataService.getConfig();
    const label = config.label;

    try {
      await client.chat.postMessage({
        channel: user_id,
        blocks: buildRedemptionConfirmation(
          reward.name,
          reward.cost,
          user.total - reward.cost
        ),
        text: `Redemption confirmed: ${reward.name} for ${reward.cost} ${label}`
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
        text: `Redemption confirmed: ${reward.name} for ${reward.cost} ${dataService.getConfig().label}`
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

// Handle section dropdown selection in App Home
app.action('home_section_select', async ({ action, body, ack, client }) => {
  await ack();
  const selectedSection = (action as any).selected_option.value;
  const userId = (body as any).user.id;
  const users = dataService.getAllUsers();
  const values = dataService.getConfig().values;
  const isAdmin = commandService.isAdmin(userId);
  try {
    await client.views.publish({
      user_id: userId,
      view: buildHomeView(users, values, userId, selectedSection, dataService.getRewards(), isAdmin, dataService.getConfig().dailyLimit, dataService.getConfig().label)
    });
  } catch (error) {
    console.error('Error updating home view section:', error);
  }
});

// Handle Reset All Points button in Settings
app.action('settings_reset_all', async ({ body, ack, client }) => {
  await ack();
  const userId = (body as any).user.id;
  if (!commandService.isAdmin(userId)) return;
  await commandService.resetAllPoints(userId);
  // Notify admin
  try {
    await client.chat.postEphemeral({ channel: userId, user: userId, text: 'All user points have been reset.' });
  } catch { }
  // Refresh Home view in Settings
  const users = dataService.getAllUsers();
  const values = dataService.getConfig().values;
  const isAdmin = true;
  try {
    await client.views.publish({
      user_id: userId,
      view: buildHomeView(users, values, userId, 'Settings', dataService.getRewards(), isAdmin, dataService.getConfig().dailyLimit, dataService.getConfig().label)
    });
  } catch (error) {
    console.error('Error refreshing Settings view after reset all:', error);
  }
});

// Handle Reset Rewards button in Settings
app.action('settings_reset_rewards', async ({ body, ack, client }) => {
  await ack();
  const userId = (body as any).user.id;
  if (!commandService.isAdmin(userId)) return;
  const result = await commandService.resetRewards(userId);
  try {
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
  } catch {}
  // Refresh Settings view
  const users = dataService.getAllUsers();
  const values = dataService.getConfig().values;
  const rewards = dataService.getRewards();
  const isAdmin = true;
  try {
    await client.views.publish({
      user_id: userId,
      view: buildHomeView(users, values, userId, 'Settings', rewards, isAdmin, dataService.getConfig().dailyLimit, dataService.getConfig().label)
    });
  } catch (error) {
    console.error('Error refreshing Settings view after reset rewards:', error);
  }
});

// Handle Reset Company Values button in Settings
app.action('settings_reset_values', async ({ body, ack, client }) => {
  await ack();
  const userId = (body as any).user.id;
  if (!commandService.isAdmin(userId)) return;
  const result = await commandService.resetValues(userId);
  try {
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
  } catch {}
  // Refresh Settings view
  const users = dataService.getAllUsers();
  const values = dataService.getConfig().values;
  const rewards = dataService.getRewards();
  const isAdmin = true;
  try {
    await client.views.publish({
      user_id: userId,
      view: buildHomeView(users, values, userId, 'Settings', rewards, isAdmin, dataService.getConfig().dailyLimit, dataService.getConfig().label)
    });
  } catch (error) {
    console.error('Error refreshing Settings view after reset values:', error);
  }
});

// Handle redeem button in Goodies store
app.action(/redeem_store_.+/, async ({ action, body, ack, client, respond }) => {
  await ack();
  const userId = (body as any).user.id;
  const rewardName = (action as any).value;
  const result = await commandService.redeemReward(userId, rewardName);
  // Send feedback
  const message = result.success ? `🎉 Redeemed "${rewardName}" successfully!` : result.message;
  try {
    await client.chat.postEphemeral({
      channel: userId,
      user: userId,
      text: message
    });
  } catch (error) {
    console.error('Error sending redemption feedback:', error);
  }
  // Refresh Home view in Goodies store section
  const users = dataService.getAllUsers();
  const values = dataService.getConfig().values;
  try {
    await client.views.publish({
      user_id: userId,
      view: buildHomeView(users, values, userId, 'Goodies store', dataService.getRewards(), commandService.isAdmin(userId), dataService.getConfig().dailyLimit, dataService.getConfig().label)
    });
  } catch (error) {
    console.error('Error refreshing Home view after redeem:', error);
  }
});

// Handle Set Daily Limit button in Settings
app.action('settings_set_daily_limit', async ({ body, ack, client }) => {
  await ack();
  const userId = (body as any).user.id;
  // Open modal to input new daily limit
  try {
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal' as const,
        callback_id: 'settings_set_daily_limit_modal',
        title: { type: 'plain_text', text: 'Set Daily Limit', emoji: true },
        submit: { type: 'plain_text', text: 'Set', emoji: true },
        close: { type: 'plain_text', text: 'Cancel', emoji: true },
        blocks: [
          {
            type: 'input' as const,
            block_id: 'daily_limit_block',
            element: {
              type: 'plain_text_input' as const,
              action_id: 'daily_limit_input',
              placeholder: { type: 'plain_text', text: 'Enter a number', emoji: true }
            },
            label: { type: 'plain_text', text: 'Daily Limit', emoji: true }
          }
        ]
      }
    });
  } catch (error) {
    console.error('Error opening daily limit modal:', error);
  }
});

// Handle submission of Set Daily Limit modal
app.view('settings_set_daily_limit_modal', async ({ ack, body, view, client }) => {
  await ack();
  const userId = body.user.id;
  const limitValue = view.state.values.daily_limit_block.daily_limit_input.value || "";
  const result = await commandService.setDailyLimit(userId, limitValue);
  // send feedback
  try {
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
  } catch (error) {
    console.error('Error sending daily limit feedback:', error);
  }
  // refresh view
  const users = dataService.getAllUsers();
  const values = dataService.getConfig().values;
  const isAdmin = true;
  try {
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', dataService.getRewards(), isAdmin, dataService.getConfig().dailyLimit, dataService.getConfig().label) });
  } catch (error) {
    console.error('Error refreshing view after daily limit set:', error);
  }
});

// Add handlers for other settings actions

// Add Value
app.action('settings_add_value', async ({ body, ack, client }) => {
  await ack();
  const userId = (body as any).user.id;
  try {
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal' as const,
        callback_id: 'settings_add_value_modal',
        title: { type: 'plain_text', text: 'Add Company Value', emoji: true },
        submit: { type: 'plain_text', text: 'Add', emoji: true },
        close: { type: 'plain_text', text: 'Cancel', emoji: true },
        blocks: [
          {
            type: 'input' as const,
            block_id: 'add_value_block',
            element: {
              type: 'plain_text_input' as const,
              action_id: 'add_value_input',
              placeholder: { type: 'plain_text', text: 'Enter new value', emoji: true }
            },
            label: { type: 'plain_text', text: 'New Company Value', emoji: true }
          }
        ]
      }
    });
  } catch (error) {
    console.error('Error opening add value modal:', error);
  }
});

// Add Value submission
app.view('settings_add_value_modal', async ({ ack, body, view, client }) => {
  await ack();
  const userId = body.user.id;
  const value = view.state.values.add_value_block.add_value_input.value || "";
  const result = await commandService.addValue(userId, value);
  try {
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
  } catch { }
  // refresh Settings view
  const users = dataService.getAllUsers();
  const values = dataService.getConfig().values;
  const rewards = dataService.getRewards();
  const isAdmin = true;
  try {
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, isAdmin, dataService.getConfig().dailyLimit, dataService.getConfig().label) });
  } catch (error) {
    console.error('Error refreshing view after add value:', error);
  }
});

// Remove Value
app.action('settings_remove_value', async ({ body, ack, client }) => {
  await ack();
  const userId = (body as any).user.id;
  const currentValues = dataService.getConfig().values;
  try {
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal' as const,
        callback_id: 'settings_remove_value_modal',
        title: { type: 'plain_text', text: 'Remove Company Value', emoji: true },
        submit: { type: 'plain_text', text: 'Remove', emoji: true },
        close: { type: 'plain_text', text: 'Cancel', emoji: true },
        blocks: [
          {
            type: 'input' as const,
            block_id: 'remove_value_block',
            element: {
              type: 'static_select' as const,
              action_id: 'remove_value_select',
              placeholder: { type: 'plain_text', text: 'Select a value', emoji: true },
              options: currentValues.map(val => ({ text: { type: 'plain_text', text: val, emoji: true }, value: val }))
            },
            label: { type: 'plain_text', text: 'Company Value to Remove', emoji: true }
          }
        ]
      }
    });
  } catch (error) {
    console.error('Error opening remove value modal:', error);
  }
});

// Remove Value submission
app.view('settings_remove_value_modal', async ({ ack, body, view, client }) => {
  await ack();
  const userId = body.user.id;
  const selected = view.state.values.remove_value_block.remove_value_select.selected_option?.value;
  const result = await commandService.removeValue(userId, selected || '');
  try {
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
  } catch { }
  // refresh Settings view
  const users = dataService.getAllUsers();
  const values = dataService.getConfig().values;
  const rewards = dataService.getRewards();
  const isAdmin = true;
  try {
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, isAdmin, dataService.getConfig().dailyLimit, dataService.getConfig().label) });
  } catch (error) {
    console.error('Error refreshing view after remove value:', error);
  }
});

// Add Reward
app.action('settings_add_reward', async ({ body, ack, client }) => {
  await ack();
  const userId = (body as any).user.id;
  try {
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal' as const,
        callback_id: 'settings_add_reward_modal',
        title: { type: 'plain_text', text: 'Add Reward', emoji: true },
        submit: { type: 'plain_text', text: 'Add', emoji: true },
        close: { type: 'plain_text', text: 'Cancel', emoji: true },
        blocks: [
          { type: 'input' as const, block_id: 'reward_name_block', element: { type: 'plain_text_input' as const, action_id: 'reward_name_input', placeholder: { type: 'plain_text', text: 'Reward name', emoji: true } }, label: { type: 'plain_text', text: 'Reward Name', emoji: true } },
          { type: 'input' as const, block_id: 'reward_cost_block', element: { type: 'plain_text_input' as const, action_id: 'reward_cost_input', placeholder: { type: 'plain_text', text: 'Cost (number)', emoji: true } }, label: { type: 'plain_text', text: 'Cost', emoji: true } }
        ]
      }
    });
  } catch (error) {
    console.error('Error opening add reward modal:', error);
  }
});

// Add Reward submission
app.view('settings_add_reward_modal', async ({ ack, body, view, client }) => {
  await ack();
  const userId = body.user.id;
  const name = view.state.values.reward_name_block.reward_name_input.value || '';
  const cost = view.state.values.reward_cost_block.reward_cost_input.value || '';
  const result = await commandService.addReward(userId, name, cost);
  try {
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
  } catch {}
  // refresh Settings view
  const users = dataService.getAllUsers();
  const values = dataService.getConfig().values;
  const rewards = dataService.getRewards();
  const isAdmin = true;
  try {
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, isAdmin, dataService.getConfig().dailyLimit, dataService.getConfig().label) });
  } catch (error) {
    console.error('Error refreshing view after add reward:', error);
  }
});

// Remove Reward
app.action('settings_remove_reward', async ({ body, ack, client }) => {
  await ack();
  const userId = (body as any).user.id;
  const currentRewards = dataService.getConfig().rewards.map(r => r.name);
  try {
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal' as const,
        callback_id: 'settings_remove_reward_modal',
        title: { type: 'plain_text', text: 'Remove Reward', emoji: true },
        submit: { type: 'plain_text', text: 'Remove', emoji: true },
        close: { type: 'plain_text', text: 'Cancel', emoji: true },
        blocks: [
          { type: 'input' as const, block_id: 'remove_reward_block', element: { type: 'static_select' as const, action_id: 'remove_reward_select', placeholder: { type: 'plain_text', text: 'Select a reward', emoji: true }, options: currentRewards.map(name => ({ text: { type: 'plain_text', text: name, emoji: true }, value: name })) }, label: { type: 'plain_text', text: 'Reward to Remove', emoji: true } }
        ]
      }
    });
  } catch (error) {
    console.error('Error opening remove reward modal:', error);
  }
});

// Remove Reward submission
app.view('settings_remove_reward_modal', async ({ ack, body, view, client }) => {
  await ack();
  const userId = body.user.id;
  const selected = view.state.values.remove_reward_block.remove_reward_select.selected_option?.value;
  if (!selected) {
    await client.chat.postEphemeral({ channel: userId, user: userId, text: 'No reward was selected. Please try again.' });
    return;
  }
  const result = await commandService.removeReward(userId, selected);
  try {
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
  } catch { }
  // refresh Settings view
  const users = dataService.getAllUsers();
  const values = dataService.getConfig().values;
  const rewards = dataService.getRewards();
  const isAdmin = true;
  try {
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, isAdmin, dataService.getConfig().dailyLimit, dataService.getConfig().label) });
  } catch (error) {
    console.error('Error refreshing view after remove reward:', error);
  }
});

// Reset User Points
app.action('settings_reset_user', async ({ body, ack, client }) => {
  await ack();
  const userId = (body as any).user.id;
  try {
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal' as const,
        callback_id: 'settings_reset_user_modal',
        title: { type: 'plain_text', text: 'Reset User Points', emoji: true },
        submit: { type: 'plain_text', text: 'Reset', emoji: true },
        close: { type: 'plain_text', text: 'Cancel', emoji: true },
        blocks: [
          { type: 'input' as const, block_id: 'reset_user_block', element: { type: 'plain_text_input' as const, action_id: 'reset_user_input', placeholder: { type: 'plain_text', text: '@username', emoji: true } }, label: { type: 'plain_text', text: 'User to Reset', emoji: true } }
        ]
      }
    });
  } catch (error) {
    console.error('Error opening reset user modal:', error);
  }
});

// Reset User submission
app.view('settings_reset_user_modal', async ({ ack, body, view, client }) => {
  await ack();
  const userId = body.user.id;
  const target = view.state.values.reset_user_block.reset_user_input.value || '';
  const result = await commandService.resetPoints(userId, target, client);
  try {
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
  } catch { }
  // refresh Settings view
  const users = dataService.getAllUsers();
  const values = dataService.getConfig().values;
  const rewards = dataService.getRewards();
  const isAdmin = true;
  try {
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, isAdmin, dataService.getConfig().dailyLimit, dataService.getConfig().label) });
  } catch (error) {
    console.error('Error refreshing view after reset user:', error);
  }
});

// Handle Set Label button in Settings
app.action('settings_set_label', async ({ body, ack, client }) => {
  await ack();
  const userId = (body as any).user.id;
  try {
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal' as const,
        callback_id: 'settings_set_label_modal',
        title: { type: 'plain_text', text: 'Set Label', emoji: true },
        submit: { type: 'plain_text', text: 'Set', emoji: true },
        close: { type: 'plain_text', text: 'Cancel', emoji: true },
        blocks: [
          {
            type: 'input' as const,
            block_id: 'label_block',
            element: {
              type: 'plain_text_input' as const,
              action_id: 'label_input',
              placeholder: { type: 'plain_text', text: 'Enter new label', emoji: true }
            },
            label: { type: 'plain_text', text: 'Points Label', emoji: true }
          }
        ]
      }
    });
  } catch (error) {
    console.error('Error opening label modal:', error);
  }
});

// Handle submission of Set Label modal
app.view('settings_set_label_modal', async ({ ack, body, view, client }) => {
  await ack();
  const userId = body.user.id;
  const newLabel = view.state.values.label_block.label_input.value || "";
  const result = await commandService.setLabel(userId, newLabel);
  try {
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
  } catch (error) {
    console.error('Error sending label feedback:', error);
  }
  // Refresh Settings view with updated label
  const users = dataService.getAllUsers();
  const config = dataService.getConfig();
  const values = config.values;
  const rewards = dataService.getRewards();
  const isAdmin = true;
  try {
    await client.views.publish({
      user_id: userId,
      view: buildHomeView(users, values, userId, 'Settings', rewards, isAdmin, config.dailyLimit, config.label)
    });
  } catch (error) {
    console.error('Error refreshing Settings view after label set:', error);
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
  console.log(`⚡️ Slack app is running on port ${port}`);
})();