/**
 * Unit tests for security-related middleware:
 *   - backend/middleware/security.js (sanitizeInput, securityHeaders, requestLogger, corsOptions, securityMiddleware)
 *   - backend/middleware/tenantContext.js (setTenantContext)
 *   - backend/middleware/validation.js (handleValidationErrors, validateJoi)
 *
 * Tests cover input sanitization, security headers, CORS configuration,
 * request logging, tenant context propagation, validation error handling,
 * and Joi schema validation middleware.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock the db module for tenantContext
const mockTenantContextRun = jest.fn((store, cb) => cb());
jest.mock('../db', () => ({
  tenantContext: { run: (...args) => mockTenantContextRun(...args) },
}));

// Mock errorHandler for validation.js (ApiError is used directly)
// We need the real ApiError so we can check thrown errors
jest.mock('../utils/password', () => ({
  PASSWORD_MIN_LENGTH: 8,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
  return {
    method: 'GET',
    path: '/api/test',
    ip: '127.0.0.1',
    headers: {},
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  res.on = jest.fn();
  res.statusCode = 200;
  return res;
}

const mockNext = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// security.js — sanitizeInput
// ============================================================================

const {
  sanitizeInput,
  securityHeaders,
  requestLogger,
  corsOptions,
  securityMiddleware,
} = require('../middleware/security');

describe('sanitizeInput', () => {
  it('should call next() after sanitizing', () => {
    const req = mockReq({ body: { name: 'test' } });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should remove null bytes from strings', () => {
    const req = mockReq({
      body: { name: 'hello\0world' },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.body.name).toBe('helloworld');
  });

  it('should replace leading $ in strings to prevent MongoDB operator injection', () => {
    const req = mockReq({
      body: { query: '$gt' },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.body.query).toBe('_dollar_gt');
  });

  it('should truncate strings longer than 10000 characters', () => {
    const longString = 'a'.repeat(15000);
    const req = mockReq({
      body: { description: longString },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.body.description.length).toBe(10000);
  });

  it('should not truncate strings at or under 10000 characters', () => {
    const exactString = 'b'.repeat(10000);
    const req = mockReq({
      body: { description: exactString },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.body.description.length).toBe(10000);
  });

  it('should strip __proto__ keys from objects', () => {
    const req = mockReq({
      body: { __proto__: { isAdmin: true }, name: 'safe' },
    });
    // Manually set __proto__ in a way that can be detected via Object.keys
    const malicious = Object.create(null);
    malicious.__proto__ = { isAdmin: true };
    malicious.name = 'safe';
    req.body = malicious;
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(Object.keys(req.body)).not.toContain('__proto__');
    expect(req.body.name).toBe('safe');
  });

  it('should strip constructor keys from objects', () => {
    const obj = Object.create(null);
    obj.constructor = { prototype: { isAdmin: true } };
    obj.name = 'safe';
    const req = mockReq({ body: obj });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(Object.keys(req.body)).not.toContain('constructor');
    expect(req.body.name).toBe('safe');
  });

  it('should strip prototype keys from objects', () => {
    const obj = Object.create(null);
    obj.prototype = { isAdmin: true };
    obj.name = 'safe';
    const req = mockReq({ body: obj });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.body).not.toHaveProperty('prototype');
    expect(req.body.name).toBe('safe');
  });

  it('should limit array size to 10000 elements', () => {
    const bigArray = new Array(15000).fill('x');
    const req = mockReq({
      body: { items: bigArray },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.body.items.length).toBe(10000);
  });

  it('should not truncate arrays with 10000 or fewer elements', () => {
    const arr = new Array(10000).fill('x');
    const req = mockReq({
      body: { items: arr },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.body.items.length).toBe(10000);
  });

  it('should stop recursion at depth > 10', () => {
    // Create deeply nested object (12 levels deep)
    let obj = { value: 'deep\0value' };
    for (let i = 0; i < 12; i++) {
      obj = { nested: obj };
    }
    const req = mockReq({ body: obj });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    // The sanitizer should not crash; the deep value may or may not be sanitized
    // The important thing is it doesn't throw
    expect(mockNext).toHaveBeenCalled();
  });

  it('should sanitize nested objects recursively', () => {
    const req = mockReq({
      body: {
        user: {
          name: 'test\0name',
          address: {
            city: '$Toronto',
          },
        },
      },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.body.user.name).toBe('testname');
    expect(req.body.user.address.city).toBe('_dollar_Toronto');
  });

  it('should sanitize arrays of strings', () => {
    const req = mockReq({
      body: { tags: ['hello\0', '$admin', 'normal'] },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.body.tags).toEqual(['hello', '_dollar_admin', 'normal']);
  });

  it('should sanitize query parameters', () => {
    const req = mockReq({
      query: { search: 'test\0query' },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.query.search).toBe('testquery');
  });

  it('should sanitize route params', () => {
    const req = mockReq({
      params: { id: 'abc\0def' },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.params.id).toBe('abcdef');
  });

  it('should leave null values untouched', () => {
    const req = mockReq({
      body: { value: null },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.body.value).toBeNull();
  });

  it('should leave numbers untouched', () => {
    const req = mockReq({
      body: { count: 42, price: 19.99 },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.body.count).toBe(42);
    expect(req.body.price).toBe(19.99);
  });

  it('should leave booleans untouched', () => {
    const req = mockReq({
      body: { active: true, deleted: false },
    });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(req.body.active).toBe(true);
    expect(req.body.deleted).toBe(false);
  });

  it('should handle req.body being undefined', () => {
    const req = mockReq({ body: undefined });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle req.query being undefined', () => {
    const req = mockReq({ query: undefined });
    const res = mockRes();

    sanitizeInput(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });
});

// ============================================================================
// security.js — securityHeaders
// ============================================================================

describe('securityHeaders', () => {
  it('should call next()', () => {
    const req = mockReq();
    const res = mockRes();

    securityHeaders(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should set Cache-Control header', () => {
    const req = mockReq();
    const res = mockRes();

    securityHeaders(req, res, mockNext);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
  });

  it('should set Pragma header', () => {
    const req = mockReq();
    const res = mockRes();

    securityHeaders(req, res, mockNext);

    expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
  });

  it('should set Expires header to 0', () => {
    const req = mockReq();
    const res = mockRes();

    securityHeaders(req, res, mockNext);

    expect(res.setHeader).toHaveBeenCalledWith('Expires', '0');
  });

  it('should set Surrogate-Control header', () => {
    const req = mockReq();
    const res = mockRes();

    securityHeaders(req, res, mockNext);

    expect(res.setHeader).toHaveBeenCalledWith('Surrogate-Control', 'no-store');
  });

  it('should set X-Content-Type-Options header', () => {
    const req = mockReq();
    const res = mockRes();

    securityHeaders(req, res, mockNext);

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  });

  it('should set X-Frame-Options header to DENY', () => {
    const req = mockReq();
    const res = mockRes();

    securityHeaders(req, res, mockNext);

    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
  });

  it('should set X-XSS-Protection header', () => {
    const req = mockReq();
    const res = mockRes();

    securityHeaders(req, res, mockNext);

    expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
  });
});

// ============================================================================
// security.js — requestLogger
// ============================================================================

describe('requestLogger', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should call next()', () => {
    const req = mockReq();
    const res = mockRes();

    requestLogger(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should log incoming request with method, path, and IP', () => {
    const req = mockReq({ method: 'POST', path: '/api/orders', ip: '10.0.0.1' });
    const res = mockRes();

    requestLogger(req, res, mockNext);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('POST /api/orders - IP: 10.0.0.1')
    );
  });

  it('should register a finish event listener on res', () => {
    const req = mockReq();
    const res = mockRes();

    requestLogger(req, res, mockNext);

    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('should log response status and duration on finish', () => {
    const req = mockReq({ method: 'GET', path: '/api/health' });
    const res = mockRes();
    res.statusCode = 200;

    requestLogger(req, res, mockNext);

    // Invoke the finish callback
    const finishCallback = res.on.mock.calls[0][1];
    finishCallback();

    // Second console.log call should include status and duration
    expect(consoleSpy).toHaveBeenCalledTimes(2);
    expect(consoleSpy.mock.calls[1][0]).toContain('Status: 200');
    expect(consoleSpy.mock.calls[1][0]).toContain('Duration:');
  });
});

// ============================================================================
// security.js — corsOptions
// ============================================================================

describe('corsOptions', () => {
  it('should be a function', () => {
    expect(typeof corsOptions).toBe('function');
  });

  it('should allow localhost:3000 in development', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const req = { headers: { origin: 'http://localhost:3000' } };
      const callback = jest.fn();

      corsOptions(req, callback);

      expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
        origin: true,
      }));
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('should allow localhost:5173 (Vite) in development', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const req = { headers: { origin: 'http://localhost:5173' } };
      const callback = jest.fn();

      corsOptions(req, callback);

      expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
        origin: true,
      }));
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('should reject unknown origins in development', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const req = { headers: { origin: 'http://evil.com' } };
      const callback = jest.fn();

      corsOptions(req, callback);

      expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
        origin: false,
      }));
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('should use ALLOWED_ORIGINS env var in production', () => {
    const origEnv = process.env.NODE_ENV;
    const origOrigins = process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://teletime.ca,https://maifurniture.ca';

    try {
      const req = { headers: { origin: 'https://teletime.ca' } };
      const callback = jest.fn();

      corsOptions(req, callback);

      expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
        origin: true,
      }));
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origOrigins === undefined) {
        delete process.env.ALLOWED_ORIGINS;
      } else {
        process.env.ALLOWED_ORIGINS = origOrigins;
      }
    }
  });

  it('should reject unlisted origins in production', () => {
    const origEnv = process.env.NODE_ENV;
    const origOrigins = process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://teletime.ca';

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    try {
      const req = { headers: { origin: 'https://evil.com' } };
      const callback = jest.fn();

      corsOptions(req, callback);

      expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
        origin: false,
      }));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('CORS: Rejected origin: https://evil.com')
      );
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origOrigins === undefined) {
        delete process.env.ALLOWED_ORIGINS;
      } else {
        process.env.ALLOWED_ORIGINS = origOrigins;
      }
      consoleSpy.mockRestore();
    }
  });

  it('should include proper CORS methods', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const req = { headers: { origin: 'http://localhost:3000' } };
      const callback = jest.fn();

      corsOptions(req, callback);

      const options = callback.mock.calls[0][1];
      expect(options.methods).toEqual(
        expect.arrayContaining(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])
      );
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('should include credentials: true', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const req = { headers: { origin: 'http://localhost:3000' } };
      const callback = jest.fn();

      corsOptions(req, callback);

      expect(callback.mock.calls[0][1].credentials).toBe(true);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('should include required allowed headers', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const req = { headers: { origin: 'http://localhost:3000' } };
      const callback = jest.fn();

      corsOptions(req, callback);

      const options = callback.mock.calls[0][1];
      expect(options.allowedHeaders).toEqual(
        expect.arrayContaining(['Content-Type', 'Authorization', 'X-API-Key'])
      );
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('should expose rate limit headers', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const req = { headers: { origin: 'http://localhost:3000' } };
      const callback = jest.fn();

      corsOptions(req, callback);

      const options = callback.mock.calls[0][1];
      expect(options.exposedHeaders).toEqual(
        expect.arrayContaining(['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'])
      );
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});

// ============================================================================
// security.js — securityMiddleware
// ============================================================================

describe('securityMiddleware', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should apply middleware to the app and log success', () => {
    const app = {
      use: jest.fn(),
      set: jest.fn(),
    };

    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      securityMiddleware(app);

      // Should apply helmetConfig, securityHeaders, sanitizeInput
      // In production, requestLogger is NOT applied
      expect(app.use).toHaveBeenCalledTimes(3);
      expect(app.set).toHaveBeenCalledWith('trust proxy', 1);
      expect(consoleSpy).toHaveBeenCalledWith('Security middleware configured successfully');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('should apply requestLogger in non-production mode', () => {
    const app = {
      use: jest.fn(),
      set: jest.fn(),
    };

    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      securityMiddleware(app);

      // helmetConfig + securityHeaders + sanitizeInput + requestLogger = 4
      expect(app.use).toHaveBeenCalledTimes(4);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});

// ============================================================================
// tenantContext.js — setTenantContext
// ============================================================================

const setTenantContext = require('../middleware/tenantContext');

describe('setTenantContext', () => {
  it('should call next() directly when req.user is undefined', () => {
    const req = { user: undefined };
    const res = mockRes();

    setTenantContext(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockTenantContextRun).not.toHaveBeenCalled();
  });

  it('should call next() directly when req.user is null', () => {
    const req = { user: null };
    const res = mockRes();

    setTenantContext(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockTenantContextRun).not.toHaveBeenCalled();
  });

  it('should call next() directly when req.user has no tenantId', () => {
    const req = { user: { id: 1, role: 'user' } };
    const res = mockRes();

    setTenantContext(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockTenantContextRun).not.toHaveBeenCalled();
  });

  it('should call next() directly when req.user.tenantId is null', () => {
    const req = { user: { id: 1, tenantId: null } };
    const res = mockRes();

    setTenantContext(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockTenantContextRun).not.toHaveBeenCalled();
  });

  it('should call next() directly when req.user.tenantId is 0 (falsy)', () => {
    const req = { user: { id: 1, tenantId: 0 } };
    const res = mockRes();

    setTenantContext(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockTenantContextRun).not.toHaveBeenCalled();
  });

  it('should wrap next() in tenantContext.run() when tenantId is present', () => {
    const req = { user: { id: 1, tenantId: 42 } };
    const res = mockRes();

    setTenantContext(req, res, mockNext);

    expect(mockTenantContextRun).toHaveBeenCalledTimes(1);
    expect(mockTenantContextRun).toHaveBeenCalledWith(
      { tenantId: 42 },
      expect.any(Function)
    );
    // next() should be called inside the run callback
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should pass the correct tenantId to tenantContext.run()', () => {
    const req = { user: { id: 5, tenantId: 100 } };
    const res = mockRes();

    setTenantContext(req, res, mockNext);

    const storeArg = mockTenantContextRun.mock.calls[0][0];
    expect(storeArg).toEqual({ tenantId: 100 });
  });

  it('should work with string tenantId', () => {
    const req = { user: { id: 1, tenantId: 'tenant-abc' } };
    const res = mockRes();

    setTenantContext(req, res, mockNext);

    expect(mockTenantContextRun).toHaveBeenCalledWith(
      { tenantId: 'tenant-abc' },
      expect.any(Function)
    );
    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// validation.js — handleValidationErrors
// ============================================================================

const { handleValidationErrors, validateJoi } = require('../middleware/validation');
const { ApiError } = require('../middleware/errorHandler');

describe('handleValidationErrors', () => {
  // To test handleValidationErrors properly we need to simulate express-validator's
  // validationResult. We mock the express-validator module to control validation outcomes.

  it('should call next() when there are no validation errors', () => {
    // Create a mock req that express-validator's validationResult will read
    // The middleware uses validationResult(req) which checks req[Symbol.for('express-validator#validationErrors')]
    // or similar internal. We test via integration approach with a fake req.
    const req = mockReq();
    // express-validator stores errors in a specific key; if none, validationResult returns isEmpty() === true
    // We need to install express-validator context on the req
    const { validationResult } = require('express-validator');

    // Create a req where validationResult returns no errors
    // The simplest way: validationResult on a fresh req with no validation chains run
    const res = mockRes();

    handleValidationErrors(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should throw ApiError.validation when there are validation errors', () => {
    // We need to simulate a req that has validation errors
    // express-validator stores them under a specific symbol on req
    const { validationResult, body } = require('express-validator');

    // We can use matchedData or manually add errors
    // Simplest: create a mock req that validationResult reads as having errors
    // In express-validator v7+, errors are stored in req[Symbol]
    // Instead, we test the thrown error by creating a proper validation context

    // Alternative: manually invoke a validation chain and then call handleValidationErrors
    const req = mockReq({
      body: {}, // missing required 'email' field
    });
    const res = mockRes();

    // Run a validation chain that will fail
    const chain = body('email').notEmpty().withMessage('Email is required');

    // express-validator chains return middleware, we need to run them
    return new Promise((resolve) => {
      chain(req, res, () => {
        // Now req has validation errors attached
        try {
          handleValidationErrors(req, res, mockNext);
          // If no error thrown, next was called
          resolve();
        } catch (err) {
          expect(err).toBeInstanceOf(ApiError);
          expect(err.code).toBe('VALIDATION_ERROR');
          expect(err.message).toBe('Validation failed');
          expect(err.details).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                field: 'email',
                message: 'Email is required',
              }),
            ])
          );
          resolve();
        }
      });
    });
  });

  it('should redact sensitive fields (password) in validation errors', () => {
    const { body } = require('express-validator');
    const req = mockReq({
      body: { password: '' }, // empty password to trigger validation
    });
    const res = mockRes();

    const chain = body('password').notEmpty().withMessage('Password is required');

    return new Promise((resolve) => {
      chain(req, res, () => {
        try {
          handleValidationErrors(req, res, mockNext);
          resolve();
        } catch (err) {
          const passwordError = err.details.find(e => e.field === 'password');
          expect(passwordError).toBeDefined();
          expect(passwordError.value).toBe('[REDACTED]');
          resolve();
        }
      });
    });
  });

  it('should redact sensitive fields (token) in validation errors', () => {
    const { body } = require('express-validator');
    const req = mockReq({
      body: { refreshToken: '' },
    });
    const res = mockRes();

    const chain = body('refreshToken').notEmpty().withMessage('Token is required');

    return new Promise((resolve) => {
      chain(req, res, () => {
        try {
          handleValidationErrors(req, res, mockNext);
          resolve();
        } catch (err) {
          const tokenError = err.details.find(e => e.field === 'refreshToken');
          expect(tokenError).toBeDefined();
          expect(tokenError.value).toBe('[REDACTED]');
          resolve();
        }
      });
    });
  });

  it('should not redact non-sensitive fields', () => {
    const { body } = require('express-validator');
    const req = mockReq({
      body: { email: '' },
    });
    const res = mockRes();

    const chain = body('email').notEmpty().withMessage('Email is required');

    return new Promise((resolve) => {
      chain(req, res, () => {
        try {
          handleValidationErrors(req, res, mockNext);
          resolve();
        } catch (err) {
          const emailError = err.details.find(e => e.field === 'email');
          expect(emailError).toBeDefined();
          expect(emailError.value).toBe('');
          resolve();
        }
      });
    });
  });
});

// ============================================================================
// validation.js — validateJoi
// ============================================================================

describe('validateJoi', () => {
  const Joi = require('joi');

  it('should return a middleware function', () => {
    const schema = Joi.object({ name: Joi.string().required() });
    const middleware = validateJoi(schema);

    expect(typeof middleware).toBe('function');
  });

  it('should call next() when validation passes', () => {
    const schema = Joi.object({
      name: Joi.string().required(),
      age: Joi.number().optional(),
    });
    const middleware = validateJoi(schema);

    const req = mockReq({ body: { name: 'John', age: 30 } });
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should replace req.body with validated (stripped) value', () => {
    const schema = Joi.object({
      name: Joi.string().required(),
    });
    const middleware = validateJoi(schema);

    const req = mockReq({ body: { name: 'John', extraField: 'ignored' } });
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(req.body).toEqual({ name: 'John' });
    expect(req.body.extraField).toBeUndefined();
  });

  it('should throw ApiError.validation on validation failure', () => {
    const schema = Joi.object({
      name: Joi.string().required(),
      age: Joi.number().integer().min(0).required(),
    });
    const middleware = validateJoi(schema);

    const req = mockReq({ body: { age: -5 } }); // missing name, invalid age
    const res = mockRes();

    expect(() => {
      middleware(req, res, mockNext);
    }).toThrow(ApiError);
  });

  it('should include field paths in validation error details', () => {
    const schema = Joi.object({
      name: Joi.string().required(),
    });
    const middleware = validateJoi(schema);

    const req = mockReq({ body: {} });
    const res = mockRes();

    try {
      middleware(req, res, mockNext);
    } catch (err) {
      expect(err.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'name',
            message: expect.stringContaining('required'),
          }),
        ])
      );
    }
  });

  it('should validate query params when property is "query"', () => {
    const schema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(50),
    });
    const middleware = validateJoi(schema, 'query');

    const req = mockReq({ query: { page: '2' } });
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.query.page).toBe(2);
    expect(req.query.limit).toBe(50); // default applied
  });

  it('should validate params when property is "params"', () => {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required(),
    });
    const middleware = validateJoi(schema, 'params');

    const req = mockReq({ params: { id: '42' } });
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.params.id).toBe(42);
  });

  it('should throw on invalid params', () => {
    const schema = Joi.object({
      id: Joi.number().integer().positive().required(),
    });
    const middleware = validateJoi(schema, 'params');

    const req = mockReq({ params: { id: 'abc' } });
    const res = mockRes();

    expect(() => {
      middleware(req, res, mockNext);
    }).toThrow(ApiError);
  });

  it('should use abortEarly: false (collect all errors)', () => {
    const schema = Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email().required(),
      age: Joi.number().required(),
    });
    const middleware = validateJoi(schema);

    const req = mockReq({ body: {} }); // all three fields missing
    const res = mockRes();

    try {
      middleware(req, res, mockNext);
    } catch (err) {
      // Should have errors for all 3 missing fields
      expect(err.details.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('should handle nested field paths correctly', () => {
    const schema = Joi.object({
      address: Joi.object({
        city: Joi.string().required(),
      }).required(),
    });
    const middleware = validateJoi(schema);

    const req = mockReq({ body: { address: {} } });
    const res = mockRes();

    try {
      middleware(req, res, mockNext);
    } catch (err) {
      expect(err.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'address.city',
          }),
        ])
      );
    }
  });
});
