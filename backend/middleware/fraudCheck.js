/**
 * Fraud Check Middleware
 *
 * Runs fraud assessment on transaction, refund, and void routes.
 * For transaction.create: uses FraudScoringService (composite scoring engine).
 * For void/refund/quote: uses FraudDetectionService (pattern-based assessment).
 *
 * Attaches assessment result to req.fraudAssessment for downstream handlers.
 * FAIL OPEN: Never block a sale due to scoring system failure.
 */

const { asyncHandler } = require('./errorHandler');
const logger = require('../utils/logger');

/**
 * Creates fraud check middleware for a specific assessment type
 * @param {string} assessmentType - 'transaction.create', 'transaction.void', 'refund.process', 'quote.convert'
 * @returns {Function} Express middleware
 */
function fraudCheck(assessmentType) {
  return asyncHandler(async (req, res, next) => {
    const fraudService = req.app.get('fraudService');
    if (!fraudService) {
      return next();
    }

    const userId = req.user?.id;
    const shiftId = req.body?.shiftId || req.body?.shift_id || null;

    let result;

    try {
      // ---------------------------------------------------------------
      // transaction.create: Use FraudScoringService (composite engine)
      // ---------------------------------------------------------------
      if (assessmentType === 'transaction.create') {
        const fraudScoringService = req.app.get('fraudScoringService');

        if (fraudScoringService) {
          // Build txnData from request
          const payments = Array.isArray(req.body?.payments) ? req.body.payments : [];
          const firstPayment = payments[0] || {};

          const txnData = {
            amount: parseFloat(req.body?.totalAmount || req.body?.total_amount || 0),
            cardBin: firstPayment.card_bin || firstPayment.cardBin || null,
            lastFour: firstPayment.card_last_four || firstPayment.cardLastFour || null,
            entryMethod: firstPayment.cardEntryMethod || firstPayment.card_entry_method || firstPayment.entry_method || null,
            terminalId: req.body?.terminalId || req.body?.terminal_id || null,
            employeeId: userId,
            locationId: req.body?.locationId || req.body?.location_id || null,
            customerId: req.body?.customerId || req.body?.customer_id || null,
            category: req.body?.category || null,
            ipAddress: req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress || null,
            currency: req.body?.currency || 'CAD',
            // MOTO address divergence data (when billingAddress + deliveryAddress present)
            billingAddress: req.body?.billingAddress || null,
            deliveryAddress: req.body?.deliveryAddress || null,
          };

          const scoreResult = await fraudScoringService.scoreTransaction(txnData);

          // Log audit entry
          if (fraudService.logAuditEntry) {
            await fraudService.logAuditEntry(userId, 'transaction.create', 'transaction', null, {
              shift_id: shiftId,
              risk_score: scoreResult.score,
              risk_level: scoreResult.riskLevel,
              action: scoreResult.action,
              total_amount: txnData.amount,
              item_count: req.body?.items?.length || 0,
            }, req);
          }

          // Check for manager fraud override — bypass block if approved
          const fraudOverride = req.body?.fraudOverride;
          if (fraudOverride?.logId && scoreResult.action === 'declined') {
            (req.log || logger).info({
              overrideLogId: fraudOverride.logId,
              overrideManagerId: fraudOverride.managerId,
              score: scoreResult.score,
            }, '[FraudCheck] Manager fraud override applied, bypassing block');

            req.fraudScore = {
              score: scoreResult.score,
              riskLevel: scoreResult.riskLevel,
              action: 'override_approved',
              signals: scoreResult.signals,
              triggeredRules: scoreResult.triggeredRules,
            };
            req.fraudAssessment = {
              riskScore: scoreResult.score,
              riskLevel: scoreResult.riskLevel,
              signals: scoreResult.signals,
              triggeredRules: scoreResult.triggeredRules.map(tr => ({
                rule_code: tr.source,
                rule_name: tr.source,
                severity: scoreResult.riskLevel,
                risk_points: tr.riskPoints,
                details: tr.details,
              })),
              action: 'override_approved',
              overrideLogId: fraudOverride.logId,
              overrideManagerId: fraudOverride.managerId,
              alertId: null,
            };

            return next();
          }

          // Handle action outcomes
          if (scoreResult.action === 'declined') {
            // Emit WebSocket fraud alert with enriched data
            const wsService = req.app.get('wsService') || require('../services/WebSocketService');
            if (wsService && wsService.broadcastToRoles) {
              // Look up employee name for the alert
              const pool = req.app.get('pool');
              let employeeName = null;
              if (pool && userId) {
                try {
                  const nameResult = await pool.query(
                    "SELECT first_name || ' ' || last_name AS name FROM users WHERE id = $1",
                    [userId]
                  );
                  employeeName = nameResult.rows[0]?.name || null;
                } catch (_) { /* ignore */ }
              }

              wsService.broadcastToRoles(['admin', 'manager'], 'fraud:alert', {
                type: 'transaction_declined',
                score: scoreResult.score,
                riskLevel: scoreResult.riskLevel,
                action: 'block',
                employeeId: userId,
                employeeName,
                locationId: txnData.locationId,
                terminalId: txnData.terminalId,
                amount: txnData.amount,
                entryMethod: txnData.entryMethod,
                signals: scoreResult.signals,
                triggeredRules: scoreResult.triggeredRules,
                timestamp: new Date().toISOString(),
              });
            }

            return res.status(403).json({
              success: false,
              error: 'Transaction blocked by fraud detection',
              code: 'FRAUD_BLOCKED',
              fraudAssessment: {
                riskScore: scoreResult.score,
                riskLevel: scoreResult.riskLevel,
                action: 'block',
                signals: scoreResult.signals,
                triggeredRules: scoreResult.triggeredRules.map(tr => ({
                  rule_code: tr.source,
                  rule_name: tr.source,
                  severity: scoreResult.riskLevel,
                  risk_points: tr.riskPoints,
                  details: tr.details,
                })),
              },
            });
          }

          if (scoreResult.action === 'held') {
            req.requiresManagerApproval = true;
            req.fraudHold = true;
          }

          if (scoreResult.action === 'flagged') {
            req.fraudFlagged = true;
          }

          // Attach score to request (flagged or approved)
          req.fraudScore = {
            score: scoreResult.score,
            riskLevel: scoreResult.riskLevel,
            action: scoreResult.action,
            signals: scoreResult.signals,
            triggeredRules: scoreResult.triggeredRules,
          };

          const mappedAction = scoreResult.action === 'declined' ? 'block'
                : scoreResult.action === 'held' ? 'require_approval'
                : scoreResult.action === 'flagged' ? 'alert'
                : 'allow';

          // Also set req.fraudAssessment for backward compatibility
          req.fraudAssessment = {
            riskScore: scoreResult.score,
            riskLevel: scoreResult.riskLevel,
            signals: scoreResult.signals,
            triggeredRules: scoreResult.triggeredRules.map(tr => ({
              rule_code: tr.source,
              rule_name: tr.source,
              severity: scoreResult.riskLevel,
              risk_points: tr.riskPoints,
              details: tr.details,
            })),
            action: mappedAction,
            alertId: null,
          };

          // Broadcast fraud:alert for all scored transactions with score >= 30
          // (declined broadcasts are already sent above; this covers flagged/held/approved)
          if (scoreResult.score >= 30 && scoreResult.action !== 'declined') {
            const wsService = req.app.get('wsService') || require('../services/WebSocketService');
            if (wsService && wsService.broadcastToRoles) {
              // Look up employee name (fire-and-forget, non-blocking)
              const pool = req.app.get('pool');
              let employeeName = null;
              if (pool && userId) {
                try {
                  const nameResult = await pool.query(
                    "SELECT first_name || ' ' || last_name AS name FROM users WHERE id = $1",
                    [userId]
                  );
                  employeeName = nameResult.rows[0]?.name || null;
                } catch (_) { /* ignore */ }
              }

              wsService.broadcastToRoles(['admin', 'manager'], 'fraud:alert', {
                type: mappedAction === 'require_approval' ? 'transaction_held'
                    : mappedAction === 'alert' ? 'transaction_flagged'
                    : 'transaction_scored',
                score: scoreResult.score,
                riskLevel: scoreResult.riskLevel,
                action: mappedAction,
                employeeId: userId,
                employeeName,
                locationId: txnData.locationId,
                terminalId: txnData.terminalId,
                amount: txnData.amount,
                entryMethod: txnData.entryMethod,
                signals: scoreResult.signals,
                triggeredRules: scoreResult.triggeredRules,
                timestamp: new Date().toISOString(),
              });
            }
          }

          return next();
        }

        // Fallback: use FraudDetectionService if FraudScoringService not available
        const customerId = req.body?.customerId || req.body?.customer_id || null;
        result = await fraudService.assessTransaction(req.body, userId, shiftId, customerId);

        await fraudService.logAuditEntry(userId, 'transaction.create', 'transaction', null, {
          shift_id: shiftId,
          risk_score: result.riskScore,
          total_amount: req.body?.totalAmount || req.body?.total_amount,
          item_count: req.body?.items?.length || 0,
        }, req);

      // ---------------------------------------------------------------
      // transaction.void: Use FraudDetectionService
      // ---------------------------------------------------------------
      } else if (assessmentType === 'transaction.void') {
        const txnId = parseInt(req.params.id);
        result = await fraudService.assessVoid(txnId, userId, shiftId);

        await fraudService.logAuditEntry(userId, 'transaction.void', 'transaction', txnId, {
          shift_id: shiftId,
          risk_score: result.riskScore,
          void_reason: req.body?.reason || req.body?.void_reason,
        }, req);

      // ---------------------------------------------------------------
      // refund.process: Use FraudDetectionService
      // ---------------------------------------------------------------
      } else if (assessmentType === 'refund.process') {
        const txnId = parseInt(req.params.id);
        result = await fraudService.assessRefund({
          ...req.body,
          original_transaction_id: txnId,
        }, userId, shiftId);

        await fraudService.logAuditEntry(userId, 'refund.process', 'transaction', txnId, {
          shift_id: shiftId,
          risk_score: result.riskScore,
          refund_amount: req.body?.refundAmount || req.body?.total_refund_amount,
        }, req);

      // ---------------------------------------------------------------
      // quote.convert: Use FraudDetectionService
      // ---------------------------------------------------------------
      } else if (assessmentType === 'quote.convert') {
        const quoteId = parseInt(req.params.id);
        const pool = req.app.get('pool') || fraudService.pool;
        const quoteResult = await pool.query(
          `SELECT q.id, q.total_cents, q.customer_id, q.created_by,
                  (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = q.id) as item_count
           FROM quotations q WHERE q.id = $1`,
          [quoteId]
        );
        const quoteData = quoteResult.rows[0];
        if (quoteData) {
          result = await fraudService.assessQuoteConversion(quoteData, userId, shiftId);

          await fraudService.logAuditEntry(userId, 'quote.convert', 'quotation', quoteId, {
            shift_id: shiftId,
            risk_score: result.riskScore,
            total_amount: (quoteData.total_cents || 0) / 100,
            item_count: parseInt(quoteData.item_count) || 0,
          }, req);

          if (result.riskScore > 0) {
            await pool.query(
              'UPDATE quotations SET quote_risk_score = $1 WHERE id = $2',
              [result.riskScore, quoteId]
            );
          }
        }
      }
    } catch (err) {
      // FAIL OPEN: log error, set score to 0 with error flag, continue
      (req.log || logger).error({ err, assessmentType },
        `[FraudCheck] Error during ${assessmentType} assessment — failing open`);
      req.fraudAssessment = { riskScore: 0, triggeredRules: [], action: 'allow', error: err.message };
      req.fraudScore = { score: 0, riskLevel: 'low', action: 'approved', signals: {}, triggeredRules: [], error: err.message };
      return next();
    }

    if (!result) {
      return next();
    }

    // Block the transaction if risk is too high
    // EXCEPT for quote conversions — those are flagged but never blocked
    if (result.action === 'block' && assessmentType !== 'quote.convert') {
      return res.status(403).json({
        success: false,
        error: 'Transaction declined by fraud prevention',
        code: 'FRAUD_DECLINED',
        riskScore: result.riskScore,
        alertId: result.alertId,
        fraudAssessment: {
          riskScore: result.riskScore,
          triggeredRules: result.triggeredRules.map(tr => ({
            rule_code: tr.rule.rule_code,
            rule_name: tr.rule.rule_name,
            severity: tr.rule.severity,
            details: tr.details,
          })),
          action: result.action,
          alertId: result.alertId,
        },
      });
    }

    // Hold: transaction proceeds to pending state for manager review
    if (result.action === 'require_approval' && assessmentType === 'transaction.create') {
      req.fraudHold = true;
      req.fraudAlertId = result.alertId;
    }

    // Flag: transaction completes but gets flagged status for review
    if (result.action === 'alert' && assessmentType === 'transaction.create') {
      req.fraudFlagged = true;
      req.fraudAlertId = result.alertId;
    }

    // Attach assessment to request for downstream handlers
    req.fraudAssessment = {
      riskScore: result.riskScore,
      triggeredRules: result.triggeredRules.map(tr => ({
        rule_code: tr.rule.rule_code,
        rule_name: tr.rule.rule_name,
        severity: tr.rule.severity,
        risk_points: tr.rule.risk_points,
        details: tr.details,
      })),
      action: result.action,
      alertId: result.alertId,
    };

    next();
  });
}

module.exports = { fraudCheck };
