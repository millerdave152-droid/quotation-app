const request = require('supertest');
const express = require('express');

// Mock database
const mockPool = {
  query: jest.fn()
};

// Mock file system
const mockFs = {
  writeFile: jest.fn((path, data, callback) => callback(null)),
  unlink: jest.fn((path, callback) => callback(null)),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  readFile: jest.fn((path, callback) => callback(null, Buffer.from('file content')))
};

describe('Document Attachments System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

    // Middleware to extract user from request
    app.use((req, res, next) => {
      req.user = req.headers['x-user-id']
        ? { id: parseInt(req.headers['x-user-id']), role: req.headers['x-user-role'] || 'user' }
        : null;
      next();
    });

    // POST /api/quotations/:id/attachments
    app.post('/api/quotations/:id/attachments', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const quotationId = parseInt(req.params.id);
        const { filename, file_size, mime_type, description } = req.body;

        if (!filename || !file_size || !mime_type) {
          return res.status(400).json({
            error: 'Filename, file size, and MIME type are required'
          });
        }

        // Validate file size (max 50MB)
        if (file_size > 50 * 1024 * 1024) {
          return res.status(400).json({
            error: 'File size exceeds maximum limit of 50MB'
          });
        }

        // Validate file type
        const allowedTypes = [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/gif',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain',
          'application/zip'
        ];

        if (!allowedTypes.includes(mime_type)) {
          return res.status(400).json({
            error: 'File type not allowed'
          });
        }

        // Check if quotation exists
        const quotationResult = await mockPool.query(
          'SELECT id FROM quotations WHERE id = $1',
          [quotationId]
        );

        if (quotationResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quotation not found' });
        }

        // Generate storage path
        const storagePath = `/uploads/quotations/${quotationId}/${Date.now()}_${filename}`;

        // Simulate file storage
        mockFs.writeFile(storagePath, req.body.file_data || '', (err) => {
          if (err) throw err;
        });

        // Insert attachment record
        const attachmentResult = await mockPool.query(
          `INSERT INTO attachments
           (quotation_id, filename, original_filename, file_size, mime_type, storage_path,
            description, uploaded_by, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            quotationId,
            filename,
            filename,
            file_size,
            mime_type,
            storagePath,
            description || null,
            req.user.id,
            1
          ]
        );

        res.status(201).json({
          success: true,
          attachment: attachmentResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/:id/attachments
    app.get('/api/quotations/:id/attachments', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const quotationId = parseInt(req.params.id);

        const result = await mockPool.query(
          `SELECT a.*, u.name as uploaded_by_name
           FROM attachments a
           LEFT JOIN users u ON a.uploaded_by = u.id
           WHERE a.quotation_id = $1 AND a.is_deleted = false
           ORDER BY a.created_at DESC`,
          [quotationId]
        );

        res.json({
          attachments: result.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/attachments/:id/download
    app.get('/api/attachments/:id/download', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const attachmentId = parseInt(req.params.id);

        const result = await mockPool.query(
          'SELECT * FROM attachments WHERE id = $1 AND is_deleted = false',
          [attachmentId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Attachment not found' });
        }

        const attachment = result.rows[0];

        // Check if file exists
        if (!mockFs.existsSync(attachment.storage_path)) {
          return res.status(404).json({ error: 'File not found on server' });
        }

        // Increment download count
        await mockPool.query(
          'UPDATE attachments SET download_count = download_count + 1 WHERE id = $1',
          [attachmentId]
        );

        // Simulate file download - in production this would stream the file
        res.json({
          success: true,
          filename: attachment.filename,
          file_size: attachment.file_size,
          mime_type: attachment.mime_type,
          storage_path: attachment.storage_path
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/attachments/:id
    app.delete('/api/attachments/:id', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const attachmentId = parseInt(req.params.id);

        const result = await mockPool.query(
          'SELECT * FROM attachments WHERE id = $1 AND is_deleted = false',
          [attachmentId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Attachment not found' });
        }

        const attachment = result.rows[0];

        // Soft delete
        await mockPool.query(
          'UPDATE attachments SET is_deleted = true, deleted_at = NOW(), deleted_by = $1 WHERE id = $2',
          [req.user.id, attachmentId]
        );

        // Optionally delete file from storage
        mockFs.unlink(attachment.storage_path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });

        res.json({
          success: true,
          message: 'Attachment deleted successfully'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // PUT /api/attachments/:id
    app.put('/api/attachments/:id', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const attachmentId = parseInt(req.params.id);
        const { filename, description } = req.body;

        const result = await mockPool.query(
          'SELECT * FROM attachments WHERE id = $1 AND is_deleted = false',
          [attachmentId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Attachment not found' });
        }

        const updateResult = await mockPool.query(
          `UPDATE attachments
           SET filename = COALESCE($1, filename),
               description = COALESCE($2, description),
               updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [filename, description, attachmentId]
        );

        res.json({
          success: true,
          attachment: updateResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/attachments/:id/versions
    app.post('/api/attachments/:id/versions', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const attachmentId = parseInt(req.params.id);
        const { file_size, mime_type } = req.body;

        if (!file_size || !mime_type) {
          return res.status(400).json({
            error: 'File size and MIME type are required'
          });
        }

        const result = await mockPool.query(
          'SELECT * FROM attachments WHERE id = $1 AND is_deleted = false',
          [attachmentId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Attachment not found' });
        }

        const originalAttachment = result.rows[0];
        const newVersion = originalAttachment.version + 1;

        // Archive old version
        await mockPool.query(
          `INSERT INTO attachment_versions
           (attachment_id, version, filename, file_size, mime_type, storage_path, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            attachmentId,
            originalAttachment.version,
            originalAttachment.filename,
            originalAttachment.file_size,
            originalAttachment.mime_type,
            originalAttachment.storage_path,
            req.user.id
          ]
        );

        // Generate new storage path
        const storagePath = `/uploads/quotations/${originalAttachment.quotation_id}/${Date.now()}_${originalAttachment.filename}`;

        // Simulate file storage
        mockFs.writeFile(storagePath, req.body.file_data || '', (err) => {
          if (err) throw err;
        });

        // Update attachment with new version
        const updateResult = await mockPool.query(
          `UPDATE attachments
           SET version = $1, file_size = $2, mime_type = $3,
               storage_path = $4, updated_at = NOW()
           WHERE id = $5
           RETURNING *`,
          [newVersion, file_size, mime_type, storagePath, attachmentId]
        );

        res.status(201).json({
          success: true,
          attachment: updateResult.rows[0],
          message: `New version ${newVersion} created`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/attachments/:id/versions
    app.get('/api/attachments/:id/versions', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const attachmentId = parseInt(req.params.id);

        const result = await mockPool.query(
          `SELECT av.*, u.name as created_by_name
           FROM attachment_versions av
           LEFT JOIN users u ON av.created_by = u.id
           WHERE av.attachment_id = $1
           ORDER BY av.version DESC`,
          [attachmentId]
        );

        res.json({
          versions: result.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/attachments/statistics
    app.get('/api/attachments/statistics', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT
             COUNT(*) as total_attachments,
             SUM(file_size) as total_size,
             AVG(file_size) as avg_size,
             SUM(download_count) as total_downloads,
             COUNT(DISTINCT quotation_id) as quotes_with_attachments
           FROM attachments
           WHERE is_deleted = false
             AND created_at BETWEEN $1 AND $2`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        const typeResult = await mockPool.query(
          `SELECT mime_type, COUNT(*) as count
           FROM attachments
           WHERE is_deleted = false
             AND created_at BETWEEN $1 AND $2
           GROUP BY mime_type
           ORDER BY count DESC`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        res.json({
          total_attachments: parseInt(result.rows[0].total_attachments || 0),
          total_size: parseInt(result.rows[0].total_size || 0),
          avg_size: parseFloat(result.rows[0].avg_size || 0),
          total_downloads: parseInt(result.rows[0].total_downloads || 0),
          quotes_with_attachments: parseInt(result.rows[0].quotes_with_attachments || 0),
          by_type: typeResult.rows.map(row => ({
            mime_type: row.mime_type,
            count: parseInt(row.count)
          }))
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/quotations/:id/attachments', () => {
    test('should upload attachment to quotation', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Check quotation exists
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            quotation_id: 1,
            filename: 'contract.pdf',
            file_size: 102400,
            mime_type: 'application/pdf',
            storage_path: '/uploads/quotations/1/contract.pdf'
          }]
        });

      const response = await request(app)
        .post('/api/quotations/1/attachments')
        .set('x-user-id', '1')
        .send({
          filename: 'contract.pdf',
          file_size: 102400,
          mime_type: 'application/pdf',
          description: 'Service contract',
          file_data: 'base64encodeddata'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.attachment.filename).toBe('contract.pdf');
    });

    test('should reject file exceeding size limit', async () => {
      const response = await request(app)
        .post('/api/quotations/1/attachments')
        .set('x-user-id', '1')
        .send({
          filename: 'large-file.pdf',
          file_size: 60 * 1024 * 1024, // 60MB
          mime_type: 'application/pdf'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('exceeds maximum limit');
    });

    test('should reject invalid file type', async () => {
      const response = await request(app)
        .post('/api/quotations/1/attachments')
        .set('x-user-id', '1')
        .send({
          filename: 'script.exe',
          file_size: 1024,
          mime_type: 'application/x-msdownload'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('File type not allowed');
    });

    test('should reject if quotation not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/999/attachments')
        .set('x-user-id', '1')
        .send({
          filename: 'contract.pdf',
          file_size: 102400,
          mime_type: 'application/pdf'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Quotation not found');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/quotations/1/attachments')
        .send({
          filename: 'contract.pdf',
          file_size: 102400,
          mime_type: 'application/pdf'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/quotations/:id/attachments', () => {
    test('should list all attachments for quotation', async () => {
      const mockAttachments = [
        {
          id: 1,
          quotation_id: 1,
          filename: 'contract.pdf',
          file_size: 102400,
          mime_type: 'application/pdf',
          uploaded_by_name: 'John Doe'
        },
        {
          id: 2,
          quotation_id: 1,
          filename: 'specs.docx',
          file_size: 51200,
          mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          uploaded_by_name: 'Jane Smith'
        }
      ];

      mockPool.query.mockResolvedValue({ rows: mockAttachments });

      const response = await request(app)
        .get('/api/quotations/1/attachments')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.attachments).toHaveLength(2);
      expect(response.body.attachments[0].filename).toBe('contract.pdf');
    });

    test('should return empty array if no attachments', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/quotations/1/attachments')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.attachments).toHaveLength(0);
    });
  });

  describe('GET /api/attachments/:id/download', () => {
    test('should download attachment', async () => {
      const mockAttachment = {
        id: 1,
        filename: 'contract.pdf',
        file_size: 102400,
        mime_type: 'application/pdf',
        storage_path: '/uploads/contract.pdf'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockAttachment] })
        .mockResolvedValueOnce({ rows: [] }); // Update download count

      const response = await request(app)
        .get('/api/attachments/1/download')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.filename).toBe('contract.pdf');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('download_count'),
        [1]
      );
    });

    test('should return 404 if attachment not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/attachments/999/download')
        .set('x-user-id', '1');

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/attachments/:id', () => {
    test('should delete attachment', async () => {
      const mockAttachment = {
        id: 1,
        filename: 'contract.pdf',
        storage_path: '/uploads/contract.pdf'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockAttachment] })
        .mockResolvedValueOnce({ rows: [] }); // Soft delete

      const response = await request(app)
        .delete('/api/attachments/1')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockFs.unlink).toHaveBeenCalled();
    });

    test('should return 404 if attachment not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/api/attachments/999')
        .set('x-user-id', '1');

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/attachments/:id', () => {
    test('should update attachment metadata', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, filename: 'old-name.pdf' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            filename: 'new-name.pdf',
            description: 'Updated description'
          }]
        });

      const response = await request(app)
        .put('/api/attachments/1')
        .set('x-user-id', '1')
        .send({
          filename: 'new-name.pdf',
          description: 'Updated description'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.attachment.filename).toBe('new-name.pdf');
    });
  });

  describe('POST /api/attachments/:id/versions', () => {
    test('should create new version of attachment', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            quotation_id: 1,
            filename: 'contract.pdf',
            version: 1,
            file_size: 102400,
            mime_type: 'application/pdf',
            storage_path: '/uploads/contract_v1.pdf'
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // Archive version
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            filename: 'contract.pdf',
            version: 2,
            file_size: 204800,
            mime_type: 'application/pdf'
          }]
        });

      const response = await request(app)
        .post('/api/attachments/1/versions')
        .set('x-user-id', '1')
        .send({
          file_size: 204800,
          mime_type: 'application/pdf',
          file_data: 'base64encodeddata'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.attachment.version).toBe(2);
      expect(response.body.message).toContain('version 2');
    });
  });

  describe('GET /api/attachments/:id/versions', () => {
    test('should return version history', async () => {
      const mockVersions = [
        { version: 2, filename: 'contract.pdf', created_by_name: 'Jane Smith' },
        { version: 1, filename: 'contract.pdf', created_by_name: 'John Doe' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockVersions });

      const response = await request(app)
        .get('/api/attachments/1/versions')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.versions).toHaveLength(2);
      expect(response.body.versions[0].version).toBe(2);
    });
  });

  describe('GET /api/attachments/statistics', () => {
    test('should return attachment statistics', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            total_attachments: '50',
            total_size: '5242880',
            avg_size: '104857.6',
            total_downloads: '200',
            quotes_with_attachments: '30'
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            { mime_type: 'application/pdf', count: '30' },
            { mime_type: 'image/jpeg', count: '20' }
          ]
        });

      const response = await request(app)
        .get('/api/attachments/statistics')
        .set('x-user-id', '1')
        .query({ start_date: '2024-01-01', end_date: '2024-12-31' });

      expect(response.status).toBe(200);
      expect(response.body.total_attachments).toBe(50);
      expect(response.body.by_type).toHaveLength(2);
      expect(response.body.by_type[0].mime_type).toBe('application/pdf');
    });
  });
});
