import { UserRecord, Reward } from '../types';

/**
 * Build the App Home view with leaderboard and user stats
 */
export const buildHomeView = (
  users: Record<string, UserRecord>,
  values: string[],
  userId: string,
  selectedSection: string = 'Home',
  rewards: Reward[] = [],
  isAdmin: boolean = false,
  dailyLimit: number = 0,
  label: string = 'points'
) => {
  const userEntries = Object.entries(users)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.total - a.total);

  // Get the current user's position
  const currentUserPosition = userEntries.findIndex(entry => entry.id === userId);
  const currentUserData = users[userId] || { total: 0, byValue: {}, dailyGiven: 0, lastReset: '' };

  // Header with dropdown select
  const options: any[] = [
    { text: { type: 'plain_text', text: 'Home', emoji: true }, value: 'Home' },
    { text: { type: 'plain_text', text: 'Recognition Leaderboard', emoji: true }, value: 'Recognition Leaderboard' },
    { text: { type: 'plain_text', text: 'Goodies store', emoji: true }, value: 'Goodies store' }
  ];
  if (isAdmin) {
    options.push({ text: { type: 'plain_text', text: 'Settings', emoji: true }, value: 'Settings' });
  }

  const headerSection = {
    type: 'section',
    text: { type: 'mrkdwn', text: 'Welcome. Make work fun again!' },
    accessory: {
      type: 'static_select',
      action_id: 'home_section_select',
      placeholder: { type: 'plain_text', text: 'Select Section', emoji: true },
      options,
      initial_option: {
        text: { type: 'plain_text', text: selectedSection, emoji: true },
        value: selectedSection
      }
    }
  };
  let contentBlocks: any[] = [];
  if (selectedSection === 'Recognition Leaderboard') {
    contentBlocks = [
      { type: 'section', text: { type: 'mrkdwn', text: '*Top recognized team members this month:*' } },
      { type: 'divider' },
      ...userEntries.slice(0, 10).map((entry, index) => ({
        type: 'section',
        text: { type: 'mrkdwn', text: `*${index + 1}.* <@${entry.id}> - *${entry.total}* ${label}` }
      }))
    ];
  } else if (selectedSection === 'Goodies store') {
    // Display the goodies/rewards store
    contentBlocks = rewards.map(reward => ({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${reward.name}* - ${reward.cost} ${label}` },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Redeem', emoji: true },
        action_id: `redeem_store_${reward.name}`,
        value: reward.name
      }
    }));
  } else if (selectedSection === 'Settings' && isAdmin) {
    contentBlocks = [
      // Settings header
      { type: 'section', text: { type: 'mrkdwn', text: '*Admin Settings*' } },
      { type: 'divider' },
      // Points Label
      { type: 'section', text: { type: 'mrkdwn', text: `*${label.charAt(0).toUpperCase() + label.slice(1)} Label:* ${label}` } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Set Label', emoji: true }, action_id: 'settings_set_label' }
      ] },
      { type: 'divider' },
      // Daily Limit
      { type: 'section', text: { type: 'mrkdwn', text: `*Daily Limit:* ${dailyLimit}` } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Set Daily Limit', emoji: true }, action_id: 'settings_set_daily_limit' }
      ] },
      { type: 'divider' },
      // Company Values
      { type: 'section', text: { type: 'mrkdwn', text: `*Company Values:* ${values.join(', ')}` } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Add Value', emoji: true }, action_id: 'settings_add_value' },
        { type: 'button', text: { type: 'plain_text', text: 'Remove Value', emoji: true }, action_id: 'settings_remove_value' }
      ] },
      { type: 'divider' },
      // Rewards
      { type: 'section', text: { type: 'mrkdwn', text: `*Rewards:* ${rewards.map(r => `${r.name} (${r.cost})`).join(', ')}` } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Add Reward', emoji: true }, action_id: 'settings_add_reward' },
        { type: 'button', text: { type: 'plain_text', text: 'Remove Reward', emoji: true }, action_id: 'settings_remove_reward' }
      ] },
      { type: 'divider' },
      // Reset options
      { type: 'section', text: { type: 'mrkdwn', text: '*Reset Options:*' } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Reset User Points', emoji: true }, action_id: 'settings_reset_user' },
        { type: 'button', text: { type: 'plain_text', text: 'Reset All Points', emoji: true }, action_id: 'settings_reset_all' }
      ] },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Reset Rewards', emoji: true }, action_id: 'settings_reset_rewards' },
        { type: 'button', text: { type: 'plain_text', text: 'Reset Company Values', emoji: true }, action_id: 'settings_reset_values' }
      ] }
    ];
  } else {
    contentBlocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Your Stats:*
• Total ${label.charAt(0).toUpperCase() + label.slice(1)}: *${currentUserData.total}*
• Leaderboard Position: *${currentUserPosition > -1 ? currentUserPosition + 1 : 'N/A'}*`
        }
      },
      { type: 'section', text: { type: 'mrkdwn', text: `*${label.charAt(0).toUpperCase() + label.slice(1)} by Value:*` } },
      { type: 'section', fields: values.map(value => ({ type: 'mrkdwn', text: `*#${value}:* ${currentUserData.byValue[value] || 0} ${label}` })) },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*How to recognize teammates:*
Valid examples:
• \`@username +++ reason #value\`
• \`@username ++ reason\` _(no tag ⇒ defaults to #general)_
• \`@alice @bob +++ great collaboration #innovation\`
• \`@dev_team ++ fixed the bug #teamwork\`
Available values: ${[...values.map(v => `#${v}`), '#general'].join(', ')}
Invalid examples:
• Missing plus signs: \`@username did a great job #teamwork\`
• No reason text: \`@username +++ #teamwork\`
• Unknown value tag: \`@username ++ awesome work #nonexistent\``
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*How to redeem rewards:*
Use the \`/redeem\` command to spend your ${label} on available rewards.`
        }
      }
    ];
  }
  return { type: 'home' as const, blocks: [headerSection, { type: 'divider' }, ...contentBlocks] };
};

