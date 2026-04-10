import { App, GenericMessageEvent } from '@slack/bolt';
import { IDataService } from '../services/dataServiceInterface';
import { RecognitionService } from '../services/recognitionService';
import { CommandService } from '../services/commandService';
import { publishHomeView, loadState } from '../utils';
import { GiphyService } from '../services/giphyService';
import { buildRecognitionBlocks } from '../views/recognition';

export function registerRecognitionHandlers(
  app: App,
  recognitionService: RecognitionService,
  dataService: IDataService,
  commandService: CommandService
) {
  const giphyService = new GiphyService(process.env.GIPHY_API_KEY);

  app.message(async ({ message, say, client }) => {
    if (!('text' in message) || !('user' in message) || message.subtype === 'bot_message') return;

    const messageEvent = message as GenericMessageEvent;
    if (!messageEvent.text || !messageEvent.user) return;

    const workspaceId = (messageEvent as any).team || (messageEvent as any).team_id;

    const recognitions = await recognitionService.processRecognitionsWithGroups(
      messageEvent.text,
      messageEvent.user,
      client,
      workspaceId
    );

    // load label
    const { config } = await loadState(dataService, workspaceId);
    const label = config.label;
    const gifEnabled = config.gifEnabled ?? true;
    const gifMinPoints = config.gifMinPoints ?? 3;

    for (const rec of recognitions) {
      let gifUrl: string | null = null;
      if (gifEnabled && rec.points >= gifMinPoints) {
        const primaryQuery = rec.value && rec.value !== 'general' ? rec.value : 'celebration';
        gifUrl = await giphyService.getGifUrl(primaryQuery);
        if (!gifUrl && primaryQuery !== 'celebration') {
          gifUrl = await giphyService.getGifUrl('celebration');
        }
      }

      await say({
        text: `:tada: <@${rec.receiver}> +${rec.points} ${label} for *${rec.value}!`,
        blocks: buildRecognitionBlocks(rec, label, gifUrl || undefined)
      });
    }

    if (recognitions.length > 0) {
      try {
        await publishHomeView(client, recognitions[0].receiver, dataService, commandService, workspaceId);
        await publishHomeView(client, recognitions[0].giver, dataService, commandService, workspaceId);
      } catch (error) {
        console.error('Error publishing home view:', error);
      }
    }
  });
}
