import { App } from '@slack/bolt';
import { IDataService } from '../services/dataServiceInterface';
import { CommandService } from '../services/commandService';
import { loadState } from '../utils';
import { AdminCacheService } from '../services/adminCacheService';
import { buildHomeView } from '../views/homeView';

export function registerSettingsHandlers(
  app: App,
  dataService: IDataService,
  commandService: CommandService,
  adminCacheService: AdminCacheService,
) {
  // Reset All Points
  app.action('settings_reset_all', async ({ body, ack, client }) => {
    await ack();
    const userId = body.user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    if (!commandService.isAdmin(userId, workspaceId)) return;
    await commandService.resetAllPoints(userId, workspaceId);
    await client.chat.postEphemeral({ channel: userId, user: userId, text: 'All user points have been reset.' });
    const { users, config, rewards } = await loadState(dataService, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, true, dailyLimit, label) });
  });

  // Reset Rewards
  app.action('settings_reset_rewards', async ({ body, ack, client }) => {
    await ack();
    const userId = body.user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    if (!commandService.isAdmin(userId, workspaceId)) return;
    const result = await commandService.resetRewards(userId, workspaceId);
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
    const { users, config, rewards } = await loadState(dataService, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, true, dailyLimit, label) });
  });

  // Reset Values
  app.action('settings_reset_values', async ({ body, ack, client }) => {
    await ack();
    const userId = body.user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    if (!commandService.isAdmin(userId, workspaceId)) return;
    const result = await commandService.resetValues(userId, workspaceId);
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
    const { users, config, rewards } = await loadState(dataService, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, true, dailyLimit, label) });
  });

  // Set Daily Limit Modal
  app.action('settings_set_daily_limit', async ({ body, ack, client }) => {
    await ack();
    const userId = (body as any).user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
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
  });
  app.view('settings_set_daily_limit_modal', async ({ ack, body, view, client }) => {
    await ack();
    const userId = body.user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    if (!commandService.isAdmin(userId, workspaceId)) {
      await client.chat.postEphemeral({ channel: userId, user: userId, text: 'Only admins can change the daily limit.' });
      return;
    }
    const limitValue = view.state.values.daily_limit_block.daily_limit_input.value || "";
    const result = await commandService.setDailyLimit(userId, limitValue, workspaceId);
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
    const { users, config, rewards } = await loadState(dataService, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, true, dailyLimit, label) });
  });

  // Add Value Modal
  app.action('settings_add_value', async ({ body, ack, client }) => {
    await ack();
    const userId = (body as any).user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
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
  });
  app.view('settings_add_value_modal', async ({ ack, body, view, client }) => {
    await ack();
    const userId = body.user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    if (!commandService.isAdmin(userId, workspaceId)) {
      await client.chat.postEphemeral({ channel: userId, user: userId, text: 'Only admins can add company values.' });
      return;
    }
    const value = view.state.values.add_value_block.add_value_input.value || "";
    const result = await commandService.addValue(userId, value, workspaceId);
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
    const { users, config, rewards } = await loadState(dataService, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, true, dailyLimit, label) });
  });

  // Remove Value Modal
  app.action('settings_remove_value', async ({ body, ack, client }) => {
    await ack();
    const userId = (body as any).user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const { config } = await loadState(dataService, workspaceId);
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
              options: config.values.map(v => ({ text: { type: 'plain_text', text: v, emoji: true }, value: v }))
            },
            label: { type: 'plain_text', text: 'Company Value to Remove', emoji: true }
          }
        ]
      }
    });
  });
  app.view('settings_remove_value_modal', async ({ ack, body, view, client }) => {
    await ack();
    const userId = body.user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    if (!commandService.isAdmin(userId, workspaceId)) {
      await client.chat.postEphemeral({ channel: userId, user: userId, text: 'Only admins can remove company values.' });
      return;
    }
    const selected = view.state.values.remove_value_block.remove_value_select.selected_option?.value;
    const result = await commandService.removeValue(userId, selected || '', workspaceId);
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
    const { users, config, rewards } = await loadState(dataService, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, true, dailyLimit, label) });
  });

  // Add Reward Modal & Submission
  app.action('settings_add_reward', async ({ body, ack, client }) => {
    await ack();
    const userId = (body as any).user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
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
  });
  app.view('settings_add_reward_modal', async ({ ack, body, view, client }) => {
    await ack();
    const userId = body.user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    if (!commandService.isAdmin(userId, workspaceId)) {
      await client.chat.postEphemeral({ channel: userId, user: userId, text: 'Only admins can add rewards.' });
      return;
    }
    const name = view.state.values.reward_name_block.reward_name_input.value || '';
    const cost = view.state.values.reward_cost_block.reward_cost_input.value || '';
    const result = await commandService.addReward(userId, name, cost, workspaceId);
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
    const { users, config, rewards } = await loadState(dataService, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, true, dailyLimit, label) });
  });

  // Remove Reward Modal & Submission
  app.action('settings_remove_reward', async ({ body, ack, client }) => {
    await ack();
    const userId = (body as any).user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const { config } = await loadState(dataService, workspaceId);
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal' as const,
        callback_id: 'settings_remove_reward_modal',
        title: { type: 'plain_text', text: 'Remove Reward', emoji: true },
        submit: { type: 'plain_text', text: 'Remove', emoji: true },
        close: { type: 'plain_text', text: 'Cancel', emoji: true },
        blocks: [
          { type: 'input' as const, block_id: 'remove_reward_block', element: { type: 'static_select' as const, action_id: 'remove_reward_select', placeholder: { type: 'plain_text', text: 'Select a reward', emoji: true }, options: config.rewards.map(r => ({ text: { type: 'plain_text', text: r.name, emoji: true }, value: r.name })) }, label: { type: 'plain_text', text: 'Reward to Remove', emoji: true } }
        ]
      }
    });
  });
  app.view('settings_remove_reward_modal', async ({ ack, body, view, client }) => {
    await ack();
    const userId = body.user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    if (!commandService.isAdmin(userId, workspaceId)) {
      await client.chat.postEphemeral({ channel: userId, user: userId, text: 'Only admins can remove rewards.' });
      return;
    }
    const selected = view.state.values.remove_reward_block.remove_reward_select.selected_option?.value;
    const result = await commandService.removeReward(userId, selected || '', workspaceId);
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
    const { users, config, rewards } = await loadState(dataService, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, true, dailyLimit, label) });
  });

  // Reset User Points Modal & Submission
  app.action('settings_reset_user', async ({ body, ack, client }) => {
    await ack();
    const userId = (body as any).user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
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
  });
  app.view('settings_reset_user_modal', async ({ ack, body, view, client }) => {
    await ack();
    const userId = body.user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    if (!commandService.isAdmin(userId, workspaceId)) {
      await client.chat.postEphemeral({ channel: userId, user: userId, text: 'Only admins can reset points.' });
      return;
    }
    const target = view.state.values.reset_user_block.reset_user_input.value || '';
    const result = await commandService.resetPoints(userId, target, client, workspaceId);
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
    const { users, config, rewards } = await loadState(dataService, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, true, dailyLimit, label) });
  });

  // Set Label Modal & Submission
  app.action('settings_set_label', async ({ body, ack, client }) => {
    await ack();
    const userId = (body as any).user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
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
            element: { type: 'plain_text_input' as const, action_id: 'label_input', placeholder: { type: 'plain_text', text: 'Enter new label', emoji: true } },
            label: { type: 'plain_text', text: 'Points Label', emoji: true }
          }
        ]
      }
    });
  });
  app.view('settings_set_label_modal', async ({ ack, body, view, client }) => {
    await ack();
    const userId = body.user.id;
    const workspaceId = (body as any).team?.id || (body as any).team_id || 'default';
    const admins = await adminCacheService.getAdmins(client, workspaceId);
    commandService.setWorkspaceAdmins(workspaceId, admins);
    if (!commandService.isAdmin(userId, workspaceId)) {
      await client.chat.postEphemeral({ channel: userId, user: userId, text: 'Only admins can set the points label.' });
      return;
    }
    const newLabel = view.state.values.label_block.label_input.value || "";
    const result = await commandService.setLabel(userId, newLabel, workspaceId);
    await client.chat.postEphemeral({ channel: userId, user: userId, text: result.message });
    const { users, config, rewards } = await loadState(dataService, workspaceId);
    const { values, dailyLimit, label } = config;
    await client.views.publish({ user_id: userId, view: buildHomeView(users, values, userId, 'Settings', rewards, true, dailyLimit, label) });
  });
}
