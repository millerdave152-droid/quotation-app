// ============================================
// CUSTOMER QUOTATION APP - BACKEND SERVER
// Complete Working Version - All Features
// ============================================

const express = require('express');
const cors = require('cors');
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
const { init: initNomenclatureRoutes } = require('./routes/nomenclature');
const { init: initInsightsRoutes } = require('./routes/insights');
const { init: initReportsRoutes } = require('./routes/reports');
const { init: initLeadsRoutes } = require('./routes/leads');

// Standardized API response utilities
const { attachResponseHelpers } = require('./utils/apiResponse');
const { notFoundHandler, errorHandler, ApiError, asyncHandler } = require('./middleware/errorHandler');

// Email notification scheduler
const notificationScheduler = require('./services/NotificationScheduler');

// New Enterprise Services (Phase 2)
const InventoryService = require('./services/InventoryService');
const OrderService = require('./services/OrderService');
const InvoiceService = require('./services/InvoiceService');
const MonerisService = require('./services/MonerisService');
const MonerisVaultService = require('./services/MonerisVaultService');
const StripeService = require('./services/StripeService');
const DeliveryService = require('./services/DeliveryService');
const PricingService = require('./services/PricingService');
const ProductMetricsService = require('./services/ProductMetricsService');
const QuoteExpiryService = require('./services/QuoteExpiryService');

// POS Payment Services (Phase 3)
const POSPaymentService = require('./services/POSPaymentService');
const ReceiptService = require('./services/ReceiptService');
const CashDrawerService = require('./services/CashDrawerService');
const POSInvoiceService = require('./services/POSInvoiceService');
const SalesOrderService = require('./services/SalesOrderService');
const DeliverySlipService = require('./services/DeliverySlipService');
const DeliveryWaiverService = require('./services/DeliveryWaiverService');
const ManufacturerRAService = require('./services/ManufacturerRAService');
const UnifiedReportingService = require('./services/UnifiedReportingService');
const VolumeDiscountService = require('./services/VolumeDiscountService');
const POSPromotionService = require('./services/POSPromotionService');
const PromotionEngine = require('./services/PromotionEngine');
const ManagerOverrideService = require('./services/ManagerOverrideService');
const ApprovalService = require('./services/ApprovalService');
const DeliveryFulfillmentService = require('./services/DeliveryFulfillmentService');
const WarrantyService = require('./services/WarrantyService');
const FinancingService = require('./services/FinancingService');
const CommissionService = require('./services/CommissionService');
const SignatureService = require('./services/SignatureService');
const BatchEmailService = require('./services/BatchEmailService');
const ScheduledBatchEmailService = require('./services/ScheduledBatchEmailService');
const QuoteExpiryDigestJob = require('./services/QuoteExpiryDigestJob');
const emailService = require('./services/EmailService'); // singleton
const NotificationService = require('./services/NotificationService');
const TaxService = require('./services/TaxService');
const InstitutionalService = require('./services/institutionalService');
const FraudDetectionService = require('./services/FraudDetectionService');
const FraudScoringService = require('./services/FraudScoringService');
const VelocityService = require('./services/VelocityService');
const BINValidationService = require('./services/BINValidationService');
const AuditLogService = require('./services/AuditLogService');
const EmployeeMonitorService = require('./services/EmployeeMonitorService');
const ChargebackEvidenceService = require('./services/ChargebackEvidenceService');
const LogArchiveService = require('./services/LogArchiveService');
const FraudMLDataService = require('./services/FraudMLDataService');
const MLScoringService = require('./services/MLScoringService');
const FeatureStoreService = require('./services/FeatureStoreService');
const redisConfig = require('./config/redis');
const cron = require('node-cron');
const DiscountAuthorityService = require('./services/DiscountAuthorityService');
const SerialNumberService = require('./services/SerialNumberService');
const PurchaseOrderService = require('./services/PurchaseOrderService');
const ProductVariantService = require('./services/ProductVariantService');
const wsService = require('./services/WebSocketService');

// Lightspeed Feature Gap Services
const PhysicalCountService = require('./services/PhysicalCountService');
const WorkOrderService = require('./services/WorkOrderService');
const SpecialOrderService = require('./services/SpecialOrderService');
const CustomerAccountService = require('./services/CustomerAccountService');
const PreOrderService = require('./services/PreOrderService');
const SurveyService = require('./services/SurveyService');
const CatalogExportService = require('./services/CatalogExportService');
const AudienceSyncService = require('./services/AudienceSyncService');

// New Enterprise Routes (Phase 2)
const ordersRoutes = require('./routes/orders');
const invoicesRoutes = require('./routes/invoices');
const inventoryRoutes = require('./routes/inventory');
const deliveryRoutes = require('./routes/delivery');
const pricingRoutes = require('./routes/pricing');
const volumePricingRoutes = require('./routes/volume-pricing');
const posPromotionsRoutes = require('./routes/pos-promotions');
const managerOverrideRoutes = require('./routes/manager-overrides');
const customerPricingRoutes = require('./routes/customer-pricing');
const discountAuthorityRoutes = require('./routes/discount-authority');
const discountEscalationRoutes = require('./routes/discount-escalations');
const discountAnalyticsRoutes = require('./routes/discount-analytics');
const approvalRoutes = require('./routes/approvalRoutes');
const deliveryFulfillmentRoutes = require('./routes/delivery-fulfillment');
const warrantyRoutes = require('./routes/warranty');
const monerisRoutes = require('./routes/moneris');
const stripeRoutes = require('./routes/stripe');
const productMetricsRoutes = require('./routes/product-metrics');

// Advanced Pricing (Volume Discounts, Promotions, Stacking)
const advancedPricingRoutes = require('./routes/advancedPricing');

// AI Personalization (Dynamic Pricing, Upselling, Smart Suggestions)
const aiPersonalizationRoutes = require('./routes/aiPersonalization');

// 3D Product Configurator
const product3dRoutes = require('./routes/product3d');

// Product Images
const productImageRoutes = require('./routes/product-images');

// Discontinued Products
const discontinuedProductRoutes = require('./routes/discontinued-products');

// Call Log
const callLogRoutes = require('./routes/call-log');

// AR Aging Report
const arAgingRoutes = require('./routes/ar-aging');

// Tax Summary
const taxSummaryRoutes = require('./routes/tax-summary');

// Time Clock
const timeClockRoutes = require('./routes/timeclock');

// Layaways
const layawayRoutes = require('./routes/layaways');

// Product Lookup (Barcode)
const productLookupRoutes = require('./routes/product-lookup');

// Vendor Product Visualization & Scraper
const vendorProductsRoutes = require('./routes/vendorProducts');

// Quick Search (Universal Product Finder)
const quickSearchRoutes = require('./routes/quickSearch');

// Lookup service (cities, postal codes, names autocomplete)
const lookupRoutes = require('./routes/lookup');

// POS Payment Routes (Phase 3)
const { init: initPosPaymentsRoutes } = require('./routes/pos-payments');
const { init: initReceiptsRoutes } = require('./routes/receipts');
const { init: initCashDrawerRoutes } = require('./routes/cash-drawer');
const { init: initPosInvoicesRoutes } = require('./routes/pos-invoices');
const { init: initSalesOrderRoutes } = require('./routes/sales-orders');
const { init: initDeliverySlipRoutes } = require('./routes/delivery-slips');
const { init: initManufacturerRARoutes } = require('./routes/manufacturer-ras');
const { init: initUnifiedReportsRoutes } = require('./routes/unified-reports');
const { init: initRecommendationsRoutes } = require('./routes/recommendations');
const { init: initFinancingRoutes } = require('./routes/financing');
const { init: initPosQuoteExpiryRoutes } = require('./routes/pos-quote-expiry');
const { init: initCommissionsRoutes } = require('./routes/commissions');
const { init: initSignaturesRoutes } = require('./routes/signatures');
const { init: initBatchEmailRoutes } = require('./routes/batch-email');
const batchEmailSettingsRoutes = require('./routes/batch-email-settings');
const { init: initSerialNumberRoutes } = require('./routes/serial-numbers');
const { init: initPurchaseOrderRoutes } = require('./routes/purchase-orders');
const { init: initProductVariantRoutes } = require('./routes/product-variants');

// Lightspeed Feature Gap Routes
const { init: initPhysicalCountRoutes } = require('./routes/physical-counts');
const { init: initWorkOrderRoutes } = require('./routes/work-orders');
const { init: initSpecialOrderRoutes } = require('./routes/special-orders');
const { init: initCustomerAccountRoutes } = require('./routes/customer-accounts');
const { init: initPreOrderRoutes } = require('./routes/pre-orders');
const { init: initSurveyRoutes } = require('./routes/surveys');
const { init: initCatalogExportRoutes } = require('./routes/catalog-exports');
const { init: initAudienceSyncRoutes } = require('./routes/audience-sync');

// Order Amendments & Credit Memos
const { init: initOrderModificationRoutes } = require('./routes/order-modifications');
const { init: initCreditMemoRoutes } = require('./routes/credit-memos');

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

// Static file serving for 3D models, uploads, and vendor images
const path = require('path');
app.use('/models', express.static(path.join(__dirname, 'public/models')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/vendor-images', express.static(path.join(__dirname, 'public/vendor-images')));

// Attach standardized response helpers to res object
app.use(attachResponseHelpers);

// Structured logging with correlation IDs (pino)
const logger = require('./utils/logger');
const { requestLogger } = require('./utils/logger');
app.use(requestLogger);

// ============================================
// DATABASE CONNECTION (tenant-aware pool from db.js)
// Tenant context is set per-request by authenticate middleware
// via AsyncLocalStorage — all downstream queries auto-scoped.
// ============================================
const pool = require('./db');
const { rawPool } = pool;

rawPool.query('SELECT NOW()', (err, res) => {
  if (err) {
    logger.error({ err }, 'Database connection error');
  } else {
    logger.info('Database connected successfully');
  }
});

// Make pool available to routes via app.locals
app.locals.pool = pool;

// ============================================
// SERVICE INSTANTIATION (Phase 2)
// ============================================
const inventoryService = new InventoryService(pool, cache);
const notificationService = new NotificationService(pool);
const orderService = new OrderService(pool, cache, inventoryService);
const invoiceService = new InvoiceService(pool, cache, emailService);
const monerisService = new MonerisService(pool, cache);
const stripeService = new StripeService(pool, cache);
const deliveryService = new DeliveryService(pool, cache);
const pricingService = new PricingService(pool, cache);
const productMetricsService = new ProductMetricsService(pool, cache);
const quoteExpiryService = new QuoteExpiryService(pool, cache, inventoryService, notificationService);
const taxService = new TaxService(pool, cache);
const institutionalService = new InstitutionalService(pool, cache);

// POS Payment Services (Phase 3)
const posPaymentService = new POSPaymentService(pool, cache, monerisService);
const receiptService = new ReceiptService(pool, cache);
const cashDrawerService = new CashDrawerService(pool, cache);
const posInvoiceService = new POSInvoiceService(pool, cache);
const salesOrderService = new SalesOrderService(pool, cache);
const deliverySlipService = new DeliverySlipService(pool, cache);
const deliveryWaiverService = new DeliveryWaiverService(pool, cache);
const manufacturerRAService = new ManufacturerRAService(pool, cache);
const reportingService = new UnifiedReportingService(pool, cache);
const volumeDiscountService = new VolumeDiscountService(pool, cache);
const posPromotionService = new POSPromotionService(pool);
const promotionEngine = new PromotionEngine(pool, posPromotionService);
const managerOverrideService = new ManagerOverrideService(pool, cache);
const approvalService = new ApprovalService(pool);
const deliveryFulfillmentService = new DeliveryFulfillmentService(pool, cache);
const warrantyService = new WarrantyService(pool, cache);
const financingService = new FinancingService(pool);
const commissionService = new CommissionService(pool, cache);
const signatureService = new SignatureService(pool, cache);
const batchEmailService = new BatchEmailService(pool, {
  maxBatchSize: parseInt(process.env.BATCH_EMAIL_MAX_SIZE, 10) || 50,
  sendDelayMs: parseInt(process.env.BATCH_EMAIL_DELAY_MS, 10) || 1000,
  maxRetries: parseInt(process.env.BATCH_EMAIL_MAX_RETRIES, 10) || 3,
});

const serialNumberService = new SerialNumberService(pool, cache);
const purchaseOrderService = new PurchaseOrderService(pool, cache, serialNumberService);
const productVariantService = new ProductVariantService(pool, cache);
// Phase 2 Fraud Infrastructure: Redis + service wiring
const redisClient = redisConfig.createClient();
if (redisClient) {
  redisConfig.connect().catch(() => {
    logger.warn('[Server] Redis connect deferred — will use PostgreSQL fallback');
  });
}

const auditLogService = new AuditLogService(pool);
const logArchiveService = new LogArchiveService(pool);
const velocityService = new VelocityService(pool, redisClient);
const binService = new BINValidationService(pool, redisClient);
const fraudService = new FraudDetectionService(pool, { velocityService, binService, auditLogService });
const mlScoringService = new MLScoringService();
const fraudScoringService = new FraudScoringService(pool, { velocityService, binService, redisClient, mlScoringService });
const employeeMonitorService = new EmployeeMonitorService(pool, { wsService, auditLogService });
const chargebackEvidenceService = new ChargebackEvidenceService(pool, wsService);
const fraudMLDataService = new FraudMLDataService(pool, redisClient);
const featureStoreService = new FeatureStoreService(pool, redisClient);
const vaultService = new MonerisVaultService(pool, monerisService, auditLogService);
app.set('fraudService', fraudService);
app.set('fraudScoringService', fraudScoringService);
app.set('auditLogService', auditLogService);
app.set('vaultService', vaultService);
app.set('employeeMonitorService', employeeMonitorService);
app.set('velocityService', velocityService);
app.set('wsService', wsService);
app.set('deliveryWaiverService', deliveryWaiverService);

// ── Scheduled jobs ──────────────────────────────────────────────────────────
// Hourly: Refresh employee fraud metrics and detect anomalies
cron.schedule('0 * * * *', () => {
  employeeMonitorService.refreshMetrics()
    .catch(err => logger.error({ err }, 'Employee monitor refresh failed'));
  // Also refresh ML feature store materialized views
  featureStoreService.refreshViews()
    .catch(err => logger.error({ err }, 'Feature store refresh failed'));
});
logger.info('Employee monitor cron scheduled (hourly)');

// Daily 3 AM: Audit log hash-chain integrity verification (yesterday's records)
cron.schedule('0 3 * * *', () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const startOfDay = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setHours(23, 59, 59, 999);

  auditLogService.verifyChainIntegrity(startOfDay, endOfDay)
    .then(result => {
      if (result.violations && result.violations.length > 0) {
        logger.error({ violations: result.violations.length }, '[AuditChain] Daily integrity check: VIOLATIONS DETECTED');
        if (wsService) {
          wsService.broadcastToRoles(['admin'], 'audit:chain_violation', {
            violations: result.violations.length,
            verified: result.verified,
            totalRecords: result.totalRecords,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        logger.info({ verified: result.verified }, '[AuditChain] Daily integrity check passed');
      }
    })
    .catch(err => logger.error({ err }, 'Audit chain verification failed'));
});
logger.info('Audit chain verification cron scheduled (daily 3 AM)');

// Weekly Sunday 3:30 AM: Full 7-day chain verification + compliance summary
cron.schedule('30 3 * * 0', () => {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  auditLogService.verifyChainIntegrity(weekAgo, new Date())
    .then(result => {
      logger.info({
        verified: result.verified,
        violations: result.violations.length,
      }, '[AuditChain] Weekly integrity check complete');
      return auditLogService.generateComplianceReport('week');
    })
    .then(report => {
      logger.info({
        totalEvents: report.total_events,
        failedLogins: report.failed_logins.total,
        chainStatus: report.chain_integrity.status,
      }, '[Compliance] Weekly compliance summary generated');
    })
    .catch(err => logger.error({ err }, 'Weekly chain verification / compliance report failed'));
});
logger.info('Weekly chain verification + compliance summary cron scheduled (Sunday 3:30 AM)');

// Monthly 1st at 5 AM: Generate monthly compliance report + archive old logs
cron.schedule('0 5 1 * *', () => {
  auditLogService.generateComplianceReport('month')
    .then(report => {
      logger.info({
        period: report.report_period,
        totalEvents: report.total_events,
        chainStatus: report.chain_integrity.status,
        retention: report.retention,
      }, '[Compliance] Monthly compliance report generated');
      // Archive logs older than 12 months to cold storage
      return logArchiveService.archiveLogs(12);
    })
    .then(archiveResult => {
      if (archiveResult.exported > 0) {
        logger.info({
          exported: archiveResult.exported,
          files: archiveResult.files,
        }, '[LogArchive] Monthly archive complete');
      }
    })
    .catch(err => logger.error({ err }, 'Monthly compliance report / archive failed'));
});
logger.info('Monthly compliance report + log archive cron scheduled (1st at 5 AM)');

// Daily 4 AM: Clean up velocity_events older than 30 days
cron.schedule('0 4 * * *', () => {
  employeeMonitorService.cleanupVelocityEvents()
    .catch(err => logger.error({ err }, 'Velocity events cleanup failed'));
});
logger.info('Velocity events cleanup cron scheduled (daily 4 AM)');

// Weekly Sunday 5 AM: Clean up expired bin_cache entries
cron.schedule('0 5 * * 0', () => {
  employeeMonitorService.cleanupExpiredBinCache()
    .catch(err => logger.error({ err }, 'BIN cache cleanup failed'));
});
logger.info('BIN cache cleanup cron scheduled (weekly Sunday 5 AM)');

// Chargeback deadline check (daily 9 AM)
cron.schedule('0 9 * * *', () => {
  if (chargebackRouter._checkDeadlines) {
    chargebackRouter._checkDeadlines()
      .catch(err => logger.error({ err }, 'Chargeback deadline check failed'));
  }
});
logger.info('Chargeback deadline check cron scheduled (daily 9 AM)');

app.set('pool', pool);
app.set('cache', cache);
const discountAuthorityService = new DiscountAuthorityService(pool);

// Lightspeed Feature Gap Service Instances
const physicalCountService = new PhysicalCountService(pool, cache);
const workOrderService = new WorkOrderService(pool, cache);
const specialOrderService = new SpecialOrderService(pool, cache);
const customerAccountService = new CustomerAccountService(pool, cache);
const preOrderService = new PreOrderService(pool, cache);
const surveyService = new SurveyService(pool, cache);
const catalogExportService = new CatalogExportService(pool, cache);
const audienceSyncService = new AudienceSyncService(pool, cache);

// Expire stale pending discount escalations every 5 minutes
setInterval(async () => {
  try {
    const expired = await discountAuthorityService.expireStalePendingEscalations();
    if (expired.length > 0) logger.info({ count: expired.length }, '[EscalationExpiry] Expired pending escalations');
  } catch (err) {
    logger.error({ err }, '[EscalationExpiry] Error');
  }
}, 5 * 60 * 1000);

logger.info('Enterprise services initialized');

// ============================================
// FILE UPLOAD & AWS SES CONFIGURATION
// ============================================
const upload = multer({ storage: multer.memoryStorage() });
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

const sesClient = new SESv2Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  requestHandler: {
    requestTimeout: 10_000, // 10 second timeout for SES API calls
  },
});

// Email service wrapper for scheduled batch emails
const emailServiceWrapper = {
  sendEmail: async ({ to, subject, html }) => {
    const command = new SendEmailCommand({
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: { Html: { Data: html } },
        },
      },
      FromEmailAddress: process.env.EMAIL_FROM,
      Destination: { ToAddresses: [to] },
    });
    return sesClient.send(command);
  },
};

// Initialize scheduled batch email service
const scheduledBatchEmailService = new ScheduledBatchEmailService(pool, batchEmailService, emailServiceWrapper, receiptService);
scheduledBatchEmailService.initialize().catch(err => {
  logger.error({ err }, 'Failed to initialize scheduled batch email service');
});
logger.info('Scheduled batch email service initialized');

// ============================================
// HEALTH CHECK ENDPOINTS
// ============================================

// Resolve git commit hash once at startup for health endpoint
const APP_VERSION = process.env.npm_package_version || '2.0.1';
const COMMIT_HASH = (() => {
  if (process.env.GIT_COMMIT_SHA) return process.env.GIT_COMMIT_SHA;
  try { return require('child_process').execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
})();

/**
 * GET /health - Full health check with DB and cache status
 * Use for monitoring dashboards and alerting
 */
app.get('/health', async (req, res) => {
  const startTime = Date.now();
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: APP_VERSION,
    commitHash: COMMIT_HASH,
    checks: {
      database: { status: 'unknown' },
      cache: { status: 'unknown' }
    }
  };

  // Check database connection
  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    health.checks.database = {
      status: 'healthy',
      responseTime: Date.now() - dbStart
    };
  } catch (error) {
    health.status = 'DEGRADED';
    health.checks.database = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Check cache status
  try {
    const cacheStats = cache.getStats();
    health.checks.cache = {
      status: 'healthy',
      stats: {
        short: { hits: cacheStats.short.hits, misses: cacheStats.short.misses },
        medium: { hits: cacheStats.medium.hits, misses: cacheStats.medium.misses },
        long: { hits: cacheStats.long.hits, misses: cacheStats.long.misses }
      }
    };
  } catch (error) {
    health.checks.cache = {
      status: 'unhealthy',
      error: error.message
    };
  }

  health.responseTime = Date.now() - startTime;

  const statusCode = health.status === 'OK' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /ready - Kubernetes readiness probe
 * Returns 200 only if the service is ready to accept traffic
 */
app.get('/ready', async (req, res) => {
  try {
    // Quick database check
    await pool.query('SELECT 1');
    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, error: 'Database not available' });
  }
});

/**
 * GET /api/health - Legacy health endpoint (for backward compatibility)
 */
app.get('/api/health', (req, res) => {
  res.success({
    status: 'OK',
    environment: process.env.NODE_ENV || 'development',
    securityEnabled: true,
    version: '2.0.1'
  }, { message: 'Backend is running' });
});

// ============================================
// AUTHENTICATION ROUTES
// ============================================
app.use('/api/auth', authLimiter, authRoutes);

// ============================================
// USER MANAGEMENT ROUTES
// ============================================
const usersRoutes = require('./routes/users');
app.use('/api/users', usersRoutes);

// GET /api/users/me/permissions — current user's resolved POS permissions
const { resolvePermissions: resolvePerms } = require('./utils/permissions');
app.get('/api/users/me/permissions', authenticate, (req, res) => {
  const permissions = resolvePerms(req.user);
  res.json({
    success: true,
    data: {
      permissions,
      posRoleName: req.user.posRoleName || null,
    }
  });
});

logger.info('User management routes loaded');

// ============================================
// QUOTE ACCEPTANCE (PUBLIC) ROUTES
// ============================================
const quoteAcceptanceRoutes = require('./routes/quote-acceptance');
app.use('/api/quote-accept', quoteAcceptanceRoutes({ pool }));
logger.info('Quote acceptance routes loaded');

// ============================================
// COUNTER-OFFER / NEGOTIATION ROUTES
// ============================================
const counterOfferRoutes = require('./routes/counterOffers');
counterOfferRoutes.setSesClient(sesClient); // Pass SES client for email notifications
app.use('/api', counterOfferRoutes);
logger.info('Counter-offer routes loaded');

// ============================================
// IN-APP NOTIFICATIONS
// ============================================
const notificationRoutes = require('./routes/notifications');
app.use('/api/notifications', notificationRoutes);
logger.info('In-app notification routes loaded');

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
logger.info('API key management routes loaded');

// ============================================
// CUSTOMER MANAGEMENT (Modular)
// ============================================
app.use('/api/customers', initCustomerRoutes({ pool, cache }));
logger.info('Customer routes loaded (modular)');

// Communication Preferences & CASL Compliance
const commPrefs = require('./routes/communication-preferences');
const commPrefRouters = commPrefs.init({ pool });
app.use('/api/customers', commPrefRouters.customerRouter);
app.use('/api/customers', commPrefRouters.publicRouter);
app.use('/api/marketing', commPrefRouters.marketingRouter);
logger.info('Communication preferences & CASL routes loaded');

// RBAC Management
const { init: initRbacRoutes } = require('./routes/rbac');
const rbacRouters = initRbacRoutes({ pool });
app.use('/api/rbac', rbacRouters.rbacRouter);
app.use('/api/roles', rbacRouters.rolesRouter);
app.use('/api/permissions', rbacRouters.permissionsRouter);
app.use('/api/users', rbacRouters.usersRbacRouter);
logger.info('RBAC management routes loaded');

// Marketing Attribution
const marketingAttribution = require('./routes/marketing-attribution');
const marketingRouters = marketingAttribution.init({ pool });
app.use('/api/marketing-sources', marketingRouters.sourcesRouter);
app.use('/api/reports', marketingRouters.reportRouter);
logger.info('Marketing attribution routes loaded');

// POS Roles — list all roles with permissions
app.get('/api/pos-roles', authenticate, asyncHandler(async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, display_name, permissions, is_system FROM pos_roles ORDER BY id');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    if (err.code === '42P01') {
      return res.json({ success: true, data: [] });
    }
    throw err;
  }
}));

// ============================================
// LOOKUP SERVICE (Cities, Postal Codes, Names)
// ============================================
app.use('/api/lookup', lookupRoutes);
logger.info('Lookup routes loaded');

// ============================================
// PRODUCT BARCODE LOOKUP (must be before /:id routes)
// ============================================
app.use('/api/products', productLookupRoutes.init({ pool }));
logger.info('Product barcode lookup routes loaded');

// ============================================
// DISCONTINUED PRODUCTS (must be before /:id routes)
// ============================================
app.use('/api/products', discontinuedProductRoutes.init({ pool }));
logger.info('Discontinued product routes loaded');

// ============================================
// PRODUCT MANAGEMENT (Modular)
// ============================================
app.use('/api/products', initProductRoutes({ pool, cache, upload }));
logger.info('Product routes loaded (modular)');

// ============================================
// CATEGORY MANAGEMENT (Normalized Hierarchy)
// ============================================
const categoriesRoutes = require('./routes/categories');
const ProductService = require('./services/ProductService');
const categoryProductService = new ProductService(pool, cache);
app.use('/api/categories', categoriesRoutes(pool, categoryProductService, cache));
logger.info('Category routes loaded');

// ============================================
// PUBLIC CATEGORY API (No Auth - Customer Portal)
// ============================================
const initPublicCategoryRoutes = require('./routes/public-categories');
app.use('/api/public', initPublicCategoryRoutes({ pool, productService: categoryProductService }));
logger.info('Public category routes loaded (no auth)');

// ============================================
// IMPORT TEMPLATES (Manufacturer Mappings)
// ============================================
app.use('/api/import-templates', initImportTemplateRoutes({ pool, cache }));
logger.info('Import template routes loaded');

// ============================================
// PRICE LIST IMPORTS
// ============================================
const { init: initPriceImportRoutes } = require('./routes/price-imports');
app.use('/api/price-imports', initPriceImportRoutes({ pool }));
logger.info('Price list import routes loaded');

// ============================================
// PRICE HISTORY
// ============================================
const { init: initPriceHistoryRoutes } = require('./routes/price-history');
app.use('/api', initPriceHistoryRoutes({ pool }));
logger.info('Price history routes loaded');

// ============================================
// HUB PROMOTIONS (Sale Pricing & Scheduling)
// ============================================
const { init: initHubPromotionRoutes } = require('./routes/hub-promotions');
app.use('/api/hub-promotions', initHubPromotionRoutes({ pool }));
logger.info('Hub promotions routes loaded');

// ============================================
// COUPONS (Code Generation, Validation, Apply)
// ============================================
const { init: initCouponRoutes } = require('./routes/coupons');
app.use('/api', initCouponRoutes({ pool }));
logger.info('Coupon code routes loaded');

// ============================================
// BUNDLES & KITS
// ============================================
const { init: initBundleRoutes } = require('./routes/bundles');
app.use('/api/bundles', initBundleRoutes({ pool }));
logger.info('Bundle routes loaded');

// ============================================
// MULTI-LOCATION INVENTORY
// ============================================

// Dedicated dashboard summary — must be registered before location-inventory
// router, which has its own /summary that returns a product list instead of stats.
app.get('/api/inventory/summary', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS "totalProducts",
        COUNT(CASE WHEN total_on_hand > reorder_level THEN 1 END)::int AS "inStock",
        COUNT(CASE WHEN total_on_hand > 0 AND total_on_hand <= reorder_level THEN 1 END)::int AS "lowStock",
        COUNT(CASE WHEN total_on_hand <= 0 THEN 1 END)::int AS "outOfStock",
        COALESCE(SUM(total_reserved), 0)::int AS "totalReserved"
      FROM (
        SELECT
          li.product_id,
          SUM(li.quantity_on_hand) AS total_on_hand,
          SUM(li.quantity_reserved) AS total_reserved,
          COALESCE(MAX(p.reorder_level), 10) AS reorder_level
        FROM location_inventory li
        JOIN products p ON p.id = li.product_id
        WHERE p.is_active = true
        GROUP BY li.product_id
      ) product_totals
    `);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

const { init: initLocationInventoryRoutes } = require('./routes/location-inventory');
app.use('/api/inventory', initLocationInventoryRoutes({ pool }));
logger.info('Multi-location inventory routes loaded');

const { init: initTransferRoutes } = require('./routes/inventory-transfers');
app.use('/api/inventory/transfers', initTransferRoutes({ pool }));
logger.info('Inventory transfer routes loaded');

const { init: initInventoryReportRoutes } = require('./routes/inventory-reports');
app.use('/api/inventory', initInventoryReportRoutes({ pool }));
logger.info('Inventory reports & alerts routes loaded');

const { init: initInventoryAgingRoutes } = require('./routes/inventory-aging');
app.use('/api/inventory', initInventoryAgingRoutes({ pool }));
logger.info('Inventory aging & turnover routes loaded');

// ============================================
// SCHEDULED REPORTS & ON-DEMAND GENERATION
// ============================================
const { init: initScheduledReportRoutes } = require('./routes/scheduled-reports');
const scheduledReportRouter = initScheduledReportRoutes({ pool });
app.use('/api/scheduled-reports', scheduledReportRouter);
// NOTE: Previously also mounted at /api/reports, but that shadowed the report-builder
// router's GET / and forced every /api/reports/* request through /:id numeric guard.
// The scheduled-reports endpoints are accessible at /api/scheduled-reports/* only.
logger.info('Scheduled reports & generation routes loaded');

// ============================================
// DISPATCH CONSOLE
// ============================================
const { init: initDispatchRoutes } = require('./routes/dispatch');
app.use('/api/dispatch', initDispatchRoutes({ pool }));
logger.info('Dispatch console routes loaded');

const { init: initRoutePlanningRoutes } = require('./routes/route-planning');
app.use('/api/dispatch/routes', initRoutePlanningRoutes({ pool }));
logger.info('Route planning routes loaded');

const { init: initDriverMgmtRoutes } = require('./routes/driver-management');
app.use('/api/dispatch', initDriverMgmtRoutes({ pool }));
logger.info('Driver management routes loaded');

const { init: initNotificationTemplateRoutes } = require('./routes/notification-templates');
app.use('/api/notification-templates', initNotificationTemplateRoutes({ pool }));
logger.info('Notification template routes loaded');

const { init: initNotificationTriggerRoutes } = require('./routes/notification-triggers');
app.use('/api/notifications', initNotificationTriggerRoutes({ pool }));
const { startReminderCron } = require('./services/notificationTriggers');
startReminderCron();
const notificationQueueService = require('./services/NotificationTriggerService');
notificationQueueService.startQueueProcessor();
logger.info('Notification trigger routes loaded');

const { init: initHubExchangeRoutes } = require('./routes/hub-exchanges');
app.use('/api/hub-exchanges', initHubExchangeRoutes({ pool }));
logger.info('Hub exchange routes loaded');

// Driver Auth (mobile app PIN login)
const { init: initDriverAuthRoutes } = require('./routes/driver-auth');
app.use('/api/auth/driver-login', initDriverAuthRoutes({ pool }));
logger.info('Driver auth routes loaded');

// Driver App (profile, shifts, vehicles)
const { init: initDriverAppRoutes } = require('./routes/driver-app');
app.use('/api/driver', initDriverAppRoutes({ pool }));
logger.info('Driver app routes loaded');

// ============================================
// CE COMPETITOR PRICING (PricesAPI.io)
// ============================================
const cePricingRoutes = require('./routes/ce-pricing');
app.use('/api/pricing/ce', cePricingRoutes.init({ pool }));
logger.info('CE competitor pricing routes loaded (PricesAPI)');

// ============================================
// PRICING ENGINE (Promotional Price Calculation)
// ============================================
const { init: initPricingEngineRoutes } = require('./routes/pricing-engine');
app.use('/api/pricing', initPricingEngineRoutes({ pool }));
logger.info('Pricing engine routes loaded');

// ============================================
// ANALYTICS (Modular)
// ============================================
app.use('/api/analytics', initAnalyticsRoutes({ pool }));
logger.info('Analytics routes loaded (modular)');

// ============================================
// UNIFIED DASHBOARD (Sales Pipeline)
// ============================================
const { init: initDashboardRoutes } = require('./routes/dashboard');
app.use('/api/dashboard', initDashboardRoutes({ pool, cache }));
logger.info('Unified dashboard routes loaded (sales pipeline)');

// ============================================
// RETAIL DASHBOARD (Real-Time KPIs)
// ============================================
const retailDashboardRoutes = require('./routes/retailDashboardRoutes');
app.use('/api/retail-dashboard', retailDashboardRoutes);
logger.info('Retail dashboard routes loaded');

// ============================================
// UNIVERSAL SEMANTIC SEARCH
// ============================================
const searchRoutes = require('./routes/searchRoutes');
app.use('/api/search', searchRoutes);
logger.info('Search routes loaded (hybrid FTS + vector)');

// ============================================
// AI BUSINESS ASSISTANT
// ============================================
const aiAssistantRoutes = require('./routes/aiAssistantRoutes');
app.use('/api/assistant', aiAssistantRoutes);
logger.info('AI Business Assistant routes loaded');

// ============================================
// INSIGHTS (AI-Powered Business Insights)
// ============================================
app.use('/api/insights', initInsightsRoutes({ pool }));
logger.info('Insights routes loaded (AI-powered business insights)');

// ============================================
// REPORTS (Report Builder & Scheduling)
// ============================================
app.use('/api/reports', initReportsRoutes({ pool }));
logger.info('Reports routes loaded (report builder & scheduling)');

// ============================================
// LEADS / INQUIRY CAPTURE
// ============================================
app.use('/api/leads', initLeadsRoutes({ pool, cache }));
logger.info('Leads routes loaded (inquiry capture system)');

// ============================================
// TASKS / FOLLOW-UP SCHEDULING
// ============================================
const { init: initTasksRoutes } = require('./routes/tasks');
app.use('/api/tasks', initTasksRoutes({ pool, cache }));
logger.info('Tasks routes loaded (follow-up scheduling)');

// ============================================
// CUSTOMER PORTAL SELF-SERVICE
// ============================================
const { init: initCustomerPortalRoutes } = require('./routes/customer-portal');
app.use('/api/customer-portal', initCustomerPortalRoutes({ pool, cache }));
logger.info('Customer portal routes loaded (self-service)');

// ============================================
// WEBHOOKS INTEGRATION SYSTEM
// ============================================
const { init: initWebhooksRoutes, getService: getWebhookService } = require('./routes/webhooks');
app.use('/api/webhooks', initWebhooksRoutes({ pool, cache }));
logger.info('Webhooks routes loaded (integrations)');

// ============================================
// DATA QUALITY TOOLS
// ============================================
const { init: initDataQualityRoutes } = require('./routes/data-quality');
app.use('/api/data-quality', initDataQualityRoutes({ pool, cache }));
logger.info('Data quality routes loaded');

// ============================================
// QUOTATIONS (Modular)
// ============================================
app.use('/api/quotations', initQuotesRoutes({ pool }));
logger.info('Quotation routes loaded (modular)');

// ============================================
// POS TRANSACTIONS (TeleTime POS)
// ============================================
const { init: initTransactionsRoutes } = require('./routes/transactions');
app.use('/api/transactions', initTransactionsRoutes({ pool, cache, discountAuthorityService }));
logger.info('POS transactions routes loaded');

// POS RETURNS
const { init: initReturnsRoutes } = require('./routes/returns');
app.use('/api/returns', initReturnsRoutes({ pool, cache, monerisService, receiptService }));
logger.info('POS returns routes loaded');

// POS STORE CREDITS
const { init: initStoreCreditsRoutes } = require('./routes/store-credits');
app.use('/api/store-credits', initStoreCreditsRoutes({ pool, cache }));
logger.info('Store credits routes loaded');

// EMPLOYEE TIME CLOCK
app.use('/api/timeclock', timeClockRoutes.init({ pool }));
logger.info('Employee time clock routes loaded');

// LAYAWAY MANAGEMENT
app.use('/api/layaways', layawayRoutes.init({ pool }));
logger.info('Layaway management routes loaded');

// GIFT CARDS
const { init: initGiftCardRoutes } = require('./routes/gift-cards');
app.use('/api/gift-cards', initGiftCardRoutes({ pool, emailService }));
logger.info('Gift card routes loaded');

// POS EXCHANGES
const { init: initExchangesRoutes } = require('./routes/exchanges');
app.use('/api/exchanges', initExchangesRoutes({ pool, cache, monerisService }));
logger.info('POS exchanges routes loaded');

// ============================================
// POS REGISTERS & SHIFTS (TeleTime POS)
// ============================================
const { init: initRegisterRoutes } = require('./routes/register');
app.use('/api/registers', initRegisterRoutes({ pool, cache, scheduledBatchEmailService }));
logger.info('POS register routes loaded');

// ============================================
// POS PAYMENTS (Moneris, Account, Gift Cards)
// ============================================
app.use('/api/pos-payments', initPosPaymentsRoutes({ posPaymentService, pool, emailService }));
logger.info('POS payments routes loaded');

// ============================================
// RECEIPTS (PDF generation, thermal, email)
// ============================================
app.use('/api/receipts', initReceiptsRoutes({ receiptService }));
logger.info('Receipt routes loaded');

// ============================================
// CASH DRAWER MANAGEMENT
// ============================================
app.use('/api/cash-drawer', initCashDrawerRoutes({ cashDrawerService }));
logger.info('Cash drawer routes loaded');

// ============================================
// POS INVOICES (Account customer invoicing)
// ============================================
app.use('/api/pos-invoices', initPosInvoicesRoutes({ posInvoiceService }));
logger.info('POS invoice routes loaded');
app.use('/api/sales-orders', initSalesOrderRoutes({ salesOrderService, posInvoiceService, managerOverrideService, pool }));
logger.info('Sales order routes loaded');
app.use('/api/delivery-slips', initDeliverySlipRoutes({ deliverySlipService, deliveryWaiverService, pool }));
logger.info('Delivery slip routes loaded');
app.use('/api/manufacturer-ras', initManufacturerRARoutes({ manufacturerRAService, pool }));
logger.info('Manufacturer RA routes loaded');

// ============================================
// UNIFIED REPORTS (Combined Quote + POS Analytics)
// ============================================
app.use('/api/reports/unified', initUnifiedReportsRoutes({ reportingService }));
logger.info('Unified reporting routes loaded');

// ============================================
// API V1 (Standardized versioned API)
// ============================================
const { init: initV1Routes } = require('./routes/v1');
app.use('/api/v1', initV1Routes({ db: { query: pool.query.bind(pool), pool }, services: {
  receiptService,
  posPaymentService,
  pricingService,
  productService: categoryProductService
}}));
logger.info('API v1 routes loaded (standardized versioned API)');

// ============================================
// DRAFTS (Quote/POS draft persistence & offline sync)
// ============================================
const { init: initDraftRoutes } = require('./routes/drafts');
app.use('/api/drafts', initDraftRoutes({ pool }));
logger.info('Draft persistence routes loaded (offline sync support)');

// ============================================
// TAX (Canadian tax calculations)
// ============================================
const { init: initTaxRoutes } = require('./routes/tax');
app.use('/api/tax', initTaxRoutes({ taxService }));
logger.info('Tax routes loaded');

// ============================================
// INSTITUTIONAL BUYERS
// ============================================
const { init: initInstitutionalRoutes } = require('./routes/institutionalRoutes');
app.use('/api/institutional', initInstitutionalRoutes({ institutionalService }));
logger.info('Institutional buyer routes loaded');

// ============================================
// VOICE NOTES (CRM interaction notes)
// ============================================
const VoiceNotesService = require('./services/voiceNotesService');
const voiceNotesService = new VoiceNotesService(pool);
const { init: initVoiceNotesRoutes } = require('./routes/voiceNotesRoutes');
app.use('/api/notes', initVoiceNotesRoutes({ voiceNotesService }));
logger.info('Voice notes routes loaded');

// ============================================
// FRAUD DETECTION & AUDIT
// ============================================
const { init: initFraudRoutes } = require('./routes/fraud');
app.use('/api/fraud', initFraudRoutes({ fraudService, employeeMonitorService, cache, fraudMLDataService, mlScoringService, featureStoreService }));
logger.info('Fraud detection routes loaded');

const { init: initAuditRoutes } = require('./routes/audit');
app.use('/api/audit', initAuditRoutes({ fraudService, auditLogService, logArchiveService }));
logger.info('Audit log routes loaded');

const { init: initChargebackRoutes } = require('./routes/chargebacks');
const chargebackRouter = initChargebackRoutes({ fraudService, pool, upload, wsService, chargebackEvidenceService });
app.use('/api/chargebacks', chargebackRouter);
logger.info('Chargeback routes loaded');

const { init: initMotoRoutes } = require('./routes/moto');
app.use('/api/moto', initMotoRoutes({ pool, fraudService, fraudScoringService, monerisService, auditLogService }));
logger.info('MOTO security routes loaded');

const { init: initPaymentMethodRoutes } = require('./routes/payment-methods');
app.use('/api/customers/:customerId/payment-methods', initPaymentMethodRoutes({ pool, vaultService }));
logger.info('Payment methods (Moneris Vault) routes loaded');

app.use('/api/serials', initSerialNumberRoutes({ serialService: serialNumberService }));
app.use('/api/serial-numbers', initSerialNumberRoutes({ serialService: serialNumberService }));
logger.info('Serial number routes loaded');

const inventorySyncRouter = require('./routes/inventory-sync');
app.use('/api/inventory-sync', inventorySyncRouter);
logger.info('Inventory sync routes loaded');

app.use('/api/purchase-orders', initPurchaseOrderRoutes({ poService: purchaseOrderService }));
logger.info('Purchase order routes loaded');

app.use('/api/product-variants', initProductVariantRoutes({ variantService: productVariantService }));

// Lightspeed Feature Gap Routes
app.use('/api/inventory/counts', initPhysicalCountRoutes({ countService: physicalCountService }));
app.use('/api/work-orders', initWorkOrderRoutes({ woService: workOrderService }));
app.use('/api/special-orders', initSpecialOrderRoutes({ soService: specialOrderService }));
app.use('/api/customer-accounts', initCustomerAccountRoutes({ accountService: customerAccountService }));
app.use('/api/pre-orders', initPreOrderRoutes({ preOrderService }));
app.use('/api/surveys', initSurveyRoutes({ surveyService }));
app.use('/api/catalog-exports', initCatalogExportRoutes({ catalogService: catalogExportService }));
app.use('/api/audience-sync', initAudienceSyncRoutes({ syncService: audienceSyncService }));
logger.info('Product variant routes loaded');

// ============================================
// CLIENT ERROR TRACKING
// ============================================
const ClientErrorTrackingService = require('./services/ClientErrorTrackingService');
const clientErrorTrackingService = new ClientErrorTrackingService(pool);
const { init: initClientErrorRoutes } = require('./routes/client-errors');
app.use('/api/errors', initClientErrorRoutes({ errorTrackingService: clientErrorTrackingService }));
logger.info('Client error tracking routes loaded');

// ============================================
// POS EMAIL (Receipt emails via AWS SES)
// ============================================
const emailRoutes = require('./routes/email');
app.use('/api/email', emailRoutes);
logger.info('POS email routes loaded');

// ============================================
// POS QUOTES (Quote lookup & conversion)
// ============================================
const { init: initPosQuotesRoutes } = require('./routes/pos-quotes');
app.use('/api/pos-quotes', initPosQuotesRoutes({ pool }));
logger.info('POS quote routes loaded');

// ============================================
// POS QUOTE EXPIRY (Expiring quotes detection)
// ============================================
app.use('/api/pos/quotes', initPosQuoteExpiryRoutes({ quoteExpiryService }));
logger.info('POS quote expiry routes loaded');

// ============================================
// POS SALES REPS (Active/on-shift sales reps)
// ============================================
const { init: initPosSalesRepsRoutes } = require('./routes/pos-sales-reps');
app.use('/api/pos', initPosSalesRepsRoutes(pool));
logger.info('POS sales reps routes loaded');

// ============================================
// SHIFT REPORTS (End-of-day/shift reports)
// ============================================
const { init: initShiftReportsRoutes } = require('./routes/shift-reports');
app.use('/api/reports', initShiftReportsRoutes(pool));
logger.info('Shift reports routes loaded');

// ============================================
// CUSTOMER PAYMENTS & CREDIT TRACKING
// ============================================
app.use('/api/payments', paymentsRoutes);
logger.info('Customer payments routes loaded');

// ============================================
// MARKETPLACE INTEGRATION (BEST BUY)
// ============================================
app.use('/api/marketplace', marketplaceRoutes);
logger.info('Marketplace integration routes loaded');

// ============================================
// 2026 FEATURES (Special Orders, E-Signatures, Portal, Templates, etc.)
// ============================================
const features2026Routes = require('./routes/features2026')(pool);
app.use('/api/features', features2026Routes);
logger.info('2026 Features routes loaded');

// ============================================
// PACKAGE BUILDER (Guided Package Wizard)
// ============================================
const initPackageBuilderRoutes = require('./routes/packageBuilder');
app.use('/api/package-builder', initPackageBuilderRoutes({ pool }));
logger.info('Package builder routes loaded');

// ============================================
// PACKAGE BUILDER V2 (Faceted Filtering)
// ============================================
const packageBuilderV2Routes = require('./routes/packageBuilderV2');
app.use('/api/package-builder-v2', packageBuilderV2Routes);
logger.info('Package builder V2 routes loaded');

// ============================================
// MANUFACTURER PROMOTIONS (Bundle Savings, Gifts, Guarantees)
// ============================================
const { init: initManufacturerPromotionsRoutes } = require('./routes/manufacturerPromotions');
app.use('/api/promotions/manufacturer', initManufacturerPromotionsRoutes({ pool }));
logger.info('Manufacturer promotions routes loaded');

// ============================================
// MANUFACTURER REBATES (Instant, Mail-In, Online Rebates)
// ============================================
const createRebateRoutes = require('./routes/rebates');
app.use('/api/rebates', createRebateRoutes(pool, authenticate));
logger.info('Manufacturer rebates routes loaded');

// ============================================
// TRADE-IN SYSTEM (Assessment, Approvals, History)
// ============================================
const tradeInRoutes = require('./routes/trade-in');
app.use('/api/trade-in', tradeInRoutes);

// Product Recommendations
app.use('/api/recommendations', initRecommendationsRoutes({ pool, cache }));
logger.info('Trade-in routes loaded');

// Upsell Strategies
const upsellRoutes = require('./routes/upsell');
app.use('/api/upsell', upsellRoutes);
logger.info('Upsell routes loaded');

// Financing Service
app.use('/api/financing', initFinancingRoutes({ financingService }));
logger.info('Financing routes loaded');

// Commission Service
app.use('/api/commissions', authenticate, initCommissionsRoutes({ commissionService, pool }));
app.use('/api/signatures', initSignaturesRoutes({ signatureService }));
app.use('/api/batch-email', initBatchEmailRoutes({ batchEmailService, receiptService }));

// Batch email settings routes (uses scheduledBatchEmailService initialized earlier)
app.use('/api/batch-email-settings', authenticate, batchEmailSettingsRoutes(pool, scheduledBatchEmailService));
logger.info('Commission and batch email routes loaded');

// ============================================
// EMAIL ENDPOINTS (PHASE 5)
// ============================================
app.get('/api/test-email', authenticate, requireRole('admin', 'manager'), async (req, res) => {
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
    logger.error({ err: error }, 'Email test error');
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/quotations/:id/send-email', authenticate, upload.single('pdf'), async (req, res) => {
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
      logger.warn({ err: e }, 'Could not parse revenue_features for email');
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
      <div class="content"><p>Dear ${(recipientName || '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))},</p><p>${(message || 'Thank you for your interest in our products. Please find your quote attached.').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))}</p>
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
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      emailHtml,
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="Quote_${quote.quote_number || quote.id}.pdf"`,
      `Content-Description: Quote_${quote.quote_number || quote.id}.pdf`,
      `Content-Disposition: attachment; filename="Quote_${quote.quote_number || quote.id}.pdf"`,
      'Content-Transfer-Encoding: base64',
      '',
      pdfBase64,
      '',
      `--${boundary}--`
    ].join('\r\n');

    const sendCommand = new SendEmailCommand({
      FromEmailAddress: process.env.EMAIL_FROM,
      Destination: { ToAddresses: [recipientEmail] },
      Content: { Raw: { Data: Buffer.from(rawMessage) } }
    });
    await sesClient.send(sendCommand);

    await pool.query(
      'UPDATE quotations SET status = $1, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['SENT', id]
    );

    res.json({ success: true, message: 'Quote sent successfully', sentTo: recipientEmail });
  } catch (error) {
    logger.error({ err: error }, 'Error sending quote email');
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

logger.info('Phase 5: Email routes loaded');

// ============================================
// ACTIVITY TRACKING ROUTES
// ============================================
const activityRoutes = require('./routes/activities')(pool);
app.use('/api/activities', activityRoutes);
logger.info('Activity tracking routes loaded');

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

    logger.info({ postalCode: code }, 'Looking up postal code');

    const addressInfo = await postalCodeService.lookupCanadianPostalCode(code);

    logger.info({ postalCode: code, addressInfo }, 'Postal code found');

    res.json({
      success: true,
      address: addressInfo
    });
  } catch (error) {
    logger.error({ errMsg: error.message }, 'Postal code lookup error');

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
    logger.error({ err: error }, 'Error fetching cities');
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
    logger.error({ err: error }, 'Error fetching all cities');
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cities data'
    });
  }
});

// ============================================
// DASHBOARD STATISTICS ENDPOINT
// ============================================
app.get('/api/dashboard/stats', authenticate, async (req, res) => {
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
    logger.error({ err: error }, 'Error fetching dashboard stats');
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
    logger.error({ err: error }, 'Error fetching payment terms');
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
    logger.error({ err: error }, 'Error creating payment terms');
    res.status(500).json({ error: 'Failed to create payment terms' });
  }
});

logger.info('Payment terms endpoints loaded');

// Quote aliases - redirect /api/quotes/* to /api/quotations/*
app.use('/api/quotes', initQuotesRoutes({ pool }));
logger.info('Quote aliases loaded (/api/quotes -> /api/quotations)');

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
    logger.error({ err }, 'Error fetching quote templates');
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

    logger.info({ templateName: name }, 'Created quote template');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'Error creating quote template');
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

    logger.info({ templateName: result.rows[0].name }, 'Deleted quote template');
    res.json({ message: 'Template deleted successfully' });
  } catch (err) {
    logger.error({ err }, 'Error deleting quote template');
    res.status(500).json({ error: err.message });
  }
});

logger.info('Quote template endpoints loaded');

// ============================================
// APPROVAL WORKFLOW ENDPOINTS
// ============================================

// Request approval for a quotation
app.post('/api/quotations/:id/request-approval', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { requested_by, requested_by_email, approver_name, approver_email, comments } = req.body;

    // Check if there's already a pending approval
    const existing = await pool.query(
      'SELECT * FROM quote_approvals WHERE quotation_id = $1 AND status = \'PENDING\'',
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
      'UPDATE quotations SET status = \'PENDING_APPROVAL\' WHERE id = $1',
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
        logger.info({ recipient: approver_email }, 'Approval request email sent');
      } catch (emailErr) {
        logger.error({ err: emailErr }, 'Error sending approval email');
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error requesting approval');
    res.status(500).json({ error: 'Failed to request approval' });
  }
});

// Get approval history for a quotation
app.get('/api/quotations/:id/approvals', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM quote_approvals WHERE quotation_id = $1 ORDER BY requested_at DESC',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching approvals');
    res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

// Get approval rules summary for a quotation (shows if approval needed and user permissions)
app.get('/api/quotations/:id/approval-summary', authenticate, async (req, res) => {
  const ApprovalRulesService = require('./services/ApprovalRulesService');

  try {
    const { id } = req.params;

    const quoteResult = await pool.query(
      'SELECT * FROM quotations WHERE id = $1',
      [id]
    );

    if (quoteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const quote = quoteResult.rows[0];
    const summary = ApprovalRulesService.getApprovalSummary(quote, req.user);

    res.json(summary);
  } catch (error) {
    logger.error({ err: error }, 'Error getting approval summary');
    res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

// Get all pending approvals
app.get('/api/approvals/pending', authenticate, async (req, res) => {
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
      query += ' AND qa.approver_email = $1';
      params.push(approver_email);
    }

    query += ' ORDER BY qa.requested_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching pending approvals');
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

// Approve a quote
app.post('/api/approvals/:id/approve', authenticate, async (req, res) => {
  const ApprovalRulesService = require('./services/ApprovalRulesService');

  try {
    const { id } = req.params;
    const { comments } = req.body;

    // Get approval request
    const approvalResult = await pool.query(
      `SELECT qa.*, q.total_cents FROM quote_approvals qa
       LEFT JOIN quotations q ON qa.quotation_id = q.id
       WHERE qa.id = $1`,
      [id]
    );

    if (approvalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    const approval = approvalResult.rows[0];

    // NEW: Role enforcement - check if user can approve this quote
    const canApprove = ApprovalRulesService.canApprove(req.user, approval);
    if (!canApprove.canApprove) {
      return res.status(403).json({
        error: 'Not authorized to approve this quote',
        reason: canApprove.reason
      });
    }

    // Update approval record
    const result = await pool.query(`
      UPDATE quote_approvals
      SET status = 'APPROVED', comments = COALESCE($1, comments), reviewed_at = CURRENT_TIMESTAMP,
          approver_name = $3, approver_email = $4
      WHERE id = $2 RETURNING *
    `, [comments, id, `${req.user.firstName} ${req.user.lastName}`, req.user.email]);

    // Update quote status to APPROVED with audit fields
    await pool.query(
      'UPDATE quotations SET status = \'APPROVED\', approved_at = CURRENT_TIMESTAMP, approved_by = $2 WHERE id = $1',
      [approval.quotation_id, req.user.id]
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
          logger.error({ err: emailErr }, 'Error sending approval notification');
        }
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error approving quote');
    res.status(500).json({ error: 'Failed to approve quote' });
  }
});

// Reject a quote
app.post('/api/approvals/:id/reject', authenticate, async (req, res) => {
  const ApprovalRulesService = require('./services/ApprovalRulesService');

  try {
    const { id } = req.params;
    const { comments } = req.body;

    if (!comments || !comments.trim()) {
      return res.status(400).json({ error: 'Comments are required when rejecting a quote' });
    }

    // Get approval request
    const approvalResult = await pool.query(
      `SELECT qa.*, q.total_cents FROM quote_approvals qa
       LEFT JOIN quotations q ON qa.quotation_id = q.id
       WHERE qa.id = $1`,
      [id]
    );

    if (approvalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    const approval = approvalResult.rows[0];

    // NEW: Role enforcement - check if user can reject this quote
    const canReject = ApprovalRulesService.canReject(req.user);
    if (!canReject.canReject) {
      return res.status(403).json({
        error: 'Not authorized to reject this quote',
        reason: canReject.reason
      });
    }

    // Update approval record
    const result = await pool.query(`
      UPDATE quote_approvals
      SET status = 'REJECTED', comments = $1, reviewed_at = CURRENT_TIMESTAMP,
          approver_name = $3, approver_email = $4
      WHERE id = $2 RETURNING *
    `, [comments, id, `${req.user.firstName} ${req.user.lastName}`, req.user.email]);

    // Update quote status to REJECTED with audit fields
    await pool.query(
      'UPDATE quotations SET status = \'REJECTED\', rejected_at = CURRENT_TIMESTAMP, rejected_by = $2, rejected_reason = $3 WHERE id = $1',
      [approval.quotation_id, req.user.id, comments]
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
          logger.error({ err: emailErr }, 'Error sending rejection notification');
        }
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error rejecting quote');
    res.status(500).json({ error: 'Failed to reject quote' });
  }
});

logger.info('Approval workflow endpoints loaded');

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
    logger.error({ err: error }, 'Error fetching delivery services');
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
    logger.error({ err: error }, 'Error calculating delivery cost');
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
    logger.error({ err: error }, 'Error fetching warranty plans');
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
    logger.error({ err: error }, 'Error calculating warranty cost');
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
    logger.error({ err: error }, 'Error fetching financing plans');
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
    logger.error({ err: error }, 'Error calculating financing');
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
    logger.error({ err: error }, 'Error fetching rebates');
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
    logger.error({ err: error }, 'Error calculating rebate');
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
    logger.error({ err: error }, 'Error fetching trade-in values');
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
    logger.error({ err: error }, 'Error fetching sales reps');
    res.status(500).json({ error: 'Failed to fetch sales reps' });
  }
});

// Removed: inline GET /api/commission-rules and POST /api/commission-rules/calculate
// These were unauthenticated and shadowed the authenticated handlers in commission-api.js (rulesRouter).
// Commission rules CRUD is available via:
//   - /api/commissions/rules (commissions.js — used by POS & frontend)
//   - /api/commission-rules (commission-api.js rulesRouter — authenticated)

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
          AND p.is_active = true
      )
      SELECT
        id,
        model,
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

      const baseParams = [productId, baseProduct.category, remainingCount];
      const excludeClause = existingIds.length > 0
        ? 'AND p.id != ALL($4::int[])'
        : '';
      const queryParams = existingIds.length > 0
        ? [...baseParams, existingIds]
        : baseParams;

      const popularProducts = await pool.query(`
        SELECT
          p.id,
          p.model,
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
          AND p.is_active = true
          AND p.category = $2
          ${excludeClause}
        GROUP BY p.id
        ORDER BY times_quoted DESC, margin_percent DESC
        LIMIT $3
      `, queryParams);

      finalRecommendations = [...finalRecommendations, ...popularProducts.rows];
    }

    res.json({
      success: true,
      baseProduct: {
        id: baseProduct.id,
        model: baseProduct.model,
        manufacturer: baseProduct.manufacturer,
        category: baseProduct.category
      },
      recommendations: finalRecommendations.map(rec => ({
        id: rec.id,
        modelNumber: rec.model,
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
    logger.error({ err: error }, 'Error generating recommendations');
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
          AND p.is_active = true
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
              modelNumber: lowMarginProduct.model,
              msrp: lowMarginProduct.msrp_cents / 100
            },
            suggestedProduct: {
              id: upgrade.id,
              modelNumber: upgrade.model,
              manufacturer: upgrade.manufacturer,
              description: upgrade.description,
              msrp: upgrade.msrp_cents / 100,
              margin: upgrade.margin_percent
            },
            benefit: {
              priceDifference: priceDiff,
              marginIncrease: Math.round(marginIncrease * 100) / 100,
              customerValue: 'Enhanced features and performance'
            },
            talking_points: [
              `Only $${priceDiff.toFixed(2)} more for upgraded model`,
              `${marginIncrease.toFixed(1)}% better margin`,
              'Premium features include better warranty and energy efficiency'
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
        p.model,
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
        AND p.is_active = true
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
          modelNumber: bundle.model,
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
    logger.error({ err: error }, 'Error generating upsell suggestions');
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
    logger.error({ err: error }, 'Error generating quote recommendations');
    res.status(500).json({ error: 'Failed to generate quote recommendations', details: error.message });
  }
});

logger.info('AI recommendation endpoints loaded');

// ============================================
// ENTERPRISE ROUTES (Phase 2)
// Orders, Invoices, Inventory, Delivery, Pricing, Moneris
// ============================================
app.use('/api/orders', ordersRoutes(pool, cache, orderService, inventoryService));
logger.info('Orders routes loaded');

app.use('/api/invoices', invoicesRoutes(pool, cache, invoiceService));
logger.info('Invoices routes loaded');

app.use('/api/inventory', inventoryRoutes(pool, cache, inventoryService));
logger.info('Inventory routes loaded');

app.use('/api/delivery', deliveryRoutes(pool, cache, deliveryService));
logger.info('Delivery routes loaded');

app.use('/api/pricing', pricingRoutes(pool, cache, pricingService));
logger.info('Pricing routes loaded');

app.use('/api/pricing/volume', volumePricingRoutes(pool, cache, volumeDiscountService));
logger.info('Volume pricing routes loaded');

app.use('/api/pos-promotions', posPromotionsRoutes(posPromotionService, promotionEngine));
logger.info('POS promotions routes loaded');

app.use('/api/manager-overrides', managerOverrideRoutes(managerOverrideService));
logger.info('Manager override routes loaded');

app.use('/api/customer-pricing', customerPricingRoutes.init({ pool, cache }));
logger.info('Customer pricing routes loaded');

app.use('/api/pos-approvals', approvalRoutes(approvalService));
logger.info('POS price-override approval routes loaded');

app.use('/api/discount-authority', discountAuthorityRoutes(discountAuthorityService, fraudService));
logger.info('Discount authority routes loaded (with fraud detection)');

app.use('/api/discount-escalations', discountEscalationRoutes(discountAuthorityService, fraudService));
logger.info('Discount escalation routes loaded (with audit logging)');

app.use('/api/discount-analytics', discountAnalyticsRoutes(pool));
logger.info('Discount analytics routes loaded');

app.use('/api/delivery/fulfillment', deliveryFulfillmentRoutes(deliveryFulfillmentService));
const deliveryWindowRoutes = require('./routes/delivery-windows');
app.use('/api/delivery-windows', deliveryWindowRoutes.init({ pool }));
logger.info('Delivery window scheduling routes loaded');
const locationRoutes = require('./routes/locations');
app.use('/api/locations', locationRoutes.init({ pool }));
logger.info('Location routes loaded');
const hubReturnRoutes = require('./routes/hub-returns');
app.use('/api/hub-returns', hubReturnRoutes.init({ pool, monerisService }));
logger.info('Hub returns routes loaded');
const hubCommissionRoutes = require('./routes/hub-commissions');
app.use('/api/hub-commissions', hubCommissionRoutes.init({ pool }));
logger.info('Hub commission routes loaded');
const commissionApi = require('./routes/commission-api');
const commissionRouters = commissionApi.init({ pool });
app.use('/api/orders', commissionRouters.orderRouter);
app.use('/api/users', commissionRouters.userRouter);
app.use('/api/commissions', commissionRouters.commissionRouter);
app.use('/api/commission-rules', commissionRouters.rulesRouter);
logger.info('Commission management API routes loaded');
const etransferPaymentRoutes = require('./routes/etransfer-payments');
const etransferRouters = etransferPaymentRoutes.init({ pool, emailService });
app.use('/api/orders', etransferRouters.orderRouter);
app.use('/api/payments', etransferRouters.paymentRouter);
logger.info('E-transfer payment routes loaded');
app.use('/api/warranty', warrantyRoutes(warrantyService));
logger.info('Delivery fulfillment routes loaded');

app.use('/api/product-metrics', productMetricsRoutes(pool, cache, productMetricsService));
logger.info('Product metrics routes loaded');

// Moneris payment routes
app.use('/api/moneris', monerisRoutes(pool, cache, monerisService));
logger.info('Moneris payment routes loaded');

// Stripe payment routes
app.use('/api/stripe', stripeRoutes(pool, cache, stripeService));
logger.info('Stripe payment routes loaded');

// ============================================
// ADVANCED PRICING (Volume Discounts, Promotions, Stacking)
// ============================================
app.use('/api/advanced-pricing', advancedPricingRoutes);
logger.info('Advanced pricing routes loaded');

// ============================================
// AI PERSONALIZATION (Dynamic Pricing, Upselling, Suggestions)
// ============================================
// Handle both old and new export formats
const aiRouter = aiPersonalizationRoutes.router || aiPersonalizationRoutes;
app.use('/api/ai', aiRouter);
// Initialize AI Quote Builder service if available
if (aiPersonalizationRoutes.initQuoteBuilderService) {
  aiPersonalizationRoutes.initQuoteBuilderService(pool, cache);
}
logger.info('AI personalization routes loaded');

// 3D PRODUCT CONFIGURATOR
// ============================================
app.use('/api/product-3d', product3dRoutes);
logger.info('3D product configurator routes loaded');

// PRODUCT IMAGES
// ============================================
app.use('/api/products', productImageRoutes.init({ pool }));
logger.info('Product image gallery routes loaded');

// BARCODE IMAGE GENERATION
// ============================================
const barcodeImageRoutes = require('./routes/barcode-image');
app.use('/api/products', barcodeImageRoutes.init({ pool }));
logger.info('Barcode image routes loaded');

// CALL LOG TRACKING
// ============================================
const callLogRouter = callLogRoutes.init({ pool });
app.use('/api', callLogRouter);
logger.info('Call log tracking routes loaded');

// AR AGING REPORT
// ============================================
app.use('/api/reports', arAgingRoutes.init({ pool, emailService }));
logger.info('AR aging report routes loaded');

// TAX SUMMARY REPORT
// ============================================
app.use('/api/reports', taxSummaryRoutes.init({ pool }));
logger.info('Tax summary report routes loaded');

// ============================================
// VENDOR PRODUCT VISUALIZATION & SCRAPER
// ============================================
vendorProductsRoutes(app);
logger.info('Vendor product visualization routes loaded');

// ============================================
// CHURN ALERTS (Automated Email Alerts for High Churn Risk Customers)
// ============================================
const churnAlertsRoutes = require('./routes/churnAlerts');
const churnAlertJob = require('./jobs/churnAlertJob');
app.use('/api/churn-alerts', churnAlertsRoutes);
logger.info('Churn alerts routes loaded');

// ============================================
// CLV ADMIN (CLV Job Management & Trend Data)
// ============================================
const clvAdminRoutes = require('./routes/clv-admin');
const clvCalculationJob = require('./jobs/clvCalculationJob');
app.use('/api/clv', clvAdminRoutes);
logger.info('CLV admin routes loaded');

// ============================================
// PURCHASING INTELLIGENCE (AI-Powered Purchasing Recommendations)
// ============================================
const purchasingIntelligenceRoutes = require('./routes/purchasingIntelligence');
const purchasingIntelligenceJob = require('./jobs/purchasingIntelligenceJob');
app.use('/api/purchasing-intelligence', purchasingIntelligenceRoutes);
logger.info('Purchasing intelligence routes loaded');

// ============================================
// NOMENCLATURE SCRAPER SCHEDULED JOB
// ============================================
const nomenclatureScraperJob = require('./jobs/nomenclatureScraperJob');
nomenclatureScraperJob.init(pool);
logger.info('Nomenclature scraper job initialized');

// ============================================
// MODEL NOMENCLATURE DECODER & TRAINING
// ============================================
app.use('/api/nomenclature', initNomenclatureRoutes({ pool, cache }));
logger.info('Nomenclature decoder routes loaded');

// ============================================
// QUICK SEARCH (Universal Product Finder)
// ============================================
app.use('/api/quick-search', quickSearchRoutes(pool, cache));
logger.info('Quick Search routes loaded');

// ============================================
// ADMIN ROUTES (Email Queue Monitoring)
// ============================================
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);
logger.info('Admin routes loaded (email monitoring, queue management)');

// ============================================
// ADMIN APPROVAL RULES (Threshold Configuration)
// ============================================
const adminApprovalRulesRoutes = require('./routes/admin-approval-rules');
app.use('/api/admin/approval-rules', authenticate, requireRole('admin', 'manager'), adminApprovalRulesRoutes(pool));
logger.info('Admin approval rules routes loaded');

// ============================================
// ADMIN SKULYTICS ROUTES (SKU Refresh & Health)
// ============================================
const adminSkulyticsRoutes = require('./routes/admin/skulytics');
app.use('/api/admin/skulytics', adminSkulyticsRoutes);
logger.info('Admin Skulytics routes loaded (SKU refresh, health)');

// ============================================
// ADMIN CE IMPORT ROUTES (Icecat Bulk Import)
// ============================================
const ceImportRoutes = require('./routes/admin/ce-import');
app.use('/api/admin/products', ceImportRoutes.init({ pool, cache }));
logger.info('Admin CE import routes loaded (Barcode Lookup + Icecat)');

// Skulytics job scheduler (started in app.listen callback below)
const scheduler = require('./jobs/scheduler');

// ============================================
// AI ASSISTANT ROUTES
// ============================================
const aiChatRoutes = require('./routes/ai-assistant');
app.use('/api/ai', aiChatRoutes);
logger.info('AI Assistant routes loaded');

// ============================================
// ORDER AMENDMENTS & CREDIT MEMOS
// ============================================
app.use('/api/order-modifications', initOrderModificationRoutes({ pool, cache }));
logger.info('Order modification routes loaded');

app.use('/api/credit-memos', initCreditMemoRoutes({ pool, cache }));
logger.info('Credit memo routes loaded');

const { init: initBugReportRoutes } = require('./routes/bugReports');
app.use('/api/bug-reports', initBugReportRoutes({ pool }));
logger.info('Bug report routes loaded');

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

// Initialize audit log hash chain before accepting requests
auditLogService.initializeChain().catch(err => {
  logger.error({ err }, '[AuditLog] Chain init failed — will lazy-init on first write');
});

// Rebuild velocity counters from PostgreSQL if Redis was restarted
velocityService.rebuildFromPostgres().catch(err => {
  logger.warn({ err: err.message }, '[VelocityService] Startup rebuild failed — will count from zero');
});

// Preload common Canadian bank BINs into cache
binService.preloadCanadianBINs().catch(err => {
  logger.warn({ err: err.message }, '[BINService] Canadian BIN preload failed — will use API/static fallback');
});

// Initialize fraud scoring engine (loads rules, starts auto-refresh)
fraudScoringService.initialize().catch(err => {
  logger.warn({ err: err.message }, '[FraudScoring] Initialization failed — will lazy-load rules on first score');
});

let serverStarted = false;
const server = app.listen(PORT, () => {
  serverStarted = true;
  logger.info({ port: PORT, env: process.env.NODE_ENV || 'development', url: `http://localhost:${PORT}` }, '[Server] Customer Quotation App backend started');

  // PCI DSS Req 10.6 — NTP synchronization check
  (() => {
    const https = require('https');
    const checkStart = Date.now();
    https.get('https://worldtimeapi.org/api/timezone/Etc/UTC', (resp) => {
      let data = '';
      resp.on('data', chunk => { data += chunk; });
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const serverTime = Date.now();
          const ntpTime = new Date(parsed.utc_datetime).getTime();
          const driftMs = Math.abs(serverTime - ntpTime);
          if (driftMs > 1000) {
            logger.warn({ driftMs, serverTime: new Date(serverTime).toISOString(), ntpTime: parsed.utc_datetime },
              '[NTP] Clock drift exceeds 1 second — PCI DSS Req 10.6 requires NTP synchronization');
            auditLogService.logEvent({
              eventType: 'system.ntp_drift',
              eventCategory: 'system',
              severity: 'warning',
              details: { drift_ms: driftMs, server_time: new Date(serverTime).toISOString(), ntp_time: parsed.utc_datetime },
            });
          } else {
            logger.info({ driftMs }, '[NTP] Clock synchronized (drift within tolerance)');
          }
        } catch (_) {
          logger.warn('[NTP] Could not parse NTP response — manual verification recommended');
        }
      });
    }).on('error', () => {
      logger.warn('[NTP] Could not reach time server — manual NTP verification recommended');
    });
  })();

  // CE integration key checks (non-fatal)
  if (!process.env.BARCODE_LOOKUP_API_KEY) {
    logger.warn('BARCODE_LOOKUP_API_KEY not set — CE product import primary source will fail, falling back to Icecat');
  }
  if (!process.env.ICECAT_USERNAME) {
    logger.warn('ICECAT_USERNAME not set — CE product import will fail');
  }
  if (!process.env.PRICES_API_KEY) {
    logger.warn('PRICES_API_KEY not set — CE live pricing will fail');
  }

  // Initialize WebSocket service (shares the same port via HTTP upgrade)
  wsService.init(server);

  // Start notification scheduler for automated email reminders
  if (process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'false') {
    notificationScheduler.start();
  }

  // Start email queue processor for reliable email delivery
  if (process.env.ENABLE_EMAIL_QUEUE !== 'false') {
    const EmailQueueService = require('./services/EmailQueueService');
    EmailQueueService.start(process.env.EMAIL_QUEUE_SCHEDULE || '*/2 * * * *');
    logger.info('Email queue processor started');
  }

  // Start churn alert scheduler for daily high churn risk notifications
  if (process.env.ENABLE_CHURN_ALERTS !== 'false') {
    churnAlertJob.startScheduler(process.env.CHURN_ALERT_SCHEDULE || '0 9 * * *');
    logger.info('Churn alert scheduler started');
  }

  // Start purchasing intelligence scheduler for daily/weekly analysis
  if (process.env.ENABLE_PURCHASING_INTELLIGENCE !== 'false') {
    purchasingIntelligenceJob.startScheduler();
    logger.info('Purchasing intelligence scheduler started (Daily 6AM, Weekly Monday 6AM)');
  }

  // Start nomenclature scraper scheduler for weekly nomenclature updates
  if (process.env.ENABLE_NOMENCLATURE_SCRAPER !== 'false') {
    nomenclatureScraperJob.startSchedule(process.env.NOMENCLATURE_SCRAPE_SCHEDULE || '0 2 * * 0');
    logger.info('Nomenclature scraper scheduler started (Weekly Sunday 2 AM)');
  }

  // Start quote expiry digest job for daily email digests to sales reps
  if (process.env.ENABLE_QUOTE_EXPIRY_DIGEST !== 'false') {
    const quoteExpiryDigestJob = new QuoteExpiryDigestJob(pool, emailService);
    quoteExpiryDigestJob.start();
    logger.info('Quote expiry digest scheduler started (Weekdays 8 AM)');
  }

  // Start daily digest job for morning overview emails to sales reps
  if (process.env.ENABLE_DAILY_DIGEST !== 'false') {
    const DailyDigestJob = require('./services/DailyDigestJob');
    const dailyDigestJob = new DailyDigestJob(pool, emailService);
    dailyDigestJob.start();
    logger.info('Daily digest scheduler started (Weekdays 8:15 AM)');
  }

  // Start discontinued product auto-hide job (daily at 2 AM)
  const discontinuedProductJob = require('./jobs/discontinuedProductJob');
  discontinuedProductJob.start(process.env.DISCONTINUED_HIDE_SCHEDULE || '0 2 * * *');
  logger.info('Discontinued product auto-hide job started (Daily 2 AM)');

  // Start customer auto-tag evaluation job (daily at 3 AM)
  const autoTagJob = require('./jobs/autoTagJob');
  autoTagJob.start(process.env.AUTO_TAG_SCHEDULE || '0 3 * * *');
  logger.info('Customer auto-tag job started (Daily 3 AM)');

  // Start CLV calculation job (daily at 2:30 AM)
  if (process.env.ENABLE_CLV_JOB !== 'false') {
    clvCalculationJob.start(process.env.CLV_JOB_SCHEDULE || '30 2 * * *');
    logger.info('CLV calculation job started (Daily 2:30 AM)');
  }

  // Start CSV auto-import watcher (watches cleaned_data folder for new price lists)
  if (process.env.AUTO_IMPORT_ENABLED === 'true') {
    const ProductSyncScheduler = require('./services/product-sync-scheduler');
    const importConfig = require('./config/import-config');
    const syncScheduler = new ProductSyncScheduler(pool, importConfig);
    syncScheduler.start();
    logger.info('Product CSV sync scheduler started');
  }

  // Initialize ChannelManager (loads active marketplace channels from DB)
  try {
    const { getInstance: getChannelManager } = require('./services/ChannelManager');
    getChannelManager().then(cm => {
      logger.info({ channelCount: cm.getAllAdapters().length }, 'ChannelManager ready');
    }).catch(err => {
      logger.warn({ err }, 'ChannelManager init failed');
    });
  } catch (err) {
    logger.warn({ err }, 'ChannelManager not available');
  }

  // Start Skulytics nightly sync job (2 AM ET) via centralized scheduler
  scheduler.startAll();

  // Start marketplace polling jobs (order sync, inventory push, import checks, deadline monitor)
  try {
    const marketplaceJobs = require('./jobs/marketplaceJobs');
    if (process.env.MARKETPLACE_POLLING_ENABLED === 'true' && process.env.MIRAKL_API_KEY) {
      marketplaceJobs.startPolling();
      logger.info('Marketplace polling started');
    }
  } catch (err) {
    logger.warn({ err }, 'Marketplace polling skipped');
  }
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    if (serverStarted) {
      // Dual-stack race on Windows — server is already listening on IPv4, ignore IPv6 failure
      logger.warn({ port: PORT }, 'Port dual-stack conflict (non-fatal, server is running)');
    } else {
      logger.error({ port: PORT }, 'Port is already in use');
      process.exit(1);
    }
  } else {
    logger.error({ err: error }, 'Server error');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  scheduler.stopAll();
  wsService.shutdown();
  server.close(() => {
    logger.info('HTTP server closed');
    pool.end(() => {
      logger.info('Database pool closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  scheduler.stopAll();
  wsService.shutdown();
  server.close(() => {
    logger.info('HTTP server closed');
    pool.end(() => {
      logger.info('Database pool closed');
      process.exit(0);
    });
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught Exception');
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ err: reason, promise: String(promise) }, 'Unhandled Rejection');
  process.exit(1);
});
