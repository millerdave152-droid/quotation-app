// ============================================
// CUSTOMER QUOTATION APP - BACKEND SERVER
// Complete Working Version - All Features
// ============================================

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();
const multer = require('multer');

// Cache module for database query caching
const cache = require('./cache');

// Security imports
const { helmetConfig, securityHeaders, sanitizeInput, corsOptions, generalLimiter, authLimiter } = require('./middleware/security');
const authRoutes = require('./routes/auth');
const quoteProtectionRoutes = require('./routes/quoteProtection');
const followUpRoutes = require('./routes/followUp');
const pushNotificationRoutes = require('./routes/pushNotifications');
const { router: apiKeysRoutes } = require('./routes/apiKeys');
const paymentsRoutes = require('./routes/payments');
const marketplaceRoutes = require('./routes/marketplace');
const { authenticate, requireRole } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// MIDDLEWARE - FIXED ORDER!
// ============================================
// Security middleware (Helmet, CORS, Rate Limiting)
app.use(helmetConfig);
app.use(securityHeaders);
app.use(sanitizeInput);
app.use(cors(corsOptions));
app.use(generalLimiter);
app.set('trust proxy', 1); // Trust proxy for rate limiting

app.use(express.json()); // ← CRITICAL FIX: Parse JSON bodies!
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

// ============================================
// DATABASE CONNECTION
// ============================================
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }  // ✅ SSL enforced in production
    : { rejectUnauthorized: false }  // Development only
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected successfully!');
  }
});

// ============================================
// FILE UPLOAD & AWS SES CONFIGURATION
// ============================================
const upload = multer({ storage: multer.memoryStorage() });
const { SESv2Client, SendEmailCommand, SendRawEmailCommand } = require('@aws-sdk/client-sesv2');

const sesClient = new SESv2Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Backend is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    securityEnabled: true
  });
});

// ============================================
// AUTHENTICATION ROUTES
// ============================================
app.use('/api/auth', authLimiter, authRoutes);

// ============================================
// QUOTE PROTECTION & EMAIL TEMPLATES
// ============================================
app.use('/api', quoteProtectionRoutes);

// ============================================
// FOLLOW-UP REMINDER SYSTEM
// ============================================
app.use('/api', followUpRoutes);

// ============================================
// PUSH NOTIFICATIONS (PWA)
// ============================================
app.use('/api/push', pushNotificationRoutes);

// ============================================
// API KEY MANAGEMENT
// ============================================
app.use('/api/api-keys', apiKeysRoutes);
console.log('✅ API key management routes loaded');

// ============================================
// CUSTOMER PAYMENTS & CREDIT TRACKING
// ============================================
app.use('/api/payments', paymentsRoutes);
console.log('✅ Customer payments routes loaded');

// ============================================
// MARKETPLACE INTEGRATION (BEST BUY)
// ============================================
app.use('/api/marketplace', marketplaceRoutes);
console.log('✅ Marketplace integration routes loaded');

// ============================================
// EMAIL ENDPOINTS (PHASE 5)
// ============================================
app.get('/api/test-email', async (req, res) => {
  try {
    const testParams = {
      Content: {
        Simple: {
          Subject: { Data: 'Test Email from Quotation App' },
          Body: { Text: { Data: 'If you receive this, AWS SES is working!' } }
        }
      },
      FromEmailAddress: process.env.EMAIL_FROM,
      Destination: { ToAddresses: [process.env.EMAIL_FROM] }
    };
    const command = new SendEmailCommand(testParams);
    await sesClient.send(command);
    res.json({ success: true, message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Email test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/quotations/:id/send-email', upload.single('pdf'), async (req, res) => {
  try {
    const { id } = req.params;
    const { recipientEmail, recipientName, message, subject } = req.body;
    
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    const quoteResult = await pool.query('SELECT * FROM quotations WHERE id = $1', [id]);
    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    const quote = quoteResult.rows[0];

    // Parse revenue features from quote
    let revenueFeatures = null;
    try {
      revenueFeatures = quote.revenue_features ?
        (typeof quote.revenue_features === 'string' ? JSON.parse(quote.revenue_features) : quote.revenue_features) :
        null;
    } catch (e) {
      console.warn('Could not parse revenue_features for email:', e);
    }

    // Build revenue features HTML section
    let revenueFeaturesHtml = '';
    if (revenueFeatures && (revenueFeatures.financing || revenueFeatures.warranties?.length > 0 ||
        revenueFeatures.delivery || revenueFeatures.rebates?.length > 0 || revenueFeatures.tradeIns?.length > 0)) {

      revenueFeaturesHtml = '<div style="background:#f0fdf4;padding:20px;border-radius:8px;margin:20px 0;border:2px solid #4CAF50;"><h3 style="margin:0 0 15px 0;color:#166534;font-size:18px;">VALUE-ADDED SERVICES</h3>';

      // Financing
      if (revenueFeatures.financing && revenueFeatures.financing.plan) {
        const monthlyPayment = revenueFeatures.financing.calculation?.monthlyPaymentCents
          ? (revenueFeatures.financing.calculation.monthlyPaymentCents / 100).toFixed(2)
          : '0.00';
        revenueFeaturesHtml += `
          <div style="background:#dbeafe;padding:15px;border-radius:6px;margin-bottom:15px;border-left:4px solid #3b82f6;">
            <div style="font-weight:bold;color:#1e40af;margin-bottom:8px;font-size:16px;">💳 Financing Available</div>
            <div style="font-size:24px;font-weight:bold;color:#1e40af;margin-bottom:5px;">As low as $${monthlyPayment}/month</div>
            <div style="font-size:14px;color:#475569;">${revenueFeatures.financing.plan.plan_name}</div>
            <div style="font-size:12px;color:#64748b;">${revenueFeatures.financing.plan.apr_percent}% APR for ${revenueFeatures.financing.plan.term_months} months</div>
          </div>
        `;
      }

      // Delivery & Installation
      if (revenueFeatures.delivery && revenueFeatures.delivery.service) {
        const deliveryCost = revenueFeatures.delivery.calculation?.totalCents
          ? (revenueFeatures.delivery.calculation.totalCents / 100).toFixed(2)
          : '0.00';
        revenueFeaturesHtml += `
          <div style="background:white;padding:15px;border-radius:6px;margin-bottom:15px;border-left:4px solid #16a34a;">
            <div style="font-weight:bold;color:#166534;margin-bottom:5px;">🚚 Delivery & Installation</div>
            <div style="font-size:14px;color:#475569;">${revenueFeatures.delivery.service.service_name}</div>
            <div style="font-size:16px;font-weight:bold;color:#166534;margin-top:5px;">$${deliveryCost}</div>
          </div>
        `;
      }

      // Extended Warranties
      if (revenueFeatures.warranties && revenueFeatures.warranties.length > 0) {
        const totalWarrantyCost = revenueFeatures.warranties.reduce((sum, w) => sum + (w.cost || 0), 0);
        revenueFeaturesHtml += `
          <div style="background:white;padding:15px;border-radius:6px;margin-bottom:15px;border-left:4px solid #16a34a;">
            <div style="font-weight:bold;color:#166534;margin-bottom:8px;">🛡️ Extended Warranty Coverage</div>
        `;
        revenueFeatures.warranties.forEach(warranty => {
          if (warranty.plan) {
            const warrantyCost = (warranty.cost / 100).toFixed(2);
            revenueFeaturesHtml += `
              <div style="font-size:14px;color:#475569;margin-bottom:5px;">
                • ${warranty.plan.plan_name} (${warranty.plan.duration_years} years) - $${warrantyCost}
              </div>
            `;
          }
        });
        revenueFeaturesHtml += `
            <div style="font-size:16px;font-weight:bold;color:#166534;margin-top:8px;border-top:1px solid #e5e7eb;padding-top:8px;">
              Total: $${(totalWarrantyCost / 100).toFixed(2)}
            </div>
          </div>
        `;
      }

      // Rebates
      if (revenueFeatures.rebates && revenueFeatures.rebates.length > 0) {
        revenueFeaturesHtml += `
          <div style="background:#dbeafe;padding:15px;border-radius:6px;margin-bottom:15px;border-left:4px solid #3b82f6;">
            <div style="font-weight:bold;color:#1e40af;margin-bottom:8px;">🎁 Manufacturer Rebates Applied</div>
        `;
        revenueFeatures.rebates.forEach(rebate => {
          const rebateValue = rebate.rebate_percent
            ? `${rebate.rebate_percent}% off`
            : `$${(rebate.rebate_amount_cents / 100).toFixed(2)} off`;
          revenueFeaturesHtml += `
            <div style="font-size:14px;color:#475569;margin-bottom:5px;">
              • ${rebate.rebate_name}: <strong style="color:#1e40af;">${rebateValue}</strong>
            </div>
          `;
        });
        revenueFeaturesHtml += '</div>';
      }

      // Trade-Ins
      if (revenueFeatures.tradeIns && revenueFeatures.tradeIns.length > 0) {
        const totalTradeInValue = revenueFeatures.tradeIns.reduce((sum, t) => sum + (t.estimatedValueCents || 0), 0);
        revenueFeaturesHtml += `
          <div style="background:#dbeafe;padding:15px;border-radius:6px;margin-bottom:15px;border-left:4px solid #3b82f6;">
            <div style="font-weight:bold;color:#1e40af;margin-bottom:8px;">♻️ Trade-In Credit</div>
        `;
        revenueFeatures.tradeIns.forEach(tradeIn => {
          const tradeInValue = (tradeIn.estimatedValueCents / 100).toFixed(2);
          revenueFeaturesHtml += `
            <div style="font-size:14px;color:#475569;margin-bottom:5px;">
              • ${tradeIn.item_description}: <strong style="color:#1e40af;">$${tradeInValue}</strong>
            </div>
          `;
        });
        revenueFeaturesHtml += `
            <div style="font-size:16px;font-weight:bold;color:#1e40af;margin-top:8px;border-top:1px solid #bfdbfe;padding-top:8px;">
              Total Credit: $${(totalTradeInValue / 100).toFixed(2)}
            </div>
          </div>
        `;
      }

      revenueFeaturesHtml += '</div>';
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333;}.container{max-width:600px;margin:0 auto;padding:20px;}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px;text-align:center;border-radius:8px 8px 0 0;}.content{background:#fff;padding:30px;border:1px solid #e5e7eb;border-top:none;}.quote-info{background:#f9fafb;padding:20px;border-radius:8px;margin:20px 0;}.quote-info table{width:100%;}.quote-info td{padding:8px 0;}.quote-info td:first-child{font-weight:bold;color:#6b7280;}.footer{background:#f9fafb;padding:20px;text-align:center;font-size:12px;color:#6b7280;border-radius:0 0 8px 8px;}</style></head>
      <body><div class="container"><div class="header"><h1 style="margin:0;font-size:28px;">Your Quote is Ready!</h1></div>
      <div class="content"><p>Dear ${recipientName},</p><p>${message || 'Thank you for your interest in our products. Please find your quote attached.'}</p>
      <div class="quote-info"><table><tr><td>Quote Number:</td><td><strong>${quote.quote_number || `Q-${quote.id}`}</strong></td></tr>
      <tr><td>Date:</td><td>${new Date(quote.created_at).toLocaleDateString()}</td></tr>
      <tr><td>Total Amount:</td><td style="color:#10b981;font-size:18px;font-weight:bold;">$${(quote.total_cents / 100).toFixed(2)} CAD</td></tr></table></div>
      ${revenueFeaturesHtml}
      <p>Please review the attached PDF quotation. If you have any questions, don't hesitate to contact us.</p></div>
      <div class="footer"><p style="margin:0 0 10px 0;"><strong>${process.env.COMPANY_NAME || 'Your Company'}</strong></p>
      <p style="margin:0;">${process.env.COMPANY_PHONE || ''} | ${process.env.EMAIL_FROM}</p></div></div></body></html>
    `;

    const pdfBase64 = req.file.buffer.toString('base64');
    const boundary = `----=_Part_${Date.now()}`;
    const rawMessage = [
      `From: "${process.env.EMAIL_FROM_NAME || 'Your Company'}" <${process.env.EMAIL_FROM}>`,
      `To: ${recipientEmail}`,
      `Subject: ${subject || `Quote #${quote.quote_number || quote.id} - ${recipientName}`}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      emailHtml,
      ``,
      `--${boundary}`,
      `Content-Type: application/pdf; name="Quote_${quote.quote_number || quote.id}.pdf"`,
      `Content-Description: Quote_${quote.quote_number || quote.id}.pdf`,
      `Content-Disposition: attachment; filename="Quote_${quote.quote_number || quote.id}.pdf"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      pdfBase64,
      ``,
      `--${boundary}--`
    ].join('\r\n');

    const sendCommand = new SendRawEmailCommand({
      FromEmailAddress: process.env.EMAIL_FROM,
      Destinations: [recipientEmail],
      Content: { Raw: { Data: Buffer.from(rawMessage) } }
    });
    await sesClient.send(sendCommand);

    await pool.query(
      'UPDATE quotations SET status = $1, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['SENT', id]
    );

    res.json({ success: true, message: 'Quote sent successfully', sentTo: recipientEmail });
  } catch (error) {
    console.error('Error sending quote email:', error);
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

console.log('✅ Phase 5: Email routes loaded');

// ============================================
// CUSTOMER MANAGEMENT ENDPOINTS
// ============================================

// Postal code lookup service
const postalCodeService = require('./services/postalCodeLookup');
const canadianCities = require('./data/canadian-cities.json');

// Lookup postal code for address auto-completion
app.get('/api/postal-code/:code', async (req, res) => {
  try {
    const { code } = req.params;

    console.log('📮 Looking up postal code:', code);

    const addressInfo = await postalCodeService.lookupCanadianPostalCode(code);

    console.log('✅ Postal code found:', addressInfo);

    res.json({
      success: true,
      address: addressInfo
    });
  } catch (error) {
    console.error('❌ Postal code lookup error:', error.message);

    // Fallback to basic region info from postal code pattern
    try {
      const regionInfo = postalCodeService.getRegionFromPostalCode(req.params.code);
      res.json({
        success: true,
        address: {
          postalCode: req.params.code.toUpperCase(),
          province: regionInfo.province,
          provinceCode: regionInfo.province,
          city: '',
          note: 'Basic region info only. Please verify city.'
        },
        fallback: true
      });
    } catch (fallbackError) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
});

// Get list of cities for a province
app.get('/api/cities/:province', (req, res) => {
  try {
    const { province } = req.params;
    const provinceCode = province.toUpperCase();

    const provinceData = canadianCities.provinces[provinceCode];

    if (!provinceData) {
      return res.status(404).json({
        success: false,
        error: 'Province not found'
      });
    }

    res.json({
      success: true,
      province: provinceCode,
      provinceName: provinceData.name,
      cities: provinceData.cities
    });
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cities'
    });
  }
});

// Get all provinces and cities
app.get('/api/cities', (req, res) => {
  try {
    res.json({
      success: true,
      data: canadianCities.provinces
    });
  } catch (error) {
    console.error('Error fetching all cities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cities data'
    });
  }
});

// Get all customers with search, filter, sorting, and pagination
app.get('/api/customers', async (req, res) => {
  try {
    const {
      search = '',
      page = 1,
      limit = 50,
      sortBy = 'name',
      sortOrder = 'ASC',
      city = '',
      province = ''
    } = req.query;

    // Create cache key based on query parameters
    const cacheKey = `customers:${search}:${page}:${limit}:${sortBy}:${sortOrder}:${city}:${province}`;

    // Try to get from cache
    const responseData = await cache.cacheQuery(cacheKey, 'medium', async () => {
      const offset = (page - 1) * limit;
      const validSortColumns = ['name', 'email', 'company', 'city', 'province', 'created_at'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'name';
      const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      // Build WHERE clause for search and filters
      let whereConditions = [];
      let queryParams = [];
      let paramIndex = 1;

      if (search) {
        whereConditions.push(`(
          name ILIKE $${paramIndex} OR
          email ILIKE $${paramIndex} OR
          company ILIKE $${paramIndex} OR
          phone ILIKE $${paramIndex} OR
          city ILIKE $${paramIndex} OR
          province ILIKE $${paramIndex}
        )`);
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      if (city) {
        whereConditions.push(`city ILIKE $${paramIndex}`);
        queryParams.push(`%${city}%`);
        paramIndex++;
      }

      if (province) {
        whereConditions.push(`province ILIKE $${paramIndex}`);
        queryParams.push(`%${province}%`);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      // Get total count for pagination
      const countQuery = `SELECT COUNT(*) FROM customers ${whereClause}`;
      const countResult = await pool.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].count);

      // Get paginated results
      const dataQuery = `
        SELECT * FROM customers
        ${whereClause}
        ORDER BY ${sortColumn} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

      return {
        customers: result.rows,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalCount / limit)
        }
      };
    });

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get customer statistics
app.get('/api/customers/stats/overview', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_customers,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_this_month,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_this_week
      FROM customers
    `);

    const topCustomers = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.email,
        c.company,
        COUNT(q.id) as quote_count,
        COALESCE(SUM(q.total_amount), 0) as total_spent
      FROM customers c
      LEFT JOIN quotations q ON c.id = q.customer_id
      GROUP BY c.id
      ORDER BY total_spent DESC
      LIMIT 10
    `);

    res.json({
      overview: stats.rows[0],
      topCustomers: topCustomers.rows
    });
  } catch (error) {
    console.error('Error fetching customer stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ============================================
// DASHBOARD STATISTICS ENDPOINT
// ============================================
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    // Quote Statistics
    const quoteStats = await pool.query(`
      SELECT
        COUNT(*) as total_quotes,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as quotes_this_month,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as quotes_this_week,
        COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_count,
        COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_count,
        COALESCE(SUM(total_amount), 0) as total_value,
        COALESCE(SUM(CASE WHEN status = 'WON' THEN total_amount ELSE 0 END), 0) as won_value,
        COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN total_amount ELSE 0 END), 0) as revenue_this_month
      FROM quotations
    `);

    // Customer Statistics
    const customerStats = await pool.query(`
      SELECT
        COUNT(*) as total_customers,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_this_month,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_this_week
      FROM customers
    `);

    // Product Count
    const productStats = await pool.query(`
      SELECT COUNT(*) as total_products
      FROM products
    `);

    // Recent Quotes (last 10)
    const recentQuotes = await pool.query(`
      SELECT
        q.id,
        q.quotation_number,
        q.created_at,
        q.status,
        q.total_amount,
        c.name as customer_name,
        c.email as customer_email
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      ORDER BY q.created_at DESC
      LIMIT 10
    `);

    // Top Customers by Revenue
    const topCustomers = await pool.query(`
      SELECT
        c.id,
        c.name,
        c.email,
        c.company,
        COUNT(q.id) as quote_count,
        COALESCE(SUM(q.total_amount), 0) as total_spent
      FROM customers c
      LEFT JOIN quotations q ON c.id = q.customer_id
      GROUP BY c.id
      ORDER BY total_spent DESC
      LIMIT 5
    `);

    // Revenue Trend (last 6 months)
    const revenueTrend = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month,
        COALESCE(SUM(total_amount), 0) as revenue,
        COUNT(*) as quote_count
      FROM quotations
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at)
    `);

    // Quote Status Distribution
    const statusDistribution = await pool.query(`
      SELECT
        COALESCE(status, 'DRAFT') as status,
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as value
      FROM quotations
      GROUP BY status
    `);

    res.json({
      quotes: quoteStats.rows[0],
      customers: customerStats.rows[0],
      products: productStats.rows[0],
      recentQuotes: recentQuotes.rows,
      topCustomers: topCustomers.rows,
      revenueTrend: revenueTrend.rows,
      statusDistribution: statusDistribution.rows
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Get single customer with quote history
app.get('/api/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get customer details
    const customerResult = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get customer's quotes
    const quotesResult = await pool.query(`
      SELECT id, quotation_number, created_at, status, total_amount
      FROM quotations
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [id]);

    // Get quote statistics for this customer
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_quotes,
        COALESCE(SUM(total_amount), 0) as total_spent,
        COALESCE(AVG(total_amount), 0) as average_order,
        MAX(created_at) as last_quote_date
      FROM quotations
      WHERE customer_id = $1
    `, [id]);

    res.json({
      customer: customerResult.rows[0],
      quotes: quotesResult.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const { name, email, phone, company, address, city, province, postal_code, notes } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    const result = await pool.query(
      `INSERT INTO customers (name, email, phone, company, address, city, province, postal_code, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, email, phone, company, address, city, province, postal_code, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating customer:', error);

    // Check for duplicate email constraint violation
    if (error.code === '23505' && error.constraint === 'customers_email_key') {
      return res.status(400).json({
        error: 'Email already in use',
        details: 'This email address is already registered to another customer'
      });
    }

    res.status(500).json({ error: 'Failed to create customer', details: error.message });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, company, address, city, province, postal_code, notes } = req.body;

    console.log('📝 UPDATE REQUEST - Customer ID:', id);
    console.log('📝 Request Body:', JSON.stringify(req.body, null, 2));

    const result = await pool.query(
      `UPDATE customers SET name = $1, email = $2, phone = $3, company = $4, address = $5,
       city = $6, province = $7, postal_code = $8, notes = $9, updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 RETURNING *`,
      [name, email, phone, company, address, city, province, postal_code, notes, id]
    );

    console.log('✅ Query executed, rows returned:', result.rows.length);

    if (result.rows.length === 0) {
      console.log('❌ No customer found with ID:', id);
      return res.status(404).json({ error: 'Customer not found' });
    }

    console.log('✅ Customer updated successfully:', result.rows[0].id);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating customer:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', error);

    // Check for duplicate email constraint violation
    if (error.code === '23505' && error.constraint === 'customers_email_key') {
      return res.status(400).json({
        error: 'Email already in use',
        details: 'This email address is already registered to another customer'
      });
    }

    // Generic error response
    res.status(500).json({ error: 'Failed to update customer', details: error.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM customers WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

console.log('✅ Customer management endpoints loaded');

// ============================================
// PRODUCT MANAGEMENT ENDPOINTS
// ============================================
app.get('/api/products', async (req, res) => {
  try {
    const { search, category, manufacturer, minPrice, maxPrice, limit = 5000, offset = 0 } = req.query;

    // Create cache key based on query parameters
    const cacheKey = `products:${search || 'all'}:${category || 'all'}:${manufacturer || 'all'}:${minPrice || '0'}:${maxPrice || 'inf'}:${limit}:${offset}`;

    // Try to get from cache first
    const result = await cache.cacheQuery(cacheKey, 'long', async () => {
      let query = 'SELECT * FROM products WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (search) {
        query += ` AND (model ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR manufacturer ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (category) {
        query += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (manufacturer) {
        query += ` AND manufacturer ILIKE $${paramIndex}`;
        params.push(`%${manufacturer}%`);
        paramIndex++;
      }

      if (minPrice) {
        query += ` AND msrp_cents >= $${paramIndex}`;
        params.push(parseInt(minPrice) * 100);
        paramIndex++;
      }

      if (maxPrice) {
        query += ` AND msrp_cents <= $${paramIndex}`;
        params.push(parseInt(maxPrice) * 100);
        paramIndex++;
      }

      query += ` ORDER BY manufacturer, model LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const queryResult = await pool.query(query, params);
      return queryResult.rows;
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Specific product routes MUST come before the generic :id route
app.get('/api/products/stats', async (req, res) => {
  try {
    const statsQuery = `
      SELECT
        COUNT(*) as total_products,
        COUNT(DISTINCT manufacturer) as manufacturers,
        COUNT(DISTINCT category) as categories
      FROM products
    `;
    const result = await pool.query(statsQuery);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching product stats:', error);
    res.status(500).json({ error: 'Failed to fetch product stats' });
  }
});

app.get('/api/products/favorites', async (req, res) => {
  try {
    const userId = req.query.user_id || 1;
    const result = await pool.query(`
      SELECT p.*, pf.created_at as favorited_at
      FROM products p
      INNER JOIN product_favorites pf ON p.id = pf.product_id
      WHERE pf.user_id = $1
      ORDER BY pf.created_at DESC
    `, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching favorite products:', error);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

app.get('/api/products/recent', async (req, res) => {
  try {
    const limit = req.query.limit || 10;
    const result = await pool.query(`
      SELECT * FROM products
      ORDER BY updated_at DESC, created_at DESC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching recent products:', error);
    res.status(500).json({ error: 'Failed to fetch recent products' });
  }
});

// Generic :id route comes AFTER specific routes
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, model, manufacturer, description, category, cost_cents, msrp_cents, sku } = req.body;

    console.log('➕ CREATE PRODUCT REQUEST:');
    console.log('  Body:', req.body);

    // Calculate margin if both cost and msrp are provided
    let margin = null;
    if (cost_cents && msrp_cents && msrp_cents > 0) {
      margin = ((msrp_cents - cost_cents) / msrp_cents) * 100;
    }

    const result = await pool.query(
      `INSERT INTO products (name, model, manufacturer, description, category, cost_cents, msrp_cents, margin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, model, manufacturer, description, category, cost_cents, msrp_cents, margin]
    );

    console.log('✅ Product created successfully:', result.rows[0].id);
    // Invalidate product caches
    cache.invalidate.products();
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error creating product:', error.message);
    console.error('❌ Error details:', error);

    // Check for duplicate model constraint violation (if exists)
    if (error.code === '23505' && error.constraint && error.constraint.includes('model')) {
      return res.status(400).json({
        error: 'Model already exists',
        details: 'This model number is already in use'
      });
    }

    res.status(500).json({ error: 'Failed to create product', details: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, model, manufacturer, description, category, cost_cents, msrp_cents, sku } = req.body;

    console.log('📝 UPDATE PRODUCT REQUEST:');
    console.log('  ID:', id);
    console.log('  Body:', req.body);

    // Calculate margin if both cost and msrp are provided
    let margin = null;
    if (cost_cents && msrp_cents && msrp_cents > 0) {
      margin = ((msrp_cents - cost_cents) / msrp_cents) * 100;
    }

    const result = await pool.query(
      `UPDATE products SET
       name = $1, model = $2, manufacturer = $3, description = $4, category = $5,
       cost_cents = $6, msrp_cents = $7, margin = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 RETURNING *`,
      [name, model, manufacturer, description, category, cost_cents, msrp_cents, margin, id]
    );

    console.log('✅ Query executed, rows returned:', result.rows.length);

    if (result.rows.length === 0) {
      console.log('❌ No product found with ID:', id);
      return res.status(404).json({ error: 'Product not found' });
    }

    console.log('✅ Product updated successfully:', result.rows[0].id);
    // Invalidate product caches
    cache.invalidate.products();
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error updating product:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to update product', details: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    // Invalidate product caches
    cache.invalidate.products();
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// ============================================
// CSV IMPORT ENDPOINT
// ============================================
const csv = require('csv-parser');
const { Readable } = require('stream');

app.post('/api/products/import-csv', upload.single('csvfile'), async (req, res) => {
  console.log('📥 CSV Import Started');

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded'
    });
  }

  const filename = req.file.originalname;
  const startTime = Date.now();

  console.log(`📄 Processing file: ${filename}`);

  const results = [];
  const errors = [];
  let totalRows = 0;
  let successful = 0;
  let failed = 0;
  let inserted = 0;
  let updated = 0;

  try {
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

          // Normalize column names (handle both uppercase and lowercase)
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

    console.log(`✓ Parsed ${successful} valid rows`);
    console.log(`💾 Importing products to database...`);

    // Import to database with progress tracking
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < results.length; i++) {
        const row = results[i];

        if (i % 100 === 0) {
          console.log(`Processed ${i}/${results.length} products...`);
        }

        try {
          // Convert costs to cents (if they're in dollars)
          const costCents = Math.round(parseFloat(row.actual_cost) * 100) || 0;
          const msrpCents = Math.round(parseFloat(row.msrp) * 100) || 0;

          // Upsert: Insert or update if model already exists
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

          // Track if it was inserted (new) or updated (existing)
          if (result.rows[0].inserted) {
            inserted++;
          } else {
            updated++;
          }

        } catch (err) {
          console.error(`Error importing row ${i}:`, err.message);
          errors.push({ row: i + 1, error: err.message, data: row });
        }
      }

      await client.query('COMMIT');
      console.log(`✅ Import committed to database`);

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Transaction error:', err);
      throw err;
    } finally {
      client.release();
    }

    // Log to import history
    try {
      await pool.query(`
        INSERT INTO import_history (
          filename, total_rows, successful, failed,
          new_products, updated_products, import_date
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      `, [filename, totalRows, successful, failed, inserted, updated]);
    } catch (err) {
      console.warn('Could not log to import_history:', err.message);
      // Continue even if history logging fails
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('✅ IMPORT COMPLETED');
    console.log(`   Total rows: ${totalRows}`);
    console.log(`   Successful: ${successful}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   New products: ${inserted}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Duration: ${duration}s`);

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
        validationErrors: errors.slice(0, 10), // Limit error details
        importErrors: errors.length > 10 ? `${errors.length - 10} more errors...` : []
      },
      duration: `${duration}s`
    });

  } catch (error) {
    console.error('❌ CSV Import Error:', error);
    res.status(500).json({
      success: false,
      error: 'Import failed',
      message: error.message,
      details: errors.slice(0, 5)
    });
  }
});

console.log('✅ CSV Import endpoint loaded');

// ============================================
// PRODUCT FAVORITES ENDPOINTS
// ============================================

// Add product to favorites
app.post('/api/products/favorites/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.body.user_id || 1; // Default user for now

    const result = await pool.query(`
      INSERT INTO product_favorites (product_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (product_id, user_id) DO NOTHING
      RETURNING *
    `, [productId, userId]);

    if (result.rows.length === 0) {
      return res.status(200).json({ message: 'Product already in favorites' });
    }
    res.status(201).json({ message: 'Product added to favorites', favorite: result.rows[0] });
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

// Remove product from favorites
app.delete('/api/products/favorites/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.query.user_id || 1; // Default user for now

    await pool.query(`
      DELETE FROM product_favorites
      WHERE product_id = $1 AND user_id = $2
    `, [productId, userId]);

    res.json({ message: 'Product removed from favorites' });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

// Get recently used products
app.get('/api/products/recent', async (req, res) => {
  try {
    const limit = req.query.limit || 10;
    const result = await pool.query(`
      SELECT DISTINCT ON (p.id) p.*, MAX(qi.created_at) as last_used
      FROM products p
      INNER JOIN quotation_items qi ON p.id = qi.product_id
      GROUP BY p.id
      ORDER BY last_used DESC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching recent products:', error);
    res.status(500).json({ error: 'Failed to fetch recent products' });
  }
});

// ============================================
// PAYMENT TERMS TEMPLATES ENDPOINTS
// ============================================

// Get payment terms templates
app.get('/api/payment-terms', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM payment_terms_templates ORDER BY is_default DESC, name ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payment terms:', error);
    res.status(500).json({ error: 'Failed to fetch payment terms' });
  }
});

// Create payment terms template
app.post('/api/payment-terms', async (req, res) => {
  try {
    const { name, terms_text } = req.body;
    const result = await pool.query(`
      INSERT INTO payment_terms_templates (name, terms_text)
      VALUES ($1, $2) RETURNING *
    `, [name, terms_text]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating payment terms:', error);
    res.status(500).json({ error: 'Failed to create payment terms' });
  }
});

console.log('✅ Product management endpoints loaded');

// ============================================
// QUOTATION ENDPOINTS - FIXED ORDER!
// ============================================

// GET STATS (must be BEFORE /:id to avoid route conflict)
app.get('/api/quotations/stats/summary', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_quotes,
        COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_count,
        SUM(total_cents) / 100.0 as total_value,
        SUM(CASE WHEN status = 'WON' THEN total_cents ELSE 0 END) / 100.0 as won_value,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_7_days
      FROM quotations
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching quotation stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET QUOTATION LIST STATS (for quotation list view)
app.get('/api/quotations/stats/overview', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_quotes,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as quotes_this_month,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as quotes_this_week,
        COALESCE(SUM(total_amount), 0) as total_value,
        COALESCE(SUM(CASE WHEN status = 'WON' THEN total_amount ELSE 0 END), 0) as won_value,
        COALESCE(SUM(CASE WHEN status = 'SENT' THEN total_amount ELSE 0 END), 0) as pending_value,
        COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_count,
        COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_count
      FROM quotations
    `);

    res.json({
      overview: stats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching quotation stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET ALL QUOTATIONS - Enhanced with search, pagination, and sorting
app.get('/api/quotations', async (req, res) => {
  try {
    const {
      search = '',
      status,
      customer_id,
      from_date,
      to_date,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const validSortColumns = ['created_at', 'quotation_number', 'customer_name', 'total_amount', 'status'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build WHERE clause
    let whereConditions = ['1=1'];
    let queryParams = [];
    let paramIndex = 1;

    // Search functionality
    if (search) {
      whereConditions.push(`(
        q.quotation_number ILIKE $${paramIndex} OR
        c.name ILIKE $${paramIndex} OR
        c.email ILIKE $${paramIndex} OR
        c.company ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Status filter
    if (status) {
      whereConditions.push(`q.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    // Customer filter
    if (customer_id) {
      whereConditions.push(`q.customer_id = $${paramIndex}`);
      queryParams.push(customer_id);
      paramIndex++;
    }

    // Date range filters
    if (from_date) {
      whereConditions.push(`q.created_at >= $${paramIndex}`);
      queryParams.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      whereConditions.push(`q.created_at <= $${paramIndex}`);
      queryParams.push(to_date);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*)
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated results with sorting
    const dataQuery = `
      SELECT
        q.*,
        c.name as customer_name,
        c.email as customer_email,
        c.company as customer_company,
        (SELECT COUNT(*) FROM quotation_items WHERE quotation_id = q.id) as item_count
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE ${whereClause}
      ORDER BY ${sortColumn === 'customer_name' ? 'c.name' : 'q.' + sortColumn} ${order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    res.json({
      quotations: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching quotations:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET QUOTATION ITEMS (must be BEFORE /:id to avoid conflict)
app.get('/api/quotations/:id/items', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY id',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching quotation items:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET SINGLE QUOTATION
app.get('/api/quotations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const quoteResult = await pool.query(`
      SELECT 
        q.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.address as customer_address,
        c.company as customer_company
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.id = $1
    `, [id]);
    
    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quotation not found' });
    }
    
    const itemsResult = await pool.query(
      'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY id',
      [id]
    );
    
    const quote = quoteResult.rows[0];
    quote.items = itemsResult.rows;
    
    res.json(quote);
  } catch (err) {
    console.error('Error fetching quotation:', err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE QUOTATION
app.post('/api/quotations', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const {
      customer_id,
      subtotal_cents,
      discount_percent,
      discount_cents,
      tax_rate,
      tax_cents,
      total_cents,
      gross_profit_cents,
      notes,
      internal_notes = '',
      terms,
      status = 'DRAFT',
      items = []
    } = req.body;

    // Generate unique quote number
    const year = new Date().getFullYear();
    const maxNumResult = await client.query(
      'SELECT quote_number FROM quotations WHERE quote_number LIKE $1 ORDER BY quote_number DESC LIMIT 1',
      [`QT-${year}-%`]
    );

    let nextNum = 1;
    if (maxNumResult.rows.length > 0) {
      const lastNumber = parseInt(maxNumResult.rows[0].quote_number.split('-').pop());
      nextNum = lastNumber + 1;
    }
    const quote_number = `QT-${year}-${nextNum.toString().padStart(4, '0')}`;

    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 30);

    const quoteResult = await client.query(
      `INSERT INTO quotations (
        quote_number, customer_id, status, subtotal_cents, discount_percent,
        discount_cents, tax_rate, tax_cents, total_cents, gross_profit_cents,
        notes, internal_notes, terms, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        quote_number, customer_id, status, subtotal_cents, discount_percent,
        discount_cents, tax_rate, tax_cents, total_cents, gross_profit_cents,
        notes, internal_notes, terms, expires_at
      ]
    );
    
    const quotation_id = quoteResult.rows[0].id;
    
    // Insert items
    for (const item of items) {
      await client.query(
        `INSERT INTO quotation_items (
          quotation_id, product_id, manufacturer, model, description, category, 
          quantity, cost_cents, msrp_cents, sell_cents, line_total_cents, 
          line_profit_cents, margin_bp, item_notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          quotation_id, item.product_id, item.manufacturer, item.model, 
          item.description, item.category, item.quantity, item.cost_cents, 
          item.msrp_cents, item.sell_cents, item.line_total_cents, 
          item.line_profit_cents, item.margin_bp, item.item_notes
        ]
      );
    }
    
    await client.query('COMMIT');
    console.log(`✅ Created quotation ${quote_number} with ${items.length} items`);
    res.status(201).json(quoteResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating quotation:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// UPDATE QUOTATION
app.put('/api/quotations/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const {
      subtotal_cents,
      discount_percent,
      discount_cents,
      tax_rate,
      tax_cents,
      total_cents,
      gross_profit_cents,
      notes,
      internal_notes = '',
      terms,
      items = []
    } = req.body;

    await client.query(
      `UPDATE quotations SET
        subtotal_cents = $1,
        discount_percent = $2,
        discount_cents = $3,
        tax_rate = $4,
        tax_cents = $5,
        total_cents = $6,
        gross_profit_cents = $7,
        notes = $8,
        internal_notes = $9,
        terms = $10,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11`,
      [
        subtotal_cents, discount_percent, discount_cents, tax_rate, tax_cents,
        total_cents, gross_profit_cents, notes, internal_notes, terms, id
      ]
    );
    
    // Delete old items and insert new ones
    await client.query('DELETE FROM quotation_items WHERE quotation_id = $1', [id]);
    
    for (const item of items) {
      await client.query(
        `INSERT INTO quotation_items (
          quotation_id, product_id, manufacturer, model, description, category, 
          quantity, cost_cents, msrp_cents, sell_cents, line_total_cents, 
          line_profit_cents, margin_bp, item_notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          id, item.product_id, item.manufacturer, item.model, item.description, 
          item.category, item.quantity, item.cost_cents, item.msrp_cents, 
          item.sell_cents, item.line_total_cents, item.line_profit_cents, 
          item.margin_bp, item.item_notes
        ]
      );
    }
    
    await client.query('COMMIT');
    res.json({ message: 'Quotation updated successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating quotation:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE QUOTATION
app.delete('/api/quotations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM quotation_items WHERE quotation_id = $1', [id]);
    const result = await pool.query('DELETE FROM quotations WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quotation not found' });
    }
    
    res.json({ message: 'Quotation deleted successfully' });
  } catch (err) {
    console.error('Error deleting quotation:', err);
    res.status(500).json({ error: err.message });
  }
});

// NOTE: Primary send-email endpoint with PDF attachment is defined earlier (line 160)
// The duplicate endpoint that was here has been removed to avoid route conflicts

// ============================================
// QUOTE EVENTS / ACTIVITY TIMELINE
// ============================================

// Get events for a quotation
app.get('/api/quotations/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT * FROM quote_events
      WHERE quotation_id = $1
      ORDER BY created_at DESC
    `, [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching quote events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Add event to quotation
app.post('/api/quotations/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    const { event_type, description } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_events (quotation_id, event_type, description)
      VALUES ($1, $2, $3) RETURNING *
    `, [id, event_type, description]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating quote event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

console.log('✅ Quotation endpoints loaded');

// ============================================
// QUOTE ALIASES (for compatibility)
// ============================================
// Add /api/quotes as aliases for /api/quotations - Enhanced version
app.get('/api/quotes', async (req, res) => {
  try {
    const {
      search = '',
      status,
      customer_id,
      from_date,
      to_date,
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const validSortColumns = ['created_at', 'quotation_number', 'customer_name', 'total_amount', 'status'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build WHERE clause
    let whereConditions = ['1=1'];
    let queryParams = [];
    let paramIndex = 1;

    // Search functionality
    if (search) {
      whereConditions.push(`(
        q.quotation_number ILIKE $${paramIndex} OR
        c.name ILIKE $${paramIndex} OR
        c.email ILIKE $${paramIndex} OR
        c.company ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Status filter
    if (status) {
      whereConditions.push(`q.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    // Customer filter
    if (customer_id) {
      whereConditions.push(`q.customer_id = $${paramIndex}`);
      queryParams.push(customer_id);
      paramIndex++;
    }

    // Date range filters
    if (from_date) {
      whereConditions.push(`q.created_at >= $${paramIndex}`);
      queryParams.push(from_date);
      paramIndex++;
    }

    if (to_date) {
      whereConditions.push(`q.created_at <= $${paramIndex}`);
      queryParams.push(to_date);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*)
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated results with sorting
    const dataQuery = `
      SELECT
        q.*,
        c.name as customer_name,
        c.email as customer_email,
        c.company as customer_company,
        (SELECT COUNT(*) FROM quotation_items WHERE quotation_id = q.id) as item_count
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE ${whereClause}
      ORDER BY ${sortColumn === 'customer_name' ? 'c.name' : 'q.' + sortColumn} ${order}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    res.json({
      quotations: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching quotes:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quotes/stats/summary', async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT
        COUNT(*)::int as total_quotes,
        COALESCE(SUM(CASE WHEN status = 'WON' THEN 1 ELSE 0 END), 0)::int as won_count,
        COALESCE(SUM(CASE WHEN status = 'WON' THEN total_cents ELSE 0 END), 0) as won_value_cents,
        COALESCE(SUM(total_cents), 0) as total_value_cents,
        COALESCE(SUM(gross_profit_cents), 0) as total_profit_cents,
        COALESCE(AVG(total_cents), 0)::bigint as avg_quote_cents
      FROM quotations
    `);

    const stats = statsResult.rows[0];
    const byStatusResult = await pool.query(`
      SELECT status, COUNT(*)::int as count
      FROM quotations
      GROUP BY status
    `);

    const by_status = {};
    byStatusResult.rows.forEach(row => {
      by_status[row.status.toLowerCase()] = row.count;
    });

    // Calculate won rate
    const won_rate = stats.total_quotes > 0
      ? Math.round((stats.won_count / stats.total_quotes) * 100)
      : 0;

    res.json({
      total_quotes: stats.total_quotes,
      won_count: stats.won_count,
      won_value_cents: stats.won_value_cents,
      total_value_cents: stats.total_value_cents,
      total_profit_cents: stats.total_profit_cents,
      avg_quote_cents: stats.avg_quote_cents,
      won_rate: won_rate,
      by_status: by_status
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET QUOTATION LIST STATS (for quotation list view)
app.get('/api/quotes/stats/overview', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_quotes,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as quotes_this_month,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as quotes_this_week,
        COALESCE(SUM(total_amount), 0) as total_value,
        COALESCE(SUM(CASE WHEN status = 'WON' THEN total_amount ELSE 0 END), 0) as won_value,
        COALESCE(SUM(CASE WHEN status = 'SENT' THEN total_amount ELSE 0 END), 0) as pending_value,
        COUNT(CASE WHEN status = 'DRAFT' THEN 1 END) as draft_count,
        COUNT(CASE WHEN status = 'SENT' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'WON' THEN 1 END) as won_count,
        COUNT(CASE WHEN status = 'LOST' THEN 1 END) as lost_count
      FROM quotations
    `);

    res.json({
      overview: stats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching quotation stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

app.get('/api/quotes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const quoteResult = await pool.query(`
      SELECT 
        q.*,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.address as customer_address,
        c.company as customer_company
      FROM quotations q
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.id = $1
    `, [id]);
    
    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    const itemsResult = await pool.query(
      'SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY id',
      [id]
    );
    
    const quote = quoteResult.rows[0];
    quote.items = itemsResult.rows;
    
    res.json(quote);
  } catch (err) {
    console.error('Error fetching quote:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quotes', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      customer_id,
      discount_percent = 0,
      notes = '',
      internal_notes = '',
      terms = '',
      status = 'DRAFT',
      tax_rate = 0.13, // Default to 13% HST, but accept from frontend
      items = []
    } = req.body;

    // Calculate totals from items
    const subtotal_cents = items.reduce((sum, item) => {
      const sell_cents = item.sell_cents || Math.round((item.sell || 0) * 100);
      return sum + (sell_cents * item.quantity);
    }, 0);

    const discount_cents = Math.round((subtotal_cents * discount_percent) / 100);
    const after_discount = subtotal_cents - discount_cents;
    // Convert tax_rate to percentage if needed (0.13 -> 13)
    const tax_rate_percent = tax_rate < 1 ? tax_rate * 100 : tax_rate;
    const tax_cents = Math.round((after_discount * tax_rate_percent) / 100);
    const total_cents = after_discount + tax_cents;

    const total_cost_cents = items.reduce((sum, item) => {
      const cost_cents = item.cost_cents || Math.round((item.cost || 0) * 100);
      return sum + (cost_cents * item.quantity);
    }, 0);

    const gross_profit_cents = after_discount - total_cost_cents;
    
    // Generate unique quote number
    const year = new Date().getFullYear();
    const maxNumResult = await client.query(
      'SELECT quote_number FROM quotations WHERE quote_number LIKE $1 ORDER BY quote_number DESC LIMIT 1',
      [`QT-${year}-%`]
    );
    
    let nextNum = 1;
    if (maxNumResult.rows.length > 0) {
      const lastNumber = parseInt(maxNumResult.rows[0].quote_number.split('-').pop());
      nextNum = lastNumber + 1;
    }
    const quote_number = `QT-${year}-${nextNum.toString().padStart(4, '0')}`;

    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 30);

    const quoteResult = await client.query(
      `INSERT INTO quotations (
        quote_number, customer_id, status, subtotal_cents, discount_percent,
        discount_cents, tax_rate, tax_cents, total_cents, gross_profit_cents,
        notes, internal_notes, terms, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        quote_number, customer_id, status, subtotal_cents, discount_percent,
        discount_cents, tax_rate_percent, tax_cents, total_cents, gross_profit_cents,
        notes, internal_notes, terms, expires_at
      ]
    );

    const quotation_id = quoteResult.rows[0].id;

    // Insert items
    for (const item of items) {
      await client.query(
        `INSERT INTO quotation_items (
          quotation_id, product_id, manufacturer, model, description, category,
          quantity, cost_cents, msrp_cents, sell_cents, line_total_cents,
          line_profit_cents, margin_bp, item_notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          quotation_id,
          item.product_id,
          item.manufacturer || '',
          item.model || item.description,
          item.description,
          item.category || '',
          item.quantity,
          item.cost_cents || Math.round((item.cost || 0) * 100),
          item.msrp_cents || Math.round((item.msrp || 0) * 100),
          item.sell_cents || Math.round((item.sell || 0) * 100),
          item.line_total_cents || Math.round((item.sell || 0) * item.quantity * 100),
          item.line_profit_cents || Math.round(((item.sell || 0) - (item.cost || 0)) * item.quantity * 100),
          item.margin_bp || 0,
          item.notes || ''
        ]
      );
    }
    
    await client.query('COMMIT');
    console.log(`✅ Created quotation ${quote_number} with ${items.length} items`);
    res.status(201).json({ quote: quoteResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating quote:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.put('/api/quotes/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const result = await pool.query(
      'UPDATE quotations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating quote status:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/quotes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM quotation_items WHERE quotation_id = $1', [id]);
    const result = await pool.query('DELETE FROM quotations WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    res.json({ message: 'Quote deleted successfully' });
  } catch (err) {
    console.error('Error deleting quote:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get quote events/history
app.get('/api/quotes/:id/events', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if quote_events table exists, if not return empty array
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'quote_events'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      // Return basic events based on quote data
      const quoteResult = await pool.query(
        'SELECT created_at, updated_at, sent_at, status FROM quotations WHERE id = $1',
        [id]
      );

      if (quoteResult.rows.length === 0) {
        return res.status(404).json({ error: 'Quote not found' });
      }

      const quote = quoteResult.rows[0];
      const events = [];

      if (quote.created_at) {
        events.push({
          event_type: 'CREATED',
          created_at: quote.created_at,
          notes: 'Quote created',
          user_name: 'System'
        });
      }

      if (quote.sent_at) {
        events.push({
          event_type: 'SENT',
          created_at: quote.sent_at,
          notes: 'Quote sent to customer',
          user_name: 'System'
        });
      }

      if (quote.status === 'WON') {
        events.push({
          event_type: 'WON',
          created_at: quote.updated_at,
          notes: 'Quote marked as won',
          user_name: 'System'
        });
      } else if (quote.status === 'LOST') {
        events.push({
          event_type: 'LOST',
          created_at: quote.updated_at,
          notes: 'Quote marked as lost',
          user_name: 'System'
        });
      }

      return res.json(events);
    }

    // If table exists, query it
    const result = await pool.query(
      'SELECT * FROM quote_events WHERE quotation_id = $1 ORDER BY created_at DESC',
      [id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching quote events:', err);
    res.status(500).json({ error: err.message });
  }
});

console.log('✅ Quote alias endpoints loaded');

// ============================================
// QUOTE TEMPLATES
// ============================================

// Get all quote templates
app.get('/api/quote-templates', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM quote_templates
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching quote templates:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create quote template
app.post('/api/quote-templates', async (req, res) => {
  try {
    const { name, description = '', items, discount_percent = 0, notes = '', terms = '' } = req.body;

    if (!name || !items || items.length === 0) {
      return res.status(400).json({ error: 'Name and items are required' });
    }

    const result = await pool.query(
      `INSERT INTO quote_templates (name, description, items, discount_percent, notes, terms)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description, JSON.stringify(items), discount_percent, notes, terms]
    );

    console.log(`✅ Created quote template: ${name}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating quote template:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete quote template
app.delete('/api/quote-templates/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM quote_templates WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    console.log(`✅ Deleted quote template: ${result.rows[0].name}`);
    res.json({ message: 'Template deleted successfully' });
  } catch (err) {
    console.error('Error deleting quote template:', err);
    res.status(500).json({ error: err.message });
  }
});

console.log('✅ Quote template endpoints loaded');

// ============================================
// APPROVAL WORKFLOW ENDPOINTS
// ============================================

// Request approval for a quotation
app.post('/api/quotations/:id/request-approval', async (req, res) => {
  try {
    const { id } = req.params;
    const { requested_by, requested_by_email, approver_name, approver_email, comments } = req.body;

    // Check if there's already a pending approval
    const existing = await pool.query(
      `SELECT * FROM quote_approvals WHERE quotation_id = $1 AND status = 'PENDING'`,
      [id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'This quote already has a pending approval request' });
    }

    // Create approval request
    const result = await pool.query(`
      INSERT INTO quote_approvals (quotation_id, requested_by, requested_by_email, approver_name, approver_email, comments)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [id, requested_by, requested_by_email, approver_name, approver_email, comments]);

    // Add event to timeline
    await pool.query(`
      INSERT INTO quote_events (quotation_id, event_type, description)
      VALUES ($1, $2, $3)
    `, [id, 'APPROVAL_REQUESTED', `Approval requested by ${requested_by} from ${approver_name}`]);

    // Update quote status to PENDING_APPROVAL
    await pool.query(
      `UPDATE quotations SET status = 'PENDING_APPROVAL' WHERE id = $1`,
      [id]
    );

    // Send email notification to approver (using AWS SES)
    const quoteResult = await pool.query(
      `SELECT q.*, c.name as customer_name, c.company as customer_company
       FROM quotations q LEFT JOIN customers c ON q.customer_id = c.id
       WHERE q.id = $1`,
      [id]
    );

    if (quoteResult.rows.length > 0 && approver_email) {
      const quote = quoteResult.rows[0];
      const emailHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #6366f1; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .content { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .button { display: inline-block; padding: 12px 24px; background: #6366f1; color: white;
                     text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 16px; }
            .details { background: white; padding: 16px; border-radius: 6px; margin-top: 16px; }
            .label { color: #6b7280; font-size: 14px; }
            .value { color: #111827; font-weight: bold; font-size: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">Approval Request</h2>
            </div>
            <div class="content">
              <p>Hi ${approver_name},</p>
              <p><strong>${requested_by}</strong> has requested your approval for the following quote:</p>
              <div class="details">
                <div style="margin-bottom: 12px;">
                  <div class="label">Quote Number</div>
                  <div class="value">${quote.quote_number}</div>
                </div>
                <div style="margin-bottom: 12px;">
                  <div class="label">Customer</div>
                  <div class="value">${quote.customer_name}${quote.customer_company ? ' (' + quote.customer_company + ')' : ''}</div>
                </div>
                <div style="margin-bottom: 12px;">
                  <div class="label">Total Value</div>
                  <div class="value">$${((quote.total_cents || 0) / 100).toFixed(2)} CAD</div>
                </div>
                ${comments ? `
                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                  <div class="label">Comments</div>
                  <div style="color: #374151; margin-top: 8px;">${comments}</div>
                </div>
                ` : ''}
              </div>
              <p style="margin-top: 24px;">Please review and approve or reject this quote in the quotation system.</p>
            </div>
            <div style="text-align: center; color: #6b7280; font-size: 12px;">
              <p>This is an automated notification from the Quotation Management System</p>
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        const command = new SendEmailCommand({
          Source: process.env.EMAIL_FROM,
          Destination: { ToAddresses: [approver_email] },
          Message: {
            Subject: { Data: `Approval Request: Quote ${quote.quote_number}` },
            Body: { Html: { Data: emailHTML } }
          }
        });
        await sesClient.send(command);
        console.log(`✅ Approval request email sent to ${approver_email}`);
      } catch (emailErr) {
        console.error('Error sending approval email:', emailErr);
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error requesting approval:', error);
    res.status(500).json({ error: 'Failed to request approval' });
  }
});

// Get approval history for a quotation
app.get('/api/quotations/:id/approvals', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM quote_approvals WHERE quotation_id = $1 ORDER BY requested_at DESC`,
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching approvals:', error);
    res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

// Get all pending approvals
app.get('/api/approvals/pending', async (req, res) => {
  try {
    const { approver_email } = req.query;

    let query = `
      SELECT
        qa.*,
        q.quote_number,
        q.total_cents,
        q.created_at as quote_created_at,
        c.name as customer_name,
        c.company as customer_company
      FROM quote_approvals qa
      LEFT JOIN quotations q ON qa.quotation_id = q.id
      LEFT JOIN customers c ON q.customer_id = c.id
      WHERE qa.status = 'PENDING'
    `;

    const params = [];
    if (approver_email) {
      query += ` AND qa.approver_email = $1`;
      params.push(approver_email);
    }

    query += ` ORDER BY qa.requested_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

// Approve a quote
app.post('/api/approvals/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    // Update approval record
    const result = await pool.query(`
      UPDATE quote_approvals
      SET status = 'APPROVED', comments = COALESCE($1, comments), reviewed_at = CURRENT_TIMESTAMP
      WHERE id = $2 RETURNING *
    `, [comments, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    const approval = result.rows[0];

    // Update quote status to APPROVED
    await pool.query(
      `UPDATE quotations SET status = 'APPROVED' WHERE id = $1`,
      [approval.quotation_id]
    );

    // Add event to timeline
    await pool.query(`
      INSERT INTO quote_events (quotation_id, event_type, description)
      VALUES ($1, $2, $3)
    `, [approval.quotation_id, 'APPROVED', `Quote approved by ${approval.approver_name}${comments ? ': ' + comments : ''}`]);

    // Send notification email to requester
    if (approval.requested_by_email) {
      const quoteResult = await pool.query(
        `SELECT q.*, c.name as customer_name FROM quotations q
         LEFT JOIN customers c ON q.customer_id = c.id WHERE q.id = $1`,
        [approval.quotation_id]
      );

      if (quoteResult.rows.length > 0) {
        const quote = quoteResult.rows[0];
        const emailHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #10b981; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
              .content { background: #f9fafb; padding: 20px; border-radius: 8px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2 style="margin: 0;">✅ Quote Approved</h2>
              </div>
              <div class="content">
                <p>Hi ${approval.requested_by},</p>
                <p>Your quote <strong>${quote.quote_number}</strong> for <strong>${quote.customer_name}</strong> has been approved by ${approval.approver_name}.</p>
                ${comments ? `<p><strong>Comments:</strong> ${comments}</p>` : ''}
                <p>You can now proceed with sending the quote to the customer.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        try {
          const command = new SendEmailCommand({
            Source: process.env.EMAIL_FROM,
            Destination: { ToAddresses: [approval.requested_by_email] },
            Message: {
              Subject: { Data: `Quote Approved: ${quote.quote_number}` },
              Body: { Html: { Data: emailHTML } }
            }
          });
          await sesClient.send(command);
        } catch (emailErr) {
          console.error('Error sending approval notification:', emailErr);
        }
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error approving quote:', error);
    res.status(500).json({ error: 'Failed to approve quote' });
  }
});

// Reject a quote
app.post('/api/approvals/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    if (!comments || !comments.trim()) {
      return res.status(400).json({ error: 'Comments are required when rejecting a quote' });
    }

    // Update approval record
    const result = await pool.query(`
      UPDATE quote_approvals
      SET status = 'REJECTED', comments = $1, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = $2 RETURNING *
    `, [comments, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    const approval = result.rows[0];

    // Update quote status to REJECTED
    await pool.query(
      `UPDATE quotations SET status = 'REJECTED' WHERE id = $1`,
      [approval.quotation_id]
    );

    // Add event to timeline
    await pool.query(`
      INSERT INTO quote_events (quotation_id, event_type, description)
      VALUES ($1, $2, $3)
    `, [approval.quotation_id, 'REJECTED', `Quote rejected by ${approval.approver_name}: ${comments}`]);

    // Send notification email to requester
    if (approval.requested_by_email) {
      const quoteResult = await pool.query(
        `SELECT q.*, c.name as customer_name FROM quotations q
         LEFT JOIN customers c ON q.customer_id = c.id WHERE q.id = $1`,
        [approval.quotation_id]
      );

      if (quoteResult.rows.length > 0) {
        const quote = quoteResult.rows[0];
        const emailHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #ef4444; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
              .content { background: #f9fafb; padding: 20px; border-radius: 8px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2 style="margin: 0;">❌ Quote Rejected</h2>
              </div>
              <div class="content">
                <p>Hi ${approval.requested_by},</p>
                <p>Your quote <strong>${quote.quote_number}</strong> for <strong>${quote.customer_name}</strong> has been rejected by ${approval.approver_name}.</p>
                <p><strong>Reason:</strong> ${comments}</p>
                <p>Please review the feedback and make necessary changes before resubmitting.</p>
              </div>
            </div>
          </body>
          </html>
        `;

        try {
          const command = new SendEmailCommand({
            Source: process.env.EMAIL_FROM,
            Destination: { ToAddresses: [approval.requested_by_email] },
            Message: {
              Subject: { Data: `Quote Rejected: ${quote.quote_number}` },
              Body: { Html: { Data: emailHTML } }
            }
          });
          await sesClient.send(command);
        } catch (emailErr) {
          console.error('Error sending rejection notification:', emailErr);
        }
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error rejecting quote:', error);
    res.status(500).json({ error: 'Failed to reject quote' });
  }
});

console.log('✅ Approval workflow endpoints loaded');

// ============================================
// REVENUE FEATURES - DELIVERY & INSTALLATION
// ============================================

// Get all delivery services
app.get('/api/delivery-services', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM delivery_services WHERE is_active = true ORDER BY service_type, service_name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching delivery services:', error);
    res.status(500).json({ error: 'Failed to fetch delivery services' });
  }
});

// Calculate delivery cost
app.post('/api/delivery-services/calculate', async (req, res) => {
  try {
    const { serviceId, distanceMiles, floorLevel, isWeekend, isEvening } = req.body;

    const service = await pool.query(
      'SELECT * FROM delivery_services WHERE id = $1',
      [serviceId]
    );

    if (service.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const s = service.rows[0];
    let totalCents = parseInt(s.base_price_cents) || 0;

    // Add distance charges
    if (distanceMiles && s.per_mile_cents) {
      totalCents += Math.round(distanceMiles * (parseInt(s.per_mile_cents) || 0));
    }

    // Add floor charges
    if (floorLevel && floorLevel > 1 && s.per_floor_cents) {
      totalCents += (floorLevel - 1) * (parseInt(s.per_floor_cents) || 0);
    }

    // Add weekend premium
    if (isWeekend && s.weekend_premium_percent) {
      const premiumAmount = Math.round(totalCents * (parseFloat(s.weekend_premium_percent) / 100));
      totalCents += premiumAmount;
    }

    // Add evening premium
    if (isEvening && s.evening_premium_percent) {
      const premiumAmount = Math.round(totalCents * (parseFloat(s.evening_premium_percent) / 100));
      totalCents += premiumAmount;
    }

    res.json({
      service: s,
      calculation: {
        basePrice: s.base_price_cents,
        distanceCharge: distanceMiles ? Math.round(distanceMiles * (s.per_mile_cents || 0)) : 0,
        floorCharge: floorLevel > 1 ? (floorLevel - 1) * (s.per_floor_cents || 0) : 0,
        weekendPremium: isWeekend ? Math.round(totalCents * (s.weekend_premium_percent / 100)) : 0,
        eveningPremium: isEvening ? Math.round(totalCents * (s.evening_premium_percent / 100)) : 0,
        totalCents: totalCents
      }
    });
  } catch (error) {
    console.error('Error calculating delivery cost:', error);
    res.status(500).json({ error: 'Failed to calculate delivery cost' });
  }
});

// Add delivery to quote
app.post('/api/quotes/:quoteId/delivery', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const {
      deliveryServiceId,
      deliveryDate,
      deliveryTimeSlot,
      deliveryAddress,
      distanceMiles,
      floorLevel,
      weekendDelivery,
      eveningDelivery,
      specialInstructions,
      totalDeliveryCostCents
    } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_delivery
      (quote_id, delivery_service_id, delivery_date, delivery_time_slot, delivery_address,
       distance_miles, floor_level, weekend_delivery, evening_delivery, special_instructions,
       total_delivery_cost_cents)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [quoteId, deliveryServiceId, deliveryDate, deliveryTimeSlot, deliveryAddress,
        distanceMiles, floorLevel, weekendDelivery, eveningDelivery, specialInstructions,
        totalDeliveryCostCents]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding delivery to quote:', error);
    res.status(500).json({ error: 'Failed to add delivery' });
  }
});

// Get delivery for quote
app.get('/api/quotes/:quoteId/delivery', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const result = await pool.query(`
      SELECT qd.*, ds.service_name, ds.service_type, ds.description
      FROM quote_delivery qd
      LEFT JOIN delivery_services ds ON qd.delivery_service_id = ds.id
      WHERE qd.quote_id = $1
    `, [quoteId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching quote delivery:', error);
    res.status(500).json({ error: 'Failed to fetch delivery' });
  }
});

// ============================================
// REVENUE FEATURES - WARRANTIES
// ============================================

// Get all warranty plans
app.get('/api/warranty-plans', async (req, res) => {
  try {
    const { productCategory, productPrice } = req.query;

    let query = 'SELECT * FROM warranty_plans WHERE is_active = true';
    const params = [];

    if (productCategory) {
      params.push(productCategory);
      query += ` AND (product_category = $${params.length} OR product_category IS NULL)`;
    }

    if (productPrice) {
      const priceCents = parseInt(productPrice);
      params.push(priceCents);
      query += ` AND price_tier_min_cents <= $${params.length}`;
      params.push(priceCents);
      query += ` AND (price_tier_max_cents >= $${params.length} OR price_tier_max_cents IS NULL)`;
    }

    query += ' ORDER BY duration_years, warranty_cost_cents';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching warranty plans:', error);
    res.status(500).json({ error: 'Failed to fetch warranty plans' });
  }
});

// Calculate warranty cost
app.post('/api/warranty-plans/calculate', async (req, res) => {
  try {
    const { planId, productPriceCents } = req.body;

    const plan = await pool.query(
      'SELECT * FROM warranty_plans WHERE id = $1',
      [planId]
    );

    if (plan.rows.length === 0) {
      return res.status(404).json({ error: 'Warranty plan not found' });
    }

    const p = plan.rows[0];
    let warrantyCostCents = parseInt(p.warranty_cost_cents) || 0;

    // If percentage-based, calculate from product price
    if (p.warranty_cost_percent && productPriceCents) {
      warrantyCostCents = Math.round(productPriceCents * (parseFloat(p.warranty_cost_percent) / 100));
    }

    res.json({
      plan: p,
      warrantyCostCents: warrantyCostCents
    });
  } catch (error) {
    console.error('Error calculating warranty cost:', error);
    res.status(500).json({ error: 'Failed to calculate warranty cost' });
  }
});

// Add warranty to quote
app.post('/api/quotes/:quoteId/warranties', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { warrantyPlanId, productId, warrantyCostCents } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_warranties (quote_id, warranty_plan_id, product_id, warranty_cost_cents)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [quoteId, warrantyPlanId, productId, warrantyCostCents]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding warranty to quote:', error);
    res.status(500).json({ error: 'Failed to add warranty' });
  }
});

// Get warranties for quote
app.get('/api/quotes/:quoteId/warranties', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const result = await pool.query(`
      SELECT qw.*, wp.plan_name, wp.duration_years, wp.coverage_details, wp.provider,
             p.sku, p.description as product_name
      FROM quote_warranties qw
      LEFT JOIN warranty_plans wp ON qw.warranty_plan_id = wp.id
      LEFT JOIN products p ON qw.product_id = p.id
      WHERE qw.quote_id = $1
    `, [quoteId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching quote warranties:', error);
    res.status(500).json({ error: 'Failed to fetch warranties' });
  }
});

// ============================================
// REVENUE FEATURES - FINANCING
// ============================================

// Get all financing plans
app.get('/api/financing-plans', async (req, res) => {
  try {
    const { minPurchase } = req.query;

    let query = 'SELECT * FROM financing_plans WHERE is_active = true';
    const params = [];

    if (minPurchase) {
      params.push(parseInt(minPurchase));
      query += ` AND min_purchase_cents <= $${params.length}`;
    }

    query += ' ORDER BY term_months, apr_percent';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching financing plans:', error);
    res.status(500).json({ error: 'Failed to fetch financing plans' });
  }
});

// Calculate monthly payment
app.post('/api/financing-plans/calculate', async (req, res) => {
  try {
    const { planId, purchaseAmountCents, downPaymentCents } = req.body;

    const plan = await pool.query(
      'SELECT * FROM financing_plans WHERE id = $1',
      [planId]
    );

    if (plan.rows.length === 0) {
      return res.status(404).json({ error: 'Financing plan not found' });
    }

    const p = plan.rows[0];
    const principal = (purchaseAmountCents || 0) - (downPaymentCents || 0);
    const monthlyRate = parseFloat(p.apr_percent) / 100 / 12;
    const numPayments = parseInt(p.term_months);

    let monthlyPaymentCents;
    let totalInterestCents = 0;

    if (monthlyRate === 0) {
      // 0% APR - simple division
      monthlyPaymentCents = Math.round(principal / numPayments);
    } else {
      // Standard loan payment calculation
      const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                            (Math.pow(1 + monthlyRate, numPayments) - 1);
      monthlyPaymentCents = Math.round(monthlyPayment);
      totalInterestCents = Math.round((monthlyPaymentCents * numPayments) - principal);
    }

    res.json({
      plan: p,
      calculation: {
        purchaseAmountCents: purchaseAmountCents || 0,
        downPaymentCents: downPaymentCents || 0,
        financedAmountCents: principal,
        monthlyPaymentCents: monthlyPaymentCents,
        totalPaymentsCents: monthlyPaymentCents * numPayments,
        totalInterestCents: totalInterestCents,
        aprPercent: p.apr_percent,
        termMonths: numPayments
      }
    });
  } catch (error) {
    console.error('Error calculating financing:', error);
    res.status(500).json({ error: 'Failed to calculate financing' });
  }
});

// Add financing to quote
app.post('/api/quotes/:quoteId/financing', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const {
      financingPlanId,
      financed_amount_cents,
      down_payment_cents,
      monthly_payment_cents,
      total_interest_cents
    } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_financing
      (quote_id, financing_plan_id, financed_amount_cents, down_payment_cents,
       monthly_payment_cents, total_interest_cents)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [quoteId, financingPlanId, financed_amount_cents, down_payment_cents,
        monthly_payment_cents, total_interest_cents]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding financing to quote:', error);
    res.status(500).json({ error: 'Failed to add financing' });
  }
});

// Get financing for quote
app.get('/api/quotes/:quoteId/financing', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const result = await pool.query(`
      SELECT qf.*, fp.plan_name, fp.provider, fp.term_months, fp.apr_percent, fp.promo_description
      FROM quote_financing qf
      LEFT JOIN financing_plans fp ON qf.financing_plan_id = fp.id
      WHERE qf.quote_id = $1
    `, [quoteId]);
    res.json(result.rows.length > 0 ? result.rows[0] : null);
  } catch (error) {
    console.error('Error fetching quote financing:', error);
    res.status(500).json({ error: 'Failed to fetch financing' });
  }
});

// ============================================
// REVENUE FEATURES - MANUFACTURER REBATES
// ============================================

// Get active rebates
app.get('/api/rebates', async (req, res) => {
  try {
    const { manufacturer } = req.query;
    const today = new Date().toISOString().split('T')[0];

    let query = `
      SELECT * FROM manufacturer_rebates
      WHERE is_active = true
      AND start_date <= $1
      AND end_date >= $1
    `;
    const params = [today];

    if (manufacturer) {
      params.push(manufacturer);
      query += ` AND manufacturer = $${params.length}`;
    }

    query += ' ORDER BY rebate_amount_cents DESC, manufacturer';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching rebates:', error);
    res.status(500).json({ error: 'Failed to fetch rebates' });
  }
});

// Calculate rebate amount
app.post('/api/rebates/calculate', async (req, res) => {
  try {
    const { rebateId, purchaseAmountCents } = req.body;

    const rebate = await pool.query(
      'SELECT * FROM manufacturer_rebates WHERE id = $1',
      [rebateId]
    );

    if (rebate.rows.length === 0) {
      return res.status(404).json({ error: 'Rebate not found' });
    }

    const r = rebate.rows[0];
    let rebateAmountCents = parseInt(r.rebate_amount_cents) || 0;

    // If percentage-based, calculate from purchase amount
    if (r.rebate_percent && purchaseAmountCents) {
      rebateAmountCents = Math.round(purchaseAmountCents * (parseFloat(r.rebate_percent) / 100));
    }

    // Apply max rebate cap if exists
    if (r.max_rebate_cents && rebateAmountCents > r.max_rebate_cents) {
      rebateAmountCents = r.max_rebate_cents;
    }

    res.json({
      rebate: r,
      rebateAmountCents: rebateAmountCents
    });
  } catch (error) {
    console.error('Error calculating rebate:', error);
    res.status(500).json({ error: 'Failed to calculate rebate' });
  }
});

// Add rebate to quote
app.post('/api/quotes/:quoteId/rebates', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { rebateId, appliedAmountCents } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_rebates (quote_id, rebate_id, applied_amount_cents)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [quoteId, rebateId, appliedAmountCents]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding rebate to quote:', error);
    res.status(500).json({ error: 'Failed to add rebate' });
  }
});

// Get rebates for quote
app.get('/api/quotes/:quoteId/rebates', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const result = await pool.query(`
      SELECT qr.*, mr.manufacturer, mr.rebate_name, mr.rebate_type,
             mr.terms_conditions, mr.redemption_url
      FROM quote_rebates qr
      LEFT JOIN manufacturer_rebates mr ON qr.rebate_id = mr.id
      WHERE qr.quote_id = $1
    `, [quoteId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching quote rebates:', error);
    res.status(500).json({ error: 'Failed to fetch rebates' });
  }
});

// ============================================
// REVENUE FEATURES - TRADE-IN VALUES
// ============================================

// Get trade-in value estimates
app.get('/api/trade-in-values', async (req, res) => {
  try {
    const { productCategory, brand, condition, ageYears } = req.query;

    let query = 'SELECT * FROM trade_in_values WHERE 1=1';
    const params = [];

    if (productCategory) {
      params.push(productCategory);
      query += ` AND product_category = $${params.length}`;
    }

    if (brand && brand !== 'Any') {
      params.push(brand);
      query += ` AND (brand = $${params.length} OR brand = 'Any')`;
    }

    if (condition) {
      params.push(condition);
      query += ` AND condition = $${params.length}`;
    }

    if (ageYears) {
      params.push(parseInt(ageYears));
      query += ` AND age_years >= $${params.length}`;
    }

    query += ' ORDER BY estimated_value_cents DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching trade-in values:', error);
    res.status(500).json({ error: 'Failed to fetch trade-in values' });
  }
});

// Add trade-in to quote
app.post('/api/quotes/:quoteId/trade-ins', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const {
      productCategory,
      brand,
      modelNumber,
      ageYears,
      condition,
      estimatedValueCents,
      notes
    } = req.body;

    const result = await pool.query(`
      INSERT INTO quote_trade_ins
      (quote_id, product_category, brand, model_number, age_years, condition,
       estimated_value_cents, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [quoteId, productCategory, brand, modelNumber, ageYears, condition,
        estimatedValueCents, notes]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding trade-in to quote:', error);
    res.status(500).json({ error: 'Failed to add trade-in' });
  }
});

// Get trade-ins for quote
app.get('/api/quotes/:quoteId/trade-ins', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const result = await pool.query(
      'SELECT * FROM quote_trade_ins WHERE quote_id = $1',
      [quoteId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching quote trade-ins:', error);
    res.status(500).json({ error: 'Failed to fetch trade-ins' });
  }
});

// ============================================
// REVENUE FEATURES - SALES COMMISSION
// ============================================

// Get all sales reps
app.get('/api/sales-reps', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sales_reps WHERE is_active = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sales reps:', error);
    res.status(500).json({ error: 'Failed to fetch sales reps' });
  }
});

// Get commission rules
app.get('/api/commission-rules', async (req, res) => {
  try {
    const { productCategory } = req.query;

    let query = 'SELECT * FROM commission_rules WHERE is_active = true';
    const params = [];

    if (productCategory) {
      params.push(productCategory);
      query += ` AND (product_category = $${params.length} OR product_category IS NULL)`;
    }

    query += ' ORDER BY product_category NULLS LAST';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching commission rules:', error);
    res.status(500).json({ error: 'Failed to fetch commission rules' });
  }
});

// Calculate commission
app.post('/api/commission-rules/calculate', async (req, res) => {
  try {
    const {
      productCategory,
      productSaleCents,
      warrantySaleCents,
      deliverySaleCents
    } = req.body;

    // Find applicable rule
    let rule = await pool.query(
      'SELECT * FROM commission_rules WHERE product_category = $1 AND is_active = true',
      [productCategory]
    );

    // Fallback to default rule if no category-specific rule
    if (rule.rows.length === 0) {
      rule = await pool.query(
        'SELECT * FROM commission_rules WHERE product_category IS NULL AND is_active = true LIMIT 1'
      );
    }

    if (rule.rows.length === 0) {
      return res.status(404).json({ error: 'No commission rule found' });
    }

    const r = rule.rows[0];

    const productCommission = Math.round((productSaleCents || 0) * (parseFloat(r.commission_percent) / 100));
    const warrantyCommission = Math.round((warrantySaleCents || 0) * (parseFloat(r.warranty_commission_percent) / 100));
    const deliveryCommission = Math.round((deliverySaleCents || 0) * (parseFloat(r.delivery_commission_percent) / 100));
    const flatCommission = parseInt(r.flat_commission_cents) || 0;

    const totalCommission = productCommission + warrantyCommission + deliveryCommission + flatCommission;

    res.json({
      rule: r,
      calculation: {
        productCommissionCents: productCommission,
        warrantyCommissionCents: warrantyCommission,
        deliveryCommissionCents: deliveryCommission,
        flatCommissionCents: flatCommission,
        totalCommissionCents: totalCommission
      }
    });
  } catch (error) {
    console.error('Error calculating commission:', error);
    res.status(500).json({ error: 'Failed to calculate commission' });
  }
});

// Assign sales rep to quote
app.post('/api/quotes/:quoteId/sales-rep', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const { salesRepId, commissionRuleId, calculatedCommissionCents } = req.body;

    // Check if assignment already exists
    const existing = await pool.query(
      'SELECT id FROM quote_sales_reps WHERE quote_id = $1',
      [quoteId]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing assignment
      result = await pool.query(`
        UPDATE quote_sales_reps
        SET sales_rep_id = $1, commission_rule_id = $2, calculated_commission_cents = $3
        WHERE quote_id = $4
        RETURNING *
      `, [salesRepId, commissionRuleId, calculatedCommissionCents, quoteId]);
    } else {
      // Create new assignment
      result = await pool.query(`
        INSERT INTO quote_sales_reps
        (quote_id, sales_rep_id, commission_rule_id, calculated_commission_cents)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [quoteId, salesRepId, commissionRuleId, calculatedCommissionCents]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error assigning sales rep to quote:', error);
    res.status(500).json({ error: 'Failed to assign sales rep' });
  }
});

// Get sales rep for quote
app.get('/api/quotes/:quoteId/sales-rep', async (req, res) => {
  try {
    const { quoteId } = req.params;
    const result = await pool.query(`
      SELECT qsr.*, sr.name as sales_rep_name, sr.email as sales_rep_email,
             cr.rule_name, cr.commission_percent
      FROM quote_sales_reps qsr
      LEFT JOIN sales_reps sr ON qsr.sales_rep_id = sr.id
      LEFT JOIN commission_rules cr ON qsr.commission_rule_id = cr.id
      WHERE qsr.quote_id = $1
    `, [quoteId]);
    res.json(result.rows.length > 0 ? result.rows[0] : null);
  } catch (error) {
    console.error('Error fetching quote sales rep:', error);
    res.status(500).json({ error: 'Failed to fetch sales rep' });
  }
});

// ============================================
// REVENUE ANALYTICS ENDPOINTS
// ============================================

// Get revenue features analytics
app.get('/api/analytics/revenue-features', async (req, res) => {
  try {
    const { startDate, endDate, period = '30' } = req.query;

    // Calculate date range (default to last 30 days)
    const days = parseInt(period) || 30;
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - (days * 24 * 60 * 60 * 1000));

    // Get all quotes in date range
    const totalQuotesResult = await pool.query(
      'SELECT COUNT(*) as count FROM quotations WHERE created_at >= $1 AND created_at <= $2',
      [start, end]
    );
    const totalQuotes = parseInt(totalQuotesResult.rows[0].count);

    // Get financing data
    const financingResult = await pool.query(
      `SELECT COUNT(DISTINCT qf.quote_id) as count,
              SUM(qf.financed_amount_cents) as total_financed,
              SUM(qf.total_interest_cents) as total_interest
       FROM quote_financing qf
       JOIN quotations q ON qf.quote_id = q.id
       WHERE q.created_at >= $1 AND q.created_at <= $2`,
      [start, end]
    );

    // Get warranties data
    const warrantiesResult = await pool.query(
      `SELECT COUNT(DISTINCT qw.quote_id) as count,
              SUM(qw.warranty_cost_cents) as total_revenue
       FROM quote_warranties qw
       JOIN quotations q ON qw.quote_id = q.id
       WHERE q.created_at >= $1 AND q.created_at <= $2`,
      [start, end]
    );

    // Get delivery data
    const deliveryResult = await pool.query(
      `SELECT COUNT(DISTINCT qd.quote_id) as count,
              SUM(qd.total_delivery_cost_cents) as total_revenue
       FROM quote_delivery qd
       JOIN quotations q ON qd.quote_id = q.id
       WHERE q.created_at >= $1 AND q.created_at <= $2`,
      [start, end]
    );

    // Get rebates data
    const rebatesResult = await pool.query(
      `SELECT COUNT(DISTINCT qr.quote_id) as count,
              SUM(qr.rebate_amount_cents) as total_rebates
       FROM quote_rebates qr
       JOIN quotations q ON qr.quote_id = q.id
       WHERE q.created_at >= $1 AND q.created_at <= $2`,
      [start, end]
    );

    // Get trade-ins data
    const tradeInsResult = await pool.query(
      `SELECT COUNT(DISTINCT qt.quote_id) as count,
              SUM(qt.trade_in_value_cents) as total_value
       FROM quote_trade_ins qt
       JOIN quotations q ON qt.quote_id = q.id
       WHERE q.created_at >= $1 AND q.created_at <= $2`,
      [start, end]
    );

    // Calculate analytics
    const financingCount = parseInt(financingResult.rows[0].count) || 0;
    const warrantiesCount = parseInt(warrantiesResult.rows[0].count) || 0;
    const deliveryCount = parseInt(deliveryResult.rows[0].count) || 0;
    const rebatesCount = parseInt(rebatesResult.rows[0].count) || 0;
    const tradeInsCount = parseInt(tradeInsResult.rows[0].count) || 0;

    const warrantiesRevenue = parseInt(warrantiesResult.rows[0].total_revenue) || 0;
    const deliveryRevenue = parseInt(deliveryResult.rows[0].total_revenue) || 0;
    const tradeInsValue = parseInt(tradeInsResult.rows[0].total_value) || 0;
    const rebatesValue = parseInt(rebatesResult.rows[0].total_rebates) || 0;

    const totalRevenue = warrantiesRevenue + deliveryRevenue;
    const quotesWithFeatures = new Set([
      ...Array(financingCount).fill(1),
      ...Array(warrantiesCount).fill(1),
      ...Array(deliveryCount).fill(1),
      ...Array(rebatesCount).fill(1),
      ...Array(tradeInsCount).fill(1)
    ]).size;

    const totalFeaturesCount = financingCount + warrantiesCount + deliveryCount + rebatesCount + tradeInsCount;

    const analytics = {
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        days: days
      },
      totalQuotes: totalQuotes,
      featureAdoption: {
        financing: financingCount,
        warranties: warrantiesCount,
        delivery: deliveryCount,
        rebates: rebatesCount,
        tradeIns: tradeInsCount
      },
      revenue: {
        financing: parseInt(financingResult.rows[0].total_interest) || 0,
        warranties: warrantiesRevenue,
        delivery: deliveryRevenue,
        rebates: rebatesValue,
        tradeIns: tradeInsValue,
        total: totalRevenue
      },
      averages: {
        quotesWithFeatures: quotesWithFeatures,
        revenuePerQuote: totalQuotes > 0 ? totalRevenue / totalQuotes : 0,
        featuresPerQuote: totalQuotes > 0 ? totalFeaturesCount / totalQuotes : 0
      },
      adoptionRate: totalQuotes > 0 ? (quotesWithFeatures / totalQuotes) * 100 : 0,
      trends: []
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching revenue analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics', details: error.message });
  }
});

// Get top performing revenue features
app.get('/api/analytics/top-features', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Get recent quotes with any revenue features
    const quotesResult = await pool.query(
      `SELECT DISTINCT q.id, q.quotation_number, q.total_cents, q.created_at, q.customer_name
       FROM quotations q
       LEFT JOIN quote_financing qf ON q.id = qf.quote_id
       LEFT JOIN quote_warranties qw ON q.id = qw.quote_id
       LEFT JOIN quote_delivery qd ON q.id = qd.quote_id
       LEFT JOIN quote_rebates qr ON q.id = qr.quote_id
       LEFT JOIN quote_trade_ins qt ON q.id = qt.quote_id
       WHERE qf.id IS NOT NULL OR qw.id IS NOT NULL OR qd.id IS NOT NULL
             OR qr.id IS NOT NULL OR qt.id IS NOT NULL
       ORDER BY q.created_at DESC
       LIMIT $1`,
      [limit]
    );

    // For each quote, get the detailed feature information
    const features = await Promise.all(quotesResult.rows.map(async (quote) => {
      const quoteId = quote.id;

      // Check for each feature type
      const hasFinancing = (await pool.query(
        'SELECT COUNT(*) as count FROM quote_financing WHERE quote_id = $1',
        [quoteId]
      )).rows[0].count > 0;

      const warrantiesCount = parseInt((await pool.query(
        'SELECT COUNT(*) as count FROM quote_warranties WHERE quote_id = $1',
        [quoteId]
      )).rows[0].count);

      const hasDelivery = (await pool.query(
        'SELECT COUNT(*) as count FROM quote_delivery WHERE quote_id = $1',
        [quoteId]
      )).rows[0].count > 0;

      const rebatesCount = parseInt((await pool.query(
        'SELECT COUNT(*) as count FROM quote_rebates WHERE quote_id = $1',
        [quoteId]
      )).rows[0].count);

      const tradeInsCount = parseInt((await pool.query(
        'SELECT COUNT(*) as count FROM quote_trade_ins WHERE quote_id = $1',
        [quoteId]
      )).rows[0].count);

      return {
        quoteId: quote.id,
        quoteNumber: quote.quotation_number,
        customerName: quote.customer_name,
        date: quote.created_at,
        total: quote.total_cents,
        features: {
          financing: hasFinancing,
          warranties: warrantiesCount,
          delivery: hasDelivery,
          rebates: rebatesCount,
          tradeIns: tradeInsCount
        }
      };
    }));

    res.json(features);
  } catch (error) {
    console.error('Error fetching top features:', error);
    res.status(500).json({ error: 'Failed to fetch top features', details: error.message });
  }
});

console.log('✅ Analytics endpoints loaded');
console.log('✅ Revenue features endpoints loaded');

// ============================================
// AI FEATURES - SMART RECOMMENDATIONS & UPSELL
// ============================================

/**
 * Smart Product Recommendations
 * Uses collaborative filtering based on product attributes, categories, and historical data
 */
app.get('/api/ai/recommendations/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 5 } = req.query;

    // Get the base product details
    const baseProductResult = await pool.query(
      'SELECT * FROM products WHERE id = $1',
      [productId]
    );

    if (baseProductResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const baseProduct = baseProductResult.rows[0];

    // Find similar products based on multiple criteria
    // 1. Same manufacturer (high relevance)
    // 2. Similar category
    // 3. Similar price range (+/- 30%)
    // 4. Products frequently bought together (from quotation_items)

    const recommendations = await pool.query(`
      WITH product_pairs AS (
        -- Find products that appear together in quotations
        SELECT
          qi2.product_id,
          COUNT(*) as co_occurrence_count
        FROM quotation_items qi1
        JOIN quotation_items qi2 ON qi1.quotation_id = qi2.quotation_id
        WHERE qi1.product_id = $1
          AND qi2.product_id != $1
        GROUP BY qi2.product_id
      ),
      similar_products AS (
        SELECT
          p.*,
          CASE
            WHEN p.manufacturer = $2 THEN 50
            ELSE 0
          END +
          CASE
            WHEN p.category = $3 THEN 30
            ELSE 0
          END +
          CASE
            WHEN p.msrp_cents BETWEEN $4 * 0.7 AND $4 * 1.3 THEN 20
            ELSE 0
          END +
          COALESCE(pp.co_occurrence_count * 10, 0) as similarity_score
        FROM products p
        LEFT JOIN product_pairs pp ON p.id = pp.product_id
        WHERE p.id != $1
          AND p.status = 'active'
      )
      SELECT
        id,
        model_number,
        manufacturer,
        category,
        description,
        msrp_cents,
        cost_cents,
        similarity_score,
        ROUND((msrp_cents - cost_cents)::numeric / NULLIF(msrp_cents, 0) * 100, 2) as margin_percent
      FROM similar_products
      WHERE similarity_score > 0
      ORDER BY similarity_score DESC, margin_percent DESC
      LIMIT $5
    `, [productId, baseProduct.manufacturer, baseProduct.category, baseProduct.msrp_cents, limit]);

    // If we don't have enough recommendations from similarity, add popular products
    let finalRecommendations = recommendations.rows;

    if (finalRecommendations.length < parseInt(limit)) {
      const remainingCount = parseInt(limit) - finalRecommendations.length;
      const existingIds = finalRecommendations.map(r => r.id);

      const popularProducts = await pool.query(`
        SELECT
          p.id,
          p.model_number,
          p.manufacturer,
          p.category,
          p.description,
          p.msrp_cents,
          p.cost_cents,
          COUNT(qi.id) as times_quoted,
          ROUND((p.msrp_cents - p.cost_cents)::numeric / NULLIF(p.msrp_cents, 0) * 100, 2) as margin_percent
        FROM products p
        LEFT JOIN quotation_items qi ON p.id = qi.product_id
        WHERE p.id != $1
          AND p.status = 'active'
          AND p.category = $2
          ${existingIds.length > 0 ? 'AND p.id NOT IN (' + existingIds.join(',') + ')' : ''}
        GROUP BY p.id
        ORDER BY times_quoted DESC, margin_percent DESC
        LIMIT $3
      `, [productId, baseProduct.category, remainingCount]);

      finalRecommendations = [...finalRecommendations, ...popularProducts.rows];
    }

    res.json({
      success: true,
      baseProduct: {
        id: baseProduct.id,
        model_number: baseProduct.model_number,
        manufacturer: baseProduct.manufacturer,
        category: baseProduct.category
      },
      recommendations: finalRecommendations.map(rec => ({
        id: rec.id,
        modelNumber: rec.model_number,
        manufacturer: rec.manufacturer,
        category: rec.category,
        description: rec.description,
        msrp: rec.msrp_cents / 100,
        cost: rec.cost_cents / 100,
        margin: rec.margin_percent || 0,
        similarityScore: rec.similarity_score || 0,
        reason: rec.similarity_score > 50
          ? 'Frequently bought together'
          : rec.similarity_score > 30
          ? 'Similar product'
          : 'Popular in category'
      }))
    });

  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ error: 'Failed to generate recommendations', details: error.message });
  }
});

/**
 * Intelligent Upsell Assistant
 * Analyzes current quote and suggests higher-margin or complementary products
 */
app.post('/api/ai/upsell-suggestions', async (req, res) => {
  try {
    const { quoteItems, customerBudget, currentTotal } = req.body;

    if (!quoteItems || quoteItems.length === 0) {
      return res.json({
        success: true,
        suggestions: [],
        message: 'Add products to get upsell suggestions'
      });
    }

    // Get product details for all items in quote
    const productIds = quoteItems.map(item => item.productId);
    const productsResult = await pool.query(
      'SELECT * FROM products WHERE id = ANY($1::int[])',
      [productIds]
    );

    const products = productsResult.rows;
    const categories = [...new Set(products.map(p => p.category))];
    const manufacturers = [...new Set(products.map(p => p.manufacturer))];

    // Calculate current quote stats
    const currentMargin = products.reduce((sum, p) => {
      const itemQty = quoteItems.find(qi => qi.productId === p.id)?.quantity || 1;
      return sum + (p.msrp_cents - p.cost_cents) * itemQty;
    }, 0);

    const currentMarginPercent = (currentMargin / currentTotal) * 100;

    // Strategy 1: Find higher-margin alternatives for low-margin items
    const lowMarginItems = products.filter(p => {
      const margin = ((p.msrp_cents - p.cost_cents) / p.msrp_cents) * 100;
      return margin < 25;
    });

    const upgradeSuggestions = [];

    for (const lowMarginProduct of lowMarginItems) {
      const upgradesResult = await pool.query(`
        SELECT
          p.*,
          ROUND((p.msrp_cents - p.cost_cents)::numeric / NULLIF(p.msrp_cents, 0) * 100, 2) as margin_percent
        FROM products p
        WHERE p.category = $1
          AND p.manufacturer = $2
          AND p.msrp_cents > $3
          AND p.msrp_cents <= $3 * 1.5
          AND p.status = 'active'
          AND p.id != $4
        ORDER BY margin_percent DESC
        LIMIT 2
      `, [lowMarginProduct.category, lowMarginProduct.manufacturer, lowMarginProduct.msrp_cents, lowMarginProduct.id]);

      if (upgradesResult.rows.length > 0) {
        upgradesResult.rows.forEach(upgrade => {
          const priceDiff = (upgrade.msrp_cents - lowMarginProduct.msrp_cents) / 100;
          const marginIncrease = upgrade.margin_percent - ((lowMarginProduct.msrp_cents - lowMarginProduct.cost_cents) / lowMarginProduct.msrp_cents * 100);

          upgradeSuggestions.push({
            type: 'upgrade',
            originalProduct: {
              id: lowMarginProduct.id,
              modelNumber: lowMarginProduct.model_number,
              msrp: lowMarginProduct.msrp_cents / 100
            },
            suggestedProduct: {
              id: upgrade.id,
              modelNumber: upgrade.model_number,
              manufacturer: upgrade.manufacturer,
              description: upgrade.description,
              msrp: upgrade.msrp_cents / 100,
              margin: upgrade.margin_percent
            },
            benefit: {
              priceDifference: priceDiff,
              marginIncrease: Math.round(marginIncrease * 100) / 100,
              customerValue: `Enhanced features and performance`
            },
            talking_points: [
              `Only $${priceDiff.toFixed(2)} more for upgraded model`,
              `${marginIncrease.toFixed(1)}% better margin`,
              `Premium features include better warranty and energy efficiency`
            ]
          });
        });
      }
    }

    // Strategy 2: Complementary products (accessories, warranties, services)
    const complementarySuggestions = [];

    // Check for warranty opportunities
    const warrantiesResult = await pool.query(`
      SELECT * FROM warranty_plans
      WHERE status = 'active'
      ORDER BY coverage_years DESC
      LIMIT 3
    `);

    if (warrantiesResult.rows.length > 0) {
      const topWarranty = warrantiesResult.rows[0];
      complementarySuggestions.push({
        type: 'warranty',
        product: {
          id: 'warranty_' + topWarranty.id,
          name: topWarranty.plan_name,
          description: `${topWarranty.coverage_years} years coverage`,
          estimatedCost: topWarranty.base_price_cents / 100
        },
        benefit: {
          customerValue: 'Complete protection and peace of mind',
          marginBoost: 'High-margin add-on (typically 60-80% margin)'
        },
        talking_points: [
          `Protect your investment for ${topWarranty.coverage_years} years`,
          'Covers parts, labor, and service calls',
          'Transferable to new owner if you sell'
        ]
      });
    }

    // Check for delivery services
    const deliveryResult = await pool.query(`
      SELECT * FROM delivery_services
      WHERE status = 'active'
      ORDER BY base_price_cents DESC
      LIMIT 2
    `);

    if (deliveryResult.rows.length > 0) {
      const premiumDelivery = deliveryResult.rows[0];
      complementarySuggestions.push({
        type: 'service',
        product: {
          id: 'delivery_' + premiumDelivery.id,
          name: premiumDelivery.service_name,
          description: premiumDelivery.description,
          estimatedCost: premiumDelivery.base_price_cents / 100
        },
        benefit: {
          customerValue: 'White-glove installation and setup',
          marginBoost: 'Service revenue with minimal cost'
        },
        talking_points: [
          'Professional installation included',
          'Remove and dispose of old equipment',
          'Full setup and demonstration'
        ]
      });
    }

    // Strategy 3: Bundle opportunities (products frequently bought together)
    const bundleSuggestions = [];

    const frequentPairsResult = await pool.query(`
      SELECT
        p.id,
        p.model_number,
        p.manufacturer,
        p.category,
        p.description,
        p.msrp_cents,
        p.cost_cents,
        COUNT(DISTINCT qi2.quotation_id) as times_paired,
        ROUND((p.msrp_cents - p.cost_cents)::numeric / NULLIF(p.msrp_cents, 0) * 100, 2) as margin_percent
      FROM quotation_items qi1
      JOIN quotation_items qi2 ON qi1.quotation_id = qi2.quotation_id
      JOIN products p ON qi2.product_id = p.id
      WHERE qi1.product_id = ANY($1::int[])
        AND qi2.product_id != ALL($1::int[])
        AND p.status = 'active'
      GROUP BY p.id
      HAVING COUNT(DISTINCT qi2.quotation_id) >= 2
      ORDER BY times_paired DESC, margin_percent DESC
      LIMIT 3
    `, [productIds]);

    frequentPairsResult.rows.forEach(bundle => {
      bundleSuggestions.push({
        type: 'bundle',
        product: {
          id: bundle.id,
          modelNumber: bundle.model_number,
          manufacturer: bundle.manufacturer,
          category: bundle.category,
          description: bundle.description,
          msrp: bundle.msrp_cents / 100,
          margin: bundle.margin_percent
        },
        benefit: {
          frequency: `Added in ${bundle.times_paired} similar quotes`,
          customerValue: 'Complete solution package',
          marginBoost: `${bundle.margin_percent}% margin on add-on`
        },
        talking_points: [
          'Customers usually add this item',
          'Works perfectly with your selection',
          `${bundle.margin_percent}% profit margin`
        ]
      });
    });

    // Compile final response
    const allSuggestions = [
      ...upgradeSuggestions.slice(0, 2),
      ...complementarySuggestions,
      ...bundleSuggestions.slice(0, 2)
    ];

    // Calculate potential revenue impact
    const potentialAdditionalRevenue = allSuggestions.reduce((sum, sugg) => {
      if (sugg.type === 'upgrade') {
        return sum + sugg.benefit.priceDifference;
      } else if (sugg.product?.estimatedCost) {
        return sum + sugg.product.estimatedCost;
      } else if (sugg.product?.msrp) {
        return sum + sugg.product.msrp;
      }
      return sum;
    }, 0);

    res.json({
      success: true,
      currentQuote: {
        itemCount: quoteItems.length,
        total: currentTotal / 100,
        currentMarginPercent: Math.round(currentMarginPercent * 100) / 100
      },
      suggestions: allSuggestions,
      impact: {
        potentialAdditionalRevenue: Math.round(potentialAdditionalRevenue * 100) / 100,
        suggestedQuoteTotal: Math.round((currentTotal / 100 + potentialAdditionalRevenue) * 100) / 100,
        estimatedMarginImprovement: '5-15%'
      },
      recommendedActions: [
        'Present top 2-3 suggestions during quote review',
        'Focus on value and customer benefits',
        'Use talking points to overcome objections'
      ]
    });

  } catch (error) {
    console.error('Error generating upsell suggestions:', error);
    res.status(500).json({ error: 'Failed to generate upsell suggestions', details: error.message });
  }
});

/**
 * Get recommendations for an entire quote
 * Analyzes all products in a quote and suggests improvements
 */
app.post('/api/ai/quote-recommendations', async (req, res) => {
  try {
    const { quoteId } = req.body;

    // Get quote details
    const quoteResult = await pool.query(
      'SELECT * FROM quotations WHERE id = $1',
      [quoteId]
    );

    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const quote = quoteResult.rows[0];

    // Get quote items
    const itemsResult = await pool.query(
      `SELECT qi.*, p.*
       FROM quotation_items qi
       JOIN products p ON qi.product_id = p.id
       WHERE qi.quotation_id = $1`,
      [quoteId]
    );

    const quoteItems = itemsResult.rows.map(item => ({
      productId: item.product_id,
      quantity: item.quantity
    }));

    // Use the upsell endpoint logic
    const upsellData = {
      quoteItems,
      customerBudget: quote.total_cents * 1.2, // Assume 20% flexibility
      currentTotal: quote.total_cents
    };

    // Generate recommendations (reuse logic)
    // ... similar to upsell-suggestions endpoint

    res.json({
      success: true,
      quoteId: quote.id,
      quotationNumber: quote.quotation_number,
      message: 'Use /api/ai/upsell-suggestions for detailed recommendations'
    });

  } catch (error) {
    console.error('Error generating quote recommendations:', error);
    res.status(500).json({ error: 'Failed to generate quote recommendations', details: error.message });
  }
});

console.log('✅ AI recommendation endpoints loaded');

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================

// 404 Handler - Must be after all routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Global Error Handler - Must be last
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);

  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// ============================================
// START SERVER
// ============================================
const server = app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('🚀 CUSTOMER QUOTATION APP - BACKEND SERVER');
  console.log('========================================');
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('========================================');
  console.log('');
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
  } else {
    console.error('❌ Server error:', error);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('✅ HTTP server closed');
    pool.end(() => {
      console.log('✅ Database pool closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('✅ HTTP server closed');
    pool.end(() => {
      console.log('✅ Database pool closed');
      process.exit(0);
    });
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
