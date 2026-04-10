import { RecognitionPipeline } from '../../src/services/recognitionPipeline';
import { AppConfig } from '../../src/types';

describe('RecognitionPipeline', () => {
  test('parses recognitions and enforces value rules', async () => {
    const config: AppConfig = {
      dailyLimit: 5,
      values: ['teamwork'],
      rewards: [],
      label: 'points',
      gifEnabled: true,
      gifMinPoints: 3
    };

    const dataService = {
      getConfig: jest.fn().mockResolvedValue(config)
    } as any;

    const groupResolver = {
      resolveGroupMembers: jest.fn().mockResolvedValue([])
    };

    const pipeline = new RecognitionPipeline(dataService, groupResolver);

    const text = '<@USER123> ++ great work #teamwork <@USER456> +++ awesome #invalid';
    const recognitions = await pipeline.parseRecognitionsWithGroups(text, 'GIVER1', {}, 'T1');

    expect(recognitions).toHaveLength(1);
    expect(recognitions[0]).toEqual(expect.objectContaining({
      giver: 'GIVER1',
      receiver: 'USER123',
      points: 2,
      value: 'teamwork',
      reason: 'great work'
    }));

    expect(dataService.getConfig).toHaveBeenCalledWith('T1');
  });

  test('expands group mentions into individual recognitions', async () => {
    const config: AppConfig = {
      dailyLimit: 5,
      values: ['teamwork'],
      rewards: [],
      label: 'points',
      gifEnabled: true,
      gifMinPoints: 3
    };

    const dataService = {
      getConfig: jest.fn().mockResolvedValue(config)
    } as any;

    const groupResolver = {
      resolveGroupMembers: jest.fn().mockResolvedValue(['USER1', 'USER2'])
    };

    const pipeline = new RecognitionPipeline(dataService, groupResolver);

    const text = '<!subteam^GROUP123> +++ great teamwork #teamwork';
    const recognitions = await pipeline.parseRecognitionsWithGroups(text, 'GIVER1', { stub: true }, 'T1');

    expect(recognitions).toHaveLength(2);
    expect(recognitions[0]).toEqual(expect.objectContaining({ receiver: 'USER1', points: 3, value: 'teamwork' }));
    expect(recognitions[1]).toEqual(expect.objectContaining({ receiver: 'USER2', points: 3, value: 'teamwork' }));
    expect(groupResolver.resolveGroupMembers).toHaveBeenCalledWith({ stub: true }, 'GROUP123');
  });

  test('returns no recognitions for invalid formats', async () => {
    const config: AppConfig = {
      dailyLimit: 5,
      values: ['teamwork'],
      rewards: [],
      label: 'points',
      gifEnabled: true,
      gifMinPoints: 3
    };

    const dataService = {
      getConfig: jest.fn().mockResolvedValue(config)
    } as any;

    const groupResolver = {
      resolveGroupMembers: jest.fn().mockResolvedValue([])
    };

    const pipeline = new RecognitionPipeline(dataService, groupResolver);

    const text = 'just mentioning <@USER123> without recognition';
    const recognitions = await pipeline.parseRecognitionsWithGroups(text, 'GIVER1', {}, 'T1');

    expect(recognitions).toEqual([]);
  });
});
