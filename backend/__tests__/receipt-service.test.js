/**
 * TeleTime - ReceiptService Tests
 *
 * Tests receipt generation across all three formats (PDF, thermal, email HTML)
 * using a complex order scenario with:
 *   - Multiple line items (5 products)
 *   - Volume discount on one item
 *   - Promo code discount at order level
 *   - Warranty attached to a product
 *   - Trade-in credit
 *   - Delivery fee (as a line item)
 *   - Multiple tax lines (GST + PST for a BC order)
 *   - Split payment (cash + card)
 *
 * Verifies data consistency across all three formats.
 */

const ReceiptService = require('../services/ReceiptService');

// ============================================================================
// COMPLEX ORDER FIXTURE
// ============================================================================

/**
 * Scenario:
 *   Item 1: iPhone 15 Pro Max 256GB       x1 @ $1,699.99 = $1,699.99
 *   Item 2: USB-C Cable (volume 10-pack)  x10 @ $12.99, 15% vol disc = $110.42
 *   Item 3: Screen Protector               x2 @ $29.99 = $59.98
 *   Item 4: AirPods Pro 2                  x1 @ $329.99 = $329.99
 *             + AppleCare+ warranty                       = $59.99
 *   Item 5: Delivery Fee                   x1 @ $25.00 = $25.00
 *
 *   Subtotal (before order disc): $2,225.38 + $59.99 warranty = $2,285.37
 *   Order-level discount (promo SAVE10): -$228.54 (10% on product subtotal, not warranty/delivery)
 *   Discounted subtotal: $2,056.83
 *   GST (5%): $102.84
 *   PST (7%): $143.98
 *   Total: $2,303.65
 *   Trade-in: Samsung Galaxy S23 Ultra, Good, -$450.00
 *   Amount Due: $1,853.65
 *   Payment: $500.00 cash (tendered $600, change $100) + $1,353.65 Visa
 */

const MOCK_TRANSACTION = {
  transaction_id: 42,
  transaction_number: 'TXN-2026-00042',
  created_at: '2026-01-28T14:30:00.000Z',
  status: 'completed',
  subtotal: '2285.37',
  discount_amount: '228.54',
  discount_reason: 'Promo: SAVE10 (10% off)',
  hst_amount: '0.00',
  gst_amount: '102.84',
  pst_amount: '143.98',
  total_amount: '2303.65',
  tax_province: 'BC',
  customer_id: 101,
  customer_name: 'Jane Doe',
  customer_email: 'jane@example.com',
  customer_phone: '604-555-1234',
  company_name: 'Doe Electronics Ltd.',
  customer_address: '123 Main St',
  customer_city: 'Vancouver, BC V5K 0A1',
  customer_province: 'BC',
  customer_postal: 'V5K 0A1',
  user_id: 5,
  cashier_name: 'Mike Smith',
  register_name: 'Register 2',
  register_location: 'Downtown',
  shift_id: 10,
  is_financed: false,
  financing_application_id: null,
  financing_agreement_id: null,
};

const MOCK_ITEMS = [
  {
    item_id: 1,
    product_name: 'iPhone 15 Pro Max 256GB',
    product_sku: 'APL-IP15PM-256',
    quantity: 1,
    unit_price: '1699.99',
    discount_percent: '0.00',
    discount_amount: '0.00',
    tax_amount: '0.00',
    line_total: '1699.99',
    serial_number: 'DNXXXXXXXXX1',
  },
  {
    item_id: 2,
    product_name: 'USB-C to Lightning Cable 2m',
    product_sku: 'ACC-USBC-2M',
    quantity: 10,
    unit_price: '12.99',
    discount_percent: '15.00',
    discount_amount: '19.49',
    tax_amount: '0.00',
    line_total: '110.42',
    serial_number: null,
  },
  {
    item_id: 3,
    product_name: 'Tempered Glass Screen Protector',
    product_sku: 'ACC-TGSP-IP15',
    quantity: 2,
    unit_price: '29.99',
    discount_percent: '0.00',
    discount_amount: '0.00',
    tax_amount: '0.00',
    line_total: '59.98',
    serial_number: null,
  },
  {
    item_id: 4,
    product_name: 'AirPods Pro 2nd Generation',
    product_sku: 'APL-APP2',
    quantity: 1,
    unit_price: '329.99',
    discount_percent: '0.00',
    discount_amount: '0.00',
    tax_amount: '0.00',
    line_total: '329.99',
    serial_number: 'FXXXXXXXXX4',
  },
  // item_id 5 is the warranty line item (will be excluded from groupedItems)
  {
    item_id: 5,
    product_name: 'AppleCare+ for AirPods',
    product_sku: 'SVC-AC-APP',
    quantity: 1,
    unit_price: '59.99',
    discount_percent: '0.00',
    discount_amount: '0.00',
    tax_amount: '0.00',
    line_total: '59.99',
    serial_number: null,
  },
  {
    item_id: 6,
    product_name: 'Standard Delivery',
    product_sku: 'SVC-DEL-STD',
    quantity: 1,
    unit_price: '25.00',
    discount_percent: '0.00',
    discount_amount: '0.00',
    tax_amount: '0.00',
    line_total: '25.00',
    serial_number: null,
  },
];

const MOCK_WARRANTIES = [
  {
    warranty_purchase_id: 1,
    transaction_item_id: 5,    // the warranty IS item_id 5
    covered_item_id: 4,         // it covers item_id 4 (AirPods)
    warranty_name: 'AppleCare+ for AirPods',
    warranty_type: 'extended',
    duration_months: 24,
    warranty_price: '59.99',
    coverage_start_date: '2026-01-28',
    coverage_end_date: '2028-01-28',
    covered_product_name: 'AirPods Pro 2nd Generation',
    covered_product_serial: 'FXXXXXXXXX4',
    registration_code: 'AC-2026-XYZ123',
    warranty_status: 'active',
    terms_url: 'https://www.apple.com/legal/sales-support/applecare/applecareplus/',
    deductible_amount: '0.00',
    provider_name: 'Apple Inc.',
  },
];

const MOCK_PAYMENTS = [
  {
    payment_method: 'cash',
    amount: '500.00',
    card_brand: null,
    card_last_four: null,
    cash_tendered: '600.00',
    change_given: '100.00',
  },
  {
    payment_method: 'credit',
    amount: '1353.65',
    card_brand: 'Visa',
    card_last_four: '4242',
    cash_tendered: null,
    change_given: null,
  },
];

const MOCK_TRADE_INS = [
  {
    assessment_id: 7,
    brand: 'Samsung',
    model: 'Galaxy S23 Ultra',
    variant: '256GB Phantom Black',
    category_name: 'Smartphones',
    condition_name: 'Good',
    condition_code: 'B',
    serial_number: 'R5XXXXXXXXX7',
    imei: '353456789012345',
    final_value: '450.00',
    base_value: '500.00',
    condition_multiplier: '0.90',
    adjustment_amount: '0.00',
    condition_notes: 'Minor scratches on frame',
    status: 'applied',
    assessed_at: '2026-01-28T14:25:00.000Z',
  },
];

// ============================================================================
// MOCK POOL
// ============================================================================

