const { AsyncLocalStorage } = require('async_hooks');
const logger = require('./logger');

const asyncLocalStorage = new AsyncLocalStorage();

function runWithTenant(tenantId, fn) {
  if (!tenantId) {
    logger.warn('runWithTenant called with no tenantId — context will be missing');
  }
  return asyncLocalStorage.run({ tenantId }, fn);
}

function getCurrentTenant() {
  return asyncLocalStorage.getStore()?.tenantId ?? null;
}

module.exports = { asyncLocalStorage, runWithTenant, getCurrentTenant };
