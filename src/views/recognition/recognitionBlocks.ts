import { Recognition } from '../../types';
import { Block, KnownBlock } from '@slack/types';

export const buildRecognitionBlocks = (
  recognition: Recognition,
  label: string,
  gifUrl?: string
): (Block | KnownBlock)[] => {
  const blocks: (Block | KnownBlock)[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:tada: <@${recognition.receiver}> *+${recognition.points} ${label}* for *${recognition.value}*!`
      }
    }
  ];

  if (gifUrl) {
    blocks.push({
      type: 'image',
      image_url: gifUrl,
      alt_text: 'Celebration GIF'
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `Recognized by <@${recognition.giver}> for: ${recognition.reason}` }
    ]
  });

  return blocks;
};
