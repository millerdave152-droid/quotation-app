/**
 * TeleTime POS - Audit Log Middleware
 * Express middleware factory that logs events after the response is sent.
 * Uses fire-and-forget pattern so audit logging never blocks the HTTP response.
 *
 * Usage:
 *   router.post('/transactions', auditLogMiddleware('sale', 'transaction'), handler)
 *   router.post('/login', auditLogMiddleware('login', 'auth'), handler)
 */

const logger = require('../utils/logger');

/**
 * Create an audit logging middleware for a specific event type.
 *
 * @param {string} eventType     - Event identifier, e.g. 'sale', 'void', 'login'
 * @param {string} eventCategory - Category, e.g. 'transaction', 'auth', 'inventory'
 * @param {object} [options]     - Extra options
 * @param {string} [options.severity='info'] - Default severity level
 * @param {Function} [options.detailsExtractor] - (req, res) => object — custom detail builder
 * @param {Function} [options.entityExtractor]  - (req, res) => { entityType, entityId }
 * @returns {Function} Express middleware
 */
function auditLogMiddleware(eventType, eventCategory, options = {}) {
  const {
    severity = 'info',
    detailsExtractor = null,
    entityExtractor = null,
  } = options;

  return function auditMiddleware(req, res, next) {
    // Capture the original json method to sniff the response body
    const originalJson = res.json.bind(res);
    let responseBody = null;

    res.json = function (body) {
      responseBody = body;
      return originalJson(body);
    };

    // Log AFTER the response has been sent to the client
    res.on('finish', () => {
      try {
        const auditLogService = req.app.get('auditLogService');
        if (!auditLogService) return;

        // Only log successful mutations (2xx) or explicit failure events
        const isAuthEvent = eventCategory === 'auth';
        const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
        if (!isSuccess && !isAuthEvent) return;

        // Determine severity based on status code for auth events
        let effectiveSeverity = severity;
        if (isAuthEvent && !isSuccess) {
          effectiveSeverity = 'warning';
        }

        // Build entity info
        let entityType = eventCategory;
        let entityId = req.params?.id || null;
        if (entityExtractor) {
          const extracted = entityExtractor(req, res);
          entityType = extracted.entityType || entityType;
          entityId = extracted.entityId || entityId;
        }

        // Build details
        let details = {};
        if (detailsExtractor) {
          try { details = detailsExtractor(req, res) || {}; } catch { /* ignore */ }
        } else {
          // Default: include method, path, status, and safe body fields
          details = {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
          };
          // Include relevant body data (but never passwords or tokens)
          if (req.body) {
            const safeFields = [
              'transaction_id', 'transactionId', 'product_id', 'productId',
              'customer_id', 'customerId', 'quantity', 'amount', 'total_amount',
              'shift_id', 'shiftId', 'reason', 'notes', 'sku',
            ];
            for (const field of safeFields) {
              if (req.body[field] !== undefined) {
                details[field] = req.body[field];
              }
            }
          }
          // Include response entity id if available
          if (responseBody?.data?.id) {
            entityId = entityId || responseBody.data.id;
          }
          if (responseBody?.data?.transaction_id) {
            entityId = entityId || responseBody.data.transaction_id;
          }
        }

        // Fire-and-forget — do NOT await
        auditLogService.logEvent({
          eventType,
          eventCategory,
          severity: effectiveSeverity,
          employeeId: req.user?.id || null,
          terminalId: req.body?.terminal_id || req.body?.terminalId || null,
          locationId: req.body?.location_id || req.body?.locationId || null,
          transactionId: req.body?.transaction_id || req.body?.transactionId
                      || responseBody?.data?.transaction_id || null,
          entityType,
          entityId,
          details,
          ipAddress: req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || null,
          userAgent: req.headers?.['user-agent'] || null,
        });
      } catch (err) {
        // Audit logging must NEVER crash the app
        logger.error({ err }, '[AuditMiddleware] Failed to log event');
      }
    });

    next();
  };
}

module.exports = { auditLogMiddleware };