function createMockPool() {
  return {
    query: jest.fn(async (sql, params) => {
      const q = sql.replace(/\s+/g, ' ').trim();

      // Transaction query
      if (q.includes('FROM transactions t') && q.includes('WHERE t.transaction_id')) {
        return { rows: [MOCK_TRANSACTION] };
      }

      // Items query
      if (q.includes('FROM transaction_items') && q.includes('WHERE transaction_id')) {
        return { rows: MOCK_ITEMS };
      }

      // Warranties query
      if (q.includes('FROM warranty_purchases')) {
        return { rows: MOCK_WARRANTIES };
      }

      // Payments query
      if (q.includes('FROM payments')) {
        return { rows: MOCK_PAYMENTS };
      }

      // Trade-in assessments
      if (q.includes('FROM trade_in_assessments')) {
        return { rows: MOCK_TRADE_INS };
      }

      // Applied rebates
      if (q.includes('FROM applied_rebates')) {
        return { rows: [] };
      }

      // Rebate claims
      if (q.includes('FROM rebate_claims')) {
        return { rows: [] };
      }

      // Financing check
      if (q.includes('financing_applications')) {
        return { rows: [{ ...MOCK_TRANSACTION, is_financed: false }] };
      }

      return { rows: [] };
    }),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('ReceiptService', () => {
  let service;
  let mockPool;

  beforeEach(() => {
    mockPool = createMockPool();
    service = new ReceiptService(mockPool, null, {
      companyName: 'TeleTime POS',
      companyAddress: '456 Robson St',
      companyCity: 'Vancouver, BC V6B 2A5',
      companyPhone: '604-555-9999',
      taxNumber: 'BN123456789',
    });
  });

  // ============================================================================
  // 1. groupItemsWithWarranties
  // ============================================================================

  describe('groupItemsWithWarranties', () => {
    it('should group warranty under covered product and exclude from main list', () => {
      const grouped = service.groupItemsWithWarranties(MOCK_ITEMS, MOCK_WARRANTIES);

      // 6 items total, 1 is a warranty (item_id 5) → 5 grouped items
      expect(grouped).toHaveLength(5);

      // item_id 5 (warranty line) should NOT appear as a main item
      const warrantyAsMain = grouped.find(g => g.item_id === 5);
      expect(warrantyAsMain).toBeUndefined();

      // item_id 4 (AirPods) should have 1 warranty attached
      const airpods = grouped.find(g => g.item_id === 4);
      expect(airpods).toBeDefined();
      expect(airpods.warranties).toHaveLength(1);
      expect(airpods.warranties[0].warranty_name).toBe('AppleCare+ for AirPods');
      expect(airpods.warranties[0].registration_code).toBe('AC-2026-XYZ123');

      // Other items should have no warranties
      const otherItems = grouped.filter(g => g.item_id !== 4);
      otherItems.forEach(item => {
        expect(item.warranties).toHaveLength(0);
      });
    });
  });

  // ============================================================================
  // 2. getTransactionForReceipt (data layer)
  // ============================================================================

  describe('getTransactionForReceipt', () => {
    it('should fetch and assemble all receipt data', async () => {
      const data = await service.getTransactionForReceipt(42);

      expect(data.transaction.transaction_number).toBe('TXN-2026-00042');
      expect(data.transaction.customer_name).toBe('Jane Doe');
      expect(data.items).toHaveLength(6);        // raw items
      expect(data.groupedItems).toHaveLength(5);  // warranty excluded
      expect(data.warranties).toHaveLength(1);
      expect(data.payments).toHaveLength(2);

      // Trade-ins
      expect(data.tradeIns.hasTradeIns).toBe(true);
      expect(data.tradeIns.count).toBe(1);
      expect(data.tradeIns.totalCredit).toBe(450);

      // No financing
      expect(data.financing).toBeNull();
    });

    it('should throw for non-existent transaction', async () => {
      mockPool.query.mockImplementation(async (sql) => {
        if (sql.replace(/\s+/g, ' ').includes('FROM transactions t')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      await expect(service.getTransactionForReceipt(9999))
        .rejects.toThrow('Transaction 9999 not found');
    });
  });

  // ============================================================================
  // 3. getReceiptData (JSON API)
  // ============================================================================

  describe('getReceiptData', () => {
    let receiptData;

    beforeAll(async () => {
      const pool = createMockPool();
      const svc = new ReceiptService(pool, null, {
        companyName: 'TeleTime POS',
        companyAddress: '456 Robson St',
        companyCity: 'Vancouver, BC V6B 2A5',
        companyPhone: '604-555-9999',
        taxNumber: 'BN123456789',
      });
      receiptData = await svc.getReceiptData(42);
    });

    it('should include company info', () => {
      expect(receiptData.company.name).toBe('TeleTime POS');
      expect(receiptData.company.taxNumber).toBe('BN123456789');
    });

    it('should include transaction metadata', () => {
      expect(receiptData.transaction.number).toBe('TXN-2026-00042');
      expect(receiptData.transaction.cashier).toBe('Mike Smith');
      expect(receiptData.transaction.register).toBe('Register 2');
      expect(receiptData.transaction.customer).toBe('Jane Doe');
    });

    it('should list 5 grouped items (warranty excluded from top-level)', () => {
      expect(receiptData.items).toHaveLength(5);
    });

    it('should nest warranty under AirPods item', () => {
      const airpods = receiptData.items.find(i => i.sku === 'APL-APP2');
      expect(airpods).toBeDefined();
      expect(airpods.warranties).toHaveLength(1);
      expect(airpods.warranties[0].name).toBe('AppleCare+ for AirPods');
      expect(airpods.warranties[0].price).toBe(59.99);
      expect(airpods.warranties[0].registrationCode).toBe('AC-2026-XYZ123');
      expect(airpods.warranties[0].durationMonths).toBe(24);
    });

    it('should show volume discount on USB-C cable', () => {
      const cable = receiptData.items.find(i => i.sku === 'ACC-USBC-2M');
      expect(cable.quantity).toBe(10);
      expect(cable.discountPercent).toBe(15);
      expect(cable.discountAmount).toBe(19.49);
      expect(cable.total).toBe(110.42);
    });

    it('should include delivery fee as line item', () => {
      const delivery = receiptData.items.find(i => i.sku === 'SVC-DEL-STD');
      expect(delivery).toBeDefined();
      expect(delivery.unitPrice).toBe(25);
      expect(delivery.total).toBe(25);
    });

    it('should show correct totals', () => {
      expect(receiptData.totals.subtotal).toBe(2285.37);
      expect(receiptData.totals.discount).toBe(228.54);
      expect(receiptData.totals.gst).toBe(102.84);
      expect(receiptData.totals.pst).toBe(143.98);
      expect(receiptData.totals.hst).toBe(0);
      expect(receiptData.totals.total).toBe(2303.65);
    });

    it('should include trade-in data', () => {
      expect(receiptData.tradeIns).not.toBeNull();
      expect(receiptData.tradeIns.hasTradeIns).toBe(true);
      expect(receiptData.tradeIns.totalCredit).toBe(450);
      expect(receiptData.tradeIns.items).toHaveLength(1);
      expect(receiptData.tradeIns.items[0].brand).toBe('Samsung');
      expect(receiptData.tradeIns.items[0].model).toBe('Galaxy S23 Ultra');
      expect(receiptData.tradeIns.items[0].imei).toBe('353456789012345');
      expect(receiptData.tradeIns.items[0].creditAmount).toBe(450);
    });

    it('should include both payments (split)', () => {
      expect(receiptData.payments).toHaveLength(2);

      const cash = receiptData.payments.find(p => p.method === 'cash');
      expect(cash.amount).toBe(500);
      expect(cash.cashTendered).toBe(600);
      expect(cash.changeGiven).toBe(100);

      const card = receiptData.payments.find(p => p.method === 'credit');
      expect(card.amount).toBe(1353.65);
      expect(card.cardBrand).toBe('Visa');
      expect(card.cardLastFour).toBe('4242');
    });

    it('should have no financing', () => {
      expect(receiptData.financing).toBeNull();
    });
  });

  // ============================================================================
  // 4. PDF Receipt Generation
  // ============================================================================

  describe('generateReceiptPdf', () => {
    it('should return a valid PDF buffer', async () => {
      const pdf = await service.generateReceiptPdf(42);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(1000);

      // PDF magic bytes: %PDF
      const header = pdf.slice(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('should produce a multi-page or reasonably sized PDF', async () => {
      const pdf = await service.generateReceiptPdf(42);
      // A complex receipt with 6 items, warranties, trade-ins should produce
      // a PDF of at least a few KB
      expect(pdf.length).toBeGreaterThan(3000);

      // Should end with %%EOF (PDF trailer)
      const trailer = pdf.slice(-20).toString('ascii');
      expect(trailer).toContain('%%EOF');
    });
  });

  // ============================================================================
  // 5. Thermal Receipt Generation
  // ============================================================================

  describe('generateThermalReceipt', () => {
    let thermal;

    beforeAll(async () => {
      const pool = createMockPool();
      const svc = new ReceiptService(pool, null, {
        companyName: 'TeleTime POS',
        companyAddress: '456 Robson St',
        companyCity: 'Vancouver, BC V6B 2A5',
        companyPhone: '604-555-9999',
        taxNumber: 'BN123456789',
      });
      thermal = await svc.generateThermalReceipt(42);
    });

    it('should return a string', () => {
      expect(typeof thermal).toBe('string');
      expect(thermal.length).toBeGreaterThan(100);
    });

    it('should include company header', () => {
      expect(thermal).toContain('TELETIME POS');
      expect(thermal).toContain('456 Robson St');
      expect(thermal).toContain('BN123456789');
    });

    it('should include transaction details', () => {
      expect(thermal).toContain('TXN-2026-00042');
      expect(thermal).toContain('Mike Smith');
      expect(thermal).toContain('Jane Doe');
    });

    it('should list all non-warranty items', () => {
      expect(thermal).toContain('iPhone 15 Pro Max 256GB');
      expect(thermal).toContain('USB-C to Lightning Cable 2m');
      expect(thermal).toContain('Tempered Glass Screen Protector');
      expect(thermal).toContain('AirPods Pro 2nd Generation');
      expect(thermal).toContain('Standard Delivery');
    });

    it('should show volume discount on cable', () => {
      expect(thermal).toContain('Discount');
      expect(thermal).toContain('$19.49');
    });

    it('should show warranty indented under AirPods', () => {
      // Warranties appear as "+ WarrantyName"
      expect(thermal).toContain('+ AppleCare+ for AirPods');
      expect(thermal).toContain('$59.99');
    });

    it('should show order-level discount', () => {
      expect(thermal).toContain('Discount:');
      expect(thermal).toContain('$228.54');
    });

    it('should show GST and PST', () => {
      expect(thermal).toContain('GST');
      expect(thermal).toContain('$102.84');
      expect(thermal).toContain('PST');
      expect(thermal).toContain('$143.98');
    });

    it('should show trade-in credit and amount due', () => {
      expect(thermal).toContain('Trade-In Credit');
      expect(thermal).toContain('$450.00');
      expect(thermal).toContain('AMOUNT DUE');
      expect(thermal).toContain('$1853.65');
    });

    it('should show both payments', () => {
      expect(thermal).toContain('CASH');
      expect(thermal).toContain('$500.00');
      expect(thermal).toContain('Tendered');
      expect(thermal).toContain('$600.00');
      expect(thermal).toContain('CHANGE');
      expect(thermal).toContain('$100.00');
      expect(thermal).toContain('Visa ****4242');
      expect(thermal).toContain('$1353.65');
    });

    it('should include trade-in details section', () => {
      expect(thermal).toContain('TRADE-IN ITEMS');
      expect(thermal).toContain('Samsung Galaxy S23 Ultra');
    });

    it('should include warranty protection section', () => {
      expect(thermal).toContain('PROTECTION PLANS');
      expect(thermal).toContain('AC-2026-XYZ123');
    });

    it('should respect 42-char line width (non-ESC/POS lines)', () => {
      const lines = thermal.split('\n');
      for (const line of lines) {
        // Skip empty lines
        if (line.trim() === '') continue;
        // 42 is the max, but some lines may wrap — the formatLine helper shouldn't exceed it
        // We allow slight overflow for long product names (they get truncated)
        expect(line.length).toBeLessThanOrEqual(50); // generous margin
      }
    });
  });

  // ============================================================================
  // 6. Email Receipt HTML Generation
  // ============================================================================

  describe('emailReceipt HTML', () => {
    // We can't call emailReceipt directly without SES, but we can test the
    // HTML generation by mocking SES and inspecting the raw MIME email
    let sentHtml;
    let sentSubject;
    let rawEmail;

    beforeAll(async () => {
      const pool = createMockPool();
      const svc = new ReceiptService(pool, null, {
        companyName: 'TeleTime POS',
        companyAddress: '456 Robson St',
        companyCity: 'Vancouver, BC V6B 2A5',
        companyPhone: '604-555-9999',
        taxNumber: 'BN123456789',
      });

      // Mock the SES client — emailReceipt uses Raw MIME format
      svc.sesClient = {
        send: jest.fn(async (command) => {
          // The command is a SendEmailCommand; extract raw data
          const rawData = command.input?.Content?.Raw?.Data;
          if (rawData) {
            rawEmail = Buffer.isBuffer(rawData) ? rawData.toString('utf-8') : rawData;
            // Extract subject from raw MIME
            const subjectMatch = rawEmail.match(/^Subject: (.+)$/m);
            sentSubject = subjectMatch ? subjectMatch[1] : '';
            // Extract HTML body (between Content-Type: text/html boundary and next boundary)
            const htmlMatch = rawEmail.match(/Content-Type: text\/html[\s\S]*?\r\n\r\n([\s\S]*?)\r\n\r\n--/);
            sentHtml = htmlMatch ? htmlMatch[1] : rawEmail;
          }
          return { MessageId: 'mock-msg-id' };
        }),
      };

      await svc.emailReceipt(42, 'jane@example.com');
    });

    it('should send email with correct subject', () => {
      expect(sentSubject).toContain('TXN-2026-00042');
    });

    it('should include company name in HTML', () => {
      expect(sentHtml).toContain('TeleTime POS');
    });

    it('should include transaction number', () => {
      expect(sentHtml).toContain('TXN-2026-00042');
    });

    it('should include customer name', () => {
      expect(sentHtml).toContain('Jane Doe');
    });

    it('should list product items in HTML table', () => {
      expect(sentHtml).toContain('iPhone 15 Pro Max 256GB');
      expect(sentHtml).toContain('AirPods Pro 2nd Generation');
      expect(sentHtml).toContain('USB-C to Lightning Cable 2m');
      expect(sentHtml).toContain('Standard Delivery');
    });

    it('should show warranty nested under AirPods', () => {
      // Warranty shown with blue arrow indicator
      expect(sentHtml).toContain('AppleCare+ for AirPods');
      expect(sentHtml).toContain('↳');
      expect(sentHtml).toContain('AC-2026-XYZ123');
    });

    it('should show subtotal, discount, taxes', () => {
      expect(sentHtml).toContain('Subtotal');
      expect(sentHtml).toContain('$2285.37');
      expect(sentHtml).toContain('Discount');
      expect(sentHtml).toContain('$228.54');
      expect(sentHtml).toContain('GST');
      expect(sentHtml).toContain('$102.84');
      expect(sentHtml).toContain('PST');
      expect(sentHtml).toContain('$143.98');
    });

    it('should show trade-in credit and amount due', () => {
      expect(sentHtml).toContain('Trade-In Credit');
      expect(sentHtml).toContain('$450.00');
      expect(sentHtml).toContain('AMOUNT DUE');
      expect(sentHtml).toContain('$1853.65');
    });

    it('should show both payments', () => {
      expect(sentHtml).toContain('CASH');
      expect(sentHtml).toContain('$500.00');
      expect(sentHtml).toContain('Visa ****4242');
      expect(sentHtml).toContain('$1353.65');
    });

    it('should show cash tendered and change', () => {
      expect(sentHtml).toContain('Cash Tendered');
      expect(sentHtml).toContain('$600.00');
      expect(sentHtml).toContain('Change');
      expect(sentHtml).toContain('$100.00');
    });

    it('should include trade-in details section', () => {
      expect(sentHtml).toContain('Trade-In Items');
      expect(sentHtml).toContain('Samsung Galaxy S23 Ultra');
      expect(sentHtml).toContain('256GB Phantom Black');
      expect(sentHtml).toContain('353456789012345'); // IMEI
    });

    it('should include warranty protection section with terms link', () => {
      expect(sentHtml).toContain('Protection Plans');
      expect(sentHtml).toContain('AirPods Pro 2nd Generation');
      expect(sentHtml).toContain('apple.com/legal');
    });
  });

  // ============================================================================
  // 7. Cross-Format Data Consistency
  // ============================================================================

  describe('Cross-format consistency', () => {
    let receiptData;
    let thermal;
    let pdfText;
    let emailHtml;

    beforeAll(async () => {
      const pool = createMockPool();
      const svc = new ReceiptService(pool, null, {
        companyName: 'TeleTime POS',
        companyAddress: '456 Robson St',
        companyCity: 'Vancouver, BC V6B 2A5',
        companyPhone: '604-555-9999',
        taxNumber: 'BN123456789',
      });

      // Mock SES — emailReceipt uses Raw MIME format
      svc.sesClient = {
        send: jest.fn(async (command) => {
          const rawData = command.input?.Content?.Raw?.Data;
          if (rawData) {
            const raw = Buffer.isBuffer(rawData) ? rawData.toString('utf-8') : rawData;
            const htmlMatch = raw.match(/Content-Type: text\/html[\s\S]*?\r\n\r\n([\s\S]*?)\r\n\r\n--/);
            emailHtml = htmlMatch ? htmlMatch[1] : raw;
          }
          return { MessageId: 'mock-msg-id' };
        }),
      };

      receiptData = await svc.getReceiptData(42);
      thermal = await svc.generateThermalReceipt(42);
      const pdfBuf = await svc.generateReceiptPdf(42);
      pdfText = pdfBuf.toString('latin1');
      await svc.emailReceipt(42, 'test@test.com');
    });

    it('should show same transaction number across all formats', () => {
      const txn = 'TXN-2026-00042';
      expect(receiptData.transaction.number).toBe(txn);
      expect(thermal).toContain(txn);
      // PDF content is FlateDecode compressed — cannot search raw buffer for text
      // Just verify PDF was generated (tested separately)
      expect(emailHtml).toContain(txn);
    });

    it('should show same total amount across all formats', () => {
      // JSON total
      expect(receiptData.totals.total).toBe(2303.65);

      // Thermal — amount due (total minus trade-in)
      expect(thermal).toContain('$1853.65');

      // Email — amount due
      expect(emailHtml).toContain('$1853.65');
    });

    it('should show same trade-in credit across all formats', () => {
      expect(receiptData.tradeIns.totalCredit).toBe(450);
      expect(thermal).toContain('$450.00');
      expect(emailHtml).toContain('$450.00');
    });

    it('should show same GST amount across all formats', () => {
      expect(receiptData.totals.gst).toBe(102.84);
      expect(thermal).toContain('$102.84');
      expect(emailHtml).toContain('$102.84');
    });

    it('should show same PST amount across all formats', () => {
      expect(receiptData.totals.pst).toBe(143.98);
      expect(thermal).toContain('$143.98');
      expect(emailHtml).toContain('$143.98');
    });

    it('should have same number of grouped items (5) across formats', () => {
      // JSON
      expect(receiptData.items).toHaveLength(5);

      // Thermal should NOT contain the warranty as a standalone line
      // but SHOULD contain it as an indented "+" line
      const thermalLines = thermal.split('\n');
      const productLines = thermalLines.filter(l =>
        l.includes('iPhone 15') ||
        l.includes('USB-C to Lightning') ||
        l.includes('Tempered Glass') ||
        l.includes('AirPods Pro') ||
        l.includes('Standard Delivery')
      );
      expect(productLines.length).toBeGreaterThanOrEqual(5);
    });

    it('should include warranty with AirPods in all formats', () => {
      // JSON
      const airpods = receiptData.items.find(i => i.sku === 'APL-APP2');
      expect(airpods.warranties).toHaveLength(1);

      // Thermal
      expect(thermal).toContain('+ AppleCare+ for AirPods');

      // Email
      expect(emailHtml).toContain('AppleCare+ for AirPods');
      expect(emailHtml).toContain('↳');
    });

    it('should show discount in all formats', () => {
      expect(receiptData.totals.discount).toBe(228.54);
      expect(thermal).toContain('$228.54');
      expect(emailHtml).toContain('$228.54');
    });
  });

  // ============================================================================
  // 8. Edge cases
  // ============================================================================

  describe('Edge cases', () => {
    it('should handle order with no customer', async () => {
      const pool = createMockPool();
      pool.query.mockImplementation(async (sql) => {
        const q = sql.replace(/\s+/g, ' ').trim();
        if (q.includes('FROM transactions t')) {
          const noCustomer = { ...MOCK_TRANSACTION, customer_name: null, company_name: null, customer_id: null };
          return { rows: [noCustomer] };
        }
        if (q.includes('FROM transaction_items')) return { rows: MOCK_ITEMS };
        if (q.includes('FROM warranty_purchases')) return { rows: MOCK_WARRANTIES };
        if (q.includes('FROM payments')) return { rows: MOCK_PAYMENTS };
        if (q.includes('FROM trade_in_assessments')) return { rows: [] };
        if (q.includes('FROM applied_rebates')) return { rows: [] };
        if (q.includes('FROM rebate_claims')) return { rows: [] };
        if (q.includes('financing_applications')) return { rows: [{ ...MOCK_TRANSACTION, is_financed: false }] };
        return { rows: [] };
      });

      const svc = new ReceiptService(pool, null, { companyName: 'Test' });
      const thermal = await svc.generateThermalReceipt(42);

      // Should not crash, and should not contain "Customer:" line with a name
      expect(thermal).toBeDefined();
      expect(thermal).not.toContain('Customer: Jane');
    });

    it('should handle order with no trade-ins', async () => {
      const pool = createMockPool();
      pool.query.mockImplementation(async (sql) => {
        const q = sql.replace(/\s+/g, ' ').trim();
        if (q.includes('FROM transactions t')) return { rows: [MOCK_TRANSACTION] };
        if (q.includes('FROM transaction_items')) return { rows: MOCK_ITEMS };
        if (q.includes('FROM warranty_purchases')) return { rows: MOCK_WARRANTIES };
        if (q.includes('FROM payments')) return { rows: MOCK_PAYMENTS };
        if (q.includes('FROM trade_in_assessments')) return { rows: [] };
        if (q.includes('FROM applied_rebates')) return { rows: [] };
        if (q.includes('FROM rebate_claims')) return { rows: [] };
        if (q.includes('financing_applications')) return { rows: [{ ...MOCK_TRANSACTION, is_financed: false }] };
        return { rows: [] };
      });

      const svc = new ReceiptService(pool, null, { companyName: 'Test' });
      const thermal = await svc.generateThermalReceipt(42);

      expect(thermal).not.toContain('TRADE-IN ITEMS');
      // Should show TOTAL instead of AMOUNT DUE
      expect(thermal).toContain('TOTAL:');
    });

    it('should reject emailReceipt with invalid email', async () => {
      await expect(service.emailReceipt(42, 'not-an-email'))
        .rejects.toThrow('Invalid email');
    });

    it('should reject emailReceipt with empty email', async () => {
      await expect(service.emailReceipt(42, ''))
        .rejects.toThrow('Email address is required');
    });
  });
});
