const request = require('supertest');
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

// Mock database pool with connect method for transactions
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

const mockPool = {
  query: jest.fn(),
  connect: jest.fn(() => Promise.resolve(mockClient))
};

describe('CSV Import Endpoint', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Setup multer for file uploads
    const storage = multer.memoryStorage();
    const upload = multer({ storage });

    // Mock POST /api/products/import-csv endpoint
    app.post('/api/products/import-csv', upload.single('csvfile'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: 'No file uploaded'
          });
        }

        const filename = req.file.originalname;
        const startTime = Date.now();

        const results = [];
        const errors = [];
        let totalRows = 0;
        let successful = 0;
        let failed = 0;
        let inserted = 0;
        let updated = 0;

        // Parse CSV from buffer
        const stream = Readable.from(req.file.buffer.toString());

        await new Promise((resolve, reject) => {
          stream
            .pipe(csv())
            .on('data', (row) => {
              totalRows++;

              // Validate required fields
              if (!row.MODEL && !row.model) {
                errors.push({ row: totalRows, error: 'Missing MODEL field', data: row });
                failed++;
                return;
              }

              // Normalize column names
              const normalizedRow = {
                manufacturer: row.MANUFACTURER || row.manufacturer || '',
                model: row.MODEL || row.model || '',
                name: row.Description || row.DESCRIPTION || row.description || '',
                description: row.Description || row.DESCRIPTION || row.description || '',
                category: row.CATEGORY || row.category || '',
                actual_cost: row.ACTUAL_COST || row.actual_cost || row.COST || row.cost || row['Dealer Cost'] || 0,
                msrp: row.MSRP || row.msrp || 0
              };

              results.push(normalizedRow);
              successful++;
            })
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
        });

        // Import to database with transactions
        const client = await mockPool.connect();

        try {
          await client.query('BEGIN');

          for (let i = 0; i < results.length; i++) {
            const row = results[i];

            try {
              const costCents = Math.round(parseFloat(row.actual_cost) * 100) || 0;
              const msrpCents = Math.round(parseFloat(row.msrp) * 100) || 0;

              const result = await client.query(`
                INSERT INTO products (
                  manufacturer, model, name, description, category,
                  cost_cents, msrp_cents,
                  import_source, import_date, import_file_name,
                  created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (model)
                DO UPDATE SET
                  manufacturer = EXCLUDED.manufacturer,
                  name = EXCLUDED.name,
                  description = EXCLUDED.description,
                  category = EXCLUDED.category,
                  cost_cents = EXCLUDED.cost_cents,
                  msrp_cents = EXCLUDED.msrp_cents,
                  import_date = EXCLUDED.import_date,
                  import_file_name = EXCLUDED.import_file_name,
                  updated_at = CURRENT_TIMESTAMP
                RETURNING (xmax = 0) AS inserted
              `, [
                row.manufacturer,
                row.model,
                row.name,
                row.description,
                row.category,
                costCents,
                msrpCents,
                'automatic',
                filename
              ]);

              if (result.rows[0].inserted) {
                inserted++;
              } else {
                updated++;
              }
            } catch (err) {
              errors.push({ row: i + 1, error: err.message, data: row });
            }
          }

          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }

        // Log to import history
        try {
          await mockPool.query(`
            INSERT INTO import_history (
              filename, total_rows, successful, failed,
              new_products, updated_products, import_date
            ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
          `, [filename, totalRows, successful, failed, inserted, updated]);
        } catch (err) {
          // Continue even if history logging fails
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        res.json({
          success: true,
          message: 'Import completed successfully',
          summary: {
            filename,
            total: totalRows,
            successful,
            failed,
            inserted,
            updated,
            validationErrors: errors.slice(0, 10),
            importErrors: errors.length > 10 ? `${errors.length - 10} more errors...` : []
          },
          duration: `${duration}s`
        });
      } catch (error) {
        console.error('CSV Import error:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Import failed'
        });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/products/import-csv', () => {
    test('should successfully import valid CSV file', async () => {
      const csvContent = `MANUFACTURER,MODEL,Description,CATEGORY,COST,MSRP
Samsung,RF28R7351SG,French Door Refrigerator 28 cu ft,Refrigerators,1299.99,2499.99
LG,WM9000HVA,Front Load Washer 5.2 cu ft,Washers,899.99,1599.99`;

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ inserted: true }] }) // First insert
        .mockResolvedValueOnce({ rows: [{ inserted: true }] }) // Second insert
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // import_history insert

      const response = await request(app)
        .post('/api/products/import-csv')
        .attach('csvfile', Buffer.from(csvContent), 'test-products.csv');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Import completed successfully');
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.successful).toBe(2);
      expect(response.body.summary.failed).toBe(0);
      expect(response.body.summary.inserted).toBe(2);
      expect(response.body.summary.updated).toBe(0);
    });

    test('should handle CSV with mixed case column names', async () => {
      const csvContent = `manufacturer,model,description,category,cost,msrp
Whirlpool,WRS325SDHZ,Side-by-Side Refrigerator,Refrigerators,749.99,1299.99`;

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ inserted: true }] }) // Insert
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // import_history

      const response = await request(app)
        .post('/api/products/import-csv')
        .attach('csvfile', Buffer.from(csvContent), 'lowercase-test.csv');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.summary.successful).toBe(1);
    });

    test('should handle CSV with updated products (ON CONFLICT)', async () => {
      const csvContent = `MANUFACTURER,MODEL,Description,CATEGORY,COST,MSRP
Samsung,RF28R7351SG,French Door Refrigerator 28 cu ft Updated,Refrigerators,1399.99,2599.99`;

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ inserted: false }] }) // Update (xmax != 0)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/products/import-csv')
        .attach('csvfile', Buffer.from(csvContent), 'update-test.csv');

      expect(response.status).toBe(200);
      expect(response.body.summary.inserted).toBe(0);
      expect(response.body.summary.updated).toBe(1);
    });

    test('should reject CSV with missing MODEL field', async () => {
      const csvContent = `MANUFACTURER,Description,CATEGORY,COST,MSRP
Samsung,French Door Refrigerator,Refrigerators,1299.99,2499.99`;

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/products/import-csv')
        .attach('csvfile', Buffer.from(csvContent), 'invalid-test.csv');

      expect(response.status).toBe(200);
      expect(response.body.summary.failed).toBe(1);
      expect(response.body.summary.successful).toBe(0);
      expect(response.body.summary.validationErrors[0].error).toBe('Missing MODEL field');
    });

    test('should return 400 when no file is uploaded', async () => {
      const response = await request(app)
        .post('/api/products/import-csv');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No file uploaded');
    });

    test('should handle CSV with price conversions to cents', async () => {
      const csvContent = `MANUFACTURER,MODEL,Description,CATEGORY,COST,MSRP
TestBrand,TEST001,Test Product,Test,99.99,199.99`;

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ inserted: true }] }) // Insert
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/products/import-csv')
        .attach('csvfile', Buffer.from(csvContent), 'price-test.csv');

      expect(response.status).toBe(200);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'TestBrand',
          'TEST001',
          'Test Product',
          'Test Product',
          'Test',
          9999, // 99.99 * 100
          19999, // 199.99 * 100
          'automatic',
          'price-test.csv'
        ])
      );
    });

    test('should handle individual row errors gracefully', async () => {
      const csvContent = `MANUFACTURER,MODEL,Description,CATEGORY,COST,MSRP
Samsung,RF28R7351SG,Test Product,Refrigerators,1299.99,2499.99
LG,WM9000HVA,Another Product,Washers,899.99,1599.99`;

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database constraint violation')) // First insert fails
        .mockResolvedValueOnce({ rows: [{ inserted: true }] }) // Second insert succeeds
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // import_history

      const response = await request(app)
        .post('/api/products/import-csv')
        .attach('csvfile', Buffer.from(csvContent), 'error-test.csv');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.summary.successful).toBe(2);
      expect(response.body.summary.inserted).toBe(1);
    });

    test('should handle large CSV files efficiently', async () => {
      // Generate CSV with 100 rows
      let csvContent = 'MANUFACTURER,MODEL,Description,CATEGORY,COST,MSRP\n';
      for (let i = 1; i <= 100; i++) {
        csvContent += `Brand${i},MODEL${i},Product ${i},Category,${i * 10}.99,${i * 20}.99\n`;
      }

      mockClient.query.mockResolvedValue({ rows: [{ inserted: true }] });
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/products/import-csv')
        .attach('csvfile', Buffer.from(csvContent), 'large-test.csv');

      expect(response.status).toBe(200);
      expect(response.body.summary.total).toBe(100);
      expect(response.body.summary.successful).toBe(100);
    });

    test('should handle CSV with empty optional fields', async () => {
      const csvContent = `MANUFACTURER,MODEL,Description,CATEGORY,COST,MSRP
,TEST002,Test Product,,0,0`;

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ inserted: true }] })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/products/import-csv')
        .attach('csvfile', Buffer.from(csvContent), 'empty-fields.csv');

      expect(response.status).toBe(200);
      expect(response.body.summary.successful).toBe(1);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          '', // Empty manufacturer
          'TEST002',
          'Test Product',
          'Test Product',
          '', // Empty category
          0,
          0,
          'automatic',
          'empty-fields.csv'
        ])
      );
    });

    test('should track import duration', async () => {
      const csvContent = `MANUFACTURER,MODEL,Description,CATEGORY,COST,MSRP
Samsung,RF28R7351SG,Test Product,Refrigerators,1299.99,2499.99`;

      mockClient.query.mockResolvedValue({ rows: [{ inserted: true }] });
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/products/import-csv')
        .attach('csvfile', Buffer.from(csvContent), 'duration-test.csv');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('duration');
      expect(response.body.duration).toMatch(/^\d+\.\d{2}s$/);
    });

    test('should limit validation errors in response to 10', async () => {
      // CSV with 15 invalid rows (missing MODEL)
      let csvContent = 'MANUFACTURER,Description,CATEGORY,COST,MSRP\n';
      for (let i = 1; i <= 15; i++) {
        csvContent += `Brand${i},Product ${i},Category,10.99,20.99\n`;
      }

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/products/import-csv')
        .attach('csvfile', Buffer.from(csvContent), 'many-errors.csv');

      expect(response.status).toBe(200);
      expect(response.body.summary.failed).toBe(15);
      expect(response.body.summary.validationErrors).toHaveLength(10);
      expect(response.body.summary.importErrors).toBe('5 more errors...');
    });
  });
});
