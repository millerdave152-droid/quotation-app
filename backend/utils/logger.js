/**
 * Structured Logger (pino)
 *
 * JSON output in production, pretty-print in development.
 * Every request gets a child logger with { requestId, userId, tenantId }.
 *
 * Usage:
 *   const logger = require('../utils/logger');
 *   logger.info({ orderId: 42 }, 'Order created');
 *
 *   // In a request handler (after requestLogger middleware):
 *   req.log.info('Processing payment');
 */

const pino = require('pino');

const isDev = process.env.NODE_ENV === 'development';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } } }
    : {}),
  base: { service: 'quotation-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.ip,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

/**
 * Express middleware: creates req.log child logger with request context.
 * Also sets X-Request-ID header.
 */
function requestLogger(req, res, next) {
  // Reuse existing request ID or generate one
  const requestId = req.headers['x-request-id']
    || req.id
    || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  req.id = req.requestId = requestId;
  req._startTime = Date.now();
  res.setHeader('X-Request-ID', requestId);

  // Child logger scoped to this request
  req.log = logger.child({
    requestId,
    userId: req.user?.id || null,
    tenantId: req.user?.tenantId || null,
    method: req.method,
    path: req.originalUrl,
  });

  // Log request completion on finish
  res.on('finish', () => {
    const duration = Date.now() - req._startTime;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    req.log[level]({ statusCode: res.statusCode, durationMs: duration }, 'request completed');
  });

  next();
}

module.exports = logger;
module.exports.requestLogger = requestLogger;
