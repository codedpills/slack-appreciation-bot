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

// Load environment variables
dotenv.config();

// Initialize services
const dataFilePath = process.env.DATA_FILE_PATH || path.join(__dirname, '../data/store.json');
const adminUsers = (process.env.ADMIN_USERS || '').split(',').filter(id => id.trim() !== '');

const dataService = createDataService(dataFilePath);
const recognitionService = createRecognitionService(dataService);
const commandService = createCommandService(dataService, adminUsers);

// Initialize Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: LogLevel.INFO
});

// Listen for message events to detect recognitions
app.message(async ({ message, say, client }) => {
  // Type guard to ensure message has text property and user property
  if (!('text' in message) || !('user' in message) || message.subtype === 'bot_message') return;

  const messageEvent = message as GenericMessageEvent;
  
  if (!messageEvent.text || !messageEvent.user) return;
  
  // Try to process as a recognition
  const recognition = await recognitionService.processRecognition(messageEvent.text, messageEvent.user);
  
  if (recognition) {
    // Announce the recognition
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
    
    // Update the App Home for both giver and receiver
    try {
      await publishHomeView(client, recognition.receiver);
      await publishHomeView(client, recognition.giver);
    } catch (error) {
      console.error('Error publishing home view:', error);
    }
  }
});

// Publish App Home with leaderboard
async function publishHomeView(client: any, userId: string) {
  const users = dataService.getAllUsers();
  const config = dataService.getConfig();
  
  try {
    await client.views.publish({
      user_id: userId,
      view: buildHomeView(users, config.values, userId)
    });
  } catch (error) {
    console.error('Error publishing home view:', error);
  }
}

// Listen for app_home_opened events
app.event('app_home_opened', async ({ event, client }) => {
  await publishHomeView(client, event.user);
});

// Handle /points config command
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
          // Handle quoted reward name
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
          // Handle quoted reward name
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
      if (args.length < 2) {
        result = { 
          success: false, 
          message: 'Please specify a user to reset. Example: /points reset @user' 
        };
      } else {
        result = await commandService.resetPoints(user_id, args[1]);
      }
      break;
      
    default:
      result = { 
        success: false, 
        message: 'Invalid command. Available commands: config, reward, reset' 
      };
  }
  
  // Respond with the result
  await respond({
    text: result.message,
    response_type: 'ephemeral'
  });
  
  // If the command was successful, update the home views
  if (result.success) {
    // Get all users and update their home views
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

// Handle /redeem command
app.command('/redeem', async ({ command, ack, respond, client }) => {
  await ack();
  
  const { text, user_id } = command;
  
  // If no reward name provided, show the modal with available rewards
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
  
  // Handle direct redemption with reward name
  // Extract reward name from quotes if present
  const match = text.match(/"([^"]+)"/);
  const rewardName = match ? match[1] : text.trim();
  
  const result = await commandService.redeemReward(user_id, rewardName);
  
  await respond({
    text: result.message,
    response_type: 'ephemeral'
  });
  
  // If redemption was successful, notify admins and update home view
  if (result.success && result.data) {
    const { reward, user } = result.data;
    
    // Send confirmation message to user
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
    
    // Notify admins
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
    
    // Update user's home view
    await publishHomeView(client, user_id);
  }
});

// Handle redemption modal submission
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
    
    // Send confirmation message to user
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
    
    // Notify admins
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
    
    // Update user's home view
    await publishHomeView(client, userId);
  } else {
    // Send error message
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

// Start the app
(async () => {
  const port = parseInt(process.env.PORT || '3000', 10);
  
  await app.start(port);
  console.log(`⚡️ Appreciation bot is running on port ${port}`);
})();