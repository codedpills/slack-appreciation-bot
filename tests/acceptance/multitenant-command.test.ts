import { newDb } from 'pg-mem';
import { createDataService } from '../../src/services/dataServicePg';
import { CommandService } from '../../src/services/commandService';

describe('Multi-tenant command isolation', () => {
  test('setDailyLimit updates only target workspace', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();
    const dataService = createDataService({ pool });
    const commandService = new CommandService(dataService, ['ADMIN']);

    const resultA = await commandService.setDailyLimit('ADMIN', '7', 'T1');
    const resultB = await commandService.setDailyLimit('ADMIN', '12', 'T2');

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);

    const configA = await dataService.getConfig('T1');
    const configB = await dataService.getConfig('T2');

    expect(configA.dailyLimit).toBe(7);
    expect(configB.dailyLimit).toBe(12);
  });
});
