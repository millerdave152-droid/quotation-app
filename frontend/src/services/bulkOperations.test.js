import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Bulk Operations Service', () => {
  const API_BASE_URL = '/api/bulk';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('bulkStatusUpdate', () => {
    test('should update status for multiple quotes', async () => {
      const mockResponse = {
        success: true,
        updated_count: 3,
        quote_ids: [1, 2, 3]
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const bulkStatusUpdate = async (quoteIds, status, userId) => {
        const response = await fetch(`${API_BASE_URL}/status-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_ids: quoteIds,
            status,
            updated_by: userId
          })
        });
        return await response.json();
      };

      const result = await bulkStatusUpdate([1, 2, 3], 'sent', 1);
      expect(result.success).toBe(true);
      expect(result.updated_count).toBe(3);
    });

    test('should handle errors gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Invalid status' })
      });

      const bulkStatusUpdate = async (quoteIds, status, userId) => {
        const response = await fetch(`${API_BASE_URL}/status-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_ids: quoteIds,
            status,
            updated_by: userId
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      };

      await expect(bulkStatusUpdate([1, 2], 'invalid', 1))
        .rejects.toThrow('Invalid status');
    });
  });

  describe('bulkSendEmails', () => {
    test('should send emails to multiple quotes', async () => {
      const mockResponse = {
        success: true,
        sent_count: 5,
        failed_count: 0,
        sent_quote_ids: [1, 2, 3, 4, 5]
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const bulkSendEmails = async (quoteIds, template, senderId) => {
        const response = await fetch(`${API_BASE_URL}/send-emails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_ids: quoteIds,
            email_template: template,
            sender_id: senderId
          })
        });
        return await response.json();
      };

      const result = await bulkSendEmails([1, 2, 3, 4, 5], 'quote_notification', 1);
      expect(result.success).toBe(true);
      expect(result.sent_count).toBe(5);
      expect(result.failed_count).toBe(0);
    });
  });

  describe('bulkGeneratePDFs', () => {
    test('should generate PDFs for multiple quotes', async () => {
      const mockResponse = {
        success: true,
        generated_count: 3,
        pdfs: [
          { quote_id: 1, pdf_id: 101, file_path: '/pdfs/quote-1.pdf' },
          { quote_id: 2, pdf_id: 102, file_path: '/pdfs/quote-2.pdf' },
          { quote_id: 3, pdf_id: 103, file_path: '/pdfs/quote-3.pdf' }
        ]
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const bulkGeneratePDFs = async (quoteIds, userId) => {
        const response = await fetch(`${API_BASE_URL}/generate-pdfs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_ids: quoteIds,
            user_id: userId
          })
        });
        return await response.json();
      };

      const result = await bulkGeneratePDFs([1, 2, 3], 1);
      expect(result.success).toBe(true);
      expect(result.generated_count).toBe(3);
      expect(result.pdfs).toHaveLength(3);
    });
  });

  describe('bulkExport', () => {
    test('should export quotes in CSV format', async () => {
      const mockResponse = {
        success: true,
        format: 'csv',
        data: [
          { id: 1, quote_number: 'Q-001', total_amount: 1000 },
          { id: 2, quote_number: 'Q-002', total_amount: 2000 }
        ],
        count: 2
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const bulkExport = async (quoteIds, format, fields = null) => {
        const response = await fetch(`${API_BASE_URL}/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_ids: quoteIds,
            format,
            fields
          })
        });
        return await response.json();
      };

      const result = await bulkExport([1, 2], 'csv');
      expect(result.success).toBe(true);
      expect(result.format).toBe('csv');
      expect(result.data).toHaveLength(2);
    });

    test('should export with specific fields', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          format: 'excel',
          data: [{ id: 1, quote_number: 'Q-001' }],
          count: 1
        })
      });

      const bulkExport = async (quoteIds, format, fields = null) => {
        const response = await fetch(`${API_BASE_URL}/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_ids: quoteIds,
            format,
            fields
          })
        });
        return await response.json();
      };

      await bulkExport([1], 'excel', ['id', 'quote_number', 'total_amount']);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('fields')
        })
      );
    });
  });

  describe('bulkDelete', () => {
    test('should soft delete quotes', async () => {
      const mockResponse = {
        success: true,
        deleted_count: 2,
        soft_delete: true
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const bulkDelete = async (quoteIds, softDelete = true, deletedBy) => {
        const response = await fetch(`${API_BASE_URL}/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_ids: quoteIds,
            soft_delete: softDelete,
            deleted_by: deletedBy
          })
        });
        return await response.json();
      };

      const result = await bulkDelete([1, 2], true, 1);
      expect(result.success).toBe(true);
      expect(result.soft_delete).toBe(true);
      expect(result.deleted_count).toBe(2);
    });
  });

  describe('bulkAssign', () => {
    test('should assign quotes to user', async () => {
      const mockResponse = {
        success: true,
        assigned_count: 5,
        assigned_to: 3
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const bulkAssign = async (quoteIds, assignedTo, assignedBy) => {
        const response = await fetch(`${API_BASE_URL}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_ids: quoteIds,
            assigned_to: assignedTo,
            assigned_by: assignedBy
          })
        });
        return await response.json();
      };

      const result = await bulkAssign([1, 2, 3, 4, 5], 3, 1);
      expect(result.success).toBe(true);
      expect(result.assigned_count).toBe(5);
      expect(result.assigned_to).toBe(3);
    });
  });

  describe('bulkArchive', () => {
    test('should archive multiple quotes', async () => {
      const mockResponse = {
        success: true,
        archived_count: 3
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const bulkArchive = async (quoteIds, archivedBy) => {
        const response = await fetch(`${API_BASE_URL}/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_ids: quoteIds,
            archived_by: archivedBy
          })
        });
        return await response.json();
      };

      const result = await bulkArchive([1, 2, 3], 1);
      expect(result.success).toBe(true);
      expect(result.archived_count).toBe(3);
    });
  });

  describe('bulkDuplicate', () => {
    test('should duplicate multiple quotes', async () => {
      const mockResponse = {
        success: true,
        duplicated_count: 2,
        duplicates: [
          { original_id: 1, new_id: 10 },
          { original_id: 2, new_id: 11 }
        ]
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const bulkDuplicate = async (quoteIds, createdBy) => {
        const response = await fetch(`${API_BASE_URL}/duplicate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_ids: quoteIds,
            created_by: createdBy
          })
        });
        return await response.json();
      };

      const result = await bulkDuplicate([1, 2], 1);
      expect(result.success).toBe(true);
      expect(result.duplicated_count).toBe(2);
      expect(result.duplicates).toHaveLength(2);
    });
  });

  describe('getOperationStatus', () => {
    test('should get bulk operation status', async () => {
      const mockData = {
        operation: {
          id: 1,
          operation_type: 'status_update',
          status: 'completed',
          total_items: 10,
          processed_items: 10
        }
      };

      cachedFetch.mockResolvedValue(mockData);

      const getOperationStatus = async (operationId) => {
        return await cachedFetch(`${API_BASE_URL}/operations/${operationId}/status`);
      };

      const result = await getOperationStatus(1);
      expect(result.operation.status).toBe('completed');
      expect(result.operation.total_items).toBe(10);
    });
  });

  describe('validateBulkOperation', () => {
    test('should validate quotes for bulk operation', async () => {
      const mockResponse = {
        valid_count: 3,
        invalid_count: 2,
        valid_ids: [1, 2, 3],
        invalid_items: [
          { id: 4, reason: 'Quote already accepted' },
          { id: 5, reason: 'No customer assigned' }
        ]
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const validateBulkOperation = async (quoteIds, operation) => {
        const response = await fetch(`${API_BASE_URL}/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_ids: quoteIds,
            operation
          })
        });
        return await response.json();
      };

      const result = await validateBulkOperation([1, 2, 3, 4, 5], 'send-email');
      expect(result.valid_count).toBe(3);
      expect(result.invalid_count).toBe(2);
      expect(result.invalid_items).toHaveLength(2);
    });
  });

  describe('Selection Management', () => {
    test('should select all items', () => {
      const selectAll = (items) => {
        return items.map(item => item.id);
      };

      const items = [
        { id: 1, name: 'Quote 1' },
        { id: 2, name: 'Quote 2' },
        { id: 3, name: 'Quote 3' }
      ];

      const selected = selectAll(items);
      expect(selected).toEqual([1, 2, 3]);
    });

    test('should toggle selection', () => {
      const toggleSelection = (currentSelection, itemId) => {
        const index = currentSelection.indexOf(itemId);
        if (index > -1) {
          return currentSelection.filter(id => id !== itemId);
        }
        return [...currentSelection, itemId];
      };

      let selection = [1, 2, 3];
      selection = toggleSelection(selection, 2);
      expect(selection).toEqual([1, 3]);

      selection = toggleSelection(selection, 2);
      expect(selection).toEqual([1, 3, 2]);
    });

    test('should clear selection', () => {
      const clearSelection = () => [];

      const selection = [1, 2, 3, 4, 5];
      const cleared = clearSelection();
      expect(cleared).toEqual([]);
    });

    test('should select by status', () => {
      const selectByStatus = (items, status) => {
        return items.filter(item => item.status === status).map(item => item.id);
      };

      const items = [
        { id: 1, status: 'pending' },
        { id: 2, status: 'sent' },
        { id: 3, status: 'pending' },
        { id: 4, status: 'accepted' }
      ];

      const selected = selectByStatus(items, 'pending');
      expect(selected).toEqual([1, 3]);
    });

    test('should get selection count', () => {
      const getSelectionCount = (selection) => selection.length;

      expect(getSelectionCount([1, 2, 3])).toBe(3);
      expect(getSelectionCount([])).toBe(0);
    });
  });

  describe('Progress Tracking', () => {
    test('should calculate progress percentage', () => {
      const calculateProgress = (processed, total) => {
        if (total === 0) return 0;
        return Math.round((processed / total) * 100);
      };

      expect(calculateProgress(25, 100)).toBe(25);
      expect(calculateProgress(50, 100)).toBe(50);
      expect(calculateProgress(100, 100)).toBe(100);
      expect(calculateProgress(0, 100)).toBe(0);
    });

    test('should estimate time remaining', () => {
      const estimateTimeRemaining = (processed, total, elapsedMs) => {
        if (processed === 0) return null;
        const avgTimePerItem = elapsedMs / processed;
        const remaining = total - processed;
        return Math.round(avgTimePerItem * remaining);
      };

      // Processed 25 out of 100 in 5000ms (5 seconds)
      const remaining = estimateTimeRemaining(25, 100, 5000);
      expect(remaining).toBe(15000); // 15 seconds remaining
    });

    test('should format operation status message', () => {
      const formatStatusMessage = (operation) => {
        const { status, processed_items, total_items } = operation;

        if (status === 'pending') return 'Operation queued';
        if (status === 'processing') return `Processing ${processed_items} of ${total_items}`;
        if (status === 'completed') return `Completed: ${total_items} items processed`;
        if (status === 'failed') return 'Operation failed';
        return 'Unknown status';
      };

      expect(formatStatusMessage({ status: 'pending' })).toBe('Operation queued');
      expect(formatStatusMessage({ status: 'processing', processed_items: 5, total_items: 10 }))
        .toBe('Processing 5 of 10');
      expect(formatStatusMessage({ status: 'completed', total_items: 10 }))
        .toBe('Completed: 10 items processed');
    });
  });

  describe('Batch Processing', () => {
    test('should split items into batches', () => {
      const splitIntoBatches = (items, batchSize) => {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
          batches.push(items.slice(i, i + batchSize));
        }
        return batches;
      };

      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const batches = splitIntoBatches(items, 3);

      expect(batches).toHaveLength(4);
      expect(batches[0]).toEqual([1, 2, 3]);
      expect(batches[1]).toEqual([4, 5, 6]);
      expect(batches[2]).toEqual([7, 8, 9]);
      expect(batches[3]).toEqual([10]);
    });

    test('should process batches sequentially', async () => {
      const processBatchSequentially = async (batches, processFunc) => {
        const results = [];
        for (const batch of batches) {
          const result = await processFunc(batch);
          results.push(result);
        }
        return results;
      };

      const mockProcess = jest.fn()
        .mockResolvedValueOnce({ success: true, count: 2 })
        .mockResolvedValueOnce({ success: true, count: 2 })
        .mockResolvedValueOnce({ success: true, count: 1 });

      const batches = [[1, 2], [3, 4], [5]];
      const results = await processBatchSequentially(batches, mockProcess);

      expect(results).toHaveLength(3);
      expect(mockProcess).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling', () => {
    test('should collect errors from bulk operation', () => {
      const collectErrors = (results) => {
        return results
          .filter(r => !r.success)
          .map(r => ({ id: r.id, error: r.error }));
      };

      const results = [
        { id: 1, success: true },
        { id: 2, success: false, error: 'Failed to send email' },
        { id: 3, success: true },
        { id: 4, success: false, error: 'Invalid status' }
      ];

      const errors = collectErrors(results);
      expect(errors).toHaveLength(2);
      expect(errors[0].id).toBe(2);
    });

    test('should retry failed items', async () => {
      const retryFailed = async (failedItems, operation, maxRetries = 3) => {
        const retryResults = [];

        for (const item of failedItems) {
          let retries = 0;
          let success = false;

          while (retries < maxRetries && !success) {
            try {
              await operation(item);
              success = true;
              retryResults.push({ id: item, success: true, retries });
            } catch (error) {
              retries++;
              if (retries >= maxRetries) {
                retryResults.push({ id: item, success: false, retries, error: error.message });
              }
            }
          }
        }

        return retryResults;
      };

      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({ success: true });

      const results = await retryFailed([1], mockOperation, 3);
      expect(results[0].success).toBe(true);
      expect(results[0].retries).toBe(1);
    });

    test('should format error summary', () => {
      const formatErrorSummary = (errors) => {
        if (errors.length === 0) return 'No errors';
        if (errors.length === 1) return `1 error: ${errors[0].error}`;
        return `${errors.length} errors occurred`;
      };

      expect(formatErrorSummary([])).toBe('No errors');
      expect(formatErrorSummary([{ error: 'Failed' }])).toBe('1 error: Failed');
      expect(formatErrorSummary([{ error: 'E1' }, { error: 'E2' }, { error: 'E3' }]))
        .toBe('3 errors occurred');
    });
  });

  describe('Export Utilities', () => {
    test('should generate CSV from bulk data', () => {
      const generateCSV = (data) => {
        if (data.length === 0) return '';

        const headers = Object.keys(data[0]);
        const rows = data.map(row =>
          headers.map(header => `"${row[header]}"`).join(',')
        );

        return [headers.join(','), ...rows].join('\n');
      };

      const data = [
        { id: 1, quote_number: 'Q-001', amount: 1000 },
        { id: 2, quote_number: 'Q-002', amount: 2000 }
      ];

      const csv = generateCSV(data);
      expect(csv).toContain('id,quote_number,amount');
      expect(csv).toContain('"Q-001"');
    });

    test('should download exported file', () => {
      const downloadFile = (data, filename, mimeType) => {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);

        return { blob, url, filename };
      };

      global.Blob = jest.fn((content, options) => ({ content, ...options }));
      global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');

      const result = downloadFile('test data', 'export.csv', 'text/csv');
      expect(result.url).toBe('blob:mock-url');
      expect(result.filename).toBe('export.csv');
    });
  });

  describe('Confirmation Dialogs', () => {
    test('should format confirmation message', () => {
      const formatConfirmMessage = (operation, count) => {
        const messages = {
          delete: `Are you sure you want to delete ${count} quote(s)?`,
          archive: `Archive ${count} quote(s)?`,
          send: `Send email to ${count} customer(s)?`,
          status: `Update status for ${count} quote(s)?`
        };
        return messages[operation] || `Perform operation on ${count} item(s)?`;
      };

      expect(formatConfirmMessage('delete', 5)).toBe('Are you sure you want to delete 5 quote(s)?');
      expect(formatConfirmMessage('send', 3)).toBe('Send email to 3 customer(s)?');
    });

    test('should check if confirmation needed', () => {
      const needsConfirmation = (operation, count) => {
        const dangerousOps = ['delete', 'archive'];
        const threshold = 10;

        return dangerousOps.includes(operation) || count >= threshold;
      };

      expect(needsConfirmation('delete', 1)).toBe(true);
      expect(needsConfirmation('status', 5)).toBe(false);
      expect(needsConfirmation('status', 15)).toBe(true);
    });
  });

  describe('Operation Queue', () => {
    test('should add operation to queue', () => {
      const operationQueue = [];

      const addToQueue = (operation) => {
        operationQueue.push({
          ...operation,
          id: Date.now(),
          status: 'queued',
          created_at: new Date().toISOString()
        });
        return operationQueue.length;
      };

      const queueLength = addToQueue({
        type: 'status_update',
        quote_ids: [1, 2, 3]
      });

      expect(queueLength).toBe(1);
      expect(operationQueue[0].status).toBe('queued');
    });

    test('should get queue length', () => {
      const getQueueLength = (queue) => queue.length;

      expect(getQueueLength([1, 2, 3])).toBe(3);
      expect(getQueueLength([])).toBe(0);
    });
  });
});
