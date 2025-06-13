import { App, GenericMessageEvent } from '@slack/bolt';
import { IDataService } from '../services/dataServiceInterface';
import { RecognitionService } from '../services/recognitionService';
import { CommandService } from '../services/commandService';
import { publishHomeView, loadState } from '../utils';

export function registerRecognitionHandlers(
  app: App,
  recognitionService: RecognitionService,
  dataService: IDataService,
  commandService: CommandService
) {
  app.message(async ({ message, say, client }) => {
    if (!('text' in message) || !('user' in message) || message.subtype === 'bot_message') return;

    const messageEvent = message as GenericMessageEvent;
    if (!messageEvent.text || !messageEvent.user) return;

    const recognitions = await recognitionService.processRecognitionsWithGroups(
      messageEvent.text,
      messageEvent.user,
      client
    );

    // load label
    const { config } = await loadState(dataService);
    const label = config.label;

    for (const rec of recognitions) {
      await say({
        text: `:tada: <@${rec.receiver}> +${rec.points} ${label} for *${rec.value}!`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `:tada: <@${rec.receiver}> *+${rec.points} ${label}* for *${rec.value}*!` } },
          { type: 'context', elements: [ { type: 'mrkdwn', text: `Recognized by <@${rec.giver}> for: ${rec.reason}` } ] }
        ]
      });
    }

    if (recognitions.length > 0) {
      try {
        await publishHomeView(client, recognitions[0].receiver, dataService, commandService);
        await publishHomeView(client, recognitions[0].giver, dataService, commandService);
      } catch (error) {
        console.error('Error publishing home view:', error);
      }
    }
  });
}
