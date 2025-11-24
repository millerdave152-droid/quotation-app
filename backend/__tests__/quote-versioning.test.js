const request = require('supertest');
const express = require('express');

// Mock database
const mockPool = {
  query: jest.fn()
};

describe('Quote Versioning System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Middleware to extract user from request
    app.use((req, res, next) => {
      req.user = req.headers['x-user-id']
        ? { id: parseInt(req.headers['x-user-id']), name: req.headers['x-user-name'] || 'Test User' }
        : null;
      next();
    });

    // POST /api/quotations/:id/create-version
    app.post('/api/quotations/:id/create-version', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { version_notes, changes_summary } = req.body;

        // Get current quote
        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        // Get current version number
        const versionResult = await mockPool.query(
          'SELECT MAX(version_number) as max_version FROM quote_versions WHERE quote_id = $1',
          [req.params.id]
        );

        const currentVersion = versionResult.rows[0].max_version || 0;
        const newVersion = currentVersion + 1;

        // Create version snapshot
        const versionData = {
          quote_id: quote.id,
          version_number: newVersion,
          data: JSON.stringify(quote),
          created_by: req.user.id,
          version_notes: version_notes,
          changes_summary: changes_summary
        };

        const insertResult = await mockPool.query(
          `INSERT INTO quote_versions
           (quote_id, version_number, data, created_by, version_notes, changes_summary)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            versionData.quote_id,
            versionData.version_number,
            versionData.data,
            versionData.created_by,
            versionData.version_notes,
            versionData.changes_summary
          ]
        );

        // Update quote with current version
        await mockPool.query(
          'UPDATE quotations SET current_version = $1 WHERE id = $2',
          [newVersion, req.params.id]
        );

        res.status(201).json({
          success: true,
          message: 'Version created successfully',
          version: insertResult.rows[0],
          version_number: newVersion
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/:id/versions
    app.get('/api/quotations/:id/versions', async (req, res) => {
      try {
        const versionsResult = await mockPool.query(
          `SELECT qv.*, u.name as created_by_name
           FROM quote_versions qv
           LEFT JOIN users u ON qv.created_by = u.id
           WHERE qv.quote_id = $1
           ORDER BY qv.version_number DESC`,
          [req.params.id]
        );

        res.json({
          count: versionsResult.rows.length,
          versions: versionsResult.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/:id/versions/:versionNumber
    app.get('/api/quotations/:id/versions/:versionNumber', async (req, res) => {
      try {
        const versionResult = await mockPool.query(
          `SELECT qv.*, u.name as created_by_name
           FROM quote_versions qv
           LEFT JOIN users u ON qv.created_by = u.id
           WHERE qv.quote_id = $1 AND qv.version_number = $2`,
          [req.params.id, req.params.versionNumber]
        );

        if (versionResult.rows.length === 0) {
          return res.status(404).json({ error: 'Version not found' });
        }

        const version = versionResult.rows[0];

        // Parse the data JSON
        version.data = typeof version.data === 'string'
          ? JSON.parse(version.data)
          : version.data;

        res.json(version);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/:id/restore-version/:versionNumber
    app.post('/api/quotations/:id/restore-version/:versionNumber', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { create_new_version } = req.body;

        // Get the version to restore
        const versionResult = await mockPool.query(
          'SELECT * FROM quote_versions WHERE quote_id = $1 AND version_number = $2',
          [req.params.id, req.params.versionNumber]
        );

        if (versionResult.rows.length === 0) {
          return res.status(404).json({ error: 'Version not found' });
        }

        const version = versionResult.rows[0];
        const versionData = typeof version.data === 'string'
          ? JSON.parse(version.data)
          : version.data;

        // If create_new_version is true, create a new version before restoring
        if (create_new_version) {
          const currentQuote = await mockPool.query(
            'SELECT * FROM quotations WHERE id = $1',
            [req.params.id]
          );

          const maxVersionResult = await mockPool.query(
            'SELECT MAX(version_number) as max_version FROM quote_versions WHERE quote_id = $1',
            [req.params.id]
          );

          const newVersionNumber = (maxVersionResult.rows[0].max_version || 0) + 1;

          await mockPool.query(
            `INSERT INTO quote_versions
             (quote_id, version_number, data, created_by, version_notes)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              req.params.id,
              newVersionNumber,
              JSON.stringify(currentQuote.rows[0]),
              req.user.id,
              `Backup before restoring to v${req.params.versionNumber}`
            ]
          );
        }

        // Restore the quote data
        const updateResult = await mockPool.query(
          `UPDATE quotations
           SET items = $1,
               total_amount = $2,
               discount = $3,
               terms = $4,
               updated_at = CURRENT_TIMESTAMP,
               updated_by = $5
           WHERE id = $6
           RETURNING *`,
          [
            versionData.items,
            versionData.total_amount,
            versionData.discount,
            versionData.terms,
            req.user.id,
            req.params.id
          ]
        );

        // Log the restore action
        await mockPool.query(
          `INSERT INTO quote_version_log
           (quote_id, action, version_number, performed_by)
           VALUES ($1, 'restored', $2, $3)`,
          [req.params.id, req.params.versionNumber, req.user.id]
        );

        res.json({
          success: true,
          message: `Quote restored to version ${req.params.versionNumber}`,
          quote: updateResult.rows[0],
          restored_from_version: parseInt(req.params.versionNumber)
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/:id/compare-versions
    app.get('/api/quotations/:id/compare-versions', async (req, res) => {
      try {
        const { version1, version2 } = req.query;

        if (!version1 || !version2) {
          return res.status(400).json({
            error: 'Both version1 and version2 parameters are required'
          });
        }

        // Get both versions
        const version1Result = await mockPool.query(
          'SELECT * FROM quote_versions WHERE quote_id = $1 AND version_number = $2',
          [req.params.id, version1]
        );

        const version2Result = await mockPool.query(
          'SELECT * FROM quote_versions WHERE quote_id = $1 AND version_number = $2',
          [req.params.id, version2]
        );

        if (version1Result.rows.length === 0 || version2Result.rows.length === 0) {
          return res.status(404).json({ error: 'One or both versions not found' });
        }

        const v1Data = typeof version1Result.rows[0].data === 'string'
          ? JSON.parse(version1Result.rows[0].data)
          : version1Result.rows[0].data;

        const v2Data = typeof version2Result.rows[0].data === 'string'
          ? JSON.parse(version2Result.rows[0].data)
          : version2Result.rows[0].data;

        // Compare the data
        const differences = {
          total_amount: {
            version1: v1Data.total_amount,
            version2: v2Data.total_amount,
            changed: v1Data.total_amount !== v2Data.total_amount
          },
          discount: {
            version1: v1Data.discount,
            version2: v2Data.discount,
            changed: v1Data.discount !== v2Data.discount
          },
          terms: {
            version1: v1Data.terms,
            version2: v2Data.terms,
            changed: v1Data.terms !== v2Data.terms
          },
          items: {
            version1: v1Data.items,
            version2: v2Data.items,
            changed: JSON.stringify(v1Data.items) !== JSON.stringify(v2Data.items)
          }
        };

        res.json({
          version1: parseInt(version1),
          version2: parseInt(version2),
          differences: differences,
          has_changes: Object.values(differences).some(d => d.changed)
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/:id/version-history
    app.get('/api/quotations/:id/version-history', async (req, res) => {
      try {
        const historyResult = await mockPool.query(
          `SELECT vl.*, u.name as performed_by_name
           FROM quote_version_log vl
           LEFT JOIN users u ON vl.performed_by = u.id
           WHERE vl.quote_id = $1
           ORDER BY vl.created_at DESC`,
          [req.params.id]
        );

        res.json({
          count: historyResult.rows.length,
          history: historyResult.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/:id/auto-version
    app.post('/api/quotations/:id/auto-version', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { enable, threshold } = req.body;

        // Update quote settings
        await mockPool.query(
          `UPDATE quotations
           SET auto_version_enabled = $1,
               auto_version_threshold = $2
           WHERE id = $3`,
          [enable, threshold || null, req.params.id]
        );

        res.json({
          success: true,
          message: enable ? 'Auto-versioning enabled' : 'Auto-versioning disabled',
          auto_version_enabled: enable,
          auto_version_threshold: threshold
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/quotations/:id/versions/:versionNumber
    app.delete('/api/quotations/:id/versions/:versionNumber', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        // Don't allow deleting the current version
        const quoteResult = await mockPool.query(
          'SELECT current_version FROM quotations WHERE id = $1',
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const currentVersion = quoteResult.rows[0].current_version;

        if (parseInt(req.params.versionNumber) === currentVersion) {
          return res.status(400).json({
            error: 'Cannot delete the current version'
          });
        }

        // Delete the version
        const deleteResult = await mockPool.query(
          'DELETE FROM quote_versions WHERE quote_id = $1 AND version_number = $2 RETURNING *',
          [req.params.id, req.params.versionNumber]
        );

        if (deleteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Version not found' });
        }

        res.json({
          success: true,
          message: `Version ${req.params.versionNumber} deleted`,
          deleted_version: deleteResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/:id/lock-version
    app.post('/api/quotations/:id/lock-version', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { version_number, lock_reason } = req.body;

        if (!version_number) {
          return res.status(400).json({ error: 'Version number is required' });
        }

        // Lock the version
        const lockResult = await mockPool.query(
          `UPDATE quote_versions
           SET is_locked = true,
               locked_by = $1,
               locked_at = CURRENT_TIMESTAMP,
               lock_reason = $2
           WHERE quote_id = $3 AND version_number = $4
           RETURNING *`,
          [req.user.id, lock_reason, req.params.id, version_number]
        );

        if (lockResult.rows.length === 0) {
          return res.status(404).json({ error: 'Version not found' });
        }

        res.json({
          success: true,
          message: `Version ${version_number} locked`,
          version: lockResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/:id/version-diff/:version1/:version2
    app.get('/api/quotations/:id/version-diff/:version1/:version2', async (req, res) => {
      try {
        const { version1, version2 } = req.params;

        // Get both versions
        const v1Result = await mockPool.query(
          'SELECT * FROM quote_versions WHERE quote_id = $1 AND version_number = $2',
          [req.params.id, version1]
        );

        const v2Result = await mockPool.query(
          'SELECT * FROM quote_versions WHERE quote_id = $1 AND version_number = $2',
          [req.params.id, version2]
        );

        if (v1Result.rows.length === 0 || v2Result.rows.length === 0) {
          return res.status(404).json({ error: 'One or both versions not found' });
        }

        const v1Data = typeof v1Result.rows[0].data === 'string'
          ? JSON.parse(v1Result.rows[0].data)
          : v1Result.rows[0].data;

        const v2Data = typeof v2Result.rows[0].data === 'string'
          ? JSON.parse(v2Result.rows[0].data)
          : v2Result.rows[0].data;

        // Calculate detailed diff
        const diff = {
          metadata: {
            from_version: parseInt(version1),
            to_version: parseInt(version2),
            from_date: v1Result.rows[0].created_at,
            to_date: v2Result.rows[0].created_at
          },
          changes: []
        };

        // Check each field for changes
        if (v1Data.total_amount !== v2Data.total_amount) {
          diff.changes.push({
            field: 'total_amount',
            old_value: v1Data.total_amount,
            new_value: v2Data.total_amount,
            change_type: 'modified'
          });
        }

        if (v1Data.discount !== v2Data.discount) {
          diff.changes.push({
            field: 'discount',
            old_value: v1Data.discount,
            new_value: v2Data.discount,
            change_type: 'modified'
          });
        }

        if (v1Data.terms !== v2Data.terms) {
          diff.changes.push({
            field: 'terms',
            old_value: v1Data.terms,
            new_value: v2Data.terms,
            change_type: 'modified'
          });
        }

        res.json(diff);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/quotations/:id/create-version', () => {
    test('should create a new version of the quote', async () => {
      const mockQuote = {
        id: 1,
        quote_number: 'Q-001',
        total_amount: 15000,
        items: JSON.stringify([{ product_id: 1, quantity: 2 }])
      };

      const mockVersion = {
        id: 1,
        quote_id: 1,
        version_number: 1,
        data: JSON.stringify(mockQuote),
        created_by: 1
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [{ max_version: 0 }] })
        .mockResolvedValueOnce({ rows: [mockVersion] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/create-version')
        .set('x-user-id', '1')
        .send({ version_notes: 'Initial version' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.version_number).toBe(1);
    });

    test('should increment version number correctly', async () => {
      const mockQuote = { id: 1, total_amount: 20000 };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [{ max_version: 3 }] })
        .mockResolvedValueOnce({ rows: [{ version_number: 4 }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/create-version')
        .set('x-user-id', '1')
        .send({ version_notes: 'Version 4' });

      expect(response.status).toBe(201);
      expect(response.body.version_number).toBe(4);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/quotations/1/create-version')
        .send({});

      expect(response.status).toBe(401);
    });

    test('should return 404 for non-existent quote', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/999/create-version')
        .set('x-user-id', '1')
        .send({});

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/quotations/:id/versions', () => {
    test('should return all versions of a quote', async () => {
      const mockVersions = [
        { id: 1, version_number: 3, created_by_name: 'John Doe', created_at: '2025-01-29' },
        { id: 2, version_number: 2, created_by_name: 'Jane Smith', created_at: '2025-01-28' },
        { id: 3, version_number: 1, created_by_name: 'John Doe', created_at: '2025-01-27' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockVersions });

      const response = await request(app).get('/api/quotations/1/versions');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(3);
      expect(response.body.versions).toHaveLength(3);
      expect(response.body.versions[0].version_number).toBe(3);
    });

    test('should return empty array for quote with no versions', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).get('/api/quotations/1/versions');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(0);
    });
  });

  describe('GET /api/quotations/:id/versions/:versionNumber', () => {
    test('should return specific version', async () => {
      const mockQuoteData = { id: 1, total_amount: 15000 };
      const mockVersion = {
        id: 1,
        version_number: 2,
        data: JSON.stringify(mockQuoteData),
        created_by_name: 'John Doe'
      };

      mockPool.query.mockResolvedValue({ rows: [mockVersion] });

      const response = await request(app).get('/api/quotations/1/versions/2');

      expect(response.status).toBe(200);
      expect(response.body.version_number).toBe(2);
      expect(response.body.data).toEqual(mockQuoteData);
    });

    test('should return 404 for non-existent version', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).get('/api/quotations/1/versions/999');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/quotations/:id/restore-version/:versionNumber', () => {
    test('should restore quote to specific version', async () => {
      const mockVersionData = {
        id: 1,
        items: JSON.stringify([{ product_id: 1, quantity: 5 }]),
        total_amount: 25000,
        discount: 10,
        terms: 'Net 30'
      };

      const mockVersion = {
        data: JSON.stringify(mockVersionData)
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockVersion] })
        .mockResolvedValueOnce({ rows: [mockVersionData] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/restore-version/2')
        .set('x-user-id', '1')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.restored_from_version).toBe(2);
    });

    test('should create backup version before restoring when requested', async () => {
      const mockCurrentQuote = { id: 1, total_amount: 30000 };
      const mockVersionData = { total_amount: 20000, items: '[]', discount: 0, terms: 'Net 30' };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ data: JSON.stringify(mockVersionData) }] })
        .mockResolvedValueOnce({ rows: [mockCurrentQuote] })
        .mockResolvedValueOnce({ rows: [{ max_version: 3 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCurrentQuote] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/restore-version/2')
        .set('x-user-id', '1')
        .send({ create_new_version: true });

      expect(response.status).toBe(200);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO quote_versions'),
        expect.arrayContaining([1, 4, expect.any(String), 1, expect.stringContaining('Backup')])
      );
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/quotations/1/restore-version/2')
        .send({});

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/quotations/:id/compare-versions', () => {
    test('should compare two versions', async () => {
      const v1Data = { total_amount: 15000, discount: 5, terms: 'Net 30', items: [] };
      const v2Data = { total_amount: 20000, discount: 10, terms: 'Net 30', items: [] };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ data: JSON.stringify(v1Data) }] })
        .mockResolvedValueOnce({ rows: [{ data: JSON.stringify(v2Data) }] });

      const response = await request(app)
        .get('/api/quotations/1/compare-versions?version1=1&version2=2');

      expect(response.status).toBe(200);
      expect(response.body.has_changes).toBe(true);
      expect(response.body.differences.total_amount.changed).toBe(true);
      expect(response.body.differences.discount.changed).toBe(true);
      expect(response.body.differences.terms.changed).toBe(false);
    });

    test('should require both version parameters', async () => {
      const response = await request(app)
        .get('/api/quotations/1/compare-versions?version1=1');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Both version1 and version2');
    });

    test('should return 404 if version not found', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ data: '{}' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/quotations/1/compare-versions?version1=1&version2=999');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/quotations/:id/version-history', () => {
    test('should return version action history', async () => {
      const mockHistory = [
        { id: 1, action: 'created', version_number: 3, performed_by_name: 'John' },
        { id: 2, action: 'restored', version_number: 2, performed_by_name: 'Jane' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockHistory });

      const response = await request(app).get('/api/quotations/1/version-history');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
      expect(response.body.history).toHaveLength(2);
    });
  });

  describe('POST /api/quotations/:id/auto-version', () => {
    test('should enable auto-versioning', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/auto-version')
        .set('x-user-id', '1')
        .send({ enable: true, threshold: 5 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.auto_version_enabled).toBe(true);
      expect(response.body.auto_version_threshold).toBe(5);
    });

    test('should disable auto-versioning', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/auto-version')
        .set('x-user-id', '1')
        .send({ enable: false });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('disabled');
    });
  });

  describe('DELETE /api/quotations/:id/versions/:versionNumber', () => {
    test('should delete a version', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ current_version: 3 }] })
        .mockResolvedValueOnce({ rows: [{ version_number: 2 }] });

      const response = await request(app)
        .delete('/api/quotations/1/versions/2')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should not allow deleting current version', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ current_version: 3 }] });

      const response = await request(app)
        .delete('/api/quotations/1/versions/3')
        .set('x-user-id', '1');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot delete the current version');
    });
  });

  describe('POST /api/quotations/:id/lock-version', () => {
    test('should lock a version', async () => {
      const mockLocked = {
        version_number: 2,
        is_locked: true,
        locked_by: 1
      };

      mockPool.query.mockResolvedValue({ rows: [mockLocked] });

      const response = await request(app)
        .post('/api/quotations/1/lock-version')
        .set('x-user-id', '1')
        .send({ version_number: 2, lock_reason: 'Final approved version' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.version.is_locked).toBe(true);
    });

    test('should require version number', async () => {
      const response = await request(app)
        .post('/api/quotations/1/lock-version')
        .set('x-user-id', '1')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Version number is required');
    });
  });

  describe('GET /api/quotations/:id/version-diff/:version1/:version2', () => {
    test('should return detailed diff between versions', async () => {
      const v1Data = { total_amount: 15000, discount: 5, terms: 'Net 30' };
      const v2Data = { total_amount: 20000, discount: 5, terms: 'Net 60' };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ data: JSON.stringify(v1Data), created_at: '2025-01-27' }] })
        .mockResolvedValueOnce({ rows: [{ data: JSON.stringify(v2Data), created_at: '2025-01-28' }] });

      const response = await request(app).get('/api/quotations/1/version-diff/1/2');

      expect(response.status).toBe(200);
      expect(response.body.metadata.from_version).toBe(1);
      expect(response.body.metadata.to_version).toBe(2);
      expect(response.body.changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'total_amount', change_type: 'modified' }),
          expect.objectContaining({ field: 'terms', change_type: 'modified' })
        ])
      );
    });
  });
});
