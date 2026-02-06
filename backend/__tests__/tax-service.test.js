/**
 * TeleTime - TaxService Unit Tests
 *
 * Tests for Canadian tax calculation service.
 */

const TaxService = require('../services/TaxService');

// Mock database pool
const mockPool = {
  query: jest.fn(),
};

describe('TaxService', () => {
  let taxService;

  beforeEach(() => {
    jest.clearAllMocks();
    taxService = new TaxService(mockPool, null);
  });

  // ============================================================================
  // TAX RATE LOOKUPS
  // ============================================================================

  describe('getTaxRates', () => {
    it('should return rates from database when available', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { tax_type: 'hst', rate_percent: '13.0000', is_compound: false, display_label: 'HST 13%' },
        ],
      });

      const rates = await taxService.getTaxRates('ON');

      expect(rates.hst).toBe(0.13);
      expect(rates.displayLabel).toBe('HST 13%');
    });

    it('should fall back to defaults when database unavailable', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB connection failed'));

      const rates = await taxService.getTaxRates('ON');

      expect(rates.hst).toBe(0.13);
      expect(rates.provinceName).toBe('Ontario');
    });

    it('should handle GST+PST provinces', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { tax_type: 'gst', rate_percent: '5.0000', is_compound: false, display_label: 'GST 5%' },
          { tax_type: 'pst', rate_percent: '7.0000', is_compound: false, display_label: 'PST 7%' },
        ],
      });

      const rates = await taxService.getTaxRates('BC');

      expect(rates.gst).toBe(0.05);
      expect(rates.pst).toBe(0.07);
      expect(rates.hst).toBe(0);
    });

    it('should handle Quebec compound QST', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { tax_type: 'gst', rate_percent: '5.0000', is_compound: false, display_label: 'GST 5%' },
          { tax_type: 'qst', rate_percent: '9.9750', is_compound: true, display_label: 'QST 9.975%' },
        ],
      });

      const rates = await taxService.getTaxRates('QC');

      expect(rates.gst).toBe(0.05);
      expect(rates.qst).toBeCloseTo(0.09975, 5);
      expect(rates.isQstCompound).toBe(true);
    });
  });

  // ============================================================================
  // TAX CALCULATION
  // ============================================================================

  describe('calculateTax', () => {
    beforeEach(() => {
      // Mock default rate lookup (falls back to defaults)
      mockPool.query.mockResolvedValue({ rows: [] });
    });

    it('should calculate Ontario HST correctly', async () => {
      const result = await taxService.calculateTax({
        amountCents: 10000,
        provinceCode: 'ON',
      });

      expect(result.hstCents).toBe(1300);
      expect(result.gstCents).toBe(0);
      expect(result.pstCents).toBe(0);
      expect(result.totalTaxCents).toBe(1300);
      expect(result.grandTotalCents).toBe(11300);
    });

    it('should calculate BC GST+PST correctly', async () => {
      const result = await taxService.calculateTax({
        amountCents: 10000,
        provinceCode: 'BC',
      });

      expect(result.gstCents).toBe(500);
      expect(result.pstCents).toBe(700);
      expect(result.totalTaxCents).toBe(1200);
    });

    it('should calculate Quebec compound QST correctly', async () => {
      const result = await taxService.calculateTax({
        amountCents: 10000,
        provinceCode: 'QC',
      });

      // GST: $100 * 5% = $5
      // QST: ($100 + $5) * 9.975% = $10.47 (rounded)
      expect(result.gstCents).toBe(500);
      // QST stored in pstCents for simplicity (or qstCents if available)
      expect(result.pstCents + result.qstCents).toBeCloseTo(1047, 0);
      expect(result.totalTaxCents).toBeCloseTo(1547, 0);
    });

    it('should calculate Alberta GST-only correctly', async () => {
      const result = await taxService.calculateTax({
        amountCents: 10000,
        provinceCode: 'AB',
      });

      expect(result.gstCents).toBe(500);
      expect(result.pstCents).toBe(0);
      expect(result.totalTaxCents).toBe(500);
    });

    it('should return zero tax when exempt', async () => {
      const result = await taxService.calculateTax({
        amountCents: 10000,
        provinceCode: 'ON',
        isTaxExempt: true,
      });

      expect(result.totalTaxCents).toBe(0);
      expect(result.grandTotalCents).toBe(10000);
      expect(result.isTaxExempt).toBe(true);
      expect(result.displayLabel).toBe('Tax Exempt');
    });

    it('should return zero tax for zero amount', async () => {
      const result = await taxService.calculateTax({
        amountCents: 0,
        provinceCode: 'ON',
      });

      expect(result.totalTaxCents).toBe(0);
      expect(result.grandTotalCents).toBe(0);
    });

    it('should provide tax breakdown for receipts', async () => {
      const result = await taxService.calculateTax({
        amountCents: 10000,
        provinceCode: 'ON',
      });

      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].type).toBe('HST');
      expect(result.breakdown[0].rate).toBe(13);
      expect(result.breakdown[0].amountCents).toBe(1300);
    });
  });

  // ============================================================================
  // ORDER TAX CALCULATION
  // ============================================================================

  describe('calculateOrderTax', () => {
    beforeEach(() => {
      mockPool.query.mockResolvedValue({ rows: [] });
    });

    it('should calculate tax for multiple items', async () => {
      const result = await taxService.calculateOrderTax({
        items: [
          { unitPriceCents: 10000, quantity: 1 },
          { unitPriceCents: 5000, quantity: 2 },
        ],
        provinceCode: 'ON',
      });

      // Total: $100 + $100 = $200
      // Tax: $200 * 13% = $26
      expect(result.summary.totalAmount).toBe(20000);
      expect(result.totalTaxCents).toBe(2600);
    });

    it('should handle mixed exempt and taxable items', async () => {
      const result = await taxService.calculateOrderTax({
        items: [
          { unitPriceCents: 10000, quantity: 1, isTaxExempt: false },
          { unitPriceCents: 10000, quantity: 1, isTaxExempt: true },
        ],
        provinceCode: 'ON',
      });

      // Only $100 is taxable
      expect(result.summary.taxableAmount).toBe(10000);
      expect(result.summary.exemptAmount).toBe(10000);
      expect(result.totalTaxCents).toBe(1300);
    });

    it('should apply order discount proportionally to taxable items', async () => {
      const result = await taxService.calculateOrderTax({
        items: [
          { unitPriceCents: 10000, quantity: 1, isTaxExempt: false },
          { unitPriceCents: 10000, quantity: 1, isTaxExempt: true },
        ],
        orderDiscountCents: 2000, // $20 discount
        provinceCode: 'ON',
      });

      // $20 discount split 50/50 between taxable and exempt
      // Taxable after discount: $100 - $10 = $90
      expect(result.summary.taxableAmount).toBe(9000);
      expect(result.totalTaxCents).toBe(1170);
    });
  });

  // ============================================================================
  // TAX EXTRACTION
  // ============================================================================

  describe('extractTax', () => {
    beforeEach(() => {
      mockPool.query.mockResolvedValue({ rows: [] });
    });

    it('should extract tax from Ontario inclusive amount', async () => {
      const result = await taxService.extractTax(11300, 'ON');

      expect(result.amountCents).toBe(10000);
      expect(result.taxCents).toBe(1300);
    });

    it('should extract tax from BC inclusive amount', async () => {
      const result = await taxService.extractTax(11200, 'BC');

      expect(result.amountCents).toBe(10000);
      expect(result.taxCents).toBe(1200);
    });

    it('should handle Quebec compound tax extraction', async () => {
      // $100 + $5 GST + $10.47 QST = $115.47
      const result = await taxService.extractTax(11547, 'QC');

      expect(result.amountCents).toBe(10000);
      expect(result.taxCents).toBe(1547);
    });
  });

  // ============================================================================
  // EXEMPTION CHECKS
  // ============================================================================

  describe('isCustomerTaxExempt', () => {
    it('should return true when customer has active exemption', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      const isExempt = await taxService.isCustomerTaxExempt(123, 'ON');

      expect(isExempt).toBe(true);
    });

    it('should return false when no exemption found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({
        rows: [{ is_tax_exempt: false }],
      });

      const isExempt = await taxService.isCustomerTaxExempt(123, 'ON');

      expect(isExempt).toBe(false);
    });

    it('should check customers table fallback on error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Table not found'));
      mockPool.query.mockResolvedValueOnce({
        rows: [{ is_tax_exempt: true }],
      });

      const isExempt = await taxService.isCustomerTaxExempt(123);

      expect(isExempt).toBe(true);
    });
  });

  describe('isProductTaxExempt', () => {
    let freshService;

    beforeEach(() => {
      jest.clearAllMocks();
      mockPool.query.mockReset();
      freshService = new TaxService(mockPool, null);
    });

    it('should return true when product is directly exempt', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ is_tax_exempt: true, category_exempt: false, exempt_provinces: null }],
      });

      const isExempt = await freshService.isProductTaxExempt(456, 'ON');

      expect(isExempt).toBe(true);
    });

    it('should return true when product category is exempt', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ is_tax_exempt: false, category_exempt: true, exempt_provinces: null }],
      });

      const isExempt = await freshService.isProductTaxExempt(456, 'ON');

      expect(isExempt).toBe(true);
    });

    it('should return true when product is exempt in specific province', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          is_tax_exempt: false,
          category_exempt: false,
          exempt_provinces: ['ON', 'BC'],
        }],
      });

      const isExempt = await freshService.isProductTaxExempt(456, 'ON');

      expect(isExempt).toBe(true);
    });

    it('should return false when product is not exempt in province', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          is_tax_exempt: false,
          category_exempt: false,
          exempt_provinces: ['BC'],
        }],
      });

      const isExempt = await freshService.isProductTaxExempt(456, 'ON');

      expect(isExempt).toBe(false);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockPool.query.mockResolvedValue({ rows: [] });
    });

    it('should handle unknown province (defaults to Ontario)', async () => {
      const freshService = new TaxService(mockPool, null);
      const result = await freshService.calculateTax({
        amountCents: 10000,
        provinceCode: 'XX',
      });

      // Falls back to Ontario's 13% HST
      expect(result.hstCents).toBe(1300);
    });

    it('should handle negative amounts gracefully', async () => {
      const result = await taxService.calculateTax({
        amountCents: -10000,
        provinceCode: 'ON',
      });

      expect(result.totalTaxCents).toBe(0);
      expect(result.isTaxExempt).toBe(true);
    });

    it('should round cents correctly', async () => {
      // $99.99 * 13% = $12.9987 -> should round to $13.00
      const result = await taxService.calculateTax({
        amountCents: 9999,
        provinceCode: 'ON',
      });

      expect(result.hstCents).toBe(1300);
    });

    it('should handle very large amounts', async () => {
      const result = await taxService.calculateTax({
        amountCents: 100000000, // $1,000,000
        provinceCode: 'ON',
      });

      expect(result.hstCents).toBe(13000000); // $130,000
      expect(result.grandTotalCents).toBe(113000000);
    });

    it('should handle very small amounts', async () => {
      const result = await taxService.calculateTax({
        amountCents: 1, // $0.01
        provinceCode: 'ON',
      });

      expect(result.hstCents).toBe(0); // Rounds to 0
      expect(result.grandTotalCents).toBe(1);
    });
  });
});
