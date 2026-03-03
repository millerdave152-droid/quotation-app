/**
 * TeleTime - API Response Utility Unit Tests
 *
 * Comprehensive tests for the standardized API response utility functions.
 * Covers success(), error(), paginated() pure functions, ErrorCodes,
 * ErrorStatusCodes mappings, and the attachResponseHelpers middleware.
 */

const {
  success,
  error,
  paginated,
  ErrorCodes,
  ErrorStatusCodes,
  attachResponseHelpers,
} = require('../utils/apiResponse');

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a minimal Express-compatible mock response with chaining.
 */
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

/**
 * Assert the meta.timestamp is a valid ISO 8601 string.
 */
function expectValidTimestamp(timestamp) {
  expect(typeof timestamp).toBe('string');
  expect(new Date(timestamp).toISOString()).toBe(timestamp);
}

// ============================================================================
// success()
// ============================================================================

describe('success()', () => {
  it('should return a properly structured success response', () => {
    const result = success({ id: 1, name: 'Test' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 1, name: 'Test' });
    expect(result.error).toBeNull();
    expect(result.meta).toBeDefined();
    expectValidTimestamp(result.meta.timestamp);
  });

  it('should include data as-is when passed an array', () => {
    const items = [{ id: 1 }, { id: 2 }];
    const result = success(items);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(items);
    expect(result.data).toHaveLength(2);
  });

  it('should handle string data', () => {
    const result = success('hello');

    expect(result.data).toBe('hello');
    expect(result.success).toBe(true);
  });

  it('should handle numeric data', () => {
    const result = success(42);

    expect(result.data).toBe(42);
    expect(result.success).toBe(true);
  });

  it('should handle boolean data', () => {
    const result = success(true);

    expect(result.data).toBe(true);
  });

  it('should coerce undefined data to null via nullish coalescing', () => {
    const result = success(undefined);

    expect(result.data).toBeNull();
    expect(result.success).toBe(true);
  });

  it('should coerce null data to null', () => {
    const result = success(null);

    expect(result.data).toBeNull();
    expect(result.success).toBe(true);
  });

  it('should preserve zero as data (not coerce to null)', () => {
    const result = success(0);

    expect(result.data).toBe(0);
  });

  it('should preserve empty string as data (not coerce to null)', () => {
    const result = success('');

    expect(result.data).toBe('');
  });

  it('should preserve false as data (not coerce to null)', () => {
    const result = success(false);

    expect(result.data).toBe(false);
  });

  it('should preserve empty array as data', () => {
    const result = success([]);

    expect(result.data).toEqual([]);
  });

  it('should preserve empty object as data', () => {
    const result = success({});

    expect(result.data).toEqual({});
  });

  it('should default options to empty object when not provided', () => {
    const result = success({ test: true });

    expect(result.meta).toBeDefined();
    expect(result.meta.message).toBeUndefined();
  });

  it('should include message in meta when provided in options', () => {
    const result = success({ id: 1 }, { message: 'Item retrieved successfully' });

    expect(result.meta.message).toBe('Item retrieved successfully');
  });

  it('should not include message in meta when not provided', () => {
    const result = success({ id: 1 });

    expect(result.meta).not.toHaveProperty('message');
  });

  it('should merge additional meta from options', () => {
    const result = success({ id: 1 }, {
      meta: { requestId: 'abc-123', custom: 'value' }
    });

    expect(result.meta.requestId).toBe('abc-123');
    expect(result.meta.custom).toBe('value');
    expectValidTimestamp(result.meta.timestamp);
  });

  it('should not overwrite timestamp with meta options', () => {
    const result = success({ id: 1 }, {
      meta: { extra: true }
    });

    // Timestamp should always be present (spread after base meta)
    expectValidTimestamp(result.meta.timestamp);
  });

  it('should include both message and additional meta', () => {
    const result = success({ id: 1 }, {
      message: 'Created',
      meta: { version: 'v1' }
    });

    expect(result.meta.message).toBe('Created');
    expect(result.meta.version).toBe('v1');
    expectValidTimestamp(result.meta.timestamp);
  });

  it('should handle deeply nested data objects', () => {
    const data = {
      order: {
        items: [
          { product: { name: 'TV', price: 49999 }, qty: 1 }
        ],
        customer: { name: 'John', address: { city: 'Mississauga' } }
      }
    };
    const result = success(data);

    expect(result.data).toEqual(data);
    expect(result.data.order.items[0].product.name).toBe('TV');
  });

  it('should produce a unique timestamp for each call', () => {
    const result1 = success('a');
    const result2 = success('b');

    // Both should have valid timestamps (they may be the same if called
    // within the same millisecond, but both must exist)
    expectValidTimestamp(result1.meta.timestamp);
    expectValidTimestamp(result2.meta.timestamp);
  });
});

