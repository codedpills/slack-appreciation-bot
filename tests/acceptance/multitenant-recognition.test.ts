import { newDb } from 'pg-mem';
import { createDataService } from '../../src/services/dataServicePg';
import { RecognitionService } from '../../src/services/recognitionService';

describe('Multi-tenant recognition isolation', () => {
  test('uses workspace-specific config values', async () => {
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    const pool = new Pool();

    const dataService = createDataService({ pool });
    const recognitionService = new RecognitionService(dataService, dataService);

    await dataService.updateConfig({ values: ['teamwork'] }, 'T1');
    await dataService.updateConfig({ values: ['innovation'] }, 'T2');

    const text = '<@USER123> +++ great work #teamwork';

    const recT1 = await recognitionService.parseRecognition(text, 'USER999', 'T1');
    const recT2 = await recognitionService.parseRecognition(text, 'USER999', 'T2');

    expect(recT1).not.toBeNull();
    expect(recT2).toBeNull();

    await pool.end();
  });
});
