/**
 * Security Middleware
 * Configures security headers, CORS, and rate limiting
 * @module middleware/security
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

/**
 * Configure Helmet Security Headers
 * Sets various HTTP headers to protect against common vulnerabilities
 * @returns {Function} Helmet middleware
 */
const helmetConfig = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  // Cross-Origin-Embedder-Policy
  crossOriginEmbedderPolicy: false,
  // Cross-Origin-Opener-Policy
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  // Cross-Origin-Resource-Policy
  crossOriginResourcePolicy: { policy: 'same-origin' },
  // DNS Prefetch Control
  dnsPrefetchControl: { allow: false },
  // Expect-CT (deprecated but some browsers still use it)
  expectCt: { maxAge: 86400 },
  // Frameguard - prevents clickjacking
  frameguard: { action: 'deny' },
  // Hide X-Powered-By header
  hidePoweredBy: true,
  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  // IE No Open - prevents IE from executing downloads
  ieNoOpen: true,
  // X-Content-Type-Options - prevents MIME sniffing
  noSniff: true,
  // Origin Agent Cluster
  originAgentCluster: true,
  // Permitted Cross-Domain Policies
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  // Referrer Policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // X-XSS-Protection (legacy but still useful for older browsers)
  xssFilter: true,
});

/**
 * Configure CORS (Cross-Origin Resource Sharing)
 * Allows or restricts access from different origins
 * @param {Object} req - Express request object
 * @param {Function} callback - CORS callback
 */
const corsOptions = (req, callback) => {
  const isProduction = process.env.NODE_ENV === 'production';

  // Allowed origins
  const allowedOrigins = isProduction
    ? (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173', // Vite default
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
      ];

  const origin = req.headers.origin;

  // Check if origin is allowed
  const isAllowed = !isProduction || allowedOrigins.includes(origin);

  const options = {
    origin: isAllowed,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Requested-With',
      'Accept',
    ],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    credentials: true, // Allow cookies
    maxAge: 86400, // Cache preflight request for 24 hours
    optionsSuccessStatus: 200,
  };

  callback(null, options);
};

/**
 * General API Rate Limiter
 * Limits requests to prevent abuse
 * Applies to all routes unless overridden
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 10000, // Much more lenient in development
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Skip rate limiting for certain conditions
  skip: (req) => {
    // Skip for health check endpoints
    if (req.path === '/health' || req.path === '/api/health') {
      return true;
    }
    // DISABLE rate limiting completely for localhost in development
    if (process.env.NODE_ENV !== 'production' && (req.ip === '::1' || req.ip === '127.0.0.1' || req.ip === '::ffff:127.0.0.1')) {
      return true;
    }
    return false;
  },
  // Using default keyGenerator (handles IPv6 properly)
  handler: (req, res) => {
    console.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

/**
 * Strict Rate Limiter for Authentication Routes
 * More restrictive to prevent brute force attacks
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Increased from 5 to 50 for development
  message: {
    success: false,
    message: 'Too many login attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count successful requests
  handler: (req, res) => {
    console.warn(`Auth rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

/**
 * Strict Rate Limiter for Password Reset
 * Very restrictive to prevent abuse
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 requests per hour
  message: {
    success: false,
    message: 'Too many password reset attempts.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`Password reset rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many password reset attempts. Please try again after 1 hour.',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

/**
 * API Creation Rate Limiter
 * Limits creation of resources to prevent spam
 */
const createLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 create requests per minute
  message: {
    success: false,
    message: 'Too many creation requests.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please slow down.',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

/**
 * Request Logger Middleware
 * Logs incoming requests for security monitoring
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} - ` +
      `Status: ${res.statusCode} - Duration: ${duration}ms`
    );
  });

  next();
};

/**
 * Security Headers Middleware
 * Adds custom security headers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const securityHeaders = (req, res, next) => {
  // Prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  next();
};

/**
 * Sanitize Input Middleware
 * Basic sanitization to prevent common attacks
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const sanitizeInput = (req, res, next) => {
  // Remove null bytes from all inputs
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj.replace(/\0/g, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach(key => {
        obj[key] = sanitize(obj[key]);
      });
    }
    return obj;
  };

  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);

  next();
};

/**
 * Main Security Middleware Configuration
 * Combines all security middleware
 * @param {Object} app - Express application
 */
const securityMiddleware = (app) => {
  // Apply Helmet security headers
  app.use(helmetConfig);

  // Apply custom security headers
  app.use(securityHeaders);

  // Sanitize inputs
  app.use(sanitizeInput);

  // Request logging (disable in production or use proper logger)
  if (process.env.NODE_ENV !== 'production') {
    app.use(requestLogger);
  }

  // Trust proxy (needed when behind reverse proxy like Nginx)
  app.set('trust proxy', 1);

  console.log('Security middleware configured successfully');
};

module.exports = {
  securityMiddleware,
  corsOptions,
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  createLimiter,
  helmetConfig,
  requestLogger,
  securityHeaders,
  sanitizeInput,
};