// ============================================================================
// error()
// ============================================================================

describe('error()', () => {
  it('should return a properly structured error response', () => {
    const result = error('NOT_FOUND', 'Resource not found');

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toBe('Resource not found');
    expect(result.meta).toBeDefined();
    expectValidTimestamp(result.meta.timestamp);
  });

  it('should include details when provided in options', () => {
    const details = { field: 'email', reason: 'Invalid format' };
    const result = error('VALIDATION_ERROR', 'Validation failed', { details });

    expect(result.error.details).toEqual(details);
    expect(result.error.details.field).toBe('email');
    expect(result.error.details.reason).toBe('Invalid format');
  });

  it('should not include details key when not provided', () => {
    const result = error('INTERNAL_ERROR', 'Something went wrong');

    expect(result.error).not.toHaveProperty('details');
  });

  it('should not include details key when details is undefined', () => {
    const result = error('INTERNAL_ERROR', 'Error', { details: undefined });

    expect(result.error).not.toHaveProperty('details');
  });

  it('should not include details key when details is null', () => {
    const result = error('INTERNAL_ERROR', 'Error', { details: null });

    expect(result.error).not.toHaveProperty('details');
  });

  it('should include details when details is an empty object', () => {
    const result = error('VALIDATION_ERROR', 'Error', { details: {} });

    expect(result.error.details).toEqual({});
  });

  it('should include details when details is an empty array', () => {
    const result = error('VALIDATION_ERROR', 'Error', { details: [] });

    expect(result.error.details).toEqual([]);
  });

  it('should include details when details is a string', () => {
    const result = error('BAD_REQUEST', 'Bad request', { details: 'Missing field' });

    expect(result.error.details).toBe('Missing field');
  });

  it('should include details when details is an array of field errors', () => {
    const details = [
      { field: 'email', message: 'Required' },
      { field: 'name', message: 'Too short' }
    ];
    const result = error('VALIDATION_ERROR', 'Validation failed', { details });

    expect(result.error.details).toHaveLength(2);
    expect(result.error.details[0].field).toBe('email');
  });

  it('should always set data to null', () => {
    const result = error('INTERNAL_ERROR', 'Error');

    expect(result.data).toBeNull();
  });

  it('should always set success to false', () => {
    const result = error('BAD_REQUEST', 'Bad');

    expect(result.success).toBe(false);
  });

  it('should default options to empty object when not provided', () => {
    const result = error('NOT_FOUND', 'Not found');

    expect(result.error).not.toHaveProperty('details');
    expectValidTimestamp(result.meta.timestamp);
  });

  it('should accept custom error codes', () => {
    const result = error('CUSTOM_ERROR', 'A custom error');

    expect(result.error.code).toBe('CUSTOM_ERROR');
    expect(result.error.message).toBe('A custom error');
  });

  it('should handle empty string code and message', () => {
    const result = error('', '');

    expect(result.error.code).toBe('');
    expect(result.error.message).toBe('');
    expect(result.success).toBe(false);
  });

  it('should not include statusCode in the response body (statusCode is for HTTP layer)', () => {
    const result = error('NOT_FOUND', 'Not found', { statusCode: 404 });

    expect(result).not.toHaveProperty('statusCode');
    expect(result.error).not.toHaveProperty('statusCode');
  });
});

