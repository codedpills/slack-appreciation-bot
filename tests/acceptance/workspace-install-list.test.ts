import { newDb } from 'pg-mem';
import { createDataService } from '../../src/services/dataServicePg';

describe('Workspace install listing', () => {
  test('lists all workspace installs', async () => {
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

    const installs = await dataService.listWorkspaceInstalls();
    const ids = installs.map(install => install.workspaceId).sort();

    expect(ids).toEqual(['T1', 'T2']);

    await pool.end();
  });
});
