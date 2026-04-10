import { GiphyService } from '../../src/services/giphyService';

jest.mock('@giphy/js-fetch-api', () => ({
  GiphyFetch: jest.fn()
}));

describe('GiphyService', () => {
  test('returns first GIF url for query', async () => {
    const search = jest.fn().mockResolvedValue({
      data: [
        { images: { fixed_height: { url: 'https://giphy.test/gif1' } } }
      ]
    });

    const { GiphyFetch } = require('@giphy/js-fetch-api');
    GiphyFetch.mockImplementation(() => ({ search }));

    const service = new GiphyService('test-key');
    const url = await service.getGifUrl('teamwork');

    expect(url).toBe('https://giphy.test/gif1');
    expect(search).toHaveBeenCalledWith('teamwork', { limit: 1, rating: 'pg' });
  });

  test('logs and returns null on failure', async () => {
    const search = jest.fn().mockRejectedValue(new Error('boom'));
    const { GiphyFetch } = require('@giphy/js-fetch-api');
    GiphyFetch.mockImplementation(() => ({ search }));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const service = new GiphyService('test-key');
    const url = await service.getGifUrl('celebration');

    expect(url).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
