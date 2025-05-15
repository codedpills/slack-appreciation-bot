import { RecognitionService } from '../../src/services/recognitionService';
import { DataService } from '../../src/services/dataService';
import fs from 'fs';
import path from 'path';

// Mock the data service
jest.mock('fs');

describe('Recognition Flow Acceptance Tests', () => {
  let dataService: DataService;
  let recognitionService: RecognitionService;
  const testDataPath = '/tmp/test-data.json';
  
  beforeEach(() => {
    // Setup mock filesystem
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    
    // Mock fs.promises
    (fs.promises as any) = {
      writeFile: jest.fn().mockResolvedValue(undefined),
    };
  
    // Create test services
    dataService = new DataService(testDataPath);
    recognitionService = new RecognitionService(dataService);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  test('should award points when a valid recognition message is posted', async () => {
    // Mock canGivePoints to always return true for testing
    jest.spyOn(dataService, 'canGivePoints').mockReturnValue(true);
    
    // Mock recordRecognition
    const recordSpy = jest.spyOn(dataService, 'recordRecognition')
      .mockImplementation(async () => {});
    
    const text = '<@USER123> +++ helped me debug a critical issue #innovation';
    const giverId = 'USER456';
    
    const recognition = await recognitionService.processRecognition(text, giverId);
    
    // Verify a valid recognition was processed
    expect(recognition).not.toBeNull();
    expect(recognition?.giver).toBe(giverId);
    expect(recognition?.receiver).toBe('USER123');
    expect(recognition?.value).toBe('innovation');
    expect(recognition?.points).toBe(3);
    
    // Verify the recognition was recorded
    expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({
      giver: giverId,
      receiver: 'USER123',
      reason: 'helped me debug a critical issue',
      value: 'innovation',
      points: 3
    }));
  });
  
  test('should validate against stored company values', async () => {
    // Mock getConfig to return a specific set of values
    jest.spyOn(dataService, 'getConfig').mockReturnValue({
      dailyLimit: 5,
      values: ['teamwork', 'innovation'],
      rewards: []
    });
    
    // Valid recognition with recognized value
    const validText = '<@USER123> +++ helped me debug #innovation';
    const invalidText = '<@USER123> +++ helped me debug #nonexistentvalue';
    const giverId = 'USER456';
    
    const validRecognition = recognitionService.parseRecognition(validText, giverId);
    const invalidRecognition = recognitionService.parseRecognition(invalidText, giverId);
    
    // Valid value should be recognized
    expect(validRecognition).not.toBeNull();
    expect(validRecognition?.value).toBe('innovation');
    
    // Invalid value should be rejected
    expect(invalidRecognition).toBeNull();
  });
  
  test('should enforce daily limits', async () => {
    // First, mock canGivePoints to return true then false after limit
    const canGivePointsSpy = jest.spyOn(dataService, 'canGivePoints')
      .mockImplementationOnce(() => true)  // First call returns true
      .mockImplementationOnce(() => false); // Second call returns false
    
    // Mock recordRecognition
    const recordSpy = jest.spyOn(dataService, 'recordRecognition')
      .mockImplementation(async () => {});
    
    const text = '<@USER123> +++ helped me debug #innovation';
    const giverId = 'USER456';
    
    // First recognition should succeed
    const firstRecognition = await recognitionService.processRecognition(text, giverId);
    expect(firstRecognition).not.toBeNull();
    expect(recordSpy).toHaveBeenCalledTimes(1);
    
    // Second recognition should fail due to daily limit
    const secondRecognition = await recognitionService.processRecognition(text, giverId);
    expect(secondRecognition).toBeNull();
    expect(recordSpy).toHaveBeenCalledTimes(1); // Still just one call
    
    // Verify canGivePoints was called with the right parameters
    expect(canGivePointsSpy).toHaveBeenCalledWith(giverId, 3);
  });
  
  test('should prevent self-recognition', async () => {
    const text = '<@USER123> +++ trying to game the system #innovation';
    const sameSelfId = 'USER123'; // Same as receiver
    
    const recognition = recognitionService.parseRecognition(text, sameSelfId);
    
    // Self-recognition should be rejected
    expect(recognition).toBeNull();
  });
  
  test('should properly parse message for recognition', () => {
    // Mock getConfig to include all the values we're testing
    jest.spyOn(dataService, 'getConfig').mockReturnValue({
      dailyLimit: 5,
      values: ['teamwork', 'innovation', 'creativity'],
      rewards: []
    });
    
    const validFormats = [
      '<@USER123> +++ helped me debug #innovation',
      '<@USER123>+++great work#teamwork',
      '<@USER123> +++ for designing the new UI #creativity'
    ];
    
    const invalidFormats = [
      'just mentioning <@USER123> without recognition',
      '<@USER123> ++ incomplete syntax #innovation', // Not enough + signs
      '<@USER123> +++ missing value tag'
    ];
    
    const giverId = 'USER456';
    
    // Valid formats should be recognized
    for (const text of validFormats) {
      const recognition = recognitionService.parseRecognition(text, giverId);
      expect(recognition).not.toBeNull();
      expect(recognition?.receiver).toBe('USER123');
    }
    
    // Invalid formats should be rejected
    for (const text of invalidFormats) {
      const recognition = recognitionService.parseRecognition(text, giverId);
      expect(recognition).toBeNull();
    }
  });
});