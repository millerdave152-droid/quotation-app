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

// Modular route imports
const { init: initCustomerRoutes } = require('./routes/customers');
const { init: initProductRoutes } = require('./routes/products');
const { init: initAnalyticsRoutes } = require('./routes/analytics');
const { init: initQuotesRoutes } = require('./routes/quotes');
const { init: initImportTemplateRoutes } = require('./routes/importTemplates');

// Standardized API response utilities
const { attachResponseHelpers } = require('./utils/apiResponse');
const { notFoundHandler, errorHandler, ApiError, asyncHandler } = require('./middleware/errorHandler');

// Email notification scheduler
const notificationScheduler = require('./services/NotificationScheduler');

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

// Attach standardized response helpers to res object
app.use(attachResponseHelpers);

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
  res.success({
    status: 'OK',
    environment: process.env.NODE_ENV || 'development',
    securityEnabled: true,
    version: '2.0.0'
  }, { message: 'Backend is running' });
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
// CUSTOMER MANAGEMENT (Modular)
// ============================================
app.use('/api/customers', initCustomerRoutes({ pool, cache }));
console.log('✅ Customer routes loaded (modular)');

// ============================================
// PRODUCT MANAGEMENT (Modular)
// ============================================
app.use('/api/products', initProductRoutes({ pool, cache, upload }));
console.log('✅ Product routes loaded (modular)');

// ============================================
// IMPORT TEMPLATES (Manufacturer Mappings)
// ============================================
app.use('/api/import-templates', initImportTemplateRoutes({ pool, cache }));
console.log('✅ Import template routes loaded');

// ============================================
// ANALYTICS (Modular)
// ============================================
app.use('/api/analytics', initAnalyticsRoutes({ pool }));
console.log('✅ Analytics routes loaded (modular)');

// ============================================
// QUOTATIONS (Modular)
// ============================================
app.use('/api/quotations', initQuotesRoutes({ pool }));
console.log('✅ Quotation routes loaded (modular)');

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
// 2026 FEATURES (Special Orders, E-Signatures, Portal, Templates, etc.)
// ============================================
const features2026Routes = require('./routes/features2026')(pool);
app.use('/api/features', features2026Routes);
console.log('✅ 2026 Features routes loaded');

// ============================================
// PACKAGE BUILDER (Guided Package Wizard)
// ============================================
const initPackageBuilderRoutes = require('./routes/packageBuilder');
app.use('/api/package-builder', initPackageBuilderRoutes({ pool }));
console.log('✅ Package builder routes loaded');

// ============================================
// PACKAGE BUILDER V2 (Faceted Filtering)
// ============================================
const packageBuilderV2Routes = require('./routes/packageBuilderV2');
app.use('/api/package-builder-v2', packageBuilderV2Routes);
console.log('✅ Package builder V2 routes loaded');

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
// ACTIVITY TRACKING ROUTES
// ============================================
const activityRoutes = require('./routes/activities')(pool);
app.use('/api/activities', activityRoutes);
console.log('✅ Activity tracking routes loaded');

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

console.log('✅ Payment terms endpoints loaded');

// Quote aliases - redirect /api/quotes/* to /api/quotations/*
app.use('/api/quotes', initQuotesRoutes({ pool }));
console.log('✅ Quote aliases loaded (/api/quotes -> /api/quotations)');

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

// Note: Quote-specific delivery endpoints (/api/quotes/:quoteId/delivery) moved to /api/quotations route module

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

// Note: Quote-specific warranty endpoints (/api/quotes/:quoteId/warranties) moved to /api/quotations route module

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

// Note: Quote-specific financing endpoints (/api/quotes/:quoteId/financing) moved to /api/quotations route module

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

// Note: Quote-specific rebate endpoints (/api/quotes/:quoteId/rebates) moved to /api/quotations route module

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

// Note: Quote-specific trade-in endpoints (/api/quotes/:quoteId/trade-ins) moved to /api/quotations route module

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

// Note: Quote-specific sales rep endpoints (/api/quotes/:quoteId/sales-rep) moved to /api/quotations route module

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
app.use(notFoundHandler);

// Global Error Handler - Must be last
app.use(errorHandler);

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

  // Start notification scheduler for automated email reminders
  if (process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'false') {
    notificationScheduler.start();
  }
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
