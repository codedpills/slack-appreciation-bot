import { newDb } from 'pg-mem';
import { createDataService } from '../../src/services/dataServicePg';
import { CommandService } from '../../src/services/commandService';

describe('Multi-tenant reward isolation', () => {
  test('redeems rewards only within target workspace', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();

    const dataService = createDataService({ pool });
    const commandService = new CommandService(dataService, ['ADMIN']);

    await dataService.addReward('Coffee', 5, 'T1');
    await dataService.updateConfig({ rewards: [] }, 'T2');
    await dataService.recordRecognition(
      {
        giver: 'U1',
        receiver: 'U2',
        reason: 'thanks',
        value: 'teamwork',
        points: 5,
        timestamp: Date.now()
      },
      'T1'
    );

    const success = await commandService.redeemReward('U2', 'Coffee', 'T1');
    const failure = await commandService.redeemReward('U2', 'Coffee', 'T2');

    expect(success.success).toBe(true);
    expect(failure.success).toBe(false);
    expect(failure.message).toContain('not found');

    const userT1 = await dataService.getUserRecord('U2', 'T1');
    const userT2 = await dataService.getUserRecord('U2', 'T2');

    expect(userT1.total).toBe(0);
    expect(userT2.total).toBe(0);

    await pool.end();
  });
});
