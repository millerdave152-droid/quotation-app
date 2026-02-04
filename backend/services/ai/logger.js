/**
 * AI Service Structured Logger
 * Provides consistent, structured logging for AI requests
 * Enables easy parsing for monitoring dashboards
 */

const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

/**
 * Format a structured log entry
 */
function formatLog(level, event, data = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'ai-assistant',
    event,
    ...data
  });
}

/**
 * Log an AI request start
 */
function logRequestStart({ conversationId, userId, queryType, model }) {
  console.log(formatLog(LOG_LEVELS.INFO, 'ai_request_start', {
    conversationId,
    userId,
    queryType,
    model
  }));
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
  console.log(formatLog(LOG_LEVELS.INFO, 'ai_request_complete', {
    conversationId,
    userId,
    queryType,
    model,
    responseTimeMs,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd,
    toolsUsed,
    toolCount: toolsUsed.length
  }));
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
  console.error(formatLog(LOG_LEVELS.ERROR, 'ai_request_error', {
    conversationId,
    userId,
    queryType,
    model,
    errorType,
    errorMessage,
    responseTimeMs
  }));
}

/**
 * Log tool execution
 */
function logToolExecution({ toolName, executionTimeMs, success, resultSize }) {
  console.log(formatLog(LOG_LEVELS.DEBUG, 'ai_tool_execution', {
    toolName,
    executionTimeMs,
    success,
    resultSize
  }));
}

/**
 * Log model routing decision
 */
function logModelRouting({ query, selectedModel, reasons, contextSize }) {
  console.log(formatLog(LOG_LEVELS.INFO, 'ai_model_routing', {
    queryPreview: query.substring(0, 50),
    selectedModel,
    reasons,
    contextSize
  }));
}

/**
 * Log feedback submission
 */
function logFeedback({ queryLogId, userId, feedback, hasNotes }) {
  console.log(formatLog(LOG_LEVELS.INFO, 'ai_feedback_submitted', {
    queryLogId,
    userId,
    feedback,
    hasNotes
  }));
}

/**
 * Log rate limit hit
 */
function logRateLimit({ userId, retryAfter }) {
  console.warn(formatLog(LOG_LEVELS.WARN, 'ai_rate_limit', {
    userId,
    retryAfter
  }));
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
