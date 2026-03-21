/**
 * TaxEngineService Unit Tests
 */

const TaxEngineService = require('../services/taxEngineService');

// Mock S3
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PutObjectCommand: jest.fn(),
}));

const mockPool = { query: jest.fn() };

describe('TaxEngineService', () => {
  let svc;

  beforeEach(() => {
    mockPool.query.mockReset();
    svc = new TaxEngineService(mockPool);
  });

  // ── calculateTax ──────────────────────────────────────────────

  describe('calculateTax', () => {
    it('Ontario HST: subtotal=10000 → hst_cents=1300, total_cents=11300', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ tax_type: 'hst', rate: 0.13 }] }) // rates
        .mockResolvedValueOnce({ rows: [] }); // no exemption (customerId not passed)

      // customerId not passed so exemption query won't fire; but code checks
      // customerId != null first. Let's be explicit:
      const result = await svc.calculateTax({ subtotalCents: 10000, provinceCode: 'ON' });

      expect(result.breakdown.hst.cents).toBe(1300);
      expect(result.totalCents).toBe(11300);
      expect(result.totalTaxCents).toBe(1300);
      expect(result.provinceCode).toBe('ON');
    });

    it('BC dual tax: gst_cents=500, pst_cents=700, total_cents=11200', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { tax_type: 'gst', rate: 0.05 },
          { tax_type: 'pst', rate: 0.07 },
        ],
      });

      const result = await svc.calculateTax({ subtotalCents: 10000, provinceCode: 'BC' });

      expect(result.breakdown.gst.cents).toBe(500);
      expect(result.breakdown.pst.cents).toBe(700);
      expect(result.totalCents).toBe(11200);
    });

    it('QC QST precision: qst_cents = Math.round(10000 * 0.09975) = 998', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { tax_type: 'gst', rate: 0.05 },
          { tax_type: 'qst', rate: 0.09975 },
        ],
      });

      const result = await svc.calculateTax({ subtotalCents: 10000, provinceCode: 'QC' });

      expect(result.breakdown.qst.cents).toBe(998); // Math.round(10000 * 0.09975)
      expect(result.breakdown.gst.cents).toBe(500);
      expect(result.totalTaxCents).toBe(1498);
    });

    it('Alberta GST only: gst_cents=500, hst is null', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ tax_type: 'gst', rate: 0.05 }],
      });

      const result = await svc.calculateTax({ subtotalCents: 10000, provinceCode: 'AB' });

      expect(result.breakdown.gst.cents).toBe(500);
      expect(result.breakdown.hst).toBeNull();
      expect(result.totalCents).toBe(10500);
    });

    it('tax exemption: verified cert zeroes exempt tax types', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { tax_type: 'gst', rate: 0.05 },
            { tax_type: 'pst', rate: 0.07 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'cert-uuid-1',
            exempt_tax_types: ['gst'],
          }],
        });

      const result = await svc.calculateTax({
        subtotalCents: 10000,
        provinceCode: 'BC',
        customerId: 42,
      });

      expect(result.breakdown.gst.cents).toBe(0); // exempt
      expect(result.breakdown.pst.cents).toBe(700); // not exempt
      expect(result.totalTaxCents).toBe(700);
      expect(result.exemptCertId).toBe('cert-uuid-1');
    });

    it('expired cert is not applied — full tax calculated', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ tax_type: 'hst', rate: 0.13 }] })
        .mockResolvedValueOnce({ rows: [] }); // no active cert (expired ones filtered by SQL)

      const result = await svc.calculateTax({
        subtotalCents: 10000,
        provinceCode: 'ON',
        customerId: 42,
      });

      expect(result.breakdown.hst.cents).toBe(1300);
      expect(result.exemptCertId).toBeNull();
    });

    it('fully exempt returns isFullyExempt = true', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ tax_type: 'hst', rate: 0.13 }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'cert-uuid-2', exempt_tax_types: ['hst'] }],
        });

      const result = await svc.calculateTax({
        subtotalCents: 10000,
        provinceCode: 'ON',
        customerId: 42,
      });

      expect(result.isFullyExempt).toBe(true);
      expect(result.totalTaxCents).toBe(0);
    });

    it('transactionId provided → writes to transaction_tax_breakdown', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ tax_type: 'hst', rate: 0.13 }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT

      await svc.calculateTax({
        subtotalCents: 5000,
        provinceCode: 'ON',
        transactionId: 99,
        transactionType: 'pos_sale',
      });

      // Second call should be the INSERT
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      const insertCall = mockPool.query.mock.calls[1];
      expect(insertCall[0]).toContain('transaction_tax_breakdown');
      expect(insertCall[1]).toContain(99); // transactionId
    });

    it('throws INVALID_INPUT for negative subtotalCents', async () => {
      await expect(
        svc.calculateTax({ subtotalCents: -100, provinceCode: 'ON' })
      ).rejects.toThrow('subtotalCents must be a non-negative integer');
    });

    it('throws NO_RATES when province has no active rates', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        svc.calculateTax({ subtotalCents: 10000, provinceCode: 'XX' })
      ).rejects.toThrow('No active tax rates');
    });
  });

  // ── getProvinceForCustomer ────────────────────────────────────

  describe('getProvinceForCustomer', () => {
    it('customer.province = "ON" → { provinceCode: "ON", source: "billing" }', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ province: 'ON', postal_code: null }],
      });

      const result = await svc.getProvinceForCustomer(1);

      expect(result).toEqual({ provinceCode: 'ON', source: 'billing', isEstimated: false });
    });

    it('customer.province = "Ontario" → normalized to "ON"', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ province: 'Ontario', postal_code: null }],
      });

      const result = await svc.getProvinceForCustomer(1);

      expect(result.provinceCode).toBe('ON');
      expect(result.source).toBe('billing');
    });

    it('province NULL, postal_code = "M5V 3L9" → FSA resolves to ON', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ province: null, postal_code: 'M5V 3L9' }] })
        .mockResolvedValueOnce({ rows: [{ province_code: 'ON' }] }); // postal_code_cache

      const result = await svc.getProvinceForCustomer(1);

      expect(result).toEqual({ provinceCode: 'ON', source: 'postal_code', isEstimated: false });
    });

    it('province NULL, postal_code NULL → default ON with isEstimated', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ province: null, postal_code: null }],
      });

      const result = await svc.getProvinceForCustomer(1);

      expect(result).toEqual({ provinceCode: 'ON', source: 'default', isEstimated: true });
    });

    it('throws CUSTOMER_NOT_FOUND for non-existent customer', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(svc.getProvinceForCustomer(999)).rejects.toThrow('Customer not found');
    });
  });
});
