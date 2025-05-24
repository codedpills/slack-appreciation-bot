import { buildHomeView } from '../../src/views/homeView';
import { UserRecord } from '../../src/types';

describe('Home View Builder', () => {
  const users: Record<string, UserRecord> = {
    U1: { total: 5, byValue: { integrity: 2, innovation: 3 }, dailyGiven: 0, lastReset: '' },
    U2: { total: 10, byValue: { integrity: 5, innovation: 5 }, dailyGiven: 0, lastReset: '' }
  };
  const values = ['integrity', 'innovation'];
  const userId = 'U1';

  test('defaults to Home section', () => {
    const view = buildHomeView(users, values, userId);
    const blocks = view.blocks;

    // Header and divider
    expect(blocks[0].accessory.type).toBe('static_select');
    expect(blocks[0].accessory.initial_option.value).toBe('Home');
    expect(blocks[1].type).toBe('divider');

    // Find Your Stats section
    const statsSection = blocks.find(b => b.type === 'section' && b.text?.text.includes('Your Stats'));
    expect(statsSection).toBeDefined();
    expect(statsSection.text.text).toContain('Total Points: *5*');

    // Points by Value fields
    const fieldsSection = blocks.find(b => b.fields);
    expect(fieldsSection.fields).toHaveLength(values.length);
    expect(fieldsSection.fields[0].text).toContain('#integrity');

    // No leaderboard entries present
    const leaderboardTitle = blocks.find(b => b.text?.text.includes('Top recognized'));
    expect(leaderboardTitle).toBeUndefined();
  });

  test('renders Recognition Leaderboard section', () => {
    const view = buildHomeView(users, values, userId, 'Recognition Leaderboard');
    const blocks = view.blocks;

    expect(blocks[0].accessory.initial_option.value).toBe('Recognition Leaderboard');
    // After divider, first content block is leaderboard title
    expect(blocks[2].text.text).toContain('Top recognized team members');
    // Should list two users
    const entries = blocks.filter(b => b.text?.text.match(/^\*\d+\./));
    expect(entries).toHaveLength(2);
  });

  test('renders Goodies store section', () => {
    const rewards = [
      { name: 'Coffee Voucher', cost: 50 },
      { name: 'Half-day Off', cost: 100 }
    ];
    const view = buildHomeView(users, values, userId, 'Goodies store', rewards as any);
    const blocks = view.blocks;
    // Header dropdown initial value
    expect(blocks[0].accessory.initial_option.value).toBe('Goodies store');

    // The store sections should list each reward
    const rewardSections = blocks.slice(2); // after header and divider
    expect(rewardSections).toHaveLength(rewards.length);

    rewardSections.forEach((blk, idx) => {
      expect(blk.type).toBe('section');
      expect(blk.text.text).toContain(`*${rewards[idx].name}* - ${rewards[idx].cost} points`);
      expect(blk.accessory.type).toBe('button');
      expect(blk.accessory.value).toBe(rewards[idx].name);
      expect(blk.accessory.action_id).toBe(`redeem_store_${rewards[idx].name}`);
    });
  });

  test('does not include Settings option for non-admin', () => {
    const view = buildHomeView(users, values, userId);
    const options = view.blocks[0].accessory.options.map((opt: any) => opt.value);
    expect(options).not.toContain('Settings');
  });

  test('includes Settings option for admins', () => {
    const view = buildHomeView(users, values, userId, 'Home', [], true);
    const options = view.blocks[0].accessory.options.map((opt: any) => opt.value);
    expect(options).toContain('Settings');
  });

  test('renders Settings section for admins', () => {
    const view = buildHomeView(users, values, userId, 'Settings', [], true);
    const blocks = view.blocks;
    // Header shows Settings
    expect(blocks[0].accessory.initial_option.value).toBe('Settings');
    // First content block is Admin Settings heading
    expect(blocks[2].text.text).toContain('Admin Settings');
    // Verify presence of action buttons
    const actionBlocks = blocks.filter(b => b.type === 'actions');
    const expectedIds = [
      'settings_set_daily_limit','settings_add_value',
      'settings_remove_value','settings_add_reward',
      'settings_remove_reward','settings_reset_user',
      'settings_reset_all'
    ];
    const foundIds = actionBlocks.flatMap(b => b.elements.map((el: any) => el.action_id));
    expectedIds.forEach(id => expect(foundIds).toContain(id));
  });

  test('renders Settings section for admins with current config', () => {
    const rewards = [
      { name: 'Coffee Voucher', cost: 50 },
      { name: 'Half-day Off', cost: 100 }
    ];
    const view = buildHomeView(users, values, userId, 'Settings', rewards as any, true, 7);
    const blocks = view.blocks;
    // Header shows Settings
    expect(blocks[0].accessory.initial_option.value).toBe('Settings');
    // Daily Limit block
    const dailyLimitBlock = blocks.find(b => b.text && b.text.text.includes('*Daily Limit:*'));
    expect(dailyLimitBlock.text.text).toBe('*Daily Limit:* 7');
    // Values block
    const valuesBlock = blocks.find(b => b.text && b.text.text.includes('*Company Values:*'));
    expect(valuesBlock.text.text).toBe('*Company Values:* integrity, innovation');
    // Rewards block
    const rewardsBlock = blocks.find(b => b.text && b.text.text.includes('*Rewards:*'));
    expect(rewardsBlock.text.text).toBe('*Rewards:* Coffee Voucher (50), Half-day Off (100)');
    // Presence of action buttons
    const actionIds = blocks.filter(b => b.type === 'actions').flatMap(b => b.elements.map((el: any) => el.action_id));
    expect(actionIds).toEqual(
      expect.arrayContaining([
        'settings_set_daily_limit', 'settings_add_value','settings_remove_value',
        'settings_add_reward','settings_remove_reward','settings_reset_user','settings_reset_all'
      ])
    );
  });
});