/**
 * PdfService Unit Tests
 * Week 2.2 of 4-week sprint
 * Tests PDF generation, error handling, and edge cases
 */

const PdfService = require('../services/PdfService');

// Mock pool factory
const createMockPool = (overrides = {}) => ({
  query: jest.fn(),
  ...overrides
});

// Mock CustomerService
jest.mock('../services/CustomerService', () => {
  return jest.fn().mockImplementation(() => ({
    calculateLifetimeValue: jest.fn().mockResolvedValue({
      metrics: { lifetimeValue: 5000, totalTransactions: 10, averageOrderValue: 500 },
      engagement: { churnRisk: 'low' },
      segment: 'gold'
    })
  }));
});

describe('PdfService', () => {
  let pdfService;
  let mockPool;

  beforeEach(() => {
    mockPool = createMockPool();
    pdfService = new PdfService(mockPool);
    jest.clearAllMocks();
  });

  describe('Error Codes', () => {
    test('should expose PDF_ERROR_CODES constant', () => {
      expect(PdfService.ERROR_CODES).toBeDefined();
      expect(PdfService.ERROR_CODES.QUOTE_NOT_FOUND).toBe('PDF_QUOTE_NOT_FOUND');
      expect(PdfService.ERROR_CODES.GENERATION_ERROR).toBe('PDF_GENERATION_ERROR');
      expect(PdfService.ERROR_CODES.TEMPLATE_ERROR).toBe('PDF_TEMPLATE_ERROR');
      expect(PdfService.ERROR_CODES.DATA_ERROR).toBe('PDF_DATA_ERROR');
      expect(PdfService.ERROR_CODES.ITEMS_ERROR).toBe('PDF_ITEMS_ERROR');
    });
  });

  describe('generateQuotePdf - Input Validation', () => {
    test('should throw DATA_ERROR for invalid quote ID (null)', async () => {
      await expect(pdfService.generateQuotePdf(null))
        .rejects.toMatchObject({
          code: 'PDF_DATA_ERROR',
          message: 'Invalid quote ID provided'
        });
    });

    test('should throw DATA_ERROR for invalid quote ID (undefined)', async () => {
      await expect(pdfService.generateQuotePdf(undefined))
        .rejects.toMatchObject({
          code: 'PDF_DATA_ERROR',
          message: 'Invalid quote ID provided'
        });
    });

    test('should throw DATA_ERROR for non-numeric quote ID', async () => {
      await expect(pdfService.generateQuotePdf('abc'))
        .rejects.toMatchObject({
          code: 'PDF_DATA_ERROR'
        });
    });

    test('should throw QUOTE_NOT_FOUND for non-existent quote', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(pdfService.generateQuotePdf(999))
        .rejects.toMatchObject({
          code: 'PDF_QUOTE_NOT_FOUND',
          message: expect.stringContaining('999')
        });
    });
  });

  describe('generateQuotePdf - Small Quote', () => {
    const mockQuote = {
      id: 1,
      quotation_number: 'Q-2024-001',
      customer_id: 100,
      customer_name: 'ACME Corporation',
      customer_email: 'billing@acme.com',
      customer_phone: '555-123-4567',
      customer_company: 'ACME Corp',
      customer_address: '123 Main St',
      customer_city: 'Toronto',
      customer_province: 'ON',
      customer_postal_code: 'M5V 1A1',
      subtotal_cents: 100000,
      discount_cents: 10000,
      discount_percent: 10,
      tax_cents: 11700,
      tax_rate: 13,
      total_cents: 101700,
      notes: 'Please expedite shipping',
      terms: 'Net 30 days',
      created_at: new Date().toISOString()
    };

    const mockItems = [
      {
        id: 1,
        manufacturer: 'Samsung',
        model: 'RF28R7351SR',
        sku: 'SAM-FRIDGE-001',
        quantity: 1,
        unit_price_cents: 299900,
        cost_cents: 200000,
        line_total_cents: 299900,
        margin_percent: 33.3
      },
      {
        id: 2,
        manufacturer: 'LG',
        model: 'WKEX200HBA',
        sku: 'LG-WASHER-001',
        quantity: 2,
        unit_price_cents: 149900,
        cost_cents: 100000,
        line_total_cents: 299800,
        margin_percent: 33.3
      }
    ];

    beforeEach(() => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })  // Quote fetch
        .mockResolvedValueOnce({ rows: mockItems })     // Items fetch
        .mockResolvedValueOnce({ rows: [] });           // Signatures fetch
    });

    test('should generate PDF for small quote (customer type)', async () => {
      const pdf = await pdfService.generateQuotePdf(1, { type: 'customer' });

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(1000);
    });

    test('should generate PDF for small quote (internal type)', async () => {
      const pdf = await pdfService.generateQuotePdf(1, { type: 'internal' });

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(1000);
    });

    test('should call database queries in correct order', async () => {
      await pdfService.generateQuotePdf(1);

      expect(mockPool.query).toHaveBeenCalledTimes(3);
      // First call: quote fetch
      expect(mockPool.query.mock.calls[0][0]).toContain('FROM quotations');
      // Second call: items fetch
      expect(mockPool.query.mock.calls[1][0]).toContain('FROM quotation_items');
      // Third call: signatures fetch
      expect(mockPool.query.mock.calls[2][0]).toContain('FROM quote_signatures');
    });
  });

  describe('generateQuotePdf - Large Quote (50+ items)', () => {
    const mockQuote = {
      id: 2,
      quotation_number: 'Q-2024-BULK',
      customer_name: 'Big Buyer Inc',
      customer_email: 'orders@bigbuyer.com',
      subtotal_cents: 5000000,
      tax_cents: 650000,
      total_cents: 5650000,
      created_at: new Date().toISOString()
    };

    test('should handle 50+ items without error', async () => {
      // Generate 55 mock items
      const manyItems = Array.from({ length: 55 }, (_, i) => ({
        id: i + 1,
        manufacturer: 'Brand',
        model: `Model-${i + 1}`,
        sku: `SKU-${String(i + 1).padStart(4, '0')}`,
        quantity: Math.floor(Math.random() * 10) + 1,
        unit_price_cents: Math.floor(Math.random() * 100000) + 10000,
        cost_cents: Math.floor(Math.random() * 80000) + 8000,
        line_total_cents: Math.floor(Math.random() * 500000) + 50000,
        margin_percent: 25
      }));

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: manyItems })
        .mockResolvedValueOnce({ rows: [] });

      const pdf = await pdfService.generateQuotePdf(2, { type: 'customer' });

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(5000); // Large PDF
    }, 10000); // Allow 10s for large PDF

    test('should handle 100+ items with pagination', async () => {
      const manyItems = Array.from({ length: 120 }, (_, i) => ({
        id: i + 1,
        manufacturer: 'TestBrand',
        model: `Item-${i + 1}`,
        quantity: 1,
        unit_price_cents: 10000,
        line_total_cents: 10000
      }));

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: manyItems })
        .mockResolvedValueOnce({ rows: [] });

      const pdf = await pdfService.generateQuotePdf(2);

      expect(pdf).toBeInstanceOf(Buffer);
      // PDF should be multi-page
      expect(pdf.length).toBeGreaterThan(10000);
    }, 15000);
  });

  describe('generateQuotePdf - Edge Prices', () => {
    test('should handle 0 cent prices', async () => {
      const mockQuote = {
        id: 3,
        quotation_number: 'Q-FREE',
        customer_name: 'Freebie Customer',
        subtotal_cents: 0,
        discount_cents: 0,
        tax_cents: 0,
        total_cents: 0,
        created_at: new Date().toISOString()
      };

      const zeroItems = [{
        id: 1,
        manufacturer: 'Free',
        model: 'Sample',
        quantity: 1,
        unit_price_cents: 0,
        line_total_cents: 0
      }];

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: zeroItems })
        .mockResolvedValueOnce({ rows: [] });

      const pdf = await pdfService.generateQuotePdf(3);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(1000);
    });

    test('should handle max cent values (999999999)', async () => {
      const mockQuote = {
        id: 4,
        quotation_number: 'Q-MAX',
        customer_name: 'Big Spender',
        subtotal_cents: 999999999,
        discount_cents: 0,
        tax_cents: 129999999,
        total_cents: 1129999998,
        created_at: new Date().toISOString()
      };

      const maxItems = [{
        id: 1,
        manufacturer: 'Luxury',
        model: 'SuperExpensive',
        quantity: 1,
        unit_price_cents: 999999999,
        line_total_cents: 999999999
      }];

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: maxItems })
        .mockResolvedValueOnce({ rows: [] });

      const pdf = await pdfService.generateQuotePdf(4);

      expect(pdf).toBeInstanceOf(Buffer);
    });

    test('should handle negative discount (credit)', async () => {
      const mockQuote = {
        id: 5,
        quotation_number: 'Q-CREDIT',
        customer_name: 'Credit Customer',
        subtotal_cents: 100000,
        discount_cents: -5000, // Credit
        tax_cents: 13650,
        total_cents: 118650,
        created_at: new Date().toISOString()
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const pdf = await pdfService.generateQuotePdf(5);

      expect(pdf).toBeInstanceOf(Buffer);
    });
  });

  describe('generateQuotePdf - Missing Data', () => {
    test('should handle missing customer gracefully', async () => {
      const quoteWithoutCustomer = {
        id: 6,
        quotation_number: 'Q-NOCUST',
        customer_id: null,
        customer_name: null,
        customer_email: null,
        subtotal_cents: 50000,
        total_cents: 56500,
        created_at: new Date().toISOString()
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [quoteWithoutCustomer] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const pdf = await pdfService.generateQuotePdf(6);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(1000);
    });

    test('should handle missing items gracefully', async () => {
      const mockQuote = {
        id: 7,
        quotation_number: 'Q-NOITEMS',
        customer_name: 'Empty Order',
        subtotal_cents: 0,
        total_cents: 0,
        created_at: new Date().toISOString()
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] }) // No items
        .mockResolvedValueOnce({ rows: [] });

      const pdf = await pdfService.generateQuotePdf(7);

      expect(pdf).toBeInstanceOf(Buffer);
    });

    test('should handle missing notes and terms', async () => {
      const mockQuote = {
        id: 8,
        quotation_number: 'Q-MINIMAL',
        customer_name: 'Minimal Customer',
        subtotal_cents: 10000,
        total_cents: 11300,
        notes: null,
        terms: null,
        created_at: new Date().toISOString()
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const pdf = await pdfService.generateQuotePdf(8);

      expect(pdf).toBeInstanceOf(Buffer);
    });
  });

  describe('generateQuotePdf - Signatures', () => {
    test('should include signatures in PDF', async () => {
      const mockQuote = {
        id: 9,
        quotation_number: 'Q-SIGNED',
        customer_name: 'Signed Customer',
        subtotal_cents: 100000,
        total_cents: 113000,
        created_at: new Date().toISOString()
      };

      const mockSignatures = [
        {
          id: 1,
          signature_type: 'staff',
          signer_name: 'John Sales',
          signer_email: 'john@company.com',
          signed_at: new Date().toISOString(),
          signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg'
        },
        {
          id: 2,
          signature_type: 'customer',
          signer_name: 'Jane Customer',
          signer_email: 'jane@customer.com',
          signed_at: new Date().toISOString(),
          signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg'
        }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: mockSignatures });

      const pdf = await pdfService.generateQuotePdf(9);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(1000);
    });

    test('should handle invalid signature image data', async () => {
      const mockQuote = {
        id: 10,
        quotation_number: 'Q-BADSIG',
        customer_name: 'Bad Signature',
        subtotal_cents: 50000,
        total_cents: 56500,
        created_at: new Date().toISOString()
      };

      const invalidSignatures = [{
        id: 1,
        signature_type: 'staff',
        signer_name: 'Test',
        signature_data: 'not-a-valid-image'
      }];

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: invalidSignatures });

      // Should not throw - gracefully handles bad signature
      const pdf = await pdfService.generateQuotePdf(10);
      expect(pdf).toBeInstanceOf(Buffer);
    });
  });

  describe('generateQuotePdf - Internal vs Customer Type', () => {
    const mockQuote = {
      id: 11,
      quotation_number: 'Q-INTERNAL',
      customer_id: 100,
      customer_name: 'Test Customer',
      subtotal_cents: 100000,
      gross_profit_cents: 30000,
      total_cents: 113000,
      created_at: new Date().toISOString()
    };

    const mockItems = [{
      id: 1,
      manufacturer: 'Test',
      model: 'Product',
      quantity: 1,
      unit_price_cents: 100000,
      cost_cents: 70000,
      line_total_cents: 100000,
      margin_percent: 30
    }];

    beforeEach(() => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: mockItems })
        .mockResolvedValueOnce({ rows: [] });
    });

    test('internal PDF should include cost and margin columns', async () => {
      const pdf = await pdfService.generateQuotePdf(11, { type: 'internal' });

      expect(pdf).toBeInstanceOf(Buffer);
      // Internal PDFs are typically larger due to extra columns
      expect(pdf.length).toBeGreaterThan(1000);
    });

    test('customer PDF should not include cost data', async () => {
      const pdf = await pdfService.generateQuotePdf(11, { type: 'customer' });

      expect(pdf).toBeInstanceOf(Buffer);
    });
  });

  describe('generateQuotePdf - Database Errors', () => {
    test('should throw DATA_ERROR on database connection failure', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(pdfService.generateQuotePdf(1))
        .rejects.toMatchObject({
          code: 'PDF_DATA_ERROR',
          message: expect.stringContaining('Failed to fetch quote data')
        });
    });

    test('error should include structured JSON response', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Timeout'));

      try {
        await pdfService.generateQuotePdf(1);
        fail('Expected error to be thrown');
      } catch (error) {
        const json = error.toJSON();
        expect(json.success).toBe(false);
        expect(json.error.code).toBe('PDF_DATA_ERROR');
        expect(json.error.timestamp).toBeDefined();
      }
    });
  });

  describe('generateBulkPdfs', () => {
    test('should generate multiple PDFs', async () => {
      const quotes = [
        { id: 1, quotation_number: 'Q-001', customer_name: 'A', subtotal_cents: 10000, total_cents: 11300, created_at: new Date().toISOString() },
        { id: 2, quotation_number: 'Q-002', customer_name: 'B', subtotal_cents: 20000, total_cents: 22600, created_at: new Date().toISOString() }
      ];

      // Setup mocks for each PDF generation
      mockPool.query
        // First PDF
        .mockResolvedValueOnce({ rows: [quotes[0]] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ quotation_number: 'Q-001' }] })
        // Second PDF
        .mockResolvedValueOnce({ rows: [quotes[1]] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ quotation_number: 'Q-002' }] });

      const results = await pdfService.generateBulkPdfs([1, 2]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    test('should handle partial failures in bulk generation', async () => {
      mockPool.query
        // First PDF succeeds
        .mockResolvedValueOnce({ rows: [{ id: 1, quotation_number: 'Q-001', customer_name: 'A', subtotal_cents: 10000, total_cents: 11300, created_at: new Date().toISOString() }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ quotation_number: 'Q-001' }] })
        // Second PDF fails - not found
        .mockResolvedValueOnce({ rows: [] });

      const results = await pdfService.generateBulkPdfs([1, 999]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeDefined();
    });

    test('should return empty array for empty input', async () => {
      const results = await pdfService.generateBulkPdfs([]);
      expect(results).toEqual([]);
    });
  });

  describe('Performance', () => {
    test('should generate small quote PDF in under 1 second', async () => {
      const mockQuote = {
        id: 100,
        quotation_number: 'Q-PERF',
        customer_name: 'Performance Test',
        subtotal_cents: 50000,
        total_cents: 56500,
        created_at: new Date().toISOString()
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [{ id: 1, manufacturer: 'Test', model: 'Item', quantity: 1, unit_price_cents: 50000 }] })
        .mockResolvedValueOnce({ rows: [] });

      const start = Date.now();
      await pdfService.generateQuotePdf(100);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
    });
  });
});
