/**
 * AI Assistant Service Unit Tests
 */

// Mock the db module (pool)
const mockQuery = jest.fn();
jest.mock('../db', () => ({ query: mockQuery }));

// Mock searchService
jest.mock('../services/searchService', () => ({
  search: jest.fn().mockResolvedValue({ results: [] }),
}));

// Mock dashboardService
jest.mock('../services/dashboardService', () => ({
  getSalesSummary: jest.fn().mockResolvedValue({ current: {}, prior: {}, trends: {} }),
  getBrandMargins: jest.fn().mockResolvedValue([]),
  getRepPerformance: jest.fn().mockResolvedValue([]),
}));

// Mock Anthropic SDK
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

const {
  createSession,
  getSession,
  loadHistory,
  sendMessage,
  getActiveSessions,
  endSession,
  TOOLS,
} = require('../services/aiAssistantService');

describe('aiAssistantService', () => {
  beforeEach(() => {
    // mockReset clears the mockResolvedValueOnce queue (clearAllMocks does not)
    mockQuery.mockReset();
    mockCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  // ── createSession ──────────────────────────────────────────────

  describe('createSession', () => {
    it('inserts a session and returns the row', async () => {
      const session = { id: 'sess-1', user_id: 1, surface: 'pos', location_id: 2 };
      mockQuery.mockResolvedValueOnce({ rows: [session] });

      const result = await createSession(1, 'pos', 2, { locationName: 'Main' });

      expect(result.id).toBe('sess-1');
      expect(result.surface).toBe('pos');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('assistant_sessions');
      expect(callArgs[1]).toEqual([1, 'pos', 2, JSON.stringify({ locationName: 'Main' })]);
    });
  });

  // ── getSession ─────────────────────────────────────────────────

  describe('getSession', () => {
    it('returns session when found', async () => {
      const session = { id: 'sess-1', user_id: 1 };
      mockQuery.mockResolvedValueOnce({ rows: [session] });

      const result = await getSession('sess-1', 1);
      expect(result.id).toBe('sess-1');
    });

    it('throws SESSION_NOT_FOUND when no session exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(getSession('nonexistent', 1))
        .rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    });
  });

  // ── loadHistory ────────────────────────────────────────────────

  describe('loadHistory', () => {
    it('formats user + assistant messages for Claude API', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { role: 'user', content: 'Hello', tool_calls: null, tool_results: null },
          { role: 'assistant', content: 'Hi there', tool_calls: null, tool_results: null },
        ],
      });

      const messages = await loadHistory('sess-1');

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
    });

    it('reconstructs tool_calls as content blocks', async () => {
      const toolCallBlocks = [{ type: 'tool_use', id: 't1', name: 'search_knowledge', input: {} }];
      mockQuery.mockResolvedValueOnce({
        rows: [
          { role: 'assistant', content: '', tool_calls: toolCallBlocks, tool_results: null },
        ],
      });

      const messages = await loadHistory('sess-1');

      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toEqual(toolCallBlocks);
    });

    it('includes tool_result messages as user role', async () => {
      const toolResults = [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }];
      mockQuery.mockResolvedValueOnce({
        rows: [
          { role: 'tool_result', content: '', tool_calls: null, tool_results: toolResults },
        ],
      });

      const messages = await loadHistory('sess-1');

      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toEqual(toolResults);
    });

    it('takes last N messages via limit', async () => {
      const rows = Array.from({ length: 30 }, (_, i) => ({
        role: 'user', content: `msg-${i}`, tool_calls: null, tool_results: null,
      }));
      mockQuery.mockResolvedValueOnce({ rows });

      const messages = await loadHistory('sess-1', 5);
      expect(messages).toHaveLength(5);
      expect(messages[0].content).toBe('msg-25');
    });
  });

  // ── sendMessage ────────────────────────────────────────────────

  describe('sendMessage', () => {
    const userContext = { userId: 1, locationId: 2, role: 'sales', surface: 'pos' };

    const setupSendMessageMocks = (claudeResponse) => {
      // getSession
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sess-1', user_id: 1, surface: 'pos', context: {}, title: null }],
      });
      // loadHistory
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // _getUserInfo
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, first_name: 'John', last_name: 'Doe', role: 'sales' }],
      });
      // INSERT user message
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 100 }] });
      // Claude response
      mockCreate.mockResolvedValueOnce(claudeResponse);
      // INSERT assistant message
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 101 }] });
      // UPDATE session (title set)
      mockQuery.mockResolvedValueOnce({});
    };

    it('end_turn: returns final text without tool calls', async () => {
      setupSendMessageMocks({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Here is your answer.' }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const result = await sendMessage('sess-1', 'What time is it?', userContext);

      expect(result.message).toBe('Here is your answer.');
      expect(result.toolCallsMade).toBe(0);
      expect(result.tokensUsed).toBe(70);
    });

    it('tool_use: executes tool and continues with result', async () => {
      // getSession
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sess-1', user_id: 1, surface: 'quotation', context: {}, title: 'Test' }],
      });
      // loadHistory
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // _getUserInfo
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, first_name: 'Jane', last_name: 'Smith', role: 'admin' }],
      });
      // INSERT user message
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 100 }] });

      // First Claude call: tool_use
      mockCreate.mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'search_knowledge', input: { query: 'Samsung fridge' } },
        ],
        usage: { input_tokens: 40, output_tokens: 15 },
      });

      // INSERT assistant message (with tool_calls)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 101 }] });
      // logToolCall INSERT
      mockQuery.mockResolvedValueOnce({});
      // INSERT tool_result message
      mockQuery.mockResolvedValueOnce({});

      // Second Claude call: end_turn
      mockCreate.mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'I found Samsung fridges for you.' }],
        usage: { input_tokens: 100, output_tokens: 30 },
      });

      // INSERT final assistant message
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 102 }] });
      // UPDATE session
      mockQuery.mockResolvedValueOnce({});

      const result = await sendMessage('sess-1', 'Find Samsung fridges', userContext);

      expect(result.message).toBe('I found Samsung fridges for you.');
      expect(result.toolCallsMade).toBe(1);
    });

    it('MAX_TOOL_CALLS guard stops infinite tool loops', async () => {
      // getSession
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'sess-1', user_id: 1, surface: 'pos', context: {}, title: 'X' }],
      });
      // loadHistory
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // _getUserInfo
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, first_name: 'A', last_name: 'B', role: 'staff' }],
      });
      // INSERT user message
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 100 }] });

      // Mock 11 consecutive tool_use responses (exceeds MAX_TOOL_CALLS=10)
      for (let i = 0; i < 11; i++) {
        mockCreate.mockResolvedValueOnce({
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: '' },
            { type: 'tool_use', id: `tool-${i}`, name: 'search_knowledge', input: { query: 'test' } },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        // INSERT assistant message
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 200 + i }] });
        // logToolCall
        mockQuery.mockResolvedValueOnce({});
        // INSERT tool_result
        mockQuery.mockResolvedValueOnce({});
      }

      // INSERT final assistant message (after loop breaks)
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 300 }] });
      // UPDATE session
      mockQuery.mockResolvedValueOnce({});

      const result = await sendMessage('sess-1', 'loop test', userContext);

      // Should have stopped at MAX_TOOL_CALLS
      expect(result.toolCallsMade).toBe(10);
    });
  });

  // ── TOOLS registry ─────────────────────────────────────────────

  describe('TOOLS', () => {
    it('has exactly 5 tools', () => {
      expect(TOOLS).toHaveLength(5);
    });

    it('includes all expected tool names', () => {
      const names = TOOLS.map(t => t.name);
      expect(names).toContain('search_knowledge');
      expect(names).toContain('get_product_details');
      expect(names).toContain('get_customer_history');
      expect(names).toContain('get_sales_summary');
      expect(names).toContain('check_inventory');
    });

    it('each tool has name, description, and input_schema', () => {
      for (const tool of TOOLS) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.input_schema).toBeDefined();
        expect(tool.input_schema.type).toBe('object');
      }
    });
  });

  // ── getActiveSessions ──────────────────────────────────────────

  describe('getActiveSessions', () => {
    it('returns active sessions for user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 's1', surface: 'pos', title: 'Session 1', is_active: true },
          { id: 's2', surface: 'pos', title: 'Session 2', is_active: true },
        ],
      });

      const sessions = await getActiveSessions(1, 'pos');
      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('s1');
    });

    it('filters by surface when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getActiveSessions(1, 'backoffice');

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('surface = $2');
      expect(mockQuery.mock.calls[0][1]).toEqual([1, 'backoffice']);
    });
  });

  // ── endSession ─────────────────────────────────────────────────

  describe('endSession', () => {
    it('sets is_active to FALSE', async () => {
      mockQuery.mockResolvedValueOnce({});

      await endSession('sess-1', 1);

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('is_active = FALSE');
      expect(mockQuery.mock.calls[0][1]).toEqual(['sess-1', 1]);
    });
  });
});
