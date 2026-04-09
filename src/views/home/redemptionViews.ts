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
