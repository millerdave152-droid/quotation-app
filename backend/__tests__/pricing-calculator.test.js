/**
 * TeleTime - PricingCalculator Unit Tests
 *
 * Comprehensive tests for the shared pricing calculation service.
 * Covers edge cases: zero quantity, negative discounts, tax-exempt items,
 * volume breaks, customer tiers, and provincial tax variations.
 */

const PricingCalculator = require('../services/PricingCalculator');

describe('PricingCalculator', () => {
  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  describe('Helper Functions', () => {
    describe('roundCents', () => {
      it('should round to nearest integer', () => {
        expect(PricingCalculator.roundCents(100.4)).toBe(100);
        expect(PricingCalculator.roundCents(100.5)).toBe(101);
        expect(PricingCalculator.roundCents(100.6)).toBe(101);
      });

      it('should handle null and NaN', () => {
        expect(PricingCalculator.roundCents(null)).toBe(0);
        expect(PricingCalculator.roundCents(NaN)).toBe(0);
        expect(PricingCalculator.roundCents(undefined)).toBe(0);
      });
    });

    describe('dollarsToCents', () => {
      it('should convert dollars to cents correctly', () => {
        expect(PricingCalculator.dollarsToCents(1.00)).toBe(100);
        expect(PricingCalculator.dollarsToCents(19.99)).toBe(1999);
        expect(PricingCalculator.dollarsToCents(0.01)).toBe(1);
        expect(PricingCalculator.dollarsToCents(1234.56)).toBe(123456);
      });

      it('should handle floating point precision', () => {
        // 0.1 + 0.2 === 0.30000000000000004 in JS
        expect(PricingCalculator.dollarsToCents(0.1 + 0.2)).toBe(30);
      });

      it('should handle null and invalid values', () => {
        expect(PricingCalculator.dollarsToCents(null)).toBe(0);
        expect(PricingCalculator.dollarsToCents('abc')).toBe(0);
      });
    });

    describe('centsToDollars', () => {
      it('should convert cents to dollars correctly', () => {
        expect(PricingCalculator.centsToDollars(100)).toBe(1.00);
        expect(PricingCalculator.centsToDollars(1999)).toBe(19.99);
        expect(PricingCalculator.centsToDollars(1)).toBe(0.01);
      });
    });

    describe('formatCurrency', () => {
      it('should format cents as currency string', () => {
        expect(PricingCalculator.formatCurrency(100)).toBe('$1.00');
        expect(PricingCalculator.formatCurrency(1999)).toBe('$19.99');
        expect(PricingCalculator.formatCurrency(0)).toBe('$0.00');
        expect(PricingCalculator.formatCurrency(123456)).toBe('$1234.56');
      });
    });

    describe('validateNumber', () => {
      it('should accept valid numbers', () => {
        expect(PricingCalculator.validateNumber(100, 'Test')).toBe(100);
        expect(PricingCalculator.validateNumber(0, 'Test')).toBe(0);
        expect(PricingCalculator.validateNumber(99.5, 'Test')).toBe(99.5);
      });

      it('should reject null and NaN', () => {
        expect(() => PricingCalculator.validateNumber(null, 'Test'))
          .toThrow('Test must be a valid number');
        expect(() => PricingCalculator.validateNumber(NaN, 'Test'))
          .toThrow('Test must be a valid number');
      });

      it('should reject negative when not allowed', () => {
        expect(() => PricingCalculator.validateNumber(-10, 'Test'))
          .toThrow('Test cannot be negative');
      });

      it('should allow negative when specified', () => {
        expect(PricingCalculator.validateNumber(-10, 'Test', { allowNegative: true }))
          .toBe(-10);
      });

      it('should reject zero when not allowed', () => {
        expect(() => PricingCalculator.validateNumber(0, 'Test', { allowZero: false }))
          .toThrow('Test cannot be zero');
      });

      it('should enforce min/max bounds', () => {
        expect(() => PricingCalculator.validateNumber(5, 'Test', { min: 10 }))
          .toThrow('Test must be at least 10');
        expect(() => PricingCalculator.validateNumber(150, 'Test', { max: 100 }))
          .toThrow('Test must be at most 100');
      });
    });
  });

  // ============================================================================
  // VOLUME BREAK PRICING
  // ============================================================================

  describe('Volume Break Pricing', () => {
    const volumeBreaks = [
      { minQty: 5, discountPercent: 5 },
      { minQty: 10, discountPercent: 10 },
      { minQty: 25, priceCents: 8000 },  // Fixed price for bulk
      { minQty: 50, priceCents: 7500 },
    ];

    it('should return base price when no breaks apply', () => {
      const result = PricingCalculator.applyVolumeBreaks(10000, 3, volumeBreaks);
      expect(result.priceCents).toBe(10000);
      expect(result.appliedBreak).toBeNull();
    });

    it('should apply percentage discount break', () => {
      const result = PricingCalculator.applyVolumeBreaks(10000, 7, volumeBreaks);
      expect(result.priceCents).toBe(9500); // 5% off
      expect(result.appliedBreak.type).toBe('percentage');
      expect(result.appliedBreak.minQty).toBe(5);
    });

    it('should apply higher tier when quantity qualifies', () => {
      const result = PricingCalculator.applyVolumeBreaks(10000, 15, volumeBreaks);
      expect(result.priceCents).toBe(9000); // 10% off
      expect(result.appliedBreak.minQty).toBe(10);
    });

    it('should apply fixed price break', () => {
      const result = PricingCalculator.applyVolumeBreaks(10000, 30, volumeBreaks);
      expect(result.priceCents).toBe(8000);
      expect(result.appliedBreak.type).toBe('fixed_price');
    });

    it('should apply highest applicable break', () => {
      const result = PricingCalculator.applyVolumeBreaks(10000, 100, volumeBreaks);
      expect(result.priceCents).toBe(7500);
      expect(result.appliedBreak.minQty).toBe(50);
    });

    it('should return base price with empty breaks array', () => {
      const result = PricingCalculator.applyVolumeBreaks(10000, 10, []);
      expect(result.priceCents).toBe(10000);
    });

    it('should return base price with null breaks', () => {
      const result = PricingCalculator.applyVolumeBreaks(10000, 10, null);
      expect(result.priceCents).toBe(10000);
    });
  });

  // ============================================================================
  // CUSTOMER TIER PRICING
  // ============================================================================

  describe('Customer Tier Pricing', () => {
    it('should apply no discount for retail tier', () => {
      const result = PricingCalculator.applyCustomerTier(10000, 'retail');
      expect(result.priceCents).toBe(10000);
      expect(result.tierDiscountCents).toBe(0);
      expect(result.tierLabel).toBe('Retail');
    });

    it('should apply 5% discount for preferred tier', () => {
      const result = PricingCalculator.applyCustomerTier(10000, 'preferred');
      expect(result.priceCents).toBe(9500);
      expect(result.tierDiscountCents).toBe(500);
      expect(result.tierDiscountPercent).toBe(5);
    });

    it('should apply 15% discount for wholesale tier', () => {
      const result = PricingCalculator.applyCustomerTier(10000, 'wholesale');
      expect(result.priceCents).toBe(8500);
      expect(result.tierDiscountCents).toBe(1500);
    });

    it('should apply 20% discount for dealer tier', () => {
      const result = PricingCalculator.applyCustomerTier(10000, 'dealer');
      expect(result.priceCents).toBe(8000);
      expect(result.tierDiscountCents).toBe(2000);
    });

    it('should apply 25% discount for VIP tier', () => {
      const result = PricingCalculator.applyCustomerTier(10000, 'vip');
      expect(result.priceCents).toBe(7500);
      expect(result.tierDiscountCents).toBe(2500);
    });

    it('should default to retail for unknown tier', () => {
      const result = PricingCalculator.applyCustomerTier(10000, 'unknown');
      expect(result.priceCents).toBe(10000);
      expect(result.tierLabel).toBe('Retail');
    });

    it('should use custom tier definitions when provided', () => {
      const customTiers = {
        gold: { discountPercent: 30, label: 'Gold Member' },
        retail: { discountPercent: 0, label: 'Standard' },
      };
      const result = PricingCalculator.applyCustomerTier(10000, 'gold', customTiers);
      expect(result.priceCents).toBe(7000);
      expect(result.tierLabel).toBe('Gold Member');
    });
  });

  // ============================================================================
  // LINE ITEM CALCULATION - EDGE CASES
  // ============================================================================

  describe('Line Item Calculation', () => {
    describe('Zero Quantity', () => {
      it('should return zeros for zero quantity', () => {
        const result = PricingCalculator.calculateLineItem({
          unitPriceCents: 10000,
          quantity: 0,
        });

        expect(result.quantity).toBe(0);
        expect(result.subtotalCents).toBe(0);
        expect(result.lineTotalCents).toBe(0);
        expect(result.lineDiscountCents).toBe(0);
        expect(result.marginCents).toBe(0);
      });
    });

    describe('Negative Discount Prevention', () => {
      it('should reject negative discount percent', () => {
        expect(() => PricingCalculator.calculateLineItem({
          unitPriceCents: 10000,
          quantity: 1,
          discountPercent: -10,
        })).toThrow('Discount percent cannot be negative');
      });

      it('should reject negative discount amount', () => {
        expect(() => PricingCalculator.calculateLineItem({
          unitPriceCents: 10000,
          quantity: 1,
          discountAmountCents: -500,
        })).toThrow('Discount amount cannot be negative');
      });

      it('should reject discount percent over 100', () => {
        expect(() => PricingCalculator.calculateLineItem({
          unitPriceCents: 10000,
          quantity: 1,
          discountPercent: 150,
        })).toThrow('Discount percent must be at most 100');
      });
    });

    describe('Discount Capping', () => {
      it('should cap discount at subtotal (not go negative)', () => {
        const result = PricingCalculator.calculateLineItem({
          unitPriceCents: 10000,
          quantity: 1,
          discountPercent: 50,
          discountAmountCents: 10000, // Extra $100 discount
        });

        // 50% off = $50, then $100 more would exceed, should cap at subtotal
        expect(result.lineTotalCents).toBe(0);
        expect(result.lineDiscountCents).toBe(10000);
      });
    });

    describe('Standard Calculation', () => {
      it('should calculate basic line item correctly', () => {
        const result = PricingCalculator.calculateLineItem({
          unitPriceCents: 10000, // $100
          quantity: 2,
          discountPercent: 10,  // 10% off
        });

        expect(result.subtotalCents).toBe(20000);       // $200
        expect(result.lineDiscountCents).toBe(2000);    // $20 (10% of $200)
        expect(result.lineTotalCents).toBe(18000);      // $180
      });

      it('should apply both percentage and fixed discounts', () => {
        const result = PricingCalculator.calculateLineItem({
          unitPriceCents: 10000,
          quantity: 1,
          discountPercent: 10,          // $10 off
          discountAmountCents: 500,     // + $5 off
        });

        expect(result.lineDiscountCents).toBe(1500);  // $15 total
        expect(result.lineTotalCents).toBe(8500);     // $85
      });
    });

    describe('Margin Calculation', () => {
      it('should calculate margin correctly', () => {
        const result = PricingCalculator.calculateLineItem({
          unitPriceCents: 10000,
          quantity: 1,
          costCents: 6000,  // $60 cost
        });

        expect(result.costCents).toBe(6000);
        expect(result.marginCents).toBe(4000);  // $40 profit
        expect(result.marginPercent).toBe(40);  // 40% margin
      });

      it('should handle zero cost (no margin calculation)', () => {
        const result = PricingCalculator.calculateLineItem({
          unitPriceCents: 10000,
          quantity: 1,
          costCents: 0,
        });

        expect(result.marginCents).toBe(10000);
        expect(result.marginPercent).toBe(100);
      });

      it('should handle negative margin (selling below cost)', () => {
        const result = PricingCalculator.calculateLineItem({
          unitPriceCents: 5000,
          quantity: 1,
          costCents: 6000,
        });

        expect(result.marginCents).toBe(-1000);
        expect(result.marginPercent).toBe(-20);
      });
    });

    describe('Tax-Exempt Flag', () => {
      it('should preserve isTaxExempt flag', () => {
        const result = PricingCalculator.calculateLineItem({
          unitPriceCents: 10000,
          quantity: 1,
          isTaxExempt: true,
        });

        expect(result.isTaxExempt).toBe(true);
      });
    });

    describe('Combined Volume Breaks and Tier Discounts', () => {
      it('should apply volume break first, then tier discount', () => {
        const volumeBreaks = [
          { minQty: 5, discountPercent: 10 },
        ];

        const result = PricingCalculator.calculateLineItem({
          unitPriceCents: 10000,
          quantity: 5,
          volumeBreaks,
          customerTier: 'wholesale', // 15% off
        });

        // Volume: $100 -> $90
        // Tier: $90 -> $76.50
        expect(result.unitPriceCents).toBe(9000);
        expect(result.effectiveUnitPriceCents).toBe(7650);
        expect(result.subtotalCents).toBe(38250); // 5 * $76.50
      });
    });
  });

  // ============================================================================
  // TAX CALCULATION
  // ============================================================================

  describe('Tax Calculation', () => {
    describe('Ontario HST (13%)', () => {
      it('should calculate 13% HST', () => {
        const result = PricingCalculator.calculateTaxes(10000, 'ON');
        expect(result.hstCents).toBe(1300);
        expect(result.gstCents).toBe(0);
        expect(result.pstCents).toBe(0);
        expect(result.totalTaxCents).toBe(1300);
        expect(result.taxLabel).toBe('HST 13%');
      });
    });

    describe('British Columbia (GST 5% + PST 7%)', () => {
      it('should calculate GST and PST separately', () => {
        const result = PricingCalculator.calculateTaxes(10000, 'BC');
        expect(result.hstCents).toBe(0);
        expect(result.gstCents).toBe(500);
        expect(result.pstCents).toBe(700);
        expect(result.totalTaxCents).toBe(1200);
      });
    });

    describe('Quebec (GST 5% + QST 9.975% on GST-inclusive amount)', () => {
      it('should calculate QST on subtotal + GST', () => {
        const result = PricingCalculator.calculateTaxes(10000, 'QC');
        expect(result.gstCents).toBe(500);
        // QST on $100 + $5 = $105 * 9.975% = $10.47
        expect(result.pstCents).toBe(1047);
        expect(result.totalTaxCents).toBe(1547);
      });
    });

    describe('Alberta (GST only 5%)', () => {
      it('should calculate only GST', () => {
        const result = PricingCalculator.calculateTaxes(10000, 'AB');
        expect(result.gstCents).toBe(500);
        expect(result.pstCents).toBe(0);
        expect(result.totalTaxCents).toBe(500);
      });
    });

    describe('Tax-Exempt', () => {
      it('should return zero tax when exempt', () => {
        const result = PricingCalculator.calculateTaxes(10000, 'ON', true);
        expect(result.totalTaxCents).toBe(0);
        expect(result.taxableAmountCents).toBe(0);
        expect(result.taxLabel).toBe('Tax Exempt');
      });
    });

    describe('Unknown Province', () => {
      it('should default to Ontario rates for unknown province', () => {
        const result = PricingCalculator.calculateTaxes(10000, 'XX');
        expect(result.hstCents).toBe(1300);
        expect(result.province).toBe('XX');
      });
    });

    describe('Zero Amount', () => {
      it('should return zero tax for zero amount', () => {
        const result = PricingCalculator.calculateTaxes(0, 'ON');
        expect(result.totalTaxCents).toBe(0);
      });
    });
  });

  // ============================================================================
  // ORDER CALCULATION
  // ============================================================================

  describe('Order Calculation', () => {
    describe('Empty Order', () => {
      it('should handle empty items array', () => {
        const result = PricingCalculator.calculateOrder({
          items: [],
          province: 'ON',
        });

        expect(result.itemCount).toBe(0);
        expect(result.subtotalCents).toBe(0);
        expect(result.grandTotalCents).toBe(0);
      });
    });

    describe('Single Item Order', () => {
      it('should calculate order with one item', () => {
        const result = PricingCalculator.calculateOrder({
          items: [
            { unitPriceCents: 10000, quantity: 2 },
          ],
          province: 'ON',
        });

        expect(result.subtotalCents).toBe(20000);
        expect(result.taxes.totalTaxCents).toBe(2600); // 13% of $200
        expect(result.grandTotalCents).toBe(22600);
      });
    });

    describe('Multiple Items with Mixed Tax-Exempt', () => {
      it('should only tax non-exempt items', () => {
        const result = PricingCalculator.calculateOrder({
          items: [
            { unitPriceCents: 10000, quantity: 1, isTaxExempt: false },
            { unitPriceCents: 10000, quantity: 1, isTaxExempt: true },
          ],
          province: 'ON',
        });

        expect(result.subtotalCents).toBe(20000);
        // Only $100 is taxable
        expect(result.taxes.taxableAmountCents).toBe(10000);
        expect(result.taxes.totalTaxCents).toBe(1300);
        expect(result.grandTotalCents).toBe(21300);
      });
    });

    describe('Order-Level Discounts', () => {
      it('should apply percentage order discount', () => {
        const result = PricingCalculator.calculateOrder({
          items: [
            { unitPriceCents: 10000, quantity: 1 },
          ],
          orderDiscountPercent: 10,
          province: 'ON',
        });

        expect(result.subtotalCents).toBe(10000);
        expect(result.discounts.orderDiscountCents).toBe(1000);
        expect(result.discountedSubtotalCents).toBe(9000);
        expect(result.taxes.totalTaxCents).toBe(1170); // 13% of $90
        expect(result.grandTotalCents).toBe(10170);
      });

      it('should apply fixed order discount', () => {
        const result = PricingCalculator.calculateOrder({
          items: [
            { unitPriceCents: 10000, quantity: 1 },
          ],
          orderDiscountCents: 2000, // $20 off
          province: 'ON',
        });

        expect(result.discounts.orderDiscountCents).toBe(2000);
        expect(result.discountedSubtotalCents).toBe(8000);
        expect(result.grandTotalCents).toBe(9040); // $80 + 13%
      });

      it('should apply both percentage and fixed order discounts', () => {
        const result = PricingCalculator.calculateOrder({
          items: [
            { unitPriceCents: 10000, quantity: 1 },
          ],
          orderDiscountPercent: 10, // $10 off
          orderDiscountCents: 500,  // + $5 off
          province: 'ON',
        });

        expect(result.discounts.orderDiscountCents).toBe(1500);
        expect(result.discountedSubtotalCents).toBe(8500);
      });

      it('should cap order discount at subtotal', () => {
        const result = PricingCalculator.calculateOrder({
          items: [
            { unitPriceCents: 5000, quantity: 1 },
          ],
          orderDiscountCents: 10000, // $100 off on $50 order
          province: 'ON',
        });

        expect(result.discounts.orderDiscountCents).toBe(5000);
        expect(result.discountedSubtotalCents).toBe(0);
        expect(result.grandTotalCents).toBe(0);
      });
    });

    describe('Discount Order of Application', () => {
      it('should apply line discounts before order discount', () => {
        const result = PricingCalculator.calculateOrder({
          items: [
            { unitPriceCents: 10000, quantity: 1, discountPercent: 10 },
          ],
          orderDiscountPercent: 10,
          province: 'ON',
        });

        // Line: $100 - 10% = $90
        // Order: $90 - 10% = $81
        expect(result.subtotalCents).toBe(9000);
        expect(result.discounts.lineDiscountsCents).toBe(1000);
        expect(result.discounts.orderDiscountCents).toBe(900);
        expect(result.discountedSubtotalCents).toBe(8100);
      });
    });

    describe('Entirely Tax-Exempt Order', () => {
      it('should have zero tax when order is exempt', () => {
        const result = PricingCalculator.calculateOrder({
          items: [
            { unitPriceCents: 10000, quantity: 2 },
          ],
          isTaxExempt: true,
          province: 'ON',
        });

        expect(result.taxes.totalTaxCents).toBe(0);
        expect(result.grandTotalCents).toBe(20000);
      });
    });

    describe('Customer Tier Applied to All Items', () => {
      it('should apply tier discount to all items', () => {
        const result = PricingCalculator.calculateOrder({
          items: [
            { unitPriceCents: 10000, quantity: 1 },
            { unitPriceCents: 5000, quantity: 2 },
          ],
          customerTier: 'wholesale', // 15% off
          province: 'ON',
        });

        // Item 1: $100 - 15% = $85
        // Item 2: $50 - 15% = $42.50 x 2 = $85
        expect(result.discounts.tierDiscountsCents).toBe(3000); // $30 total tier discount
        expect(result.subtotalCents).toBe(17000); // $170
      });
    });

    describe('Margin Calculations', () => {
      it('should calculate total margins correctly', () => {
        const result = PricingCalculator.calculateOrder({
          items: [
            { unitPriceCents: 10000, quantity: 1, costCents: 6000 },
            { unitPriceCents: 5000, quantity: 2, costCents: 3000 },
          ],
          province: 'ON',
        });

        // Item 1: $100 sell, $60 cost, $40 margin
        // Item 2: $100 sell, $60 cost, $40 margin
        expect(result.margins.totalCostCents).toBe(12000);
        expect(result.margins.totalMarginCents).toBe(8000);
        expect(result.margins.marginPercent).toBe(40);
      });
    });

    describe('Formatted Output', () => {
      it('should provide formatted currency strings', () => {
        const result = PricingCalculator.calculateOrder({
          items: [
            { unitPriceCents: 12345, quantity: 1 },
          ],
          province: 'ON',
        });

        expect(result.formatted.subtotal).toBe('$123.45');
        expect(result.formatted.grandTotal).toBe('$139.50');
      });
    });
  });

  // ============================================================================
  // QUICK HELPERS
  // ============================================================================

  describe('Quick Helpers', () => {
    describe('calculateItemPrice', () => {
      it('should calculate simple item price', () => {
        const result = PricingCalculator.calculateItemPrice(10000, 5, 10);
        expect(result.subtotalCents).toBe(50000);
        expect(result.lineDiscountCents).toBe(5000);
        expect(result.lineTotalCents).toBe(45000);
      });
    });

    describe('calculateTax', () => {
      it('should return just the tax amount', () => {
        const tax = PricingCalculator.calculateTax(10000, 'ON');
        expect(tax).toBe(1300);
      });
    });

    describe('addTax', () => {
      it('should add tax to amount', () => {
        const result = PricingCalculator.addTax(10000, 'ON');
        expect(result.amountCents).toBe(10000);
        expect(result.taxCents).toBe(1300);
        expect(result.totalCents).toBe(11300);
      });
    });

    describe('extractTax', () => {
      it('should extract tax from inclusive amount (ON)', () => {
        const result = PricingCalculator.extractTax(11300, 'ON');
        expect(result.amountCents).toBe(10000);
        expect(result.taxCents).toBe(1300);
      });

      it('should extract tax from inclusive amount (BC)', () => {
        // BC: 5% GST + 7% PST = 12%
        const result = PricingCalculator.extractTax(11200, 'BC');
        expect(result.amountCents).toBe(10000);
        expect(result.taxCents).toBe(1200);
      });

      it('should handle Quebec compound tax', () => {
        // QC: 5% GST + 9.975% QST on (amount + GST)
        // $100 + $5 GST = $105
        // $105 * 9.975% = $10.47 QST
        // Total: $115.47
        const result = PricingCalculator.extractTax(11547, 'QC');
        expect(result.amountCents).toBe(10000);
        expect(result.taxCents).toBe(1547);
      });
    });

    describe('calculatePriceForMargin', () => {
      it('should calculate price to achieve target margin', () => {
        // 40% margin on $60 cost means selling at $100
        // margin = (100 - 60) / 100 = 40%
        const price = PricingCalculator.calculatePriceForMargin(6000, 40);
        expect(price).toBe(10000);
      });

      it('should reject 100% margin', () => {
        expect(() => PricingCalculator.calculatePriceForMargin(6000, 100))
          .toThrow('Target margin cannot be 100% or greater');
      });

      it('should reject negative margin', () => {
        expect(() => PricingCalculator.calculatePriceForMargin(6000, -10))
          .toThrow('Target margin cannot be negative');
      });
    });

    describe('calculateMargin', () => {
      it('should calculate margin percentage', () => {
        expect(PricingCalculator.calculateMargin(10000, 6000)).toBe(40);
        expect(PricingCalculator.calculateMargin(10000, 8000)).toBe(20);
        expect(PricingCalculator.calculateMargin(10000, 10000)).toBe(0);
      });

      it('should handle zero price', () => {
        expect(PricingCalculator.calculateMargin(0, 6000)).toBe(0);
      });
    });

    describe('calculateMarkup', () => {
      it('should calculate markup percentage', () => {
        // Markup = (price - cost) / cost
        expect(PricingCalculator.calculateMarkup(10000, 6000)).toBe(66.67);
        expect(PricingCalculator.calculateMarkup(10000, 5000)).toBe(100);
      });

      it('should handle zero cost', () => {
        expect(PricingCalculator.calculateMarkup(10000, 0)).toBe(0);
      });
    });
  });

  // ============================================================================
  // REAL-WORLD SCENARIOS
  // ============================================================================

  describe('Real-World Scenarios', () => {
    it('should calculate a typical POS transaction', () => {
      const result = PricingCalculator.calculateOrder({
        items: [
          {
            unitPriceCents: 199900, // $1999 Samsung TV
            quantity: 1,
            costCents: 150000,
          },
          {
            unitPriceCents: 14999, // $149.99 Soundbar
            quantity: 1,
            discountPercent: 10, // 10% accessory discount
            costCents: 10000,
          },
        ],
        province: 'ON',
        customerTier: 'retail',
      });

      expect(result.itemCount).toBe(2);
      // TV: $1999
      // Soundbar: $149.99 - 10% = $134.99
      expect(result.subtotalCents).toBe(213399);
      expect(result.taxes.totalTaxCents).toBe(27742);
      expect(result.grandTotalCents).toBe(241141); // $2411.41
    });

    it('should calculate a wholesale quote with volume breaks', () => {
      const result = PricingCalculator.calculateOrder({
        items: [
          {
            unitPriceCents: 50000, // $500 washer
            quantity: 10,
            volumeBreaks: [
              { minQty: 5, discountPercent: 5 },
              { minQty: 10, discountPercent: 10 },
            ],
            costCents: 35000,
          },
        ],
        customerTier: 'dealer', // 20% off
        orderDiscountPercent: 5, // Additional 5% volume incentive
        province: 'AB', // Alberta - GST only
      });

      // Volume break: $500 * 90% = $450
      // Dealer tier: $450 * 80% = $360
      // Per unit: $360 * 10 = $3600
      // Order discount: $3600 * 95% = $3420
      // GST: $3420 * 5% = $171
      expect(result.discountedSubtotalCents).toBe(342000);
      expect(result.taxes.gstCents).toBe(17100);
      expect(result.grandTotalCents).toBe(359100); // $3591
    });

    it('should handle contractor tax-exempt purchase', () => {
      const result = PricingCalculator.calculateOrder({
        items: [
          { unitPriceCents: 89900, quantity: 5, costCents: 65000 },
        ],
        isTaxExempt: true,
        customerTier: 'wholesale',
        province: 'ON',
      });

      // Wholesale: $899 * 85% = $764.15 per unit
      // 5 units: $3820.75
      expect(result.taxes.totalTaxCents).toBe(0);
      expect(result.taxes.isTaxExempt).toBe(true);
      expect(result.grandTotalCents).toBe(result.discountedSubtotalCents);
    });
  });
});
