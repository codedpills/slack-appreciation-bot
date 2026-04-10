import { GiphyFetch } from '@giphy/js-fetch-api';

export class GiphyService {
  private readonly gf: GiphyFetch | null;

  constructor(apiKey?: string) {
    this.gf = apiKey ? new GiphyFetch(apiKey) : null;
  }

  async getGifUrl(query: string): Promise<string | null> {
    if (!this.gf) {
      console.warn('GiphyService missing API key');
      return null;
    }

    try {
      const result = await this.gf.search(query, { limit: 1, rating: 'pg' });
      const first = result.data?.[0]?.images?.fixed_height?.url;
      return first ?? null;
    } catch (error) {
      console.warn('GiphyService failed to fetch GIF', error);
      return null;
    }
  }
}