/**
 * Build the modal view for redeeming rewards
 */
export const buildRedeemModal = (rewards: Array<{ name: string; cost: number }>, userPoints: number) => {
  return {
    type: 'modal' as const,
    title: {
      type: 'plain_text' as const,
      text: 'Redeem Rewards',
      emoji: true
    },
    submit: {
      type: 'plain_text' as const,
      text: 'Redeem',
      emoji: true
    },
    close: {
      type: 'plain_text' as const,
      text: 'Cancel',
      emoji: true
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Your Points:* ${userPoints}`
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'input',
        block_id: 'reward_select',
        element: {
          type: 'static_select',
          placeholder: {
            type: 'plain_text' as const,
            text: 'Select a reward',
            emoji: true
          },
          options: rewards.map(reward => ({
            text: {
              type: 'plain_text' as const,
              text: `${reward.name} (${reward.cost} points)`,
              emoji: true
            },
            value: reward.name
          })),
          action_id: 'reward_selection'
        },
        label: {
          type: 'plain_text' as const,
          text: 'Available Rewards',
          emoji: true
        }
      }
    ]
  };
};

/**
 * Build confirmation message for reward redemption
 */
export const buildRedemptionConfirmation = (
  rewardName: string,
  cost: number,
  remainingPoints: number
) => {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:white_check_mark: You've successfully redeemed *${rewardName}*!`
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Points spent:* ${cost}\n*Remaining balance:* ${remainingPoints}`
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'An admin will be in touch shortly to fulfill your reward.'
      }
    }
  ];
};

/**
 * Build admin notification for reward redemption
 */
export const buildAdminRedemptionNotification = (
  userId: string,
  rewardName: string,
  cost: number
) => {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:bell: *Reward Redemption Notification*`
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<@${userId}> has redeemed *${rewardName}* for ${cost} points.`
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Mark as Fulfilled',
            emoji: true
          },
          value: `fulfill_${userId}_${rewardName}`,
          action_id: 'fulfill_reward'
        }
      ]
    }
  ];
};