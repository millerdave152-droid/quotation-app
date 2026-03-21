/**
 * Search Service Unit Tests
 */

// Mock the db module (pool)
const mockQuery = jest.fn();
jest.mock('../db', () => ({ query: mockQuery }));

// Mock embeddingService
const mockGenerateEmbedding = jest.fn();
jest.mock('../services/embeddingService', () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

const { search, mergeResults } = require('../services/searchService');

describe('searchService', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGenerateEmbedding.mockReset();
  });

  describe('search()', () => {
    it('returns results with correct shape (entity, id, score)', async () => {
      // FTS query results (one per entity type searched)
      mockQuery.mockResolvedValue({ rows: [] }); // default for all queries
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Acme Corp', entity_type: 'customer', fts_score: 0.5 }] }) // customers FTS
        .mockResolvedValueOnce({ rows: [] }) // products FTS
        .mockResolvedValueOnce({ rows: [] }) // quotations FTS
        .mockResolvedValueOnce({ rows: [] }); // customer_notes FTS

      mockGenerateEmbedding.mockResolvedValueOnce(null); // no vector

      const result = await search({ query: 'Acme', limit: 10 });

      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0]).toHaveProperty('entity_type', 'customer');
      expect(result.results[0]).toHaveProperty('id', 1);
      expect(result.results[0]).toHaveProperty('score');
    });

    it('hybrid scoring: both FTS + vector match scores higher than FTS-only', async () => {
      const ftsResults = [
        { id: 1, name: 'A', entity_type: 'customer', fts_score: 0.8 },
        { id: 2, name: 'B', entity_type: 'customer', fts_score: 0.5 },
      ];
      const vecResults = [
        { id: 2, name: 'B', entity_type: 'customer', vec_score: 0.9 },
      ];

      const merged = mergeResults(ftsResults, vecResults, 10);

      // Item 2 has both FTS (0.5/0.8 * 0.6) + vector (0.9 * 0.4) = 0.375 + 0.36 = 0.735
      // Item 1 has FTS only (0.8/0.8 * 0.6) + 0 = 0.6
      // So item 2 should rank higher
      expect(merged[0].id).toBe(2);
      expect(merged[0].score).toBeGreaterThan(merged[1].score);
    });

    it('empty query returns empty results', async () => {
      const result = await search({ query: '' });

      expect(result.results).toEqual([]);
      expect(result.meta.resultCount).toBe(0);
    });

    it('FTS fallback when embedding is null', async () => {
      mockGenerateEmbedding.mockResolvedValueOnce(null);
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 5, name: 'Test', entity_type: 'product', fts_score: 0.7 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await search({ query: 'test product', entities: ['products'] });

      // Should still return FTS results even though vector is null
      expect(result.results.length).toBe(1);
      expect(result.results[0].entity_type).toBe('product');
    });

    it('search_log INSERT fires for each search call', async () => {
      mockGenerateEmbedding.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValue({ rows: [] });

      await search({ query: 'test', userId: 1, surface: 'global' });

      // Find the INSERT INTO search_log call
      const logCall = mockQuery.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('search_log')
      );
      expect(logCall).toBeDefined();
    });

    it('filters entities when specific entities are provided', async () => {
      mockGenerateEmbedding.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValue({ rows: [] });

      await search({ query: 'test', entities: ['products'] });

      // Should only query products FTS, not all 4 entities
      const ftsCalls = mockQuery.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('ts_rank')
      );
      expect(ftsCalls.length).toBe(1); // only 1 entity
    });
  });

  describe('mergeResults()', () => {
    it('deduplicates by entity_type:id', () => {
      const fts = [{ id: 1, entity_type: 'customer', fts_score: 0.5, name: 'A' }];
      const vec = [{ id: 1, entity_type: 'customer', vec_score: 0.8, name: 'A' }];

      const merged = mergeResults(fts, vec, 10);

      expect(merged.length).toBe(1); // deduplicated
      expect(merged[0].score).toBeGreaterThan(0.5 * 0.6); // has both components
    });

    it('respects limit parameter', () => {
      const fts = Array.from({ length: 20 }, (_, i) => ({
        id: i, entity_type: 'product', fts_score: 0.5, name: `P${i}`,
      }));

      const merged = mergeResults(fts, [], 5);

      expect(merged.length).toBe(5);
    });

    it('removes internal scoring fields from output', () => {
      const fts = [{ id: 1, entity_type: 'customer', fts_score: 0.5, name: 'A' }];
      const merged = mergeResults(fts, [], 10);

      expect(merged[0]).not.toHaveProperty('fts_score');
      expect(merged[0]).not.toHaveProperty('fts_norm');
      expect(merged[0]).not.toHaveProperty('vec_norm');
    });
  });
});
