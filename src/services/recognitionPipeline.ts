import { IDataService } from './dataServiceInterface';
import { Recognition } from '../types';

export type GroupResolver = {
  resolveGroupMembers(client: any, groupId: string): Promise<string[]>;
};

export class RecognitionPipeline {
  private dataService: IDataService;
  private groupResolver: GroupResolver;

  constructor(dataService: IDataService, groupResolver: GroupResolver) {
    this.dataService = dataService;
    this.groupResolver = groupResolver;
  }

  async parseRecognitionsWithGroups(
    text: string,
    giverId: string,
    client: any,
    workspaceId?: string
  ): Promise<Recognition[]> {
    const regex = /((?:<@[A-Z0-9]+>|<!subteam\^[A-Z0-9]+>)+)\s*(\+{1,})\s*([^<#]+?)(?:#(\w+))?(?=\s*(?:<@|<!subteam\^)|$)/gi;
    const matches = [...text.matchAll(regex)];

    if (matches.length === 0) {
      return [];
    }

    const recognitions: Recognition[] = [];
    const config = await this.dataService.getConfig(workspaceId);

    for (const match of matches) {
      const [, mentionGroup, plusSymbols, reasonText, valueTag] = match;
      const mentionedUsers = await this.resolveMentionGroup(mentionGroup, client);
      const reason = reasonText.trim();
      const value = valueTag ? valueTag.toLowerCase().trim() : 'general';

      if (!reason) {
        continue;
      }

      if (value !== 'general' && !config.values.includes(value)) {
        continue;
      }

      const points = plusSymbols.length;

      for (const receiverId of mentionedUsers) {
        if (receiverId === giverId) continue;
        recognitions.push({
          giver: giverId,
          receiver: receiverId,
          reason,
          value,
          points,
          timestamp: Date.now()
        });
      }
    }

    return recognitions;
  }

  private async resolveMentionGroup(mentionGroup: string, client: any): Promise<string[]> {
    const userMentionRegex = /<@([A-Z0-9]+)>/g;
    const groupMentionRegex = /<!subteam\^([A-Z0-9]+)>/g;
    const userMatches = [...mentionGroup.matchAll(userMentionRegex)].map(match => match[1]);
    const groupMatches = [...mentionGroup.matchAll(groupMentionRegex)].map(match => match[1]);

    if (userMatches.length > 0) {
      return userMatches;
    }

    if (groupMatches.length > 0) {
      return this.groupResolver.resolveGroupMembers(client, groupMatches[0]);
    }

    return [];
  }
}
