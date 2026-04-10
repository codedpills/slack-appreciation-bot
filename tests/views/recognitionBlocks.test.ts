import { buildRecognitionBlocks } from '../../src/views/recognition/recognitionBlocks';
import { Recognition } from '../../src/types';

describe('recognition blocks', () => {
  test('inserts GIF block between section and context', () => {
    const recognition: Recognition = {
      giver: 'U1',
      receiver: 'U2',
      reason: 'great teamwork',
      value: 'teamwork',
      points: 3,
      timestamp: 123456
    };

    const blocks = buildRecognitionBlocks(recognition, 'points', 'https://example.com/gif.gif');

    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe('section');
    expect(blocks[1].type).toBe('image');
    expect(blocks[2].type).toBe('context');
  });
});
