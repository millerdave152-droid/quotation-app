/**
 * AI Service Structured Logger
 * Provides consistent, structured logging for AI requests
 * Delegates to the shared pino logger.
 */

const parentLogger = require('../../utils/logger');
const log = parentLogger.child({ service: 'ai-assistant' });

const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

/**
 * Log an AI request start
 */
function logRequestStart({ conversationId, userId, queryType, model }) {
  log.info({ event: 'ai_request_start', conversationId, userId, queryType, model }, 'AI request started');
}

/**
 * Log an AI request completion
 */
function logRequestComplete({
  conversationId,
  userId,
  queryType,
  model,
  responseTimeMs,
  inputTokens,
  outputTokens,
  costUsd,
  toolsUsed = []
}) {
  log.info({ event: 'ai_request_complete', conversationId, userId, queryType, model, responseTimeMs, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costUsd, toolsUsed, toolCount: toolsUsed.length }, 'AI request completed');
}

/**
 * Log an AI request error
 */
function logRequestError({
  conversationId,
  userId,
  queryType,
  model,
  errorType,
  errorMessage,
  responseTimeMs
}) {
  log.error({ event: 'ai_request_error', conversationId, userId, queryType, model, errorType, errorMessage, responseTimeMs }, 'AI request error');
}

/**
 * Log tool execution
 */
function logToolExecution({ toolName, executionTimeMs, success, resultSize }) {
  log.debug({ event: 'ai_tool_execution', toolName, executionTimeMs, success, resultSize }, 'AI tool executed');
}

/**
 * Log model routing decision
 */
function logModelRouting({ query, selectedModel, reasons, contextSize }) {
  log.info({ event: 'ai_model_routing', queryPreview: query.substring(0, 50), selectedModel, reasons, contextSize }, 'AI model routed');
}

/**
 * Log feedback submission
 */
function logFeedback({ queryLogId, userId, feedback, hasNotes }) {
  log.info({ event: 'ai_feedback_submitted', queryLogId, userId, feedback, hasNotes }, 'AI feedback submitted');
}

/**
 * Log rate limit hit
 */
function logRateLimit({ userId, retryAfter }) {
  log.warn({ event: 'ai_rate_limit', userId, retryAfter }, 'AI rate limit hit');
}

/**
 * Create metrics summary for a time period
 */
function createMetricsSummary(metrics) {
  return {
    totalRequests: metrics.total,
    successRate: metrics.total > 0 ? ((metrics.total - metrics.errors) / metrics.total * 100).toFixed(2) : 0,
    avgLatencyMs: metrics.avgLatency,
    p95LatencyMs: metrics.p95Latency,
    totalCostUsd: metrics.totalCost,
    avgCostPerQuery: metrics.total > 0 ? (metrics.totalCost / metrics.total).toFixed(6) : 0,
    modelDistribution: metrics.modelCounts,
    feedbackRate: metrics.total > 0 ? (metrics.feedbackCount / metrics.total * 100).toFixed(2) : 0
  };
}

module.exports = {
  LOG_LEVELS,
  logRequestStart,
  logRequestComplete,
  logRequestError,
  logToolExecution,
  logModelRouting,
  logFeedback,
  logRateLimit,
  createMetricsSummary
};