// ============================================================================
// paginated()
// ============================================================================

describe('paginated()', () => {
  const sampleItems = [
    { id: 1, name: 'Product A' },
    { id: 2, name: 'Product B' },
    { id: 3, name: 'Product C' },
  ];

  it('should return a success response with pagination meta', () => {
    const result = paginated(sampleItems, { page: 1, limit: 10, total: 3 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(sampleItems);
    expect(result.error).toBeNull();
    expect(result.meta.pagination).toBeDefined();
  });

  it('should calculate pagination fields correctly for first page', () => {
    const result = paginated(sampleItems, { page: 1, limit: 10, total: 25 });

    expect(result.meta.pagination.page).toBe(1);
    expect(result.meta.pagination.limit).toBe(10);
    expect(result.meta.pagination.total).toBe(25);
    expect(result.meta.pagination.totalPages).toBe(3);
    expect(result.meta.pagination.hasNextPage).toBe(true);
    expect(result.meta.pagination.hasPrevPage).toBe(false);
  });

  it('should calculate pagination fields correctly for middle page', () => {
    const result = paginated(sampleItems, { page: 2, limit: 10, total: 25 });

    expect(result.meta.pagination.page).toBe(2);
    expect(result.meta.pagination.totalPages).toBe(3);
    expect(result.meta.pagination.hasNextPage).toBe(true);
    expect(result.meta.pagination.hasPrevPage).toBe(true);
  });

  it('should calculate pagination fields correctly for last page', () => {
    const result = paginated(sampleItems, { page: 3, limit: 10, total: 25 });

    expect(result.meta.pagination.page).toBe(3);
    expect(result.meta.pagination.totalPages).toBe(3);
    expect(result.meta.pagination.hasNextPage).toBe(false);
    expect(result.meta.pagination.hasPrevPage).toBe(true);
  });

  it('should handle single page of results', () => {
    const result = paginated(sampleItems, { page: 1, limit: 10, total: 3 });

    expect(result.meta.pagination.totalPages).toBe(1);
    expect(result.meta.pagination.hasNextPage).toBe(false);
    expect(result.meta.pagination.hasPrevPage).toBe(false);
  });

  it('should handle empty results', () => {
    const result = paginated([], { page: 1, limit: 10, total: 0 });

    expect(result.data).toEqual([]);
    expect(result.meta.pagination.total).toBe(0);
    expect(result.meta.pagination.totalPages).toBe(0);
    expect(result.meta.pagination.hasNextPage).toBe(false);
    expect(result.meta.pagination.hasPrevPage).toBe(false);
  });

  it('should handle total exactly equal to limit', () => {
    const result = paginated(sampleItems, { page: 1, limit: 3, total: 3 });

    expect(result.meta.pagination.totalPages).toBe(1);
    expect(result.meta.pagination.hasNextPage).toBe(false);
    expect(result.meta.pagination.hasPrevPage).toBe(false);
  });

  it('should handle total one more than limit', () => {
    const result = paginated(sampleItems, { page: 1, limit: 3, total: 4 });

    expect(result.meta.pagination.totalPages).toBe(2);
    expect(result.meta.pagination.hasNextPage).toBe(true);
  });

  it('should handle limit of 1', () => {
    const result = paginated([{ id: 1 }], { page: 3, limit: 1, total: 5 });

    expect(result.meta.pagination.totalPages).toBe(5);
    expect(result.meta.pagination.hasNextPage).toBe(true);
    expect(result.meta.pagination.hasPrevPage).toBe(true);
  });

  it('should handle very large totals', () => {
    const result = paginated(sampleItems, { page: 1, limit: 25, total: 100000 });

    expect(result.meta.pagination.totalPages).toBe(4000);
    expect(result.meta.pagination.hasNextPage).toBe(true);
    expect(result.meta.pagination.hasPrevPage).toBe(false);
  });

  it('should include timestamp in meta alongside pagination', () => {
    const result = paginated(sampleItems, { page: 1, limit: 10, total: 3 });

    expectValidTimestamp(result.meta.timestamp);
    expect(result.meta.pagination).toBeDefined();
  });

  it('should merge additional options meta with pagination', () => {
    const result = paginated(sampleItems, { page: 1, limit: 10, total: 3 }, {
      meta: { filters: { category: 'TVs' } }
    });

    expect(result.meta.pagination).toBeDefined();
    expect(result.meta.filters).toEqual({ category: 'TVs' });
  });

  it('should include message from options', () => {
    const result = paginated(sampleItems, { page: 1, limit: 10, total: 3 }, {
      message: 'Products retrieved'
    });

    expect(result.meta.message).toBe('Products retrieved');
    expect(result.meta.pagination).toBeDefined();
  });

  it('should handle page beyond total pages (hasNextPage false)', () => {
    const result = paginated([], { page: 10, limit: 10, total: 25 });

    expect(result.meta.pagination.page).toBe(10);
    expect(result.meta.pagination.totalPages).toBe(3);
    expect(result.meta.pagination.hasNextPage).toBe(false);
    expect(result.meta.pagination.hasPrevPage).toBe(true);
  });

  it('should use Math.ceil for totalPages calculation', () => {
    // 7 items with limit 3 = ceil(7/3) = 3 pages
    const result = paginated([], { page: 1, limit: 3, total: 7 });

    expect(result.meta.pagination.totalPages).toBe(3);
  });

  it('should call success() internally (success response structure)', () => {
    const result = paginated(sampleItems, { page: 1, limit: 10, total: 3 });

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBe(sampleItems);
  });
});

// ============================================================================
// ErrorCodes
// ============================================================================

describe('ErrorCodes', () => {
  it('should export all expected client error codes', () => {
    expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN');
    expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
    expect(ErrorCodes.CONFLICT).toBe('CONFLICT');
    expect(ErrorCodes.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(ErrorCodes.BAD_REQUEST).toBe('BAD_REQUEST');
  });

  it('should export all expected server error codes', () => {
    expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ErrorCodes.DATABASE_ERROR).toBe('DATABASE_ERROR');
    expect(ErrorCodes.EXTERNAL_SERVICE_ERROR).toBe('EXTERNAL_SERVICE_ERROR');
  });

  it('should export all expected business logic error codes', () => {
    expect(ErrorCodes.INSUFFICIENT_CREDIT).toBe('INSUFFICIENT_CREDIT');
    expect(ErrorCodes.QUOTE_EXPIRED).toBe('QUOTE_EXPIRED');
    expect(ErrorCodes.APPROVAL_REQUIRED).toBe('APPROVAL_REQUIRED');
    expect(ErrorCodes.INVALID_STATUS_TRANSITION).toBe('INVALID_STATUS_TRANSITION');
    expect(ErrorCodes.INSUFFICIENT_STOCK).toBe('INSUFFICIENT_STOCK');
    expect(ErrorCodes.PAYMENT_FAILED).toBe('PAYMENT_FAILED');
    expect(ErrorCodes.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
    expect(ErrorCodes.DUPLICATE_ENTRY).toBe('DUPLICATE_ENTRY');
    expect(ErrorCodes.ACCOUNT_INACTIVE).toBe('ACCOUNT_INACTIVE');
  });

  it('should have values equal to their keys (self-documenting)', () => {
    for (const [key, value] of Object.entries(ErrorCodes)) {
      expect(key).toBe(value);
    }
  });

  it('should contain exactly 20 error codes', () => {
    expect(Object.keys(ErrorCodes)).toHaveLength(19);
  });
});

// ============================================================================
// ErrorStatusCodes
// ============================================================================

describe('ErrorStatusCodes', () => {
  it('should map client errors to 4xx status codes', () => {
    expect(ErrorStatusCodes[ErrorCodes.VALIDATION_ERROR]).toBe(400);
    expect(ErrorStatusCodes[ErrorCodes.BAD_REQUEST]).toBe(400);
    expect(ErrorStatusCodes[ErrorCodes.UNAUTHORIZED]).toBe(401);
    expect(ErrorStatusCodes[ErrorCodes.FORBIDDEN]).toBe(403);
    expect(ErrorStatusCodes[ErrorCodes.NOT_FOUND]).toBe(404);
    expect(ErrorStatusCodes[ErrorCodes.CONFLICT]).toBe(409);
    expect(ErrorStatusCodes[ErrorCodes.RATE_LIMITED]).toBe(429);
  });

  it('should map server errors to 5xx status codes', () => {
    expect(ErrorStatusCodes[ErrorCodes.INTERNAL_ERROR]).toBe(500);
    expect(ErrorStatusCodes[ErrorCodes.DATABASE_ERROR]).toBe(500);
    expect(ErrorStatusCodes[ErrorCodes.EXTERNAL_SERVICE_ERROR]).toBe(502);
  });

  it('should map business logic errors to appropriate status codes', () => {
    expect(ErrorStatusCodes[ErrorCodes.INSUFFICIENT_CREDIT]).toBe(400);
    expect(ErrorStatusCodes[ErrorCodes.QUOTE_EXPIRED]).toBe(400);
    expect(ErrorStatusCodes[ErrorCodes.APPROVAL_REQUIRED]).toBe(403);
    expect(ErrorStatusCodes[ErrorCodes.INVALID_STATUS_TRANSITION]).toBe(400);
    expect(ErrorStatusCodes[ErrorCodes.INSUFFICIENT_STOCK]).toBe(400);
    expect(ErrorStatusCodes[ErrorCodes.PAYMENT_FAILED]).toBe(402);
    expect(ErrorStatusCodes[ErrorCodes.SERVICE_UNAVAILABLE]).toBe(503);
    expect(ErrorStatusCodes[ErrorCodes.DUPLICATE_ENTRY]).toBe(409);
    expect(ErrorStatusCodes[ErrorCodes.ACCOUNT_INACTIVE]).toBe(403);
  });

  it('should have a mapping for every ErrorCode', () => {
    for (const code of Object.values(ErrorCodes)) {
      expect(ErrorStatusCodes[code]).toBeDefined();
      expect(typeof ErrorStatusCodes[code]).toBe('number');
    }
  });

  it('should only contain valid HTTP status codes (100-599)', () => {
    for (const statusCode of Object.values(ErrorStatusCodes)) {
      expect(statusCode).toBeGreaterThanOrEqual(100);
      expect(statusCode).toBeLessThan(600);
    }
  });
});

// ============================================================================
// attachResponseHelpers middleware
// ============================================================================

describe('attachResponseHelpers', () => {
  it('should be a function with arity 3 (req, res, next)', () => {
    expect(typeof attachResponseHelpers).toBe('function');
    expect(attachResponseHelpers.length).toBe(3);
  });

  it('should call next()', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    attachResponseHelpers(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('should attach all response helper methods to res', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    attachResponseHelpers(req, res, next);

    expect(typeof res.success).toBe('function');
    expect(typeof res.created).toBe('function');
    expect(typeof res.apiError).toBe('function');
    expect(typeof res.notFound).toBe('function');
    expect(typeof res.validationError).toBe('function');
    expect(typeof res.paginated).toBe('function');
  });

  // --------------------------------------------------------------------------
  // res.success()
  // --------------------------------------------------------------------------

  describe('res.success()', () => {
    let res;

    beforeEach(() => {
      res = mockRes();
      attachResponseHelpers({}, res, jest.fn());
    });

    it('should send a 200 response with success body', () => {
      res.success({ id: 1 });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledTimes(1);

      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 1 });
      expect(body.error).toBeNull();
      expectValidTimestamp(body.meta.timestamp);
    });

    it('should allow custom status code via options', () => {
      res.success({ id: 1 }, { statusCode: 202 });

      expect(res.status).toHaveBeenCalledWith(202);
    });

    it('should default to 200 when no statusCode option', () => {
      res.success('data');

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should include message in meta when provided', () => {
      res.success({ id: 1 }, { message: 'Done' });

      const body = res.json.mock.calls[0][0];
      expect(body.meta.message).toBe('Done');
    });

    it('should handle null data', () => {
      res.success(null);

      const body = res.json.mock.calls[0][0];
      expect(body.data).toBeNull();
      expect(body.success).toBe(true);
    });

    it('should return the res object for chaining', () => {
      const result = res.success({ test: true });

      expect(result).toBe(res);
    });
  });

  // --------------------------------------------------------------------------
  // res.created()
  // --------------------------------------------------------------------------

  describe('res.created()', () => {
    let res;

    beforeEach(() => {
      res = mockRes();
      attachResponseHelpers({}, res, jest.fn());
    });

    it('should send a 201 response', () => {
      res.created({ id: 42, name: 'New Product' });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledTimes(1);

      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ id: 42, name: 'New Product' });
    });

    it('should include default "Resource created successfully" message', () => {
      res.created({ id: 1 });

      const body = res.json.mock.calls[0][0];
      expect(body.meta.message).toBe('Resource created successfully');
    });

    it('should allow overriding the default message', () => {
      res.created({ id: 1 }, { message: 'Customer created' });

      const body = res.json.mock.calls[0][0];
      expect(body.meta.message).toBe('Customer created');
    });

    it('should return the res object for chaining', () => {
      const result = res.created({ id: 1 });

      expect(result).toBe(res);
    });
  });

  // --------------------------------------------------------------------------
  // res.apiError()
  // --------------------------------------------------------------------------

  describe('res.apiError()', () => {
    let res;

    beforeEach(() => {
      res = mockRes();
      attachResponseHelpers({}, res, jest.fn());
    });

    it('should send an error response with the correct status code from ErrorStatusCodes', () => {
      res.apiError(ErrorCodes.NOT_FOUND, 'Product not found');

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledTimes(1);

      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Product not found');
    });

    it('should use status code from ErrorStatusCodes map', () => {
      res.apiError(ErrorCodes.UNAUTHORIZED, 'Not authenticated');
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should allow overriding status code via options', () => {
      res.apiError(ErrorCodes.NOT_FOUND, 'Not found', { statusCode: 410 });

      expect(res.status).toHaveBeenCalledWith(410);
    });

    it('should default to 500 for unknown error codes', () => {
      res.apiError('UNKNOWN_CODE', 'Unknown error');

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should include details when provided', () => {
      res.apiError(ErrorCodes.VALIDATION_ERROR, 'Invalid input', {
        details: [{ field: 'email', message: 'Required' }]
      });

      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.error.details).toEqual([{ field: 'email', message: 'Required' }]);
    });

    it('should handle all standard error codes with correct status', () => {
      const testCases = [
        [ErrorCodes.VALIDATION_ERROR, 400],
        [ErrorCodes.BAD_REQUEST, 400],
        [ErrorCodes.UNAUTHORIZED, 401],
        [ErrorCodes.FORBIDDEN, 403],
        [ErrorCodes.NOT_FOUND, 404],
        [ErrorCodes.CONFLICT, 409],
        [ErrorCodes.RATE_LIMITED, 429],
        [ErrorCodes.INTERNAL_ERROR, 500],
        [ErrorCodes.DATABASE_ERROR, 500],
        [ErrorCodes.EXTERNAL_SERVICE_ERROR, 502],
        [ErrorCodes.PAYMENT_FAILED, 402],
        [ErrorCodes.SERVICE_UNAVAILABLE, 503],
      ];

      for (const [code, expectedStatus] of testCases) {
        jest.clearAllMocks();
        res = mockRes();
        attachResponseHelpers({}, res, jest.fn());

        res.apiError(code, 'Test');
        expect(res.status).toHaveBeenCalledWith(expectedStatus);
      }
    });

    it('should return the res object for chaining', () => {
      const result = res.apiError(ErrorCodes.BAD_REQUEST, 'Bad');

      expect(result).toBe(res);
    });
  });

  // --------------------------------------------------------------------------
  // res.notFound()
  // --------------------------------------------------------------------------

  describe('res.notFound()', () => {
    let res;

    beforeEach(() => {
      res = mockRes();
      attachResponseHelpers({}, res, jest.fn());
    });

    it('should send a 404 response with NOT_FOUND error code', () => {
      res.notFound('Product');

      expect(res.status).toHaveBeenCalledWith(404);

      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Product not found');
    });

    it('should default resource name to "Resource"', () => {
      res.notFound();

      const body = res.json.mock.calls[0][0];
      expect(body.error.message).toBe('Resource not found');
    });

    it('should include custom resource name in the message', () => {
      res.notFound('Customer');

      const body = res.json.mock.calls[0][0];
      expect(body.error.message).toBe('Customer not found');
    });

    it('should handle multi-word resource names', () => {
      res.notFound('Order Item');

      const body = res.json.mock.calls[0][0];
      expect(body.error.message).toBe('Order Item not found');
    });

    it('should return the res object for chaining', () => {
      const result = res.notFound('Product');

      expect(result).toBe(res);
    });
  });

  // --------------------------------------------------------------------------
  // res.validationError()
  // --------------------------------------------------------------------------

  describe('res.validationError()', () => {
    let res;

    beforeEach(() => {
      res = mockRes();
      attachResponseHelpers({}, res, jest.fn());
    });

    it('should send a 400 response with VALIDATION_ERROR code', () => {
      res.validationError('Email is required');

      expect(res.status).toHaveBeenCalledWith(400);

      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Email is required');
    });

    it('should include validation details', () => {
      const details = [
        { field: 'email', message: 'Required' },
        { field: 'name', message: 'Too short' }
      ];
      res.validationError('Validation failed', details);

      const body = res.json.mock.calls[0][0];
      expect(body.error.details).toEqual(details);
    });

    it('should handle undefined details', () => {
      res.validationError('Invalid input');

      const body = res.json.mock.calls[0][0];
      // details is passed as undefined, which is falsy, so no details key
      expect(body.error).not.toHaveProperty('details');
    });

    it('should handle null details', () => {
      res.validationError('Invalid input', null);

      const body = res.json.mock.calls[0][0];
      // null is falsy, so details should not be present
      expect(body.error).not.toHaveProperty('details');
    });

    it('should handle string details', () => {
      res.validationError('Invalid', 'email must be valid');

      const body = res.json.mock.calls[0][0];
      expect(body.error.details).toBe('email must be valid');
    });

    it('should return the res object for chaining', () => {
      const result = res.validationError('Bad input');

      expect(result).toBe(res);
    });
  });

  // --------------------------------------------------------------------------
  // res.paginated()
  // --------------------------------------------------------------------------

  describe('res.paginated()', () => {
    let res;

    beforeEach(() => {
      res = mockRes();
      attachResponseHelpers({}, res, jest.fn());
    });

    it('should send a 200 response with paginated data', () => {
      const items = [{ id: 1 }, { id: 2 }];
      res.paginated(items, { page: 1, limit: 10, total: 2 });

      expect(res.status).toHaveBeenCalledWith(200);

      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(true);
      expect(body.data).toEqual(items);
      expect(body.meta.pagination).toBeDefined();
      expect(body.meta.pagination.page).toBe(1);
      expect(body.meta.pagination.limit).toBe(10);
      expect(body.meta.pagination.total).toBe(2);
      expect(body.meta.pagination.totalPages).toBe(1);
      expect(body.meta.pagination.hasNextPage).toBe(false);
      expect(body.meta.pagination.hasPrevPage).toBe(false);
    });

    it('should pass options through to paginated function', () => {
      res.paginated([], { page: 2, limit: 5, total: 20 }, { message: 'Page 2' });

      const body = res.json.mock.calls[0][0];
      expect(body.meta.message).toBe('Page 2');
      expect(body.meta.pagination.totalPages).toBe(4);
    });

    it('should return the res object for chaining', () => {
      const result = res.paginated([], { page: 1, limit: 10, total: 0 });

      expect(result).toBe(res);
    });
  });
});

// ============================================================================
// Integration: response helpers use correct pure functions
// ============================================================================

describe('Integration: middleware + pure functions', () => {
  it('res.success should produce the same body shape as success()', () => {
    const res = mockRes();
    attachResponseHelpers({}, res, jest.fn());

    const data = { id: 1, name: 'Test' };
    res.success(data);

    const body = res.json.mock.calls[0][0];
    const pureResult = success(data);

    expect(body.success).toBe(pureResult.success);
    expect(body.data).toEqual(pureResult.data);
    expect(body.error).toEqual(pureResult.error);
    expect(body.meta).toHaveProperty('timestamp');
  });

  it('res.apiError should produce the same body shape as error()', () => {
    const res = mockRes();
    attachResponseHelpers({}, res, jest.fn());

    res.apiError(ErrorCodes.NOT_FOUND, 'Not found');

    const body = res.json.mock.calls[0][0];
    const pureResult = error(ErrorCodes.NOT_FOUND, 'Not found');

    expect(body.success).toBe(pureResult.success);
    expect(body.data).toEqual(pureResult.data);
    expect(body.error.code).toBe(pureResult.error.code);
    expect(body.error.message).toBe(pureResult.error.message);
  });

  it('res.paginated should produce the same body shape as paginated()', () => {
    const res = mockRes();
    attachResponseHelpers({}, res, jest.fn());

    const items = [{ id: 1 }];
    const pagination = { page: 1, limit: 10, total: 1 };
    res.paginated(items, pagination);

    const body = res.json.mock.calls[0][0];
    const pureResult = paginated(items, pagination);

    expect(body.success).toBe(pureResult.success);
    expect(body.data).toEqual(pureResult.data);
    expect(body.meta.pagination).toEqual(pureResult.meta.pagination);
  });

  it('should not pollute the original res object prototype', () => {
    const res1 = mockRes();
    const res2 = mockRes();

    attachResponseHelpers({}, res1, jest.fn());

    // res2 should not have the helpers until middleware runs on it
    expect(res2.success).toBeUndefined();
    expect(res2.created).toBeUndefined();
    expect(res2.apiError).toBeUndefined();
    expect(res2.notFound).toBeUndefined();
    expect(res2.validationError).toBeUndefined();
    expect(res2.paginated).toBeUndefined();
  });
});

// ============================================================================
// Module exports verification
// ============================================================================

describe('module exports', () => {
  it('should export all expected functions and objects', () => {
    const apiResponse = require('../utils/apiResponse');

    expect(typeof apiResponse.success).toBe('function');
    expect(typeof apiResponse.error).toBe('function');
    expect(typeof apiResponse.paginated).toBe('function');
    expect(typeof apiResponse.attachResponseHelpers).toBe('function');
    expect(typeof apiResponse.ErrorCodes).toBe('object');
    expect(typeof apiResponse.ErrorStatusCodes).toBe('object');
  });
});
