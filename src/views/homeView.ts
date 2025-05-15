import { UserRecord } from '../types';

/**
 * Build the App Home view with leaderboard and user stats
 */
export const buildHomeView = (
  users: Record<string, UserRecord>,
  values: string[],
  userId: string
) => {
  const userEntries = Object.entries(users)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.total - a.total);

  // Get the current user's position
  const currentUserPosition = userEntries.findIndex(entry => entry.id === userId);
  const currentUserData = users[userId] || { total: 0, byValue: {}, dailyGiven: 0, lastReset: '' };

  // Create blocks for the view
  return {
    type: 'home',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🏆 Recognition Leaderboard',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Top recognized team members this month:*'
        }
      },
      {
        type: 'divider'
      },
      ...userEntries.slice(0, 10).map((entry, index) => ({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${index + 1}.* <@${entry.id}> - *${entry.total}* points`
        }
      })),
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Your Stats:*\n• Total Points: *${currentUserData.total}*\n• Leaderboard Position: *${currentUserPosition > -1 ? currentUserPosition + 1 : 'N/A'}*`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Points by Value:*'
        }
      },
      {
        type: 'section',
        fields: values.map(value => ({
          type: 'mrkdwn',
          text: `*#${value}:* ${currentUserData.byValue[value] || 0} points`
        }))
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*How to recognize teammates:*\nType `@username +++ reason #value` in any channel.'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*How to redeem rewards:*\nUse the `/redeem` command to spend your points on available rewards.'
        }
      }
    ]
  };
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