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
});