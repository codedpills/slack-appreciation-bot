import { RecognitionService } from '../../src/services/recognitionService';
import { AppConfig } from '../../src/types';

describe('RecognitionService with split reader/writer', () => {
  test('records recognition using reader and writer dependencies', async () => {
    const config: AppConfig = {
      dailyLimit: 5,
      values: ['teamwork'],
      rewards: [],
      label: 'points',
      gifEnabled: true,
      gifMinPoints: 3
    };

    const reader = {
      getConfig: jest.fn().mockResolvedValue(config),
      canGivePoints: jest.fn().mockResolvedValue(true)
    } as any;

    const writer = {
      recordRecognition: jest.fn().mockResolvedValue(undefined)
    } as any;

    const service = new RecognitionService(reader, writer);

    const recognition = await service.processRecognition(
      '<@USER123> +++ great teamwork #teamwork',
      'USER999',
      'T1'
    );

    expect(recognition).not.toBeNull();
    expect(reader.getConfig).toHaveBeenCalledWith('T1');
    expect(reader.canGivePoints).toHaveBeenCalledWith('USER999', 3, 'T1');
    expect(writer.recordRecognition).toHaveBeenCalledWith(expect.objectContaining({
      receiver: 'USER123',
      value: 'teamwork',
      points: 3
    }), 'T1');
  });
});
