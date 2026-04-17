import { AppConfig, UserRecord, Reward, SubscriptionStatus, PlanTier, BillingPeriod } from '../../types';

export type ViewContext = {
  userId: string;
  section?: string;
  users: Record<string, UserRecord>;
  rewards: Reward[];
  config: Pick<AppConfig, 'values' | 'dailyLimit' | 'label' | 'gifEnabled' | 'gifMinPoints'>;
  isAdmin: boolean;
  currentUser?: UserRecord;
  billing?: {
    enabled: boolean;
    status?: SubscriptionStatus;
    planTier?: PlanTier;
    billingPeriod?: BillingPeriod;
    trialEndsAt?: string;
    upgradeUrl?: string;
    portalUrl?: string;
  };
};

export const buildHomeViewFromContext = (ctx: ViewContext) => {
  return buildHomeView(
    ctx.users,
    ctx.config.values,
    ctx.userId,
    ctx.section || 'Home',
    ctx.rewards,
    ctx.isAdmin,
    ctx.config.dailyLimit,
    ctx.config.label,
    ctx.currentUser,
    ctx.config.gifEnabled,
    ctx.config.gifMinPoints,
    ctx.billing
  );
};

/**
 * Build the App Home view with leaderboard and user stats
 */
export const buildHomeView = (
  users: Record<string, UserRecord>,
  values: string[],
  userId: string,
  selectedSection = 'Home',
  rewards: Reward[] = [],
  isAdmin = false,
  dailyLimit = 0,
  label = 'points',
  currentUser?: UserRecord,
  gifEnabled = true,
  gifMinPoints = 3,
  billing?: {
    enabled: boolean;
    status?: SubscriptionStatus;
    planTier?: PlanTier;
    billingPeriod?: BillingPeriod;
    trialEndsAt?: string;
    upgradeUrl?: string;
    portalUrl?: string;
  }
) => {
  const userEntries = Object.entries(users)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.total - a.total);

  // Get the current user's position
  const currentUserPosition = userEntries.findIndex(entry => entry.id === userId);
  const currentUserData = currentUser || users[userId] || { total: 0, byValue: {}, dailyGiven: 0, lastReset: '' };

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
      // GIF Settings
      { type: 'section', text: { type: 'mrkdwn', text: `*Recognition GIFs:* ${gifEnabled ? 'Enabled' : 'Disabled'}` } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: gifEnabled ? 'Disable GIFs' : 'Enable GIFs', emoji: true }, action_id: 'settings_toggle_gif' }
      ] },
      { type: 'section', text: { type: 'mrkdwn', text: `*GIF Minimum Points:* ${gifMinPoints}` } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Set GIF Minimum', emoji: true }, action_id: 'settings_set_gif_min_points' }
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
    if (billing?.enabled) {
      const billingStatus = billing.status ? billing.status.replace('_', ' ') : 'unknown';
      const billingText = billing.trialEndsAt
        ? `*Billing:* ${billingStatus} (trial ends ${billing.trialEndsAt})`
        : `*Billing:* ${billingStatus}`;
      const planText = billing.planTier
        ? `*Plan:* ${billing.planTier.replace(/_/g, ' ')}${billing.billingPeriod ? ` (${billing.billingPeriod})` : ''}`
        : '*Plan:* unknown';
      const billingButton: any = {
        type: 'button',
        text: { type: 'plain_text', text: 'Manage Subscription', emoji: true },
        action_id: 'billing_manage_subscription'
      };
      if (billing.portalUrl) {
        billingButton.url = billing.portalUrl;
      } else if (billing.upgradeUrl) {
        billingButton.url = billing.upgradeUrl;
      }
      contentBlocks.push(
        { type: 'divider' },
        { type: 'section', text: { type: 'mrkdwn', text: '*Billing*' } },
        { type: 'section', text: { type: 'mrkdwn', text: billingText } },
        { type: 'section', text: { type: 'mrkdwn', text: planText } },
        {
          type: 'actions',
          elements: [
            billingButton
          ]
        }
      );
    }
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
      { type: 'divider' },
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
