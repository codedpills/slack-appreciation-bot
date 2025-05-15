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
    // Parse recognition using regex
    const regex = /<@([A-Z0-9]+)>\s*\+{3}(.*?)#(\w+)/i;
    const match = text.match(regex);
    
    if (!match) return null;
    
    const [, receiverId, reasonText, valueTag] = match;
    const reason = reasonText.trim();
    const value = valueTag.toLowerCase().trim();
    
    // Don't allow self-recognition
    if (receiverId === giverId) return null;
    
    // Verify the value is valid
    const config = this.dataService.getConfig();
    if (!config.values.includes(value)) return null;
    
    // Create recognition object
    return {
      giver: giverId,
      receiver: receiverId,
      reason,
      value,
      points: 3, // Fixed point value as per PRD
      timestamp: Date.now()
    };
  }

  /**
   * Process and save a recognition
   * Returns whether the recognition was processed successfully
   */
  async processRecognition(text: string, giverId: string): Promise<Recognition | null> {
    // Parse the recognition
    const recognition = this.parseRecognition(text, giverId);
    if (!recognition) return null;
    
    // Check if giver has enough daily points
    if (!this.dataService.canGivePoints(giverId, recognition.points)) {
      return null;
    }
    
    // Record the recognition
    await this.dataService.recordRecognition(recognition);
    
    return recognition;
  }
}

export const createRecognitionService = (dataService: DataService): RecognitionService => {
  return new RecognitionService(dataService);
};