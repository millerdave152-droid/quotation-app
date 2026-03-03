/**
 * Unit tests for backend/middleware/errorHandler.js
 *
 * Tests:
 *   - ApiError class and all static factories
 *   - asyncHandler wrapper
 *   - notFoundHandler middleware
 *   - errorHandler global middleware
 *     - ApiError instances
 *     - PostgreSQL errors (5-digit codes)
 *     - JWT errors (JsonWebTokenError, TokenExpiredError)
 *     - ValidationError / Joi errors
 *     - MulterError
 *     - SyntaxError (malformed JSON)
 *     - Unknown / generic errors
 *     - Production vs development mode
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
}));

// We need the real apiResponse module for error formatting
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

// ── Import SUT ─────────────────────────────────────────────────────────────────

const {
  ApiError,
  asyncHandler,
  notFoundHandler,
  errorHandler,
} = require('../middleware/errorHandler');

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
  return {
    method: 'GET',
    originalUrl: '/api/test',
    path: '/api/test',
    _startTime: Date.now() - 50,
    log: {
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// ApiError class
// ============================================================================

describe('ApiError', () => {
  describe('constructor', () => {
    it('should create an error with code, message, and default statusCode', () => {
      const err = new ApiError('CUSTOM_CODE', 'Something went wrong');

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.name).toBe('ApiError');
      expect(err.code).toBe('CUSTOM_CODE');
      expect(err.message).toBe('Something went wrong');
      expect(err.statusCode).toBe(500);
      expect(err.details).toBeNull();
      expect(err.isOperational).toBe(true);
      expect(err.stack).toBeDefined();
    });

    it('should use statusCode from options', () => {
      const err = new ApiError('TEST', 'test', { statusCode: 418 });
      expect(err.statusCode).toBe(418);
    });

    it('should use statusCode from ErrorStatusCodes mapping when not in options', () => {
      const err = new ApiError('NOT_FOUND', 'not found');
      expect(err.statusCode).toBe(404);
    });

    it('should include details when provided', () => {
      const details = { field: 'email', reason: 'invalid' };
      const err = new ApiError('VALIDATION_ERROR', 'Invalid input', { details });
      expect(err.details).toEqual(details);
    });
  });

  describe('static factories', () => {
    it('badRequest should create a 400 error', () => {
      const err = ApiError.badRequest('Invalid input', { field: 'name' });
      expect(err.code).toBe('BAD_REQUEST');
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Invalid input');
      expect(err.details).toEqual({ field: 'name' });
    });

    it('notFound should create a 404 error with resource name', () => {
      const err = ApiError.notFound('Product');
      expect(err.code).toBe('NOT_FOUND');
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe('Product not found');
    });

    it('notFound should default to "Resource" when no argument given', () => {
      const err = ApiError.notFound();
      expect(err.message).toBe('Resource not found');
    });

    it('unauthorized should create a 401 error', () => {
      const err = ApiError.unauthorized('Token expired');
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('Token expired');
    });

    it('unauthorized should use default message', () => {
      const err = ApiError.unauthorized();
      expect(err.message).toBe('Authentication required');
    });

    it('forbidden should create a 403 error', () => {
      const err = ApiError.forbidden('No access');
      expect(err.code).toBe('FORBIDDEN');
      expect(err.statusCode).toBe(403);
      expect(err.message).toBe('No access');
    });

    it('forbidden should use default message', () => {
      const err = ApiError.forbidden();
      expect(err.message).toBe('Access denied');
    });

    it('validation should create a 400 validation error', () => {
      const details = [{ field: 'email', message: 'required' }];
      const err = ApiError.validation('Validation failed', details);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.statusCode).toBe(400);
      expect(err.details).toEqual(details);
    });

    it('conflict should create a 409 error', () => {
      const err = ApiError.conflict('Already exists', { id: 1 });
      expect(err.code).toBe('CONFLICT');
      expect(err.statusCode).toBe(409);
      expect(err.message).toBe('Already exists');
      expect(err.details).toEqual({ id: 1 });
    });

    it('internal should create a 500 error', () => {
      const err = ApiError.internal();
      expect(err.code).toBe('INTERNAL_ERROR');
      expect(err.statusCode).toBe(500);
      expect(err.message).toBe('An unexpected error occurred');
    });

    it('internal should accept custom message', () => {
      const err = ApiError.internal('Custom internal error');
      expect(err.message).toBe('Custom internal error');
    });

    it('database should create a 500 database error', () => {
      const err = ApiError.database();
      expect(err.code).toBe('DATABASE_ERROR');
      expect(err.statusCode).toBe(500);
      expect(err.message).toBe('Database operation failed');
    });

    it('database should accept custom message', () => {
      const err = ApiError.database('Connection pool exhausted');
      expect(err.message).toBe('Connection pool exhausted');
    });

    it('insufficientStock should include product, available, and requested details', () => {
      const err = ApiError.insufficientStock('Widget XL', 5, 10);
      expect(err.code).toBe('INSUFFICIENT_STOCK');
      expect(err.message).toContain('Widget XL');
      expect(err.message).toContain('5 available');
      expect(err.message).toContain('10 requested');
      expect(err.details).toEqual({ product: 'Widget XL', available: 5, requested: 10 });
    });

    it('paymentFailed should create a 402 error', () => {
      const err = ApiError.paymentFailed('Card declined', { gateway: 'moneris' });
      expect(err.code).toBe('PAYMENT_FAILED');
      expect(err.statusCode).toBe(402);
      expect(err.message).toBe('Card declined');
      expect(err.details).toEqual({ gateway: 'moneris' });
    });

    it('paymentFailed should use default message', () => {
      const err = ApiError.paymentFailed();
      expect(err.message).toBe('Payment processing failed');
    });

    it('duplicateEntry should create a 409 error and redact email values', () => {
      const err = ApiError.duplicateEntry('email', 'user@example.com');
      expect(err.code).toBe('DUPLICATE_ENTRY');
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('email');
      expect(err.details.value).toBe('[REDACTED]');
      expect(err.details.field).toBe('email');
    });

    it('duplicateEntry should not redact non-email values', () => {
      const err = ApiError.duplicateEntry('sku', 'ABC-123');
      expect(err.details.value).toBe('ABC-123');
    });

    it('serviceUnavailable should create a 503 error', () => {
      const err = ApiError.serviceUnavailable('Moneris');
      expect(err.code).toBe('SERVICE_UNAVAILABLE');
      expect(err.statusCode).toBe(503);
      expect(err.message).toContain('Moneris');
    });

    it('accountInactive should create a 403 error', () => {
      const err = ApiError.accountInactive();
      expect(err.code).toBe('ACCOUNT_INACTIVE');
      expect(err.statusCode).toBe(403);
      expect(err.message).toContain('deactivated');
    });
  });
});

// ============================================================================
// asyncHandler
// ============================================================================

describe('asyncHandler', () => {
  it('should call the wrapped async function', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const wrapped = asyncHandler(fn);

    const req = mockReq();
    const res = mockRes();

    await wrapped(req, res, mockNext);

    expect(fn).toHaveBeenCalledWith(req, res, mockNext);
  });

  it('should pass rejected promise errors to next()', async () => {
    const error = new Error('Async failure');
    const fn = jest.fn().mockRejectedValue(error);
    const wrapped = asyncHandler(fn);

    const req = mockReq();
    const res = mockRes();

    await wrapped(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it('should pass synchronous thrown errors to next()', async () => {
    const error = new Error('Sync failure');
    // asyncHandler wraps fn(req,res,next) in Promise.resolve().catch(next)
    // Sync throws become rejected promises caught by .catch(next)
    const fn = jest.fn(async () => { throw error; });
    const wrapped = asyncHandler(fn);

    const req = mockReq();
    const res = mockRes();

    await wrapped(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(error);
  });
});

// ============================================================================
// notFoundHandler
// ============================================================================

describe('notFoundHandler', () => {
  it('should call next with a NOT_FOUND ApiError including method and URL', () => {
    const req = mockReq({ method: 'POST', originalUrl: '/api/v1/widgets' });
    const res = mockRes();

    notFoundHandler(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    const err = mockNext.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('POST');
    expect(err.message).toContain('/api/v1/widgets');
  });
});

// ============================================================================
// errorHandler
// ============================================================================

describe('errorHandler', () => {
  const _next = jest.fn(); // unused but required for Express error handler signature

  describe('logging', () => {
    it('should log 5xx errors at error level', () => {
      const err = ApiError.internal('Server boom');
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(req.log.error).toHaveBeenCalled();
      expect(req.log.warn).not.toHaveBeenCalled();
    });

    it('should log 4xx errors at warn level', () => {
      const err = ApiError.badRequest('Bad input');
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(req.log.warn).toHaveBeenCalled();
      expect(req.log.error).not.toHaveBeenCalled();
    });

    it('should fall back to global logger when req.log is absent', () => {
      const err = ApiError.internal('No req.log');
      const req = mockReq({ log: undefined });
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(logger.error).toHaveBeenCalled();
    });

    it('should include duration in log data when req._startTime is set', () => {
      const err = ApiError.badRequest('test');
      const req = mockReq({ _startTime: Date.now() - 100 });
      const res = mockRes();

      errorHandler(err, req, res, _next);

      const logData = req.log.warn.mock.calls[0][0];
      expect(logData).toHaveProperty('durationMs');
      expect(typeof logData.durationMs).toBe('number');
    });

    it('should not include duration when req._startTime is absent', () => {
      const err = ApiError.badRequest('test');
      const req = mockReq({ _startTime: undefined });
      const res = mockRes();

      errorHandler(err, req, res, _next);

      const logData = req.log.warn.mock.calls[0][0];
      expect(logData.durationMs).toBeUndefined();
    });
  });

  describe('ApiError handling', () => {
    it('should respond with correct status code and error format for ApiError', () => {
      const err = ApiError.notFound('Order');
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(404);
      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Order not found');
    });

    it('should include details in ApiError response', () => {
      const err = ApiError.validation('Bad data', [{ field: 'email' }]);
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.error.details).toEqual([{ field: 'email' }]);
    });
  });

  describe('PostgreSQL error handling', () => {
    it('should handle 23505 (unique violation) as 409 Conflict', () => {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = '23505';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(409);
      const body = res.json.mock.calls[0][0];
      expect(body.error.code).toBe('CONFLICT');
    });

    it('should handle 23503 (foreign key violation) as 400 Bad Request', () => {
      const err = new Error('violates foreign key constraint');
      err.code = '23503';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.code).toBe('BAD_REQUEST');
    });

    it('should handle 23502 (not null violation) as 400 Validation Error', () => {
      const err = new Error('null value in column "name"');
      err.code = '23502';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.code).toBe('VALIDATION_ERROR');
    });

    it('should not handle 22P02 as PG error because code regex requires all digits', () => {
      // 22P02 contains 'P' so it doesn't match /^[0-9]{5}$/ — falls through to default handler
      const err = new Error('invalid input syntax for type integer');
      err.code = '22P02';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should handle 42P01 (undefined table) as 500 Internal Error', () => {
      const err = new Error('relation "foobar" does not exist');
      err.code = '42P01';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error.code).toBe('INTERNAL_ERROR');
    });

    it('should handle 42703 (undefined column) as 500 Internal Error', () => {
      const err = new Error('column "foo" does not exist');
      err.code = '42703';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error.code).toBe('INTERNAL_ERROR');
    });

    it('should handle unknown PG error codes as 500 Database Error', () => {
      const err = new Error('some pg error');
      err.code = '99999';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error.code).toBe('DATABASE_ERROR');
    });

    it('should log PG error details at debug level', () => {
      const err = new Error('pg error');
      err.code = '23505';
      err.detail = 'Key (email)=(test@x.com) already exists';
      err.hint = 'Check unique constraint';
      err.where = 'at line 42';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(req.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          pgCode: '23505',
          pgDetail: err.detail,
          pgHint: err.hint,
          pgWhere: err.where,
        }),
        'DB error detail'
      );
    });

    it('should include debug info in development mode', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        const err = new Error('duplicate key');
        err.code = '23505';
        err.position = '15';
        const req = mockReq();
        const res = mockRes();

        errorHandler(err, req, res, _next);

        const body = res.json.mock.calls[0][0];
        expect(body.error.message).toContain('duplicate key');
        expect(body.error.message).toContain('pos:15');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('should not include debug info in production mode', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const err = new Error('secret internal details');
        err.code = '23505';
        err.position = '15';
        const req = mockReq();
        const res = mockRes();

        errorHandler(err, req, res, _next);

        const body = res.json.mock.calls[0][0];
        expect(body.error.message).not.toContain('secret internal details');
        expect(body.error.message).toBe('Duplicate entry already exists');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });

  describe('JWT error handling', () => {
    it('should handle JsonWebTokenError as 401', () => {
      const err = new Error('jwt malformed');
      err.name = 'JsonWebTokenError';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(401);
      const body = res.json.mock.calls[0][0];
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Invalid authentication token');
    });

    it('should handle TokenExpiredError as 401', () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(401);
      const body = res.json.mock.calls[0][0];
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('expired');
    });
  });

  describe('ValidationError / Joi handling', () => {
    it('should handle errors with name "ValidationError"', () => {
      const err = new Error('Validation failed');
      err.name = 'ValidationError';
      err.errors = [{ field: 'name', message: 'required' }];
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toEqual(err.errors);
    });

    it('should handle Joi errors (isJoi flag)', () => {
      const err = new Error('Joi validation failed');
      err.isJoi = true;
      err.details = [{ message: '"name" is required', path: ['name'] }];
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toEqual(err.details);
    });
  });

  describe('MulterError handling', () => {
    it('should handle LIMIT_FILE_SIZE', () => {
      const err = new Error('File too large');
      err.name = 'MulterError';
      err.code = 'LIMIT_FILE_SIZE';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toBe('File is too large');
    });

    it('should handle LIMIT_FILE_COUNT', () => {
      const err = new Error('Too many files');
      err.name = 'MulterError';
      err.code = 'LIMIT_FILE_COUNT';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.message).toBe('Too many files');
    });

    it('should handle LIMIT_UNEXPECTED_FILE', () => {
      const err = new Error('Unexpected field');
      err.name = 'MulterError';
      err.code = 'LIMIT_UNEXPECTED_FILE';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.message).toBe('Unexpected file field');
    });

    it('should handle unknown MulterError codes with generic message', () => {
      const err = new Error('Unknown multer issue');
      err.name = 'MulterError';
      err.code = 'SOME_OTHER_CODE';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error.message).toBe('File upload error');
    });
  });

  describe('SyntaxError handling (malformed JSON)', () => {
    it('should handle SyntaxError with status 400 and body property', () => {
      const err = new SyntaxError('Unexpected token } in JSON');
      err.status = 400;
      err.body = '{"bad json}';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toBe('Invalid JSON in request body');
    });

    it('should NOT handle SyntaxError without status 400', () => {
      const err = new SyntaxError('eval failed');
      // No status or body
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      // Should fall through to default handler (500)
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should NOT handle SyntaxError without body property', () => {
      const err = new SyntaxError('not JSON');
      err.status = 400;
      // No body property
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      // Falls through to default handler
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('unknown / generic errors', () => {
    it('should respond with 500 for unknown errors in production', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const err = new Error('Secret internal details');
        const req = mockReq();
        const res = mockRes();

        errorHandler(err, req, res, _next);

        expect(res.status).toHaveBeenCalledWith(500);
        const body = res.json.mock.calls[0][0];
        expect(body.error.code).toBe('INTERNAL_ERROR');
        expect(body.error.message).toBe('An unexpected error occurred');
        expect(body.error.message).not.toContain('Secret');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('should include error message in development', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        const err = new Error('Detailed dev error info');
        const req = mockReq();
        const res = mockRes();

        errorHandler(err, req, res, _next);

        expect(res.status).toHaveBeenCalledWith(500);
        const body = res.json.mock.calls[0][0];
        expect(body.error.message).toBe('Detailed dev error info');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('should treat undefined NODE_ENV as production (no leak)', () => {
      const origEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      try {
        const err = new Error('Should not leak');
        const req = mockReq();
        const res = mockRes();

        errorHandler(err, req, res, _next);

        const body = res.json.mock.calls[0][0];
        expect(body.error.message).toBe('An unexpected error occurred');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('should never include stack traces in response body', () => {
      const err = new Error('Stack trace test');
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      const body = res.json.mock.calls[0][0];
      expect(body.error.details).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain('at ');
    });
  });

  describe('error code string matching (not PG)', () => {
    it('should not treat non-5-digit string codes as PG errors', () => {
      const err = new Error('Not a PG error');
      err.code = 'ECONNREFUSED';
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      // Should fall through to default (500), not PG handler
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should not treat numeric codes as PG errors', () => {
      const err = new Error('Not a PG error');
      err.code = 12345; // number, not string
      const req = mockReq();
      const res = mockRes();

      errorHandler(err, req, res, _next);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
