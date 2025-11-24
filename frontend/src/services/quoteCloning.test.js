import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Quote Cloning Service', () => {
  const API_BASE_URL = '/api/quotes';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('cloneQuote', () => {
    test('should clone a quote', async () => {
      const mockResponse = {
        success: true,
        original_id: 1,
        cloned_quote: {
          id: 10,
          quote_number: 'Q-001-COPY',
          customer_id: 1,
          total_amount: 5000,
          status: 'draft'
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const cloneQuote = async (quoteId, modifications = {}, cloneLineItems = true, userId) => {
        const response = await fetch(`${API_BASE_URL}/${quoteId}/clone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modifications,
            clone_line_items: cloneLineItems,
            created_by: userId
          })
        });
        return await response.json();
      };

      const result = await cloneQuote(1, {}, true, 1);
      expect(result.success).toBe(true);
      expect(result.cloned_quote.quote_number).toBe('Q-001-COPY');
      expect(result.cloned_quote.status).toBe('draft');
    });

    test('should clone with modifications', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          cloned_quote: { id: 11, customer_id: 2, total_amount: 6000 }
        })
      });

      const cloneQuote = async (quoteId, modifications = {}, cloneLineItems = true, userId) => {
        const response = await fetch(`${API_BASE_URL}/${quoteId}/clone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modifications,
            clone_line_items: cloneLineItems,
            created_by: userId
          })
        });
        return await response.json();
      };

      await cloneQuote(1, {
        customer_id: 2,
        total_amount: 6000,
        quote_number: 'Q-002'
      }, false, 1);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"customer_id":2')
        })
      );
    });
  });

  describe('cloneMultiple', () => {
    test('should clone multiple quotes', async () => {
      const mockResponse = {
        success: true,
        cloned_count: 3,
        cloned_quotes: [
          { original_id: 1, cloned_quote: { id: 10 } },
          { original_id: 2, cloned_quote: { id: 11 } },
          { original_id: 3, cloned_quote: { id: 12 } }
        ]
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const cloneMultiple = async (quoteIds, userId) => {
        const response = await fetch(`${API_BASE_URL}/clone-multiple`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_ids: quoteIds,
            created_by: userId
          })
        });
        return await response.json();
      };

      const result = await cloneMultiple([1, 2, 3], 1);
      expect(result.success).toBe(true);
      expect(result.cloned_count).toBe(3);
      expect(result.cloned_quotes).toHaveLength(3);
    });
  });

  describe('getClones', () => {
    test('should get all clones of a quote', async () => {
      const mockData = {
        original_id: 1,
        clones: [
          { id: 10, quote_number: 'Q-001-COPY', cloned_from: 1 },
          { id: 11, quote_number: 'Q-001-COPY-2', cloned_from: 1 }
        ],
        clone_count: 2
      };

      cachedFetch.mockResolvedValue(mockData);

      const getClones = async (quoteId) => {
        return await cachedFetch(`${API_BASE_URL}/${quoteId}/clones`);
      };

      const result = await getClones(1);
      expect(result.clones).toHaveLength(2);
      expect(result.clone_count).toBe(2);
    });
  });

  describe('getCloneHistory', () => {
    test('should get clone history', async () => {
      const mockData = {
        history: [
          {
            id: 1,
            original_quote_id: 1,
            cloned_quote_id: 10,
            quote_number: 'Q-001-COPY',
            created_by_name: 'John Doe',
            created_at: '2024-01-15T10:00:00Z'
          }
        ],
        total: 1
      };

      cachedFetch.mockResolvedValue(mockData);

      const getCloneHistory = async (quoteId) => {
        return await cachedFetch(`${API_BASE_URL}/${quoteId}/clone-history`);
      };

      const result = await getCloneHistory(1);
      expect(result.history).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('cloneWithVariations', () => {
    test('should clone with variations', async () => {
      const mockResponse = {
        success: true,
        variations_count: 2,
        variations: [
          { id: 10, quote_number: 'Q-001-V1', notes: 'Variation 1: Low price' },
          { id: 11, quote_number: 'Q-001-V2', notes: 'Variation 2: High spec' }
        ]
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const cloneWithVariations = async (quoteId, variations, userId) => {
        const response = await fetch(`${API_BASE_URL}/${quoteId}/clone-with-variations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            variations,
            created_by: userId
          })
        });
        return await response.json();
      };

      const result = await cloneWithVariations(1, [
        { description: 'Low price', total_amount: 4000 },
        { description: 'High spec', total_amount: 6000 }
      ], 1);

      expect(result.success).toBe(true);
      expect(result.variations_count).toBe(2);
      expect(result.variations).toHaveLength(2);
    });
  });

  describe('cloneAsTemplate', () => {
    test('should clone quote as template', async () => {
      const mockResponse = {
        success: true,
        template: {
          id: 1,
          name: 'Standard Quote Template',
          category: 'sales',
          base_quote_id: 1
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const cloneAsTemplate = async (quoteId, templateName, category, userId) => {
        const response = await fetch(`${API_BASE_URL}/${quoteId}/clone-as-template`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_name: templateName,
            category,
            created_by: userId
          })
        });
        return await response.json();
      };

      const result = await cloneAsTemplate(1, 'Standard Quote Template', 'sales', 1);
      expect(result.success).toBe(true);
      expect(result.template.name).toBe('Standard Quote Template');
    });
  });

  describe('quickClone', () => {
    test('should quickly clone a quote', async () => {
      const mockResponse = {
        success: true,
        cloned_quote: {
          id: 20,
          quote_number: 'Q-001-Q1234567890',
          customer_id: 2
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const quickClone = async (quoteId, customerId, userId) => {
        const response = await fetch(`${API_BASE_URL}/${quoteId}/quick-clone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: customerId,
            created_by: userId
          })
        });
        return await response.json();
      };

      const result = await quickClone(1, 2, 1);
      expect(result.success).toBe(true);
      expect(result.cloned_quote).toBeDefined();
    });
  });

  describe('isCloneable', () => {
    test('should check if quote is cloneable', async () => {
      const mockData = {
        is_cloneable: true,
        reasons: null
      };

      cachedFetch.mockResolvedValue(mockData);

      const isCloneable = async (quoteId) => {
        return await cachedFetch(`${API_BASE_URL}/${quoteId}/is-cloneable`);
      };

      const result = await isCloneable(1);
      expect(result.is_cloneable).toBe(true);
    });

    test('should return reasons when not cloneable', async () => {
      const mockData = {
        is_cloneable: false,
        reasons: ['Quote is deleted']
      };

      cachedFetch.mockResolvedValue(mockData);

      const isCloneable = async (quoteId) => {
        return await cachedFetch(`${API_BASE_URL}/${quoteId}/is-cloneable`);
      };

      const result = await isCloneable(1);
      expect(result.is_cloneable).toBe(false);
      expect(result.reasons).toContain('Quote is deleted');
    });
  });

  describe('Clone Utilities', () => {
    test('should generate clone name with suffix', () => {
      const generateCloneName = (originalName, suffix = 'COPY') => {
        return `${originalName}-${suffix}`;
      };

      expect(generateCloneName('Q-001')).toBe('Q-001-COPY');
      expect(generateCloneName('Q-002', 'V1')).toBe('Q-002-V1');
    });

    test('should auto-increment clone suffix', () => {
      const autoIncrementCloneName = (originalName, existingClones) => {
        const copyCount = existingClones.filter(q =>
          q.quote_number.startsWith(`${originalName}-COPY`)
        ).length;

        return copyCount === 0
          ? `${originalName}-COPY`
          : `${originalName}-COPY-${copyCount + 1}`;
      };

      const existing = [
        { quote_number: 'Q-001-COPY' },
        { quote_number: 'Q-001-COPY-2' }
      ];

      expect(autoIncrementCloneName('Q-001', existing)).toBe('Q-001-COPY-3');
      expect(autoIncrementCloneName('Q-002', [])).toBe('Q-002-COPY');
    });

    test('should validate clone modifications', () => {
      const validateModifications = (modifications) => {
        const errors = [];

        if (modifications.total_amount && modifications.total_amount < 0) {
          errors.push('Total amount cannot be negative');
        }

        if (modifications.discount_percentage && (
          modifications.discount_percentage < 0 || modifications.discount_percentage > 100
        )) {
          errors.push('Discount must be between 0 and 100');
        }

        return { valid: errors.length === 0, errors };
      };

      const result1 = validateModifications({ total_amount: -100 });
      expect(result1.valid).toBe(false);

      const result2 = validateModifications({ discount_percentage: 150 });
      expect(result2.valid).toBe(false);

      const result3 = validateModifications({ total_amount: 5000 });
      expect(result3.valid).toBe(true);
    });

    test('should prepare clone payload', () => {
      const prepareClonePayload = (modifications, options) => {
        return {
          modifications: modifications || {},
          clone_line_items: options.cloneLineItems !== false,
          clone_attachments: options.cloneAttachments || false,
          created_by: options.userId
        };
      };

      const payload = prepareClonePayload(
        { customer_id: 2 },
        { cloneLineItems: true, userId: 1 }
      );

      expect(payload.modifications.customer_id).toBe(2);
      expect(payload.clone_line_items).toBe(true);
      expect(payload.created_by).toBe(1);
    });
  });

  describe('Clone Status Tracking', () => {
    test('should track clone progress', () => {
      const trackCloneProgress = (current, total) => {
        return {
          current,
          total,
          percentage: Math.round((current / total) * 100),
          remaining: total - current
        };
      };

      const progress = trackCloneProgress(3, 10);
      expect(progress.percentage).toBe(30);
      expect(progress.remaining).toBe(7);
    });

    test('should format clone status message', () => {
      const formatCloneStatus = (cloned, total, failed = 0) => {
        if (failed > 0) {
          return `Cloned ${cloned} of ${total} quotes (${failed} failed)`;
        }
        return `Cloned ${cloned} of ${total} quotes`;
      };

      expect(formatCloneStatus(5, 10)).toBe('Cloned 5 of 10 quotes');
      expect(formatCloneStatus(5, 10, 2)).toBe('Cloned 5 of 10 quotes (2 failed)');
    });
  });

  describe('Clone History Analysis', () => {
    test('should group clones by date', () => {
      const groupClonesByDate = (clones) => {
        const groups = {};
        clones.forEach(clone => {
          const date = clone.created_at.split('T')[0];
          if (!groups[date]) groups[date] = [];
          groups[date].push(clone);
        });
        return groups;
      };

      const clones = [
        { id: 1, created_at: '2024-01-15T10:00:00Z' },
        { id: 2, created_at: '2024-01-15T11:00:00Z' },
        { id: 3, created_at: '2024-01-16T10:00:00Z' }
      ];

      const grouped = groupClonesByDate(clones);
      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped['2024-01-15']).toHaveLength(2);
    });

    test('should get most cloned quotes', () => {
      const getMostClonedQuotes = (history) => {
        const counts = {};
        history.forEach(h => {
          counts[h.original_quote_id] = (counts[h.original_quote_id] || 0) + 1;
        });

        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, count]) => ({ quote_id: parseInt(id), clone_count: count }));
      };

      const history = [
        { original_quote_id: 1 },
        { original_quote_id: 2 },
        { original_quote_id: 1 },
        { original_quote_id: 3 },
        { original_quote_id: 1 }
      ];

      const mostCloned = getMostClonedQuotes(history);
      expect(mostCloned[0].quote_id).toBe(1);
      expect(mostCloned[0].clone_count).toBe(3);
    });

    test('should calculate clone statistics', () => {
      const calculateCloneStats = (clones) => {
        const totalClones = clones.length;
        const uniqueOriginals = new Set(clones.map(c => c.cloned_from)).size;
        const avgClonesPerOriginal = totalClones / uniqueOriginals;

        return {
          total_clones: totalClones,
          unique_originals: uniqueOriginals,
          avg_clones_per_original: avgClonesPerOriginal.toFixed(2)
        };
      };

      const clones = [
        { id: 10, cloned_from: 1 },
        { id: 11, cloned_from: 1 },
        { id: 12, cloned_from: 2 },
        { id: 13, cloned_from: 1 }
      ];

      const stats = calculateCloneStats(clones);
      expect(stats.total_clones).toBe(4);
      expect(stats.unique_originals).toBe(2);
      expect(stats.avg_clones_per_original).toBe('2.00');
    });
  });

  describe('Clone Comparison', () => {
    test('should compare original and cloned quote', () => {
      const compareQuotes = (original, cloned) => {
        const differences = [];

        if (original.customer_id !== cloned.customer_id) {
          differences.push({ field: 'customer_id', original: original.customer_id, cloned: cloned.customer_id });
        }

        if (original.total_amount !== cloned.total_amount) {
          differences.push({ field: 'total_amount', original: original.total_amount, cloned: cloned.total_amount });
        }

        return {
          has_differences: differences.length > 0,
          differences
        };
      };

      const original = { customer_id: 1, total_amount: 5000 };
      const cloned = { customer_id: 2, total_amount: 6000 };

      const comparison = compareQuotes(original, cloned);
      expect(comparison.has_differences).toBe(true);
      expect(comparison.differences).toHaveLength(2);
    });

    test('should highlight modified fields', () => {
      const highlightModifiedFields = (original, cloned) => {
        const modified = [];

        Object.keys(cloned).forEach(key => {
          if (original[key] !== undefined && original[key] !== cloned[key]) {
            modified.push(key);
          }
        });

        return modified;
      };

      const original = { quote_number: 'Q-001', customer_id: 1, total_amount: 5000 };
      const cloned = { quote_number: 'Q-001-COPY', customer_id: 1, total_amount: 6000 };

      const modified = highlightModifiedFields(original, cloned);
      expect(modified).toContain('quote_number');
      expect(modified).toContain('total_amount');
      expect(modified).not.toContain('customer_id');
    });
  });

  describe('Variation Management', () => {
    test('should create variation matrix', () => {
      const createVariationMatrix = (baseOptions) => {
        const variations = [];

        baseOptions.prices.forEach((price, i) => {
          baseOptions.specs.forEach((spec, j) => {
            variations.push({
              name: `Variation ${i + 1}-${j + 1}`,
              total_amount: price,
              description: spec.description
            });
          });
        });

        return variations;
      };

      const options = {
        prices: [4000, 5000, 6000],
        specs: [
          { description: 'Basic' },
          { description: 'Premium' }
        ]
      };

      const variations = createVariationMatrix(options);
      expect(variations).toHaveLength(6);
    });

    test('should label variations', () => {
      const labelVariations = (variations) => {
        return variations.map((v, i) => ({
          ...v,
          label: `Option ${String.fromCharCode(65 + i)}`,
          order: i + 1
        }));
      };

      const variations = [
        { total_amount: 4000 },
        { total_amount: 5000 },
        { total_amount: 6000 }
      ];

      const labeled = labelVariations(variations);
      expect(labeled[0].label).toBe('Option A');
      expect(labeled[1].label).toBe('Option B');
      expect(labeled[2].label).toBe('Option C');
    });
  });

  describe('Clone Permissions', () => {
    test('should check clone permissions', () => {
      const canClone = (user, quote) => {
        if (user.role === 'admin') return { allowed: true };

        if (quote.created_by === user.id) {
          return { allowed: true };
        }

        if (user.permissions && user.permissions.includes('clone_all_quotes')) {
          return { allowed: true };
        }

        return { allowed: false, reason: 'Insufficient permissions' };
      };

      const admin = { id: 1, role: 'admin' };
      const owner = { id: 2, role: 'user' };
      const other = { id: 3, role: 'user' };
      const quote = { id: 1, created_by: 2 };

      expect(canClone(admin, quote).allowed).toBe(true);
      expect(canClone(owner, quote).allowed).toBe(true);
      expect(canClone(other, quote).allowed).toBe(false);
    });
  });

  describe('Bulk Clone Operations', () => {
    test('should batch clone operations', () => {
      const batchCloneOperations = (quoteIds, batchSize = 10) => {
        const batches = [];
        for (let i = 0; i < quoteIds.length; i += batchSize) {
          batches.push(quoteIds.slice(i, i + batchSize));
        }
        return batches;
      };

      const ids = Array.from({ length: 25 }, (_, i) => i + 1);
      const batches = batchCloneOperations(ids, 10);

      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(10);
      expect(batches[2]).toHaveLength(5);
    });

    test('should estimate clone time', () => {
      const estimateCloneTime = (quoteCount, avgTimePerQuote = 2) => {
        const totalSeconds = quoteCount * avgTimePerQuote;
        if (totalSeconds < 60) return `${totalSeconds} seconds`;
        const minutes = Math.floor(totalSeconds / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
      };

      expect(estimateCloneTime(10)).toBe('20 seconds');
      expect(estimateCloneTime(50)).toBe('1 minute');
      expect(estimateCloneTime(100)).toBe('3 minutes');
    });
  });

  describe('Clone Notifications', () => {
    test('should format clone success message', () => {
      const formatSuccessMessage = (clonedQuote) => {
        return `Quote ${clonedQuote.quote_number} created successfully`;
      };

      expect(formatSuccessMessage({ quote_number: 'Q-001-COPY' }))
        .toBe('Quote Q-001-COPY created successfully');
    });

    test('should format bulk clone message', () => {
      const formatBulkCloneMessage = (count, failed = 0) => {
        if (failed === 0) {
          return `Successfully cloned ${count} quote${count !== 1 ? 's' : ''}`;
        }
        return `Cloned ${count - failed} of ${count} quotes (${failed} failed)`;
      };

      expect(formatBulkCloneMessage(5)).toBe('Successfully cloned 5 quotes');
      expect(formatBulkCloneMessage(1)).toBe('Successfully cloned 1 quote');
      expect(formatBulkCloneMessage(10, 2)).toBe('Cloned 8 of 10 quotes (2 failed)');
    });
  });
});
