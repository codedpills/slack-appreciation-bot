import { newDb } from 'pg-mem';
import { createDataService } from '../../src/services/dataServicePg';

describe('Multi-tenant config isolation', () => {
  test('keeps workspace config isolated', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();

    try {
      const dataService = createDataService({ pool });

      await dataService.updateConfig({ label: 'alpha' }, 'T1');
      await dataService.updateConfig({ label: 'beta' }, 'T2');

      const cfgA = await dataService.getConfig('T1');
      const cfgB = await dataService.getConfig('T2');

      expect(cfgA.label).toBe('alpha');
      expect(cfgB.label).toBe('beta');
      expect(cfgA.label).not.toBe(cfgB.label);
    } finally {
      await pool.end();
    }
  });
});
