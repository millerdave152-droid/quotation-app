/**
 * Credit Hold Check Middleware
 * Blocks on-account sales if customer is over their credit limit or account is on hold
 */

const { ApiError } = require('./errorHandler');

function creditHoldCheck(accountService) {
  return async (req, res, next) => {
    try {
      const customerId = req.body.customerId || req.body.customer_id;
      const paymentMethod = req.body.paymentMethod || req.body.payment_method;

      // Only check for on-account payment method
      if (paymentMethod !== 'on_account' || !customerId) {
        return next();
      }

      const result = await accountService.checkCreditHold(customerId);

      if (!result.hasAccount) {
        throw new ApiError(400, 'Customer does not have an on-account setup');
      }

      if (!result.canCharge) {
        throw new ApiError(403, `On-account sale blocked: Account status is "${result.status}"${result.status === 'active' ? ' — credit limit exceeded' : ''}`);
      }

      // Attach credit info to request for downstream use
      req.customerCredit = result;
      next();
    } catch (err) {
      if (err instanceof ApiError) return next(err);
      next(new ApiError(500, 'Credit check failed'));
    }
  };
}

module.exports = { creditHoldCheck };
