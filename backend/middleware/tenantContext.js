/**
 * Tenant Context Middleware
 *
 * Wraps each request in an AsyncLocalStorage context so that all downstream
 * database queries automatically pick up the authenticated user's tenantId.
 *
 * Must be mounted AFTER the authenticate middleware sets req.user.tenantId.
 * Requests without a tenantId (unauthenticated / public routes) pass through
 * without a tenant context — the pool wrapper falls back to raw queries.
 */

const { tenantContext } = require('../db');

function setTenantContext(req, res, next) {
  const tenantId = req.user && req.user.tenantId;

  if (!tenantId) {
    // No authenticated tenant — pass through without tenant scoping
    return next();
  }

  tenantContext.run({ tenantId }, () => {
    next();
  });
}

module.exports = setTenantContext;
