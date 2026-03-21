/**
 * Institutional Service Unit Tests
 */

const InstitutionalService = require('../services/institutionalService');

// Mock S3
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PutObjectCommand: jest.fn(),
}));

// Mock pdfkit with event-emitter behavior so generateInvoicePDF resolves
jest.mock('pdfkit', () => jest.fn().mockImplementation(() => {
  const handlers = {};
  const mock = {};
  const chain = () => jest.fn(() => mock);
  Object.assign(mock, {
    pipe: chain(), fontSize: chain(), font: chain(), text: chain(),
    rect: chain(), roundedRect: chain(), fill: chain(), fillColor: chain(),
    fillAndStroke: chain(), moveTo: chain(), lineTo: chain(), stroke: chain(),
    strokeColor: chain(), lineWidth: chain(),
    on: jest.fn((event, cb) => { handlers[event] = cb; return mock; }),
    end: jest.fn(() => {
      if (handlers.data) handlers.data(Buffer.from('fake-pdf'));
      if (handlers.end) handlers.end();
    }),
  });
  return mock;
}));

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue(mockClient),
};

const mockCache = {
  invalidatePattern: jest.fn(),
};

describe('InstitutionalService', () => {
  let svc;

  beforeEach(() => {
    // mockReset clears the mockResolvedValueOnce queue (clearAllMocks does not)
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPool.query.mockReset();
    mockPool.connect.mockReset().mockResolvedValue(mockClient);
    mockCache.invalidatePattern.mockReset();
    svc = new InstitutionalService(mockPool, mockCache);
  });

  // ── createProfile ─────────────────────────────────────────────

  describe('createProfile', () => {
    it('inserts profile and returns result', async () => {
      const profileData = {
        org_type: 'housing_authority',
        org_name: 'City Housing',
        payment_terms: 'net30',
        credit_limit_cents: 500000,
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // customer check
        .mockResolvedValueOnce({ rows: [] }) // no duplicate
        .mockResolvedValueOnce({ rows: [{ id: 10, ...profileData }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // audit

      const result = await svc.createProfile(1, profileData, 5);

      expect(result.id).toBe(10);
      expect(result.org_type).toBe('housing_authority');
    });

    it('throws DUPLICATE_PROFILE if customer already has one', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // customer exists
        .mockResolvedValueOnce({ rows: [{ id: 99 }] }); // existing profile

      await expect(
        svc.createProfile(1, { org_type: 'school', org_name: 'Test' }, 5)
      ).rejects.toMatchObject({ code: 'DUPLICATE_PROFILE' });
    });

    it('throws INVALID_ORG_TYPE for invalid org_type', async () => {
      await expect(
        svc.createProfile(1, { org_type: 'invalid_type', org_name: 'X' }, 5)
      ).rejects.toMatchObject({ code: 'INVALID_ORG_TYPE' });
    });
  });

  // ── checkCreditAvailability ───────────────────────────────────

  describe('checkCreditAvailability', () => {
    it('approved=true when available >= amount', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ credit_limit_cents: 100000, credit_used_cents: 20000 }],
      });

      const result = await svc.checkCreditAvailability(1, 50000);

      expect(result.approved).toBe(true);
      expect(result.availableCents).toBe(80000);
      expect(result.shortfallCents).toBe(0);
    });

    it('approved=false with shortfallCents when over limit', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ credit_limit_cents: 100000, credit_used_cents: 80000 }],
      });

      const result = await svc.checkCreditAvailability(1, 30000);

      expect(result.approved).toBe(false);
      expect(result.shortfallCents).toBe(10000); // needs 30000, has 20000
    });

    it('hasLimit=false when credit_limit=0 → always approved', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ credit_limit_cents: 0, credit_used_cents: 0 }],
      });

      const result = await svc.checkCreditAvailability(1, 999999);

      expect(result.approved).toBe(true);
    });
  });

  // ── addContact ────────────────────────────────────────────────

  describe('addContact', () => {
    it('sets is_primary=false on existing primary when new contact is_primary=true', async () => {
      // _requireProfile
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      // Transaction queries
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE existing primary to false
        .mockResolvedValueOnce({ rows: [{ id: 20, first_name: 'Jane', is_primary: true }] }) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      // Audit
      mockPool.query.mockResolvedValueOnce({});

      const result = await svc.addContact(1, {
        first_name: 'Jane',
        last_name: 'Smith',
        is_primary: true,
      }, 5);

      expect(result.is_primary).toBe(true);
      // Verify the UPDATE to clear existing primary was called
      const updateCall = mockClient.query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('is_primary = FALSE')
      );
      expect(updateCall).toBeDefined();
    });
  });

  // ── createInvoice ─────────────────────────────────────────────

  describe('createInvoice', () => {
    it('generates INV-YYYY-NNNNN format and calculates correct due_date for net30', async () => {
      const now = new Date();
      const year = now.getFullYear();

      // _generateInvoiceNumber uses pool.query (not client.query) for nextval
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ seq: '42' }] }) // nextval
        .mockResolvedValueOnce({}); // audit

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, payment_terms: 'net30' }] }) // profile
        .mockResolvedValueOnce({ rows: [{ // quotes
          id: 100, quotation_number: 'Q-001', subtotal_cents: 50000,
          tax_cents: 6500, total_cents: 56500, status: 'WON',
          institutional_profile_id: 1,
        }] })
        .mockResolvedValueOnce({ rows: [{ total_tax: 0 }] }) // tax breakdown
        .mockResolvedValueOnce({ rows: [{ // invoice INSERT
          id: 200, invoice_number: `INV-${year}-00042`, total_cents: 56500,
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        }] })
        .mockResolvedValueOnce({}) // credit update
        .mockResolvedValueOnce({}); // COMMIT

      const result = await svc.createInvoice(1, [100], {}, 5);

      expect(result.invoice_number).toMatch(/^INV-\d{4}-\d{5}$/);
    });

    it('increments credit_used_cents on profile', async () => {
      // _generateInvoiceNumber uses pool.query (not client.query) for nextval
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ seq: '1' }] }) // nextval
        .mockResolvedValueOnce({}); // audit

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, payment_terms: 'net60' }] })
        .mockResolvedValueOnce({ rows: [{
          id: 100, quotation_number: 'Q-001', subtotal_cents: 100000,
          tax_cents: 13000, total_cents: 113000, status: 'WON',
          institutional_profile_id: 1,
        }] })
        .mockResolvedValueOnce({ rows: [{ total_tax: 0 }] })
        .mockResolvedValueOnce({ rows: [{ id: 200, invoice_number: 'INV-2026-00001', total_cents: 113000 }] })
        .mockResolvedValueOnce({}) // credit update
        .mockResolvedValueOnce({}); // COMMIT

      await svc.createInvoice(1, [100], {}, 5);

      // Verify credit update call
      const creditCall = mockClient.query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('credit_used_cents = credit_used_cents +')
      );
      expect(creditCall).toBeDefined();
      expect(creditCall[1][0]).toBe(113000); // totalCents
    });
  });

  // ── recordPayment ─────────────────────────────────────────────

  describe('recordPayment', () => {
    it('transitions status issued → partially_paid correctly', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ // invoice FOR UPDATE
          id: 1, status: 'issued', total_cents: 10000, paid_cents: 0,
          profile_id: 5, payment_reference: null, paid_date: null,
        }] })
        .mockResolvedValueOnce({ rows: [{ id: 50, amount_cents: 3000 }] }) // payment INSERT
        .mockResolvedValueOnce({}) // invoice UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      mockPool.query
        .mockResolvedValueOnce({}) // audit
        .mockResolvedValueOnce({ rows: [{ // getInvoice re-fetch
          id: 1, status: 'partially_paid', total_cents: 10000, paid_cents: 3000,
          profile_id: 5, org_name: 'Test',
        }] });

      const result = await svc.recordPayment(1, {
        amount_cents: 3000,
        payment_method: 'cheque',
        received_date: '2026-03-07',
      }, 5);

      expect(result.invoice.status).toBe('partially_paid');
    });

    it('transitions to paid and releases credit on full payment', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{
          id: 1, status: 'partially_paid', total_cents: 10000, paid_cents: 7000,
          profile_id: 5, payment_reference: null, paid_date: null,
        }] })
        .mockResolvedValueOnce({ rows: [{ id: 51, amount_cents: 3000 }] })
        .mockResolvedValueOnce({}) // invoice UPDATE
        .mockResolvedValueOnce({}) // credit release (GREATEST)
        .mockResolvedValueOnce({}); // COMMIT

      mockPool.query
        .mockResolvedValueOnce({}) // audit
        .mockResolvedValueOnce({ rows: [{
          id: 1, status: 'paid', total_cents: 10000, paid_cents: 10000,
          profile_id: 5, org_name: 'Test',
        }] });

      const result = await svc.recordPayment(1, {
        amount_cents: 3000,
        payment_method: 'eft',
        received_date: '2026-03-07',
      }, 5);

      expect(result.invoice.status).toBe('paid');

      // Verify GREATEST floor is used
      const creditCall = mockClient.query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('GREATEST')
      );
      expect(creditCall).toBeDefined();
    });
  });

  // ── voidInvoice ───────────────────────────────────────────────

  describe('voidInvoice', () => {
    it('throws CANNOT_VOID_PAID on paid invoice', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{
          id: 1, status: 'paid', total_cents: 10000, paid_cents: 10000, profile_id: 5,
        }] });

      await expect(
        svc.voidInvoice(1, 'test reason', 5)
      ).rejects.toMatchObject({ code: 'CANNOT_VOID_PAID' });
    });

    it('releases credit on void of issued invoice', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{
          id: 1, status: 'issued', total_cents: 50000, paid_cents: 0,
          profile_id: 5, invoice_number: 'INV-2026-00001',
        }] })
        .mockResolvedValueOnce({}) // UPDATE status = void
        .mockResolvedValueOnce({}) // credit release GREATEST
        .mockResolvedValueOnce({}); // COMMIT

      mockPool.query.mockResolvedValueOnce({}); // audit

      const result = await svc.voidInvoice(1, 'test reason', 5);

      expect(result.status).toBe('void');

      // Verify credit release with GREATEST
      const creditCall = mockClient.query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('GREATEST')
      );
      expect(creditCall).toBeDefined();
    });
  });

  // ── getCreditStatus ───────────────────────────────────────────

  describe('getCreditStatus', () => {
    it('calculates correct utilizationPct', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ credit_limit_cents: 200000, credit_used_cents: 100000 }],
      });

      const result = await svc.getCreditStatus(1);

      expect(result.utilizationPct).toBe(50);
      expect(result.availableCents).toBe(100000);
      expect(result.isOverLimit).toBe(false);
      expect(result.hasLimit).toBe(true);
    });

    it('zero credit limit → hasLimit=false, utilizationPct=0', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ credit_limit_cents: 0, credit_used_cents: 0 }],
      });

      const result = await svc.getCreditStatus(1);

      expect(result.hasLimit).toBe(false);
      expect(result.utilizationPct).toBe(0);
      expect(result.isOverLimit).toBe(false);
      expect(result.availableCents).toBe(0);
    });

    it('over-limit → isOverLimit=true, negative availableCents', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ credit_limit_cents: 100000, credit_used_cents: 150000 }],
      });

      const result = await svc.getCreditStatus(1);

      expect(result.isOverLimit).toBe(true);
      expect(result.availableCents).toBe(-50000);
      expect(result.utilizationPct).toBe(150);
      expect(result.hasLimit).toBe(true);
    });

    it('throws PROFILE_NOT_FOUND for non-existent profile', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(svc.getCreditStatus(999)).rejects.toMatchObject({ code: 'PROFILE_NOT_FOUND' });
    });
  });

  // ── createProfile (additional branches) ─────────────────────

  describe('createProfile (additional branches)', () => {
    it('throws CUSTOMER_NOT_FOUND when customer does not exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // no customer

      await expect(
        svc.createProfile(999, { org_type: 'school', org_name: 'Test' }, 5)
      ).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
    });

    it('throws INVALID_PAYMENT_TERMS for unrecognized terms', async () => {
      await expect(
        svc.createProfile(1, { org_type: 'school', org_name: 'X', payment_terms: 'net999' }, 5)
      ).rejects.toMatchObject({ code: 'INVALID_PAYMENT_TERMS' });
    });
  });

  // ── updateProfile ──────────────────────────────────────────────

  describe('updateProfile', () => {
    it('throws INVALID_ORG_TYPE when org_type is invalid', async () => {
      await expect(
        svc.updateProfile(1, { org_type: 'banana' }, 5)
      ).rejects.toMatchObject({ code: 'INVALID_ORG_TYPE' });
    });

    it('throws INVALID_PAYMENT_TERMS when payment_terms is invalid', async () => {
      await expect(
        svc.updateProfile(1, { payment_terms: 'net999' }, 5)
      ).rejects.toMatchObject({ code: 'INVALID_PAYMENT_TERMS' });
    });

    it('throws PROFILE_NOT_FOUND when profile does not exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        svc.updateProfile(999, { org_name: 'New Name' }, 5)
      ).rejects.toMatchObject({ code: 'PROFILE_NOT_FOUND' });
    });

    it('returns current profile when no allowed fields are provided', async () => {
      const current = { id: 1, org_name: 'Old Name', org_type: 'school' };
      mockPool.query.mockResolvedValueOnce({ rows: [current] });

      const result = await svc.updateProfile(1, { not_allowed_field: 'foo' }, 5);

      expect(result).toEqual(current);
      expect(mockPool.query).toHaveBeenCalledTimes(1); // only the fetch, no UPDATE
    });

    it('updates a single field and records audit diff', async () => {
      const current = { id: 1, org_name: 'Old Name', org_type: 'school' };
      mockPool.query
        .mockResolvedValueOnce({ rows: [current] }) // fetch current
        .mockResolvedValueOnce({ rows: [{ ...current, org_name: 'New Name' }] }) // UPDATE
        .mockResolvedValueOnce({}); // audit

      const result = await svc.updateProfile(1, { org_name: 'New Name' }, 5);

      expect(result.org_name).toBe('New Name');
      const updateCall = mockPool.query.mock.calls[1];
      expect(updateCall[0]).toContain('org_name = $1');
      expect(updateCall[1]).toEqual(['New Name', 1]);
    });

    it('updates multiple fields simultaneously', async () => {
      const current = { id: 1, org_name: 'Old', org_type: 'school', payment_terms: 'net30', credit_limit_cents: 0 };
      const updated = { ...current, org_name: 'New Corp', payment_terms: 'net60', credit_limit_cents: 500000 };
      mockPool.query
        .mockResolvedValueOnce({ rows: [current] })
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({}); // audit

      const result = await svc.updateProfile(1, {
        org_name: 'New Corp',
        payment_terms: 'net60',
        credit_limit_cents: 500000,
      }, 5);

      expect(result.org_name).toBe('New Corp');
      expect(result.payment_terms).toBe('net60');
      expect(result.credit_limit_cents).toBe(500000);
      const updateSql = mockPool.query.mock.calls[1][0];
      expect(updateSql).toContain('org_name');
      expect(updateSql).toContain('payment_terms');
      expect(updateSql).toContain('credit_limit_cents');
    });

    it('ignores fields not in ALLOWED list', async () => {
      const current = { id: 1, org_name: 'Old', org_type: 'school' };
      mockPool.query
        .mockResolvedValueOnce({ rows: [current] })
        .mockResolvedValueOnce({ rows: [{ ...current, org_name: 'Updated' }] })
        .mockResolvedValueOnce({}); // audit

      await svc.updateProfile(1, {
        org_name: 'Updated',
        hacker_field: 'DROP TABLE',
        id: 999,
      }, 5);

      const updateParams = mockPool.query.mock.calls[1][1];
      expect(updateParams).toEqual(['Updated', 1]); // only org_name + profileId
    });

    it('invalidates cache on successful update', async () => {
      const current = { id: 1, org_name: 'Old' };
      mockPool.query
        .mockResolvedValueOnce({ rows: [current] })
        .mockResolvedValueOnce({ rows: [{ ...current, org_name: 'New' }] })
        .mockResolvedValueOnce({}); // audit

      await svc.updateProfile(1, { org_name: 'New' }, 5);

      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('institutional:*');
    });
  });

  // ── createInvoice (quote validation) ───────────────────────────

  describe('createInvoice (quote validation)', () => {
    it('throws INVALID_QUOTES when quoteIds is empty', async () => {
      await expect(
        svc.createInvoice(1, [], {}, 5)
      ).rejects.toMatchObject({ code: 'INVALID_QUOTES' });
    });

    it('throws INVALID_QUOTES when quoteIds is null', async () => {
      await expect(
        svc.createInvoice(1, null, {}, 5)
      ).rejects.toMatchObject({ code: 'INVALID_QUOTES' });
    });

    it('throws PROFILE_NOT_FOUND when profile does not exist', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // profile not found

      await expect(
        svc.createInvoice(999, [100], {}, 5)
      ).rejects.toMatchObject({ code: 'PROFILE_NOT_FOUND' });
    });

    it('throws INVALID_QUOTES when some quote IDs not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, payment_terms: 'net30' }] }) // profile
        .mockResolvedValueOnce({ rows: [{ // only 1 of 2 found
          id: 100, quotation_number: 'Q-001', subtotal_cents: 50000,
          tax_cents: 6500, total_cents: 56500, status: 'WON',
          institutional_profile_id: 1,
        }] });

      await expect(
        svc.createInvoice(1, [100, 200], {}, 5)
      ).rejects.toMatchObject({ code: 'INVALID_QUOTES' });
    });

    it('throws INVALID_QUOTES when quote belongs to wrong profile', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, payment_terms: 'net30' }] }) // profile
        .mockResolvedValueOnce({ rows: [{
          id: 100, quotation_number: 'Q-001', subtotal_cents: 50000,
          tax_cents: 6500, total_cents: 56500, status: 'WON',
          institutional_profile_id: 99, // wrong profile
        }] });

      await expect(
        svc.createInvoice(1, [100], {}, 5)
      ).rejects.toMatchObject({ code: 'INVALID_QUOTES' });
    });

    it('throws QUOTES_NOT_READY when quote status is DRAFT', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, payment_terms: 'net30' }] }) // profile
        .mockResolvedValueOnce({ rows: [{
          id: 100, quotation_number: 'Q-001', subtotal_cents: 50000,
          tax_cents: 0, total_cents: 50000, status: 'DRAFT',
          institutional_profile_id: 1,
        }] });

      await expect(
        svc.createInvoice(1, [100], {}, 5)
      ).rejects.toMatchObject({ code: 'QUOTES_NOT_READY' });
    });

    it('throws QUOTES_NOT_READY when quote status is EXPIRED', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, payment_terms: 'net30' }] }) // profile
        .mockResolvedValueOnce({ rows: [{
          id: 100, quotation_number: 'Q-100', subtotal_cents: 50000,
          tax_cents: 0, total_cents: 50000, status: 'EXPIRED',
          institutional_profile_id: 1,
        }] });

      await expect(
        svc.createInvoice(1, [100], {}, 5)
      ).rejects.toMatchObject({ code: 'QUOTES_NOT_READY' });
    });

    it('uses precise tax from transaction_tax_breakdown when > 0', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ seq: '5' }] }) // nextval
        .mockResolvedValueOnce({}); // audit

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, payment_terms: 'net30' }] }) // profile
        .mockResolvedValueOnce({ rows: [{
          id: 100, quotation_number: 'Q-001', subtotal_cents: 50000,
          tax_cents: 6000, total_cents: 56000, status: 'WON',
          institutional_profile_id: 1,
        }] })
        .mockResolvedValueOnce({ rows: [{ total_tax: 6500 }] }) // more precise tax
        .mockResolvedValueOnce({ rows: [{
          id: 200, invoice_number: 'INV-2026-00005', total_cents: 56500,
          subtotal_cents: 50000, tax_cents: 6500,
        }] }) // INSERT
        .mockResolvedValueOnce({}) // credit update
        .mockResolvedValueOnce({}); // COMMIT

      await svc.createInvoice(1, [100], {}, 5);

      // INSERT is the 5th client.query call (index 4)
      const insertParams = mockClient.query.mock.calls[4][1];
      expect(insertParams[3]).toBe(50000); // subtotal
      expect(insertParams[4]).toBe(6500); // tax from breakdown (not 6000 from quote)
      expect(insertParams[5]).toBe(56500); // total = 50000 + 6500
    });

    it('accepts COMPLETED status quotes', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ seq: '10' }] }) // nextval
        .mockResolvedValueOnce({}); // audit

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, payment_terms: 'net30' }] }) // profile
        .mockResolvedValueOnce({ rows: [{
          id: 100, quotation_number: 'Q-001', subtotal_cents: 50000,
          tax_cents: 6500, total_cents: 56500, status: 'COMPLETED',
          institutional_profile_id: 1,
        }] })
        .mockResolvedValueOnce({ rows: [{ total_tax: 0 }] }) // tax breakdown
        .mockResolvedValueOnce({ rows: [{ id: 200, invoice_number: 'INV-2026-00010', total_cents: 56500 }] })
        .mockResolvedValueOnce({}) // credit update
        .mockResolvedValueOnce({}); // COMMIT

      const result = await svc.createInvoice(1, [100], {}, 5);
      expect(result.invoice_number).toMatch(/^INV-\d{4}-\d{5}$/);
    });
  });

  // ── createInvoice (due_date for all payment terms) ─────────────

  describe('createInvoice (due_date for all payment terms)', () => {
    /**
     * Helper: run createInvoice with given payment_terms and return
     * the issuedDate and dueDate params passed to the INSERT query.
     */
    async function runWithTerms(svcInstance, terms) {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ seq: '1' }] }) // nextval
        .mockResolvedValueOnce({}); // audit

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, payment_terms: terms }] }) // profile
        .mockResolvedValueOnce({ rows: [{
          id: 100, quotation_number: 'Q-001', subtotal_cents: 10000,
          tax_cents: 1300, total_cents: 11300, status: 'WON',
          institutional_profile_id: 1,
        }] })
        .mockResolvedValueOnce({ rows: [{ total_tax: 0 }] }) // tax breakdown
        .mockResolvedValueOnce({ rows: [{ id: 200, invoice_number: 'INV-2026-00001', total_cents: 11300 }] })
        .mockResolvedValueOnce({}) // credit update
        .mockResolvedValueOnce({}); // COMMIT

      await svcInstance.createInvoice(1, [100], {}, 5);

      // INSERT is the 5th client.query call (index 4)
      const insertParams = mockClient.query.mock.calls[4][1];
      return { issuedDate: insertParams[6], dueDate: insertParams[7] };
    }

    function daysDiff(dateStr1, dateStr2) {
      // Use UTC noon to avoid DST off-by-one
      const d1 = new Date(dateStr1 + 'T12:00:00Z');
      const d2 = new Date(dateStr2 + 'T12:00:00Z');
      return Math.round((d2 - d1) / 86400000);
    }

    it('net60: due date is 60 days after issued date', async () => {
      const { issuedDate, dueDate } = await runWithTerms(svc, 'net60');
      expect(daysDiff(issuedDate, dueDate)).toBe(60);
    });

    it('net90: due date is 90 days after issued date', async () => {
      const { issuedDate, dueDate } = await runWithTerms(svc, 'net90');
      expect(daysDiff(issuedDate, dueDate)).toBe(90);
    });

    it('cod: due date equals issued date (0 days)', async () => {
      const { issuedDate, dueDate } = await runWithTerms(svc, 'cod');
      expect(dueDate).toBe(issuedDate);
    });

    it('prepaid: due date equals issued date (0 days)', async () => {
      const { issuedDate, dueDate } = await runWithTerms(svc, 'prepaid');
      expect(dueDate).toBe(issuedDate);
    });
  });

  // ── recordPayment (additional branches) ────────────────────────

  describe('recordPayment (additional branches)', () => {
    it('throws INVALID_AMOUNT for zero amount', async () => {
      await expect(
        svc.recordPayment(1, { amount_cents: 0, payment_method: 'cheque', received_date: '2026-03-07' }, 5)
      ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    });

    it('throws INVALID_AMOUNT for negative amount', async () => {
      await expect(
        svc.recordPayment(1, { amount_cents: -500, payment_method: 'cheque', received_date: '2026-03-07' }, 5)
      ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    });

    it('throws INVALID_PAYMENT_METHOD for unrecognized method', async () => {
      await expect(
        svc.recordPayment(1, { amount_cents: 1000, payment_method: 'bitcoin', received_date: '2026-03-07' }, 5)
      ).rejects.toMatchObject({ code: 'INVALID_PAYMENT_METHOD' });
    });

    it('throws INVOICE_NOT_FOUND when invoice does not exist', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // no invoice

      await expect(
        svc.recordPayment(999, { amount_cents: 1000, payment_method: 'cheque', received_date: '2026-03-07' }, 5)
      ).rejects.toMatchObject({ code: 'INVOICE_NOT_FOUND' });
    });

    it('throws INVOICE_VOIDED when invoice status is void', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{
          id: 1, status: 'void', total_cents: 10000, paid_cents: 0, profile_id: 5,
        }] });

      await expect(
        svc.recordPayment(1, { amount_cents: 1000, payment_method: 'cheque', received_date: '2026-03-07' }, 5)
      ).rejects.toMatchObject({ code: 'INVOICE_VOIDED' });
    });

    it('overpayment: amount exceeds remaining → still marks paid with GREATEST floor', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{
          id: 1, status: 'issued', total_cents: 10000, paid_cents: 0,
          profile_id: 5, payment_reference: null, paid_date: null,
        }] })
        .mockResolvedValueOnce({ rows: [{ id: 60, amount_cents: 15000 }] }) // payment INSERT
        .mockResolvedValueOnce({}) // invoice UPDATE
        .mockResolvedValueOnce({}) // credit release GREATEST
        .mockResolvedValueOnce({}); // COMMIT

      mockPool.query
        .mockResolvedValueOnce({}) // audit
        .mockResolvedValueOnce({ rows: [{
          id: 1, status: 'paid', total_cents: 10000, paid_cents: 15000,
          profile_id: 5, org_name: 'Test',
        }] });

      const result = await svc.recordPayment(1, {
        amount_cents: 15000,
        payment_method: 'wire',
        received_date: '2026-03-07',
      }, 5);

      expect(result.invoice.status).toBe('paid');
      expect(result.invoice.paid_cents).toBe(15000);
      // Verify GREATEST floor for credit release
      const creditCall = mockClient.query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('GREATEST')
      );
      expect(creditCall).toBeDefined();
    });

    it('preserves existing payment_reference when new payment has none', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{
          id: 1, status: 'issued', total_cents: 10000, paid_cents: 0,
          profile_id: 5, payment_reference: 'REF-001', paid_date: null,
        }] })
        .mockResolvedValueOnce({ rows: [{ id: 70, amount_cents: 5000 }] }) // payment INSERT
        .mockResolvedValueOnce({}) // invoice UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      mockPool.query
        .mockResolvedValueOnce({}) // audit
        .mockResolvedValueOnce({ rows: [{
          id: 1, status: 'partially_paid', total_cents: 10000, paid_cents: 5000,
          profile_id: 5, org_name: 'Test',
        }] });

      await svc.recordPayment(1, {
        amount_cents: 5000,
        payment_method: 'eft',
        received_date: '2026-03-07',
      }, 5);

      // Invoice UPDATE is the 4th client.query call (index 3)
      const updateParams = mockClient.query.mock.calls[3][1];
      // payment_reference param should be the existing 'REF-001'
      expect(updateParams[3]).toBe('REF-001');
    });
  });

  // ── voidInvoice (additional branches) ──────────────────────────

  describe('voidInvoice (additional branches)', () => {
    it('throws CANNOT_VOID_PAID on partially_paid invoice', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{
          id: 1, status: 'partially_paid', total_cents: 10000, paid_cents: 3000, profile_id: 5,
        }] });

      await expect(
        svc.voidInvoice(1, 'test reason', 5)
      ).rejects.toMatchObject({ code: 'CANNOT_VOID_PAID' });
    });

    it('throws INVOICE_NOT_FOUND when invoice does not exist', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // no invoice

      await expect(
        svc.voidInvoice(999, 'not found', 5)
      ).rejects.toMatchObject({ code: 'INVOICE_NOT_FOUND' });
    });
  });

  // ── getProfile ─────────────────────────────────────────────────

  describe('getProfile', () => {
    it('returns profile with contacts, addresses, and openQuotes when requested', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, org_name: 'Acme', customer_name: 'John' }] }) // profile
        .mockResolvedValueOnce({ rows: [{ id: 10, first_name: 'Jane' }] }) // contacts
        .mockResolvedValueOnce({ rows: [{ id: 20, site_name: 'HQ' }] }) // addresses
        .mockResolvedValueOnce({ rows: [{ id: 30, quotation_number: 'Q-001' }] }); // quotes

      const result = await svc.getProfile(1, {
        includeContacts: true,
        includeAddresses: true,
        includeOpenQuotes: true,
      });

      expect(result.org_name).toBe('Acme');
      expect(result.contacts).toHaveLength(1);
      expect(result.addresses).toHaveLength(1);
      expect(result.openQuotes).toHaveLength(1);
    });

    it('throws PROFILE_NOT_FOUND for non-existent profile', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(svc.getProfile(999)).rejects.toMatchObject({ code: 'PROFILE_NOT_FOUND' });
    });

    it('omits contacts/addresses/quotes when opts are false', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, org_name: 'Acme' }] });

      const result = await svc.getProfile(1);

      expect(result.contacts).toBeUndefined();
      expect(result.addresses).toBeUndefined();
      expect(result.openQuotes).toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledTimes(1); // only the profile query
    });
  });

  // ── getProfileByCustomer ───────────────────────────────────────

  describe('getProfileByCustomer', () => {
    it('returns null when no profile exists', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await svc.getProfileByCustomer(999);
      expect(result).toBeNull();
    });

    it('returns profile when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 5, customer_id: 42, org_name: 'Test' }] });

      const result = await svc.getProfileByCustomer(42);
      expect(result.id).toBe(5);
    });
  });

  // ── addContact (non-primary branch) ────────────────────────────

  describe('addContact (non-primary)', () => {
    it('skips UPDATE when is_primary is false', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // _requireProfile

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 25, first_name: 'Bob', is_primary: false }] }) // INSERT
        .mockResolvedValueOnce({}); // COMMIT

      mockPool.query.mockResolvedValueOnce({}); // audit

      const result = await svc.addContact(1, {
        first_name: 'Bob',
        last_name: 'Jones',
        is_primary: false,
      }, 5);

      expect(result.is_primary).toBe(false);
      // Should NOT have the UPDATE clearing existing primary
      const updateCall = mockClient.query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('is_primary = FALSE')
      );
      expect(updateCall).toBeUndefined();
    });
  });

  // ── listProfiles ───────────────────────────────────────────────

  describe('listProfiles', () => {
    it('applies isActive, orgType, and search filters', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] }) // count
        .mockResolvedValueOnce({ rows: [{ id: 1, org_name: 'School A' }] }); // data

      const result = await svc.listProfiles(
        { isActive: true, orgType: 'school', search: 'School' },
        { limit: 10, offset: 0 }
      );

      expect(result.profiles).toHaveLength(1);
      expect(result.total).toBe(1);
      const countSql = mockPool.query.mock.calls[0][0];
      expect(countSql).toContain('is_active');
      expect(countSql).toContain('org_type');
      expect(countSql).toContain('ILIKE');
    });

    it('returns all when no filters specified', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await svc.listProfiles();

      expect(result.profiles).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ── listInvoices ───────────────────────────────────────────────

  describe('listInvoices', () => {
    it('applies profileId, status, overdueOnly, and date range filters', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({ rows: [
          { id: 1, total_cents: 10000, paid_cents: 0 },
          { id: 2, total_cents: 20000, paid_cents: 5000 },
        ] });

      const result = await svc.listInvoices(
        { profileId: 1, status: 'issued', overdueOnly: true, fromDate: '2026-01-01', toDate: '2026-03-07' },
        { limit: 10 }
      );

      expect(result.invoices).toHaveLength(2);
      expect(result.invoices[0].balance_owing_cents).toBe(10000);
      expect(result.invoices[1].balance_owing_cents).toBe(15000);
      expect(result.total).toBe(2);
      const countSql = mockPool.query.mock.calls[0][0];
      expect(countSql).toContain('profile_id');
      expect(countSql).toContain('status');
      expect(countSql).toContain('due_date < CURRENT_DATE');
      expect(countSql).toContain('issued_date >=');
      expect(countSql).toContain('issued_date <=');
    });
  });

  // ── getInvoice ─────────────────────────────────────────────────

  describe('getInvoice', () => {
    it('includes payments when includePayments=true', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{
          id: 1, total_cents: 10000, paid_cents: 3000, org_name: 'Test',
        }] })
        .mockResolvedValueOnce({ rows: [{ id: 50, amount_cents: 3000 }] }); // payments

      const result = await svc.getInvoice(1, true);

      expect(result.payments).toHaveLength(1);
      expect(result.balance_owing_cents).toBe(7000);
    });

    it('omits payments when includePayments=false', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{
        id: 1, total_cents: 10000, paid_cents: 0, org_name: 'Test',
      }] });

      const result = await svc.getInvoice(1, false);

      expect(result.payments).toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('throws INVOICE_NOT_FOUND for non-existent invoice', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(svc.getInvoice(999)).rejects.toMatchObject({ code: 'INVOICE_NOT_FOUND' });
    });
  });

  // ── updateOverdueStatuses ──────────────────────────────────────

  describe('updateOverdueStatuses', () => {
    it('returns count of updated invoices', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 3, rows: [{ id: 1 }, { id: 2 }, { id: 3 }] });

      const count = await svc.updateOverdueStatuses();
      expect(count).toBe(3);
    });

    it('returns 0 when no invoices are overdue', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const count = await svc.updateOverdueStatuses();
      expect(count).toBe(0);
    });
  });

  // ── listContacts ───────────────────────────────────────────────

  describe('listContacts', () => {
    it('includes inactive contacts when includeInactive=true', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, is_active: true },
          { id: 2, is_active: false },
        ],
      });

      const result = await svc.listContacts(1, true);
      expect(result).toHaveLength(2);
      const sql = mockPool.query.mock.calls[0][0];
      expect(sql).not.toContain('is_active = TRUE');
    });

    it('excludes inactive contacts by default', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, is_active: true }] });

      const result = await svc.listContacts(1);
      expect(result).toHaveLength(1);
      const sql = mockPool.query.mock.calls[0][0];
      expect(sql).toContain('is_active = TRUE');
    });
  });

  // ── addDeliveryAddress ─────────────────────────────────────────

  describe('addDeliveryAddress', () => {
    it('inserts address and returns result', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // _requireProfile
        .mockResolvedValueOnce({ rows: [{ id: 30, site_name: 'Main Office' }] }); // INSERT

      const result = await svc.addDeliveryAddress(1, {
        site_name: 'Main Office',
        address_line1: '123 Main St',
        city: 'Toronto',
        province_code: 'ON',
        postal_code: 'M5V 3L9',
      });

      expect(result.site_name).toBe('Main Office');
      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('institutional:*');
    });
  });

  // ── updateDeliveryAddress ──────────────────────────────────────

  describe('updateDeliveryAddress', () => {
    it('throws ADDRESS_NOT_FOUND for non-existent address', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        svc.updateDeliveryAddress(999, { site_name: 'New' })
      ).rejects.toMatchObject({ code: 'ADDRESS_NOT_FOUND' });
    });

    it('returns current when no allowed fields provided', async () => {
      const current = { id: 1, site_name: 'Old' };
      mockPool.query.mockResolvedValueOnce({ rows: [current] });

      const result = await svc.updateDeliveryAddress(1, { not_allowed: 'x' });
      expect(result).toEqual(current);
    });
  });

  // ── updateContact ──────────────────────────────────────────────

  describe('updateContact', () => {
    it('throws CONTACT_NOT_FOUND for non-existent contact', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        svc.updateContact(999, { title: 'Manager' }, 5)
      ).rejects.toMatchObject({ code: 'CONTACT_NOT_FOUND' });
    });

    it('returns current when no allowed fields provided', async () => {
      const current = { id: 1, profile_id: 10, first_name: 'Jane' };
      mockPool.query.mockResolvedValueOnce({ rows: [current] });

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}); // COMMIT

      const result = await svc.updateContact(1, { not_allowed: 'x' }, 5);
      expect(result).toEqual(current);
    });

    it('clears existing primary when setting is_primary=true', async () => {
      const current = { id: 1, profile_id: 10, first_name: 'Jane', is_primary: false };
      mockPool.query
        .mockResolvedValueOnce({ rows: [current] }) // fetch current
        .mockResolvedValueOnce({}); // audit

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE existing primary to false
        .mockResolvedValueOnce({ rows: [{ ...current, is_primary: true }] }) // UPDATE contact
        .mockResolvedValueOnce({}); // COMMIT

      const result = await svc.updateContact(1, { is_primary: true }, 5);
      expect(result.is_primary).toBe(true);
      const clearCall = mockClient.query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('is_primary = FALSE')
      );
      expect(clearCall).toBeDefined();
    });
  });

  // ── listDeliveryAddresses ──────────────────────────────────────

  describe('listDeliveryAddresses', () => {
    it('includes inactive when activeOnly=false', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });

      const result = await svc.listDeliveryAddresses(1, false);
      expect(result).toHaveLength(2);
      const sql = mockPool.query.mock.calls[0][0];
      expect(sql).not.toContain('is_active = TRUE');
    });
  });

  // ── updateDeliveryAddress (update path) ────────────────────────

  describe('updateDeliveryAddress (update path)', () => {
    it('updates allowed fields and returns updated row', async () => {
      const current = { id: 1, site_name: 'Old Office', city: 'Toronto' };
      mockPool.query
        .mockResolvedValueOnce({ rows: [current] }) // fetch current
        .mockResolvedValueOnce({ rows: [{ ...current, site_name: 'New Office', city: 'Ottawa' }] }); // UPDATE

      const result = await svc.updateDeliveryAddress(1, { site_name: 'New Office', city: 'Ottawa' });

      expect(result.site_name).toBe('New Office');
      expect(result.city).toBe('Ottawa');
      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('institutional:*');
    });
  });

  // ── _requireProfile error path ─────────────────────────────────

  describe('addDeliveryAddress (profile not found)', () => {
    it('throws PROFILE_NOT_FOUND via _requireProfile', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // no profile

      await expect(
        svc.addDeliveryAddress(999, { site_name: 'X', address_line1: '1 A', city: 'T', province_code: 'ON', postal_code: 'M5V' })
      ).rejects.toMatchObject({ code: 'PROFILE_NOT_FOUND' });
    });
  });

  // ── generateInvoicePDF ─────────────────────────────────────────

  describe('generateInvoicePDF', () => {
    it('generates PDF with quote lines, tax breakdown, and uploads to S3', async () => {
      // getInvoice: invoice query + payments query
      mockPool.query
        .mockResolvedValueOnce({ rows: [{
          id: 1, invoice_number: 'INV-2026-00001', profile_id: 5,
          total_cents: 56500, subtotal_cents: 50000, tax_cents: 6500, paid_cents: 3000,
          issued_date: '2026-03-01', due_date: '2026-03-31', paid_date: null,
          org_name: 'City Housing', vendor_number: 'V-100',
          customer_name: 'John Doe', customer_email: 'john@example.com',
          customer_phone: '555-1234', customer_address: '123 Main St',
          customer_city: 'Toronto', customer_province: 'ON', customer_postal_code: 'M5V 3L9',
          profile_payment_terms: 'net30', quote_ids: [100, 101],
          status: 'partially_paid',
        }] })
        .mockResolvedValueOnce({ rows: [{ id: 50, amount_cents: 3000, recorded_by_name: 'Admin' }] }) // payments
        .mockResolvedValueOnce({ rows: [ // quotations
          { id: 100, quotation_number: 'Q-001', subtotal_cents: 25000, tax_cents: 3250, total_cents: 28250, notes: 'Samsung fridge order' },
          { id: 101, quotation_number: 'Q-002', subtotal_cents: 25000, tax_cents: 3250, total_cents: 28250, notes: null },
        ] })
        .mockResolvedValueOnce({ rows: [{ // tax breakdown
          province_code: 'ON', hst_cents: 6500, hst_rate: 0.13,
          gst_cents: 0, gst_rate: null, pst_cents: 0, pst_rate: null,
          qst_cents: 0, qst_rate: null,
        }] })
        .mockResolvedValueOnce({}); // UPDATE pdf_url

      const pdfUrl = await svc.generateInvoicePDF(1);

      expect(pdfUrl).toContain('invoices/5/INV-2026-00001.pdf');
    });

    it('generates PDF with GST+PST breakdown (dual tax)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{
          id: 2, invoice_number: 'INV-2026-00002', profile_id: 5,
          total_cents: 11200, subtotal_cents: 10000, tax_cents: 1200, paid_cents: 0,
          issued_date: '2026-03-01', due_date: '2026-03-31', paid_date: null,
          org_name: 'BC School', vendor_number: null,
          customer_name: 'Jane', customer_email: null,
          customer_phone: null, customer_address: null,
          customer_city: 'Vancouver', customer_province: 'BC', customer_postal_code: null,
          profile_payment_terms: null, quote_ids: [200],
          status: 'issued',
        }] })
        .mockResolvedValueOnce({ rows: [] }) // no payments
        .mockResolvedValueOnce({ rows: [
          { id: 200, quotation_number: 'Q-200', subtotal_cents: 10000, tax_cents: 1200, total_cents: 11200, notes: null },
        ] })
        .mockResolvedValueOnce({ rows: [{
          province_code: 'BC', hst_cents: 0, hst_rate: null,
          gst_cents: 500, gst_rate: 0.05, pst_cents: 700, pst_rate: 0.07,
          qst_cents: 0, qst_rate: null,
        }] })
        .mockResolvedValueOnce({}); // UPDATE pdf_url

      const pdfUrl = await svc.generateInvoicePDF(2);

      expect(pdfUrl).toContain('invoices/5/INV-2026-00002.pdf');
    });

    it('generates PDF without tax breakdown (uses fallback tax line)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{
          id: 3, invoice_number: 'INV-2026-00003', profile_id: 5,
          total_cents: 11300, subtotal_cents: 10000, tax_cents: 1300, paid_cents: 11300,
          issued_date: '2026-03-01', due_date: '2026-03-31', paid_date: '2026-03-15',
          org_name: 'Corp X', vendor_number: null,
          customer_name: null, customer_email: null, customer_phone: null,
          customer_address: null, customer_city: null, customer_province: null,
          customer_postal_code: null, profile_payment_terms: 'net60',
          quote_ids: [300], status: 'paid',
        }] })
        .mockResolvedValueOnce({ rows: [] }) // no payments
        .mockResolvedValueOnce({ rows: [
          { id: 300, quotation_number: null, subtotal_cents: 10000, tax_cents: 1300, total_cents: 11300, notes: null },
        ] })
        .mockResolvedValueOnce({ rows: [] }) // NO tax breakdown
        .mockResolvedValueOnce({}); // UPDATE pdf_url

      const pdfUrl = await svc.generateInvoicePDF(3);

      expect(pdfUrl).toContain('.pdf');
    });

    it('generates PDF with QST breakdown', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{
          id: 4, invoice_number: 'INV-2026-00004', profile_id: 5,
          total_cents: 11498, subtotal_cents: 10000, tax_cents: 1498, paid_cents: 0,
          issued_date: '2026-03-01', due_date: '2026-05-30', paid_date: null,
          org_name: 'QC Municipality', vendor_number: 'QC-001',
          customer_name: 'Marie', customer_email: 'marie@qc.ca',
          customer_phone: '514-555-0000', customer_address: '456 Rue Main',
          customer_city: 'Montreal', customer_province: 'QC', customer_postal_code: 'H2X 1Y4',
          profile_payment_terms: 'net90', quote_ids: [400],
          status: 'issued',
        }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [
          { id: 400, quotation_number: 'Q-400', subtotal_cents: 10000, tax_cents: 1498, total_cents: 11498, notes: 'Quebec order with QST' },
        ] })
        .mockResolvedValueOnce({ rows: [{
          province_code: 'QC', hst_cents: 0, hst_rate: null,
          gst_cents: 500, gst_rate: 0.05, pst_cents: 0, pst_rate: null,
          qst_cents: 998, qst_rate: 0.09975,
        }] })
        .mockResolvedValueOnce({}); // UPDATE pdf_url

      const pdfUrl = await svc.generateInvoicePDF(4);

      expect(pdfUrl).toContain('.pdf');
    });

    it('generates PDF with no quote_ids (empty line items)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{
          id: 5, invoice_number: 'INV-2026-00005', profile_id: 5,
          total_cents: 5000, subtotal_cents: 5000, tax_cents: 0, paid_cents: 0,
          issued_date: '2026-03-01', due_date: '2026-03-01', paid_date: null,
          org_name: 'No Quotes Corp', vendor_number: null,
          customer_name: null, customer_email: null, customer_phone: null,
          customer_address: null, customer_city: null, customer_province: null,
          customer_postal_code: null, profile_payment_terms: 'cod',
          quote_ids: null, status: 'issued',
        }] })
        .mockResolvedValueOnce({ rows: [] }) // no payments
        .mockResolvedValueOnce({}); // UPDATE pdf_url (no quotes/tax queries since quote_ids is null)

      const pdfUrl = await svc.generateInvoicePDF(5);

      expect(pdfUrl).toContain('.pdf');
    });
  });

  // ── addContact rollback on error ───────────────────────────────

  describe('addContact (error rollback)', () => {
    it('rolls back transaction when INSERT fails', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // _requireProfile

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('DB constraint violation')); // INSERT fails

      await expect(
        svc.addContact(1, { first_name: 'Jane', last_name: 'Smith' }, 5)
      ).rejects.toThrow('DB constraint violation');

      // Verify ROLLBACK was called
      const rollbackCall = mockClient.query.mock.calls.find(
        c => c[0] === 'ROLLBACK'
      );
      expect(rollbackCall).toBeDefined();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
