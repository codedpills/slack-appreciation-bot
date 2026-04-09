import { newDb } from 'pg-mem';
import { createDataService } from '../../src/services/dataServicePg';

describe('Workspace install persistence', () => {
  test('stores and retrieves install data per workspace', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();

    const dataService = createDataService({ pool });

    await dataService.upsertWorkspaceInstall({
      workspaceId: 'T1',
      botUserId: 'U111',
      botToken: 'xoxb-test-1',
      installedAt: new Date('2024-01-01T00:00:00Z').toISOString()
    });

    await dataService.upsertWorkspaceInstall({
      workspaceId: 'T2',
      botUserId: 'U222',
      botToken: 'xoxb-test-2',
      installedAt: new Date('2024-02-01T00:00:00Z').toISOString()
    });

    const install1 = await dataService.getWorkspaceInstall('T1');
    const install2 = await dataService.getWorkspaceInstall('T2');

    expect(install1).toEqual(
      expect.objectContaining({
        workspaceId: 'T1',
        botUserId: 'U111',
        botToken: 'xoxb-test-1'
      })
    );
    expect(install2).toEqual(
      expect.objectContaining({
        workspaceId: 'T2',
        botUserId: 'U222',
        botToken: 'xoxb-test-2'
      })
    );

    await pool.end();
  });
});
