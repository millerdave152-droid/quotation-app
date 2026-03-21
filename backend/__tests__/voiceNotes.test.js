/**
 * VoiceNotesService Unit Tests
 */

// Mock S3
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PutObjectCommand: jest.fn(),
}));

// Mock axios (Whisper API)
jest.mock('axios', () => ({
  post: jest.fn(),
}));
const axios = require('axios');

// Mock form-data
jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    getHeaders: jest.fn().mockReturnValue({ 'content-type': 'multipart/form-data' }),
  }));
});

// Mock Anthropic SDK
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

// Mock embedding service
jest.mock('../services/embeddingService', () => ({
  embedNewRecord: jest.fn().mockResolvedValue({}),
}));

const VoiceNotesService = require('../services/voiceNotesService');

const mockPool = { query: jest.fn() };

describe('VoiceNotesService', () => {
  let svc;

  beforeEach(() => {
    // mockReset clears the mockResolvedValueOnce queue (clearAllMocks does not)
    mockPool.query.mockReset();
    mockCreate.mockReset();
    axios.post.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    svc = new VoiceNotesService(mockPool);
  });

  // ── processVoiceNote ───────────────────────────────────────────

  describe('processVoiceNote', () => {
    const audioBuffer = Buffer.from('fake-audio-data');
    const mimeType = 'audio/webm';
    const customerId = 42;
    const userId = 5;

    it('full pipeline: S3 upload → Whisper → Claude → DB insert', async () => {
      // Mock Whisper transcription
      axios.post.mockResolvedValueOnce({
        data: { text: 'Customer wants a Samsung fridge delivered next Tuesday' },
      });

      // Mock Claude structuring
      mockCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: 'Customer requested Samsung fridge delivery for next Tuesday.',
            tags: ['delivery', 'product'],
            action_items: ['Schedule delivery for next Tuesday'],
            follow_up_date: '2026-03-10',
            sentiment: 'positive',
            key_entities: {
              products: ['Samsung fridge'],
              amounts: [],
              people: [],
              dates: ['next Tuesday'],
            },
          }),
        }],
      });

      // DB insert
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 100 }] });

      const result = await svc.processVoiceNote(audioBuffer, mimeType, customerId, userId);

      expect(result.noteId).toBe(100);
      expect(result.summary).toContain('Samsung fridge');
      expect(result.transcription).toContain('Samsung fridge');
      expect(result.actionItems).toHaveLength(1);
      expect(result.followUpDate).toBe('2026-03-10');
      expect(result.sentiment).toBe('positive');
      expect(result.tags).toContain('delivery');
      expect(result.audioUrl).toContain('voice-notes/42/');

      // Verify Whisper was called
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-openai-key',
          }),
        })
      );
    });

    it('throws TRANSCRIPTION_EMPTY when Whisper returns empty text', async () => {
      axios.post.mockResolvedValueOnce({
        data: { text: '' },
      });

      await expect(
        svc.processVoiceNote(audioBuffer, mimeType, customerId, userId)
      ).rejects.toMatchObject({ code: 'TRANSCRIPTION_EMPTY' });
    });

    it('throws TRANSCRIPTION_EMPTY when Whisper returns whitespace only', async () => {
      axios.post.mockResolvedValueOnce({
        data: { text: '   \n  ' },
      });

      await expect(
        svc.processVoiceNote(audioBuffer, mimeType, customerId, userId)
      ).rejects.toMatchObject({ code: 'TRANSCRIPTION_EMPTY' });
    });

    it('uses fallback structure when Claude parse fails', async () => {
      // Whisper returns valid text
      axios.post.mockResolvedValueOnce({
        data: { text: 'Customer called about warranty claim on dishwasher' },
      });

      // Claude returns invalid JSON
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'This is not valid JSON at all' }],
      });

      // DB insert
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 101 }] });

      const result = await svc.processVoiceNote(audioBuffer, mimeType, customerId, userId);

      // Fallback structure uses transcription prefix as summary
      expect(result.noteId).toBe(101);
      expect(result.summary).toContain('Customer called');
      expect(result.tags).toEqual(['general']);
      expect(result.actionItems).toEqual([]);
      expect(result.sentiment).toBe('neutral');
    });

    it('handles different mime types for file extensions', async () => {
      axios.post.mockResolvedValueOnce({ data: { text: 'test note content' } });
      mockCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: 'Test note', tags: ['general'],
            action_items: [], follow_up_date: null,
            sentiment: 'neutral', key_entities: { products: [], amounts: [], people: [], dates: [] },
          }),
        }],
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 102 }] });

      const result = await svc.processVoiceNote(
        audioBuffer, 'audio/mp4', customerId, userId
      );

      expect(result.audioUrl).toContain('.mp4');
    });

    it('throws OPENAI_NOT_CONFIGURED when no API key', async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(
        svc.processVoiceNote(audioBuffer, mimeType, customerId, userId)
      ).rejects.toMatchObject({ code: 'OPENAI_NOT_CONFIGURED' });
    });

    it('falls back to basic structure when ANTHROPIC_API_KEY is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      svc = new VoiceNotesService(mockPool);

      // Whisper succeeds
      axios.post.mockResolvedValueOnce({ data: { text: 'Customer wants delivery info' } });

      // DB insert (fallback path still inserts)
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 200 }] });

      const result = await svc.processVoiceNote(audioBuffer, mimeType, customerId, userId);

      // Falls back to basic structure instead of throwing
      expect(result.noteId).toBe(200);
      expect(result.tags).toEqual(['general']);
      expect(result.actionItems).toEqual([]);
      expect(result.sentiment).toBe('neutral');
    });

    it('passes surface context to Claude structuring', async () => {
      axios.post.mockResolvedValueOnce({ data: { text: 'POS walk-in note' } });
      mockCreate.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: 'Walk-in customer note', tags: ['general'],
            action_items: [], follow_up_date: null,
            sentiment: 'neutral', key_entities: { products: [], amounts: [], people: [], dates: [] },
          }),
        }],
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 103 }] });

      await svc.processVoiceNote(audioBuffer, mimeType, customerId, userId, {
        surface: 'pos',
        contextNote: 'Customer at register 3',
      });

      // Verify Claude was called with surface info in the user message
      const claudeCall = mockCreate.mock.calls[0][0];
      const userMsg = claudeCall.messages[0].content;
      expect(userMsg).toContain('Surface: pos');
      expect(userMsg).toContain('Context: Customer at register 3');
    });
  });

  // ── getActionItemsDue ──────────────────────────────────────────

  describe('getActionItemsDue', () => {
    it('returns notes with action items within daysAhead', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1, customer_id: 42, content: 'Follow up on delivery',
            action_items: ['Call customer about delivery time'],
            follow_up_date: '2026-03-10', tags: ['delivery', 'follow-up'],
            sentiment: 'neutral', customer_name: 'Acme Corp', customer_company: 'Acme',
          },
        ],
      });

      const result = await svc.getActionItemsDue(5, 7);

      expect(result).toHaveLength(1);
      expect(result[0].action_items).toContain('Call customer about delivery time');
      expect(result[0].customer_name).toBe('Acme Corp');

      // Verify query params
      expect(mockPool.query.mock.calls[0][1]).toEqual([5, 7]);
    });

    it('returns empty array when no items due', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await svc.getActionItemsDue(5, 7);
      expect(result).toEqual([]);
    });

    it('uses default daysAhead=7 when not specified', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await svc.getActionItemsDue(5);

      expect(mockPool.query.mock.calls[0][1]).toEqual([5, 7]);
    });
  });

  // ── getCustomerNoteHistory ─────────────────────────────────────

  describe('getCustomerNoteHistory', () => {
    it('returns notes for customer', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, customer_id: 42, content: 'First note', note_source: 'voice', created_by_name: 'John' },
          { id: 2, customer_id: 42, content: 'Second note', note_source: 'manual', created_by_name: 'Jane' },
        ],
      });

      const result = await svc.getCustomerNoteHistory(42);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('First note');
    });

    it('applies source filter', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await svc.getCustomerNoteHistory(42, { source: 'voice' });

      const sql = mockPool.query.mock.calls[0][0];
      expect(sql).toContain('note_source');
      expect(mockPool.query.mock.calls[0][1]).toContain('voice');
    });

    it('applies tags filter with array overlap (&&)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await svc.getCustomerNoteHistory(42, { tags: ['delivery', 'service'] });

      const sql = mockPool.query.mock.calls[0][0];
      expect(sql).toContain('&&');
      expect(mockPool.query.mock.calls[0][1]).toContainEqual(['delivery', 'service']);
    });

    it('applies sentiment filter', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await svc.getCustomerNoteHistory(42, { sentiment: 'negative' });

      const sql = mockPool.query.mock.calls[0][0];
      expect(sql).toContain('sentiment');
      expect(mockPool.query.mock.calls[0][1]).toContain('negative');
    });

    it('applies date range filters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await svc.getCustomerNoteHistory(42, {
        fromDate: '2026-01-01',
        toDate: '2026-03-07',
      });

      const params = mockPool.query.mock.calls[0][1];
      expect(params).toContain('2026-01-01');
      expect(params).toContain('2026-03-07');
    });

    it('combines multiple filters correctly', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await svc.getCustomerNoteHistory(42, {
        source: 'voice',
        tags: ['warranty'],
        sentiment: 'urgent',
      });

      const params = mockPool.query.mock.calls[0][1];
      // customerId + source + tags + sentiment = 4 params
      expect(params).toHaveLength(4);
      expect(params[0]).toBe(42);
      expect(params[1]).toBe('voice');
      expect(params[2]).toEqual(['warranty']);
      expect(params[3]).toBe('urgent');
    });
  });
});
