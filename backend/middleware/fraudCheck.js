/**
 * Fraud Check Middleware
 * Runs fraud assessment on transaction, refund, and void routes.
 * Attaches assessment result to req.fraudAssessment for downstream handlers.
 */

const { asyncHandler } = require('./errorHandler');

/**
 * Creates fraud check middleware for a specific assessment type
 * @param {string} assessmentType - 'transaction.create', 'transaction.void', 'refund.process'
 * @returns {Function} Express middleware
 */
function fraudCheck(assessmentType) {
  return asyncHandler(async (req, res, next) => {
    const fraudService = req.app.get('fraudService');
    if (!fraudService) {
      // Fraud service not configured — skip silently
      return next();
    }

    const userId = req.user?.id;
    const shiftId = req.body?.shiftId || req.body?.shift_id || null;

    let result;

    try {
      if (assessmentType === 'transaction.create') {
        const customerId = req.body?.customerId || req.body?.customer_id || null;
        result = await fraudService.assessTransaction(req.body, userId, shiftId, customerId);

        // Log audit entry
        await fraudService.logAuditEntry(userId, 'transaction.create', 'transaction', null, {
          shift_id: shiftId,
          risk_score: result.riskScore,
          total_amount: req.body?.totalAmount || req.body?.total_amount,
          item_count: req.body?.items?.length || 0
        }, req);

      } else if (assessmentType === 'transaction.void') {
        const txnId = parseInt(req.params.id);
        result = await fraudService.assessVoid(txnId, userId, shiftId);

        await fraudService.logAuditEntry(userId, 'transaction.void', 'transaction', txnId, {
          shift_id: shiftId,
          risk_score: result.riskScore,
          void_reason: req.body?.reason || req.body?.void_reason
        }, req);

      } else if (assessmentType === 'refund.process') {
        const txnId = parseInt(req.params.id);
        result = await fraudService.assessRefund({
          ...req.body,
          original_transaction_id: txnId
        }, userId, shiftId);

        await fraudService.logAuditEntry(userId, 'refund.process', 'transaction', txnId, {
          shift_id: shiftId,
          risk_score: result.riskScore,
          refund_amount: req.body?.refundAmount || req.body?.total_refund_amount
        }, req);
      }
    } catch (err) {
      // Log error but don't block the transaction for fraud check failures
      console.error(`[FraudCheck] Error during ${assessmentType} assessment:`, err.message);
      req.fraudAssessment = { riskScore: 0, triggeredRules: [], action: 'allow', error: err.message };
      return next();
    }

    if (!result) {
      return next();
    }

    // Block the transaction if risk is too high
    if (result.action === 'block') {
      return res.status(403).json({
        success: false,
        error: 'Transaction blocked by fraud detection',
        code: 'FRAUD_BLOCKED',
        fraudAssessment: {
          riskScore: result.riskScore,
          triggeredRules: result.triggeredRules.map(tr => ({
            rule_code: tr.rule.rule_code,
            rule_name: tr.rule.rule_name,
            severity: tr.rule.severity,
            details: tr.details
          })),
          action: result.action,
          alertId: result.alertId
        }
      });
    }

    // Attach assessment to request for downstream handlers
    req.fraudAssessment = {
      riskScore: result.riskScore,
      triggeredRules: result.triggeredRules.map(tr => ({
        rule_code: tr.rule.rule_code,
        rule_name: tr.rule.rule_name,
        severity: tr.rule.severity,
        risk_points: tr.rule.risk_points,
        details: tr.details
      })),
      action: result.action,
      alertId: result.alertId
    };

    next();
  });
}

module.exports = { fraudCheck };
