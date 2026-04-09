import { CommandService } from '../../src/services/commandService';

class DummyDataService {
  async setDailyLimit() {}
  async addValue() {}
  async removeValue() {}
  async addReward() {}
  async removeReward() {}
  async getRewards() { return []; }
  async getReward() { return undefined; }
  async getUserRecord() { return { total: 0, byValue: {}, dailyGiven: 0, lastReset: '2024-01-01' }; }
  async getAllUsers() { return {}; }
  async resetUserPoints() {}
  async recordRecognition() {}
  async canGivePoints() { return true; }
  async redeemReward() { return false; }
  async saveData() {}
  async normalizeUserIds() {}
  async resetRewards() {}
  async resetValues() {}
  async setLabel() {}
  async getConfig() { return { dailyLimit: 10, values: ['teamwork'], rewards: [], label: 'points' }; }
  async updateConfig() {}
  async upsertWorkspaceInstall() {}
  async getWorkspaceInstall() { return null; }
}

describe('Workspace admin isolation', () => {
  test('uses workspace-specific admin lists', async () => {
    const dataService = new DummyDataService() as any;
    const commandService = new CommandService(dataService, []);

    commandService.setWorkspaceAdmins('T1', ['ADMIN1']);
    commandService.setWorkspaceAdmins('T2', ['ADMIN2']);

    const result1 = await commandService.setDailyLimit('ADMIN1', '5', 'T1');
    const result2 = await commandService.setDailyLimit('ADMIN1', '5', 'T2');

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(false);
  });
});
