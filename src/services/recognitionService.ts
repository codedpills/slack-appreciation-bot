import { DataService } from './dataService';
import { Recognition } from '../types';

/**
 * Service for handling recognitions
 */
export class RecognitionService {
  private dataService: DataService;

  constructor(dataService: DataService) {
    this.dataService = dataService;
  }

  /**
   * Process a recognition from a message
   * Returns null if no valid recognition was found
   */
  parseRecognition(text: string, giverId: string): Recognition | null {
    // Removed debug logs and redundant comments for tidiness
    const regex = /<@([A-Z0-9]+)>\s*(\+{1,})\s*(.*?)(?:\s*#(\w+))?$/i;
    const match = text.match(regex);

    if (!match) return null;

    const [, receiverId, plusSymbols, reasonText, valueTag] = match;
    const reason = reasonText.trim();
    if (!reason && !valueTag) return null;

    const value = valueTag ? valueTag.toLowerCase().trim() : 'general';

    if (reason.length === 0) return null;

    if (receiverId === giverId) return null;

    const config = this.dataService.getConfig();
    if (!config.values.includes(value) && value !== 'general') {
      return null;
    }

    const points = plusSymbols.length;

    return {
      giver: giverId,
      receiver: receiverId,
      reason,
      value,
      points,
      timestamp: Date.now()
    };
  }

  parseRecognitions(text: string, giverId: string): Recognition[] {
    const regex = /(?:<@([A-Z0-9]+)>\s*)+(\+{1,})(.*?)#(\w+)/gi; // match multiple mentions
    const matches = [...text.matchAll(regex)];

    const recognitions: Recognition[] = [];

    for (const match of matches) {
      const [, , plusSymbols, reasonText, valueTag] = match;
      const mentionsRegex = /<@([A-Z0-9]+)>/g; // extract individual mentions
      const mentionedUsers = [...match[0].matchAll(mentionsRegex)].map(m => m[1]);

      for (const receiverId of mentionedUsers) {
        if (receiverId === giverId) continue;

        const reason = reasonText.trim();
        const value = valueTag.toLowerCase().trim();

        const config = this.dataService.getConfig();
        if (!config.values.includes(value)) continue;

        const points = plusSymbols.length;

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

  async resolveGroupMembers(client: any, groupId: string): Promise<string[]> {
    try {
      const result = await client.usergroups.users.list({ usergroup: groupId });
      if (!result.ok || !result.users) {
        console.error('Failed to fetch group members:', result.error);
        return [];
      }
      return result.users;
    } catch (error) {
      console.error('Error resolving group members:', error);
      return [];
    }
  }

  async parseRecognitionsWithGroups(text: string, giverId: string, client: any): Promise<Recognition[]> {
    const regex = /(?:<@([A-Z0-9]+)>|<!subteam\^([A-Z0-9]+)>)\s*(\+{1,})(.*?)#(\w+)/gi; // match multiple mentions and groups
    const matches = [...text.matchAll(regex)];

    const recognitions: Recognition[] = [];

    for (const match of matches) {
      const [, userId, groupId, plusSymbols, reasonText, valueTag] = match;

      const mentionedUsers = userId ? [userId] : groupId ? await this.resolveGroupMembers(client, groupId) : [];

      for (const receiverId of mentionedUsers) {
        if (receiverId === giverId) continue;

        const reason = reasonText.trim();
        const value = valueTag.toLowerCase().trim();

        const config = this.dataService.getConfig();
        if (!config.values.includes(value)) continue;

        const points = plusSymbols.length;

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

  /**
   * Process and save a recognition
   * Returns whether the recognition was processed successfully
   */
  async processRecognition(text: string, giverId: string): Promise<Recognition | null> {
    const recognition = this.parseRecognition(text, giverId);
    if (!recognition) return null;

    if (!this.dataService.canGivePoints(giverId, recognition.points)) {
      return null;
    }

    await this.dataService.recordRecognition(recognition);

    return recognition;
  }

  async processRecognitions(text: string, giverId: string): Promise<Recognition[]> {
    const recognitions = this.parseRecognitions(text, giverId);
    const validRecognitions: Recognition[] = [];

    for (const recognition of recognitions) {
      if (!this.dataService.canGivePoints(giverId, recognition.points)) {
        continue;
      }

      await this.dataService.recordRecognition(recognition);
      validRecognitions.push(recognition);
    }

    return validRecognitions;
  }
}

export const createRecognitionService = (dataService: DataService): RecognitionService => {
  return new RecognitionService(dataService);
};