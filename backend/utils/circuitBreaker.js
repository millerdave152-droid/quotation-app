/**
 * Circuit Breaker
 * Prevents cascading failures by stopping calls to a failing dependency
 * after a threshold of consecutive failures.
 *
 * States:
 *   closed    — normal operation, calls pass through
 *   open      — calls blocked, fallback returned immediately
 *   half-open — one test call allowed to check recovery
 */

const logger = require('./logger');

class CircuitBreaker {
  /**
   * @param {string} name - Identifier for logging
   * @param {object} options
   * @param {number} options.failureThreshold - Failures before opening (default 5)
   * @param {number} options.recoveryTimeout - ms before half-open test (default 30000)
   */
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 30000;
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  /**
   * Execute a function through the circuit breaker.
   * @param {Function} fn - The async function to execute
   * @param {Function} [fallback] - Optional fallback when circuit is open
   * @returns {Promise<*>} Result of fn or fallback
   */
  async execute(fn, fallback) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'half-open';
        logger.info({ breaker: this.name }, 'Circuit breaker half-open — testing recovery');
      } else {
        return fallback ? fallback() : null;
      }
    }

    try {
      const result = await fn();
      if (this.state === 'half-open') {
        this._reset();
      }
      return result;
    } catch (err) {
      this._recordFailure();
      throw err;
    }
  }

  /** @private */
  _recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      logger.warn({ breaker: this.name, failures: this.failureCount }, 'Circuit breaker opened');
    }
  }

  /** @private */
  _reset() {
    const prev = this.state;
    this.failureCount = 0;
    this.state = 'closed';
    if (prev !== 'closed') {
      logger.info({ breaker: this.name }, 'Circuit breaker closed — recovered');
    }
  }
}

module.exports = CircuitBreaker;
