const request = require('supertest');
const express = require('express');

// Mock database
const mockPool = {
  query: jest.fn()
};

describe('Discount Engine System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Middleware to extract user from request
    app.use((req, res, next) => {
      req.user = req.headers['x-user-id']
        ? { id: parseInt(req.headers['x-user-id']), role: req.headers['x-user-role'] || 'user' }
        : null;
      next();
    });

    // POST /api/discount-rules
    app.post('/api/discount-rules', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const {
          name,
          description,
          discount_type,
          discount_value,
          min_quantity,
          min_amount,
          max_discount,
          start_date,
          end_date,
          requires_approval
        } = req.body;

        if (!name || !discount_type || !discount_value) {
          return res.status(400).json({
            error: 'Name, discount type, and discount value are required'
          });
        }

        const validTypes = ['percentage', 'fixed_amount', 'tiered'];
        if (!validTypes.includes(discount_type)) {
          return res.status(400).json({
            error: 'Invalid discount type'
          });
        }

        if (discount_type === 'percentage' && (discount_value < 0 || discount_value > 100)) {
          return res.status(400).json({
            error: 'Percentage discount must be between 0 and 100'
          });
        }

        const ruleResult = await mockPool.query(
          `INSERT INTO discount_rules
           (name, description, discount_type, discount_value, min_quantity, min_amount,
            max_discount, start_date, end_date, requires_approval, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *`,
          [
            name, description, discount_type, discount_value, min_quantity || null,
            min_amount || null, max_discount || null, start_date || null,
            end_date || null, requires_approval || false, req.user.id
          ]
        );

        res.status(201).json({
          success: true,
          rule: ruleResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/discount-rules
    app.get('/api/discount-rules', async (req, res) => {
      try {
        const { active_only } = req.query;

        let query = 'SELECT * FROM discount_rules';
        const params = [];

        if (active_only === 'true') {
          query += ' WHERE is_active = true AND (start_date IS NULL OR start_date <= NOW()) AND (end_date IS NULL OR end_date >= NOW())';
        }

        query += ' ORDER BY created_at DESC';

        const rulesResult = await mockPool.query(query, params);

        res.json({
          count: rulesResult.rows.length,
          rules: rulesResult.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/promo-codes
    app.post('/api/promo-codes', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const {
          code,
          discount_type,
          discount_value,
          max_uses,
          min_purchase_amount,
          valid_from,
          valid_until,
          customer_specific
        } = req.body;

        if (!code || !discount_type || !discount_value) {
          return res.status(400).json({
            error: 'Code, discount type, and value are required'
          });
        }

        // Check if code already exists
        const existingCode = await mockPool.query(
          'SELECT id FROM promo_codes WHERE code = $1',
          [code.toUpperCase()]
        );

        if (existingCode.rows.length > 0) {
          return res.status(400).json({
            error: 'Promo code already exists'
          });
        }

        const promoResult = await mockPool.query(
          `INSERT INTO promo_codes
           (code, discount_type, discount_value, max_uses, min_purchase_amount,
            valid_from, valid_until, customer_specific, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            code.toUpperCase(), discount_type, discount_value, max_uses || null,
            min_purchase_amount || null, valid_from || null, valid_until || null,
            customer_specific || false, req.user.id
          ]
        );

        res.status(201).json({
          success: true,
          promo_code: promoResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/promo-codes/validate
    app.post('/api/promo-codes/validate', async (req, res) => {
      try {
        const { code, customer_id, quote_amount } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Promo code is required' });
        }

        const promoResult = await mockPool.query(
          'SELECT * FROM promo_codes WHERE code = $1 AND is_active = true',
          [code.toUpperCase()]
        );

        if (promoResult.rows.length === 0) {
          return res.status(404).json({
            valid: false,
            error: 'Invalid promo code'
          });
        }

        const promo = promoResult.rows[0];

        // Check date validity
        const now = new Date();
        if (promo.valid_from && new Date(promo.valid_from) > now) {
          return res.json({
            valid: false,
            error: 'Promo code not yet valid'
          });
        }

        if (promo.valid_until && new Date(promo.valid_until) < now) {
          return res.json({
            valid: false,
            error: 'Promo code has expired'
          });
        }

        // Check usage limit
        if (promo.max_uses && promo.times_used >= promo.max_uses) {
          return res.json({
            valid: false,
            error: 'Promo code has reached maximum uses'
          });
        }

        // Check minimum purchase
        if (promo.min_purchase_amount && quote_amount < promo.min_purchase_amount) {
          return res.json({
            valid: false,
            error: `Minimum purchase amount of $${promo.min_purchase_amount} required`
          });
        }

        // Calculate discount
        let discountAmount = 0;
        if (promo.discount_type === 'percentage') {
          discountAmount = (quote_amount * promo.discount_value) / 100;
          if (promo.max_discount_amount && discountAmount > promo.max_discount_amount) {
            discountAmount = promo.max_discount_amount;
          }
        } else {
          discountAmount = promo.discount_value;
        }

        res.json({
          valid: true,
          promo_code: promo,
          discount_amount: discountAmount,
          final_amount: quote_amount - discountAmount
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/:id/apply-discount
    app.post('/api/quotations/:id/apply-discount', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { discount_rule_id, promo_code, custom_discount } = req.body;

        // Get quote
        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];
        let discountAmount = 0;
        let discountType = null;
        let requiresApproval = false;

        if (discount_rule_id) {
          const ruleResult = await mockPool.query(
            'SELECT * FROM discount_rules WHERE id = $1 AND is_active = true',
            [discount_rule_id]
          );

          if (ruleResult.rows.length === 0) {
            return res.status(404).json({ error: 'Discount rule not found' });
          }

          const rule = ruleResult.rows[0];
          discountType = rule.discount_type;
          requiresApproval = rule.requires_approval;

          if (rule.discount_type === 'percentage') {
            discountAmount = (quote.total_amount * rule.discount_value) / 100;
            if (rule.max_discount && discountAmount > rule.max_discount) {
              discountAmount = rule.max_discount;
            }
          } else {
            discountAmount = rule.discount_value;
          }
        } else if (custom_discount) {
          discountType = custom_discount.type;
          if (custom_discount.type === 'percentage') {
            discountAmount = (quote.total_amount * custom_discount.value) / 100;
          } else {
            discountAmount = custom_discount.value;
          }
          // Custom discounts over 20% require approval
          requiresApproval = custom_discount.value > 20;
        }

        // Update quote
        const updateResult = await mockPool.query(
          `UPDATE quotations
           SET discount_amount = $1,
               discount_type = $2,
               total_amount = $3,
               requires_approval = $4
           WHERE id = $5
           RETURNING *`,
          [
            discountAmount,
            discountType,
            quote.total_amount - discountAmount,
            requiresApproval,
            req.params.id
          ]
        );

        // Log discount application
        await mockPool.query(
          `INSERT INTO discount_log
           (quote_id, discount_amount, discount_type, applied_by, rule_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.params.id, discountAmount, discountType, req.user.id, discount_rule_id || null]
        );

        res.json({
          success: true,
          quote: updateResult.rows[0],
          discount_applied: discountAmount,
          requires_approval: requiresApproval
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/tiered-pricing
    app.post('/api/tiered-pricing', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { product_id, tiers } = req.body;

        if (!product_id || !tiers || tiers.length === 0) {
          return res.status(400).json({
            error: 'Product ID and tiers are required'
          });
        }

        // Validate tiers
        for (const tier of tiers) {
          if (tier.min_quantity === undefined || tier.min_quantity === null ||
              tier.discount_percentage === undefined || tier.discount_percentage === null) {
            return res.status(400).json({
              error: 'Each tier must have min_quantity and discount_percentage'
            });
          }
        }

        // Delete existing tiers
        await mockPool.query(
          'DELETE FROM tiered_pricing WHERE product_id = $1',
          [product_id]
        );

        // Insert new tiers
        const insertPromises = tiers.map(tier =>
          mockPool.query(
            `INSERT INTO tiered_pricing
             (product_id, min_quantity, max_quantity, discount_percentage, created_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [product_id, tier.min_quantity, tier.max_quantity || null, tier.discount_percentage, req.user.id]
          )
        );

        await Promise.all(insertPromises);

        res.status(201).json({
          success: true,
          message: `${tiers.length} pricing tiers created`,
          product_id: product_id
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/products/:id/pricing-tiers
    app.get('/api/products/:id/pricing-tiers', async (req, res) => {
      try {
        const tiersResult = await mockPool.query(
          'SELECT * FROM tiered_pricing WHERE product_id = $1 ORDER BY min_quantity ASC',
          [req.params.id]
        );

        res.json({
          count: tiersResult.rows.length,
          tiers: tiersResult.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/customer-pricing
    app.post('/api/customer-pricing', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { customer_id, product_id, special_price, discount_percentage } = req.body;

        if (!customer_id || !product_id) {
          return res.status(400).json({
            error: 'Customer ID and Product ID are required'
          });
        }

        if (!special_price && !discount_percentage) {
          return res.status(400).json({
            error: 'Either special price or discount percentage is required'
          });
        }

        const pricingResult = await mockPool.query(
          `INSERT INTO customer_specific_pricing
           (customer_id, product_id, special_price, discount_percentage, created_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (customer_id, product_id)
           DO UPDATE SET special_price = $3, discount_percentage = $4
           RETURNING *`,
          [customer_id, product_id, special_price || null, discount_percentage || null, req.user.id]
        );

        res.status(201).json({
          success: true,
          pricing: pricingResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/customers/:customerId/special-pricing
    app.get('/api/customers/:customerId/special-pricing', async (req, res) => {
      try {
        const pricingResult = await mockPool.query(
          `SELECT csp.*, p.name as product_name, p.price as standard_price
           FROM customer_specific_pricing csp
           JOIN products p ON csp.product_id = p.id
           WHERE csp.customer_id = $1`,
          [req.customerId]
        );

        res.json({
          count: pricingResult.rows.length,
          pricing: pricingResult.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/discount-analytics
    app.get('/api/discount-analytics', async (req, res) => {
      try {
        const { start_date, end_date } = req.query;

        const analyticsResult = await mockPool.query(
          `SELECT
             COUNT(*) as total_discounts,
             SUM(discount_amount) as total_discount_amount,
             AVG(discount_amount) as avg_discount_amount,
             discount_type,
             COUNT(*) as count_by_type
           FROM discount_log
           WHERE created_at BETWEEN $1 AND $2
           GROUP BY discount_type`,
          [start_date || '2020-01-01', end_date || '2030-12-31']
        );

        res.json({
          analytics: analyticsResult.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/discount-rules/:id
    app.delete('/api/discount-rules/:id', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const deleteResult = await mockPool.query(
          'DELETE FROM discount_rules WHERE id = $1 RETURNING *',
          [req.params.id]
        );

        if (deleteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Discount rule not found' });
        }

        res.json({
          success: true,
          message: 'Discount rule deleted',
          rule: deleteResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/discount-rules', () => {
    test('should create percentage discount rule', async () => {
      const newRule = {
        name: '10% Off',
        description: 'Standard 10% discount',
        discount_type: 'percentage',
        discount_value: 10
      };

      mockPool.query.mockResolvedValue({ rows: [{ id: 1, ...newRule }] });

      const response = await request(app)
        .post('/api/discount-rules')
        .set('x-user-id', '1')
        .send(newRule);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.rule.discount_type).toBe('percentage');
    });

    test('should create fixed amount discount rule', async () => {
      const newRule = {
        name: '$50 Off',
        discount_type: 'fixed_amount',
        discount_value: 50,
        min_amount: 500
      };

      mockPool.query.mockResolvedValue({ rows: [{ id: 1, ...newRule }] });

      const response = await request(app)
        .post('/api/discount-rules')
        .set('x-user-id', '1')
        .send(newRule);

      expect(response.status).toBe(201);
      expect(response.body.rule.discount_value).toBe(50);
    });

    test('should validate percentage range', async () => {
      const response = await request(app)
        .post('/api/discount-rules')
        .set('x-user-id', '1')
        .send({
          name: 'Invalid',
          discount_type: 'percentage',
          discount_value: 150
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('between 0 and 100');
    });

    test('should validate discount type', async () => {
      const response = await request(app)
        .post('/api/discount-rules')
        .set('x-user-id', '1')
        .send({
          name: 'Invalid',
          discount_type: 'invalid_type',
          discount_value: 10
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid discount type');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/discount-rules')
        .send({ name: 'Test' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/discount-rules', () => {
    test('should return all discount rules', async () => {
      const mockRules = [
        { id: 1, name: '10% Off', discount_type: 'percentage' },
        { id: 2, name: '$50 Off', discount_type: 'fixed_amount' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockRules });

      const response = await request(app).get('/api/discount-rules');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
    });

    test('should filter active rules only', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 1, is_active: true }] });

      const response = await request(app).get('/api/discount-rules?active_only=true');

      expect(response.status).toBe(200);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('is_active = true'),
        expect.any(Array)
      );
    });
  });

  describe('POST /api/promo-codes', () => {
    test('should create promo code', async () => {
      const newPromo = {
        code: 'SAVE20',
        discount_type: 'percentage',
        discount_value: 20,
        max_uses: 100
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, code: 'SAVE20' }] });

      const response = await request(app)
        .post('/api/promo-codes')
        .set('x-user-id', '1')
        .send(newPromo);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('should convert code to uppercase', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ code: 'SAVE20' }] });

      await request(app)
        .post('/api/promo-codes')
        .set('x-user-id', '1')
        .send({ code: 'save20', discount_type: 'percentage', discount_value: 20 });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['SAVE20', expect.any(String), expect.any(Number), expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.any(Number)])
      );
    });

    test('should reject duplicate promo codes', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 1 }] });

      const response = await request(app)
        .post('/api/promo-codes')
        .set('x-user-id', '1')
        .send({ code: 'EXISTING', discount_type: 'percentage', discount_value: 10 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('POST /api/promo-codes/validate', () => {
    test('should validate valid promo code', async () => {
      const mockPromo = {
        id: 1,
        code: 'SAVE20',
        discount_type: 'percentage',
        discount_value: 20,
        is_active: true,
        times_used: 5,
        max_uses: 100
      };

      mockPool.query.mockResolvedValue({ rows: [mockPromo] });

      const response = await request(app)
        .post('/api/promo-codes/validate')
        .send({ code: 'SAVE20', quote_amount: 1000 });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.discount_amount).toBe(200);
      expect(response.body.final_amount).toBe(800);
    });

    test('should reject invalid promo code', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/promo-codes/validate')
        .send({ code: 'INVALID', quote_amount: 1000 });

      expect(response.status).toBe(404);
      expect(response.body.valid).toBe(false);
    });

    test('should reject expired promo code', async () => {
      const expiredPromo = {
        code: 'EXPIRED',
        is_active: true,
        valid_until: '2020-01-01'
      };

      mockPool.query.mockResolvedValue({ rows: [expiredPromo] });

      const response = await request(app)
        .post('/api/promo-codes/validate')
        .send({ code: 'EXPIRED', quote_amount: 1000 });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
      expect(response.body.error).toContain('expired');
    });

    test('should check minimum purchase amount', async () => {
      const mockPromo = {
        code: 'MIN100',
        is_active: true,
        discount_type: 'percentage',
        discount_value: 10,
        min_purchase_amount: 100
      };

      mockPool.query.mockResolvedValue({ rows: [mockPromo] });

      const response = await request(app)
        .post('/api/promo-codes/validate')
        .send({ code: 'MIN100', quote_amount: 50 });

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
      expect(response.body.error).toContain('Minimum purchase');
    });
  });

  describe('POST /api/quotations/:id/apply-discount', () => {
    test('should apply discount rule to quote', async () => {
      const mockQuote = { id: 1, total_amount: 1000 };
      const mockRule = {
        id: 1,
        discount_type: 'percentage',
        discount_value: 15,
        is_active: true,
        requires_approval: false
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [mockRule] })
        .mockResolvedValueOnce({ rows: [{ ...mockQuote, discount_amount: 150 }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/apply-discount')
        .set('x-user-id', '1')
        .send({ discount_rule_id: 1 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.discount_applied).toBe(150);
    });

    test('should require approval for large custom discounts', async () => {
      const mockQuote = { id: 1, total_amount: 1000 };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/apply-discount')
        .set('x-user-id', '1')
        .send({ custom_discount: { type: 'percentage', value: 25 } });

      expect(response.status).toBe(200);
      expect(response.body.requires_approval).toBe(true);
    });
  });

  describe('POST /api/tiered-pricing', () => {
    test('should create tiered pricing', async () => {
      const tiers = [
        { min_quantity: 1, max_quantity: 9, discount_percentage: 0 },
        { min_quantity: 10, max_quantity: 49, discount_percentage: 10 },
        { min_quantity: 50, max_quantity: null, discount_percentage: 20 }
      ];

      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/tiered-pricing')
        .set('x-user-id', '1')
        .send({ product_id: 1, tiers });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(mockPool.query).toHaveBeenCalledTimes(4); // 1 delete + 3 inserts
    });

    test('should validate tier structure', async () => {
      const response = await request(app)
        .post('/api/tiered-pricing')
        .set('x-user-id', '1')
        .send({ product_id: 1, tiers: [{ min_quantity: 10 }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('discount_percentage');
    });
  });

  describe('GET /api/products/:id/pricing-tiers', () => {
    test('should return pricing tiers for product', async () => {
      const mockTiers = [
        { min_quantity: 1, discount_percentage: 0 },
        { min_quantity: 10, discount_percentage: 10 }
      ];

      mockPool.query.mockResolvedValue({ rows: mockTiers });

      const response = await request(app).get('/api/products/1/pricing-tiers');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
    });
  });

  describe('POST /api/customer-pricing', () => {
    test('should create customer-specific pricing', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ customer_id: 1, product_id: 1, special_price: 90 }]
      });

      const response = await request(app)
        .post('/api/customer-pricing')
        .set('x-user-id', '1')
        .send({ customer_id: 1, product_id: 1, special_price: 90 });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('should require either special price or discount percentage', async () => {
      const response = await request(app)
        .post('/api/customer-pricing')
        .set('x-user-id', '1')
        .send({ customer_id: 1, product_id: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('special price or discount percentage');
    });
  });

  describe('GET /api/discount-analytics', () => {
    test('should return discount analytics', async () => {
      const mockAnalytics = [
        { total_discounts: '50', total_discount_amount: '5000', discount_type: 'percentage' },
        { total_discounts: '30', total_discount_amount: '3000', discount_type: 'fixed_amount' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockAnalytics });

      const response = await request(app).get('/api/discount-analytics');

      expect(response.status).toBe(200);
      expect(response.body.analytics).toHaveLength(2);
    });
  });

  describe('DELETE /api/discount-rules/:id', () => {
    test('should delete discount rule', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 1 }] });

      const response = await request(app)
        .delete('/api/discount-rules/1')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should return 404 for non-existent rule', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/api/discount-rules/999')
        .set('x-user-id', '1');

      expect(response.status).toBe(404);
    });
  });
});
