import { RecognitionService } from '../../src/services/recognitionService';
import { DataService } from '../../src/services/dataService';
import fs from 'fs';

jest.mock('fs');

describe('Recognition Flow Acceptance Tests', () => {
  let dataService: DataService;
  let recognitionService: RecognitionService;
  const testDataPath = '/tmp/test-data.json';
  
  beforeEach(() => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    
    (fs.promises as any) = {
      writeFile: jest.fn().mockResolvedValue(undefined),
    };
  
    dataService = new DataService(testDataPath);
    recognitionService = new RecognitionService(dataService);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  test('should award points when a valid recognition message is posted', async () => {
    // Mock canGivePoints to always return true for testing
    jest.spyOn(dataService, 'canGivePoints').mockReturnValue(true);
    
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
      .mockImplementationOnce(() => true)  
      .mockImplementationOnce(() => false); 
    
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
    expect(recordSpy).toHaveBeenCalledTimes(1); 
    
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
    jest.spyOn(dataService, 'getConfig').mockReturnValue({
      dailyLimit: 5,
      values: ['teamwork', 'innovation', 'creativity'],
      rewards: []
    });
    
    const validFormats = [
      '<@USER123> +++ helped me debug #innovation',
      '<@USER123>+++great work#teamwork',
      '<@USER123> +++ for designing the new UI #creativity',
      '<@USER123> ++ incomplete syntax #innovation',
      '<@USER123> + missing value tag' // Now valid with 1 '+' symbol
    ];

    const invalidFormats = [
      'just mentioning <@USER123> without recognition' // Invalid due to missing `+` symbols and value tag
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

  test('should award points based on the number of + symbols', async () => {
    jest.spyOn(dataService, 'canGivePoints').mockReturnValue(true);
    const recordSpy = jest.spyOn(dataService, 'recordRecognition').mockImplementation(async () => {});

    const text = '<@USER123> ++ great work #teamwork';
    const giverId = 'USER456';

    const recognition = await recognitionService.processRecognition(text, giverId);

    expect(recognition).not.toBeNull();
    expect(recognition?.points).toBe(2);
    expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ points: 2 }));
  });

  test('should handle multiple recognitions in a single message', async () => {
    jest.spyOn(dataService, 'canGivePoints').mockReturnValue(true);
    const recordSpy = jest.spyOn(dataService, 'recordRecognition').mockImplementation(async () => {});

    const text = '<@USER123> ++ great work #teamwork <@USER456> +++ amazing effort #innovation';
    const giverId = 'USER789';

    const recognitions = await recognitionService.processRecognitions(text, giverId);

    expect(recognitions).toHaveLength(2);

    expect(recognitions[0]).toEqual(expect.objectContaining({
      receiver: 'USER123',
      points: 2,
      value: 'teamwork'
    }));

    expect(recognitions[1]).toEqual(expect.objectContaining({
      receiver: 'USER456',
      points: 3,
      value: 'innovation'
    }));

    expect(recordSpy).toHaveBeenCalledTimes(2);
  });

  test('should handle group recognition', async () => {
    jest.spyOn(dataService, 'canGivePoints').mockReturnValue(true);
    jest.spyOn(recognitionService, 'resolveGroupMembers').mockResolvedValue(['USER123', 'USER456']);
    const recordSpy = jest.spyOn(dataService, 'recordRecognition').mockImplementation(async () => {});

    const text = '<!subteam^GROUP123> ++ great teamwork #teamwork';
    const giverId = 'USER789';

    const recognitions = await recognitionService.parseRecognitionsWithGroups(text, giverId, {} as any);

    for (const recognition of recognitions) {
      await dataService.recordRecognition(recognition); 
    }

    expect(recognitions).toHaveLength(2);

    expect(recognitions[0]).toEqual(expect.objectContaining({
      receiver: 'USER123',
      points: 2,
      value: 'teamwork'
    }));

    expect(recognitions[1]).toEqual(expect.objectContaining({
      receiver: 'USER456',
      points: 2,
      value: 'teamwork'
    }));

    expect(recordSpy).toHaveBeenCalledTimes(2);
  });
});