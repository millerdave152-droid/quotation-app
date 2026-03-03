/**
 * TeleTime - Logger Utility Unit Tests
 *
 * Tests for the structured pino logger and requestLogger middleware.
 * Pino is mocked to isolate unit behavior without producing real log output.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockChild = jest.fn();
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockDebug = jest.fn();

const mockChildLogger = {
  info: mockInfo,
  warn: mockWarn,
  error: mockError,
  debug: mockDebug,
  child: mockChild,
};

// The child() call on the main logger returns our mock child logger
mockChild.mockReturnValue(mockChildLogger);

const mockPinoInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: mockChild,
  level: 'info',
};

const mockPino = jest.fn().mockReturnValue(mockPinoInstance);
mockPino.stdTimeFunctions = { isoTime: jest.fn() };
mockPino.stdSerializers = {
  err: jest.fn((err) => ({ message: err.message, stack: err.stack })),
};

jest.mock('pino', () => mockPino);

// ── Import after mocks ────────────────────────────────────────────────────────

const logger = require('../utils/logger');
const { requestLogger } = require('../utils/logger');

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a minimal Express-compatible mock request.
 */
function mockReq(overrides = {}) {
  return {
    headers: {},
    method: 'GET',
    originalUrl: '/api/products',
    ip: '127.0.0.1',
    user: null,
    ...overrides,
  };
}

/**
 * Build a minimal Express-compatible mock response with EventEmitter-like
 * behavior for the 'finish' event.
 */
function mockRes(overrides = {}) {
  const listeners = {};
  return {
    statusCode: 200,
    setHeader: jest.fn(),
    on: jest.fn((event, cb) => {
      listeners[event] = cb;
    }),
    // Helper to trigger the 'finish' event in tests
    _emit: (event) => {
      if (listeners[event]) {
        listeners[event]();
      }
    },
    ...overrides,
  };
}

// ============================================================================
// Logger module exports
// ============================================================================

describe('Logger module exports', () => {
  it('should export the pino logger instance as default', () => {
    expect(logger).toBe(mockPinoInstance);
  });

  it('should export requestLogger as a named export', () => {
    expect(typeof requestLogger).toBe('function');
  });

  it('should export requestLogger with arity 3 (req, res, next)', () => {
    expect(requestLogger.length).toBe(3);
  });
});

// ============================================================================
// Pino initialization
// ============================================================================

describe('Pino initialization', () => {
  it('should call pino() with base service name', () => {
    expect(mockPino).toHaveBeenCalledTimes(1);

    const config = mockPino.mock.calls[0][0];
    expect(config.base).toEqual({ service: 'quotation-api' });
  });

  it('should configure isoTime timestamps', () => {
    const config = mockPino.mock.calls[0][0];
    expect(config.timestamp).toBe(mockPino.stdTimeFunctions.isoTime);
  });

  it('should configure custom serializers for err, req, and res', () => {
    const config = mockPino.mock.calls[0][0];

    expect(config.serializers).toBeDefined();
    expect(typeof config.serializers.err).toBe('function');
    expect(typeof config.serializers.req).toBe('function');
    expect(typeof config.serializers.res).toBe('function');
  });

  it('should configure req serializer to extract method, url, and remoteAddress', () => {
    const config = mockPino.mock.calls[0][0];
    const reqSerializer = config.serializers.req;

    const serialized = reqSerializer({
      method: 'POST',
      url: '/api/orders',
      ip: '192.168.1.1',
      headers: { 'content-type': 'application/json' },
    });

    expect(serialized).toEqual({
      method: 'POST',
      url: '/api/orders',
      remoteAddress: '192.168.1.1',
    });
  });

  it('should configure req serializer to not leak other request fields', () => {
    const config = mockPino.mock.calls[0][0];
    const reqSerializer = config.serializers.req;

    const serialized = reqSerializer({
      method: 'GET',
      url: '/api/secret',
      ip: '10.0.0.1',
      headers: { authorization: 'Bearer secret-token' },
      body: { password: 'supersecret' },
    });

    expect(serialized).not.toHaveProperty('headers');
    expect(serialized).not.toHaveProperty('body');
    expect(Object.keys(serialized)).toEqual(['method', 'url', 'remoteAddress']);
  });

  it('should configure res serializer to extract statusCode', () => {
    const config = mockPino.mock.calls[0][0];
    const resSerializer = config.serializers.res;

    const serialized = resSerializer({ statusCode: 201, body: 'secret' });

    expect(serialized).toEqual({ statusCode: 201 });
    expect(serialized).not.toHaveProperty('body');
  });

  it('should use pino.stdSerializers.err for error serialization', () => {
    const config = mockPino.mock.calls[0][0];
    expect(config.serializers.err).toBe(mockPino.stdSerializers.err);
  });
});

// ============================================================================
// requestLogger middleware
// ============================================================================

describe('requestLogger middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChild.mockReturnValue(mockChildLogger);
  });

  it('should call next()', () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    requestLogger(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('should set req.id and req.requestId with a generated ID when none exists', () => {
    const req = mockReq();
    const res = mockRes();

    requestLogger(req, res, jest.fn());

    expect(req.id).toBeDefined();
    expect(typeof req.id).toBe('string');
    expect(req.requestId).toBe(req.id);
  });

  it('should reuse x-request-id header when present', () => {
    const req = mockReq({
      headers: { 'x-request-id': 'custom-request-id-123' },
    });
    const res = mockRes();

    requestLogger(req, res, jest.fn());

    expect(req.id).toBe('custom-request-id-123');
    expect(req.requestId).toBe('custom-request-id-123');
  });

  it('should reuse req.id when already set', () => {
    const req = mockReq({ id: 'existing-id-456' });
    const res = mockRes();

    requestLogger(req, res, jest.fn());

    expect(req.id).toBe('existing-id-456');
    expect(req.requestId).toBe('existing-id-456');
  });

  it('should prefer x-request-id header over req.id', () => {
    const req = mockReq({
      headers: { 'x-request-id': 'header-id' },
      id: 'existing-id',
    });
    const res = mockRes();

    requestLogger(req, res, jest.fn());

    expect(req.id).toBe('header-id');
    expect(req.requestId).toBe('header-id');
  });

  it('should set X-Request-ID response header', () => {
    const req = mockReq();
    const res = mockRes();

    requestLogger(req, res, jest.fn());

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.id);
  });

  it('should set _startTime on the request', () => {
    const before = Date.now();
    const req = mockReq();
    const res = mockRes();

    requestLogger(req, res, jest.fn());

    const after = Date.now();
    expect(req._startTime).toBeGreaterThanOrEqual(before);
    expect(req._startTime).toBeLessThanOrEqual(after);
  });

  it('should create a child logger on req.log', () => {
    const req = mockReq();
    const res = mockRes();

    requestLogger(req, res, jest.fn());

    expect(mockChild).toHaveBeenCalledTimes(1);
    expect(req.log).toBe(mockChildLogger);
  });

  it('should create child logger with correct context fields', () => {
    const req = mockReq({
      method: 'POST',
      originalUrl: '/api/orders',
      user: { id: 42, tenantId: 'tenant-001' },
    });
    const res = mockRes();

    requestLogger(req, res, jest.fn());

    expect(mockChild).toHaveBeenCalledWith({
      requestId: req.id,
      userId: 42,
      tenantId: 'tenant-001',
      method: 'POST',
      path: '/api/orders',
    });
  });

  it('should set userId and tenantId to null when no user exists', () => {
    const req = mockReq({ user: null });
    const res = mockRes();

    requestLogger(req, res, jest.fn());

    const childArgs = mockChild.mock.calls[0][0];
    expect(childArgs.userId).toBeNull();
    expect(childArgs.tenantId).toBeNull();
  });

  it('should set userId and tenantId to null when user is undefined', () => {
    const req = mockReq();
    delete req.user;
    const res = mockRes();

    requestLogger(req, res, jest.fn());

    const childArgs = mockChild.mock.calls[0][0];
    expect(childArgs.userId).toBeNull();
    expect(childArgs.tenantId).toBeNull();
  });

  it('should register a "finish" event listener on res', () => {
    const req = mockReq();
    const res = mockRes();

    requestLogger(req, res, jest.fn());

    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  // --------------------------------------------------------------------------
  // Finish event logging
  // --------------------------------------------------------------------------

  describe('finish event logging', () => {
    it('should log at info level for 2xx responses', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 200 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      expect(mockInfo).toHaveBeenCalledTimes(1);
      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 200,
          durationMs: expect.any(Number),
        }),
        'request completed'
      );
    });

    it('should log at info level for 3xx responses', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 301 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      expect(mockInfo).toHaveBeenCalledTimes(1);
      expect(mockInfo).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 301 }),
        'request completed'
      );
    });

    it('should log at warn level for 4xx responses', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 404 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      expect(mockWarn).toHaveBeenCalledTimes(1);
      expect(mockWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          durationMs: expect.any(Number),
        }),
        'request completed'
      );
    });

    it('should log at warn level for 400 (Bad Request)', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 400 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      expect(mockWarn).toHaveBeenCalledTimes(1);
      expect(mockInfo).not.toHaveBeenCalled();
      expect(mockError).not.toHaveBeenCalled();
    });

    it('should log at warn level for 429 (Rate Limited)', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 429 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      expect(mockWarn).toHaveBeenCalledTimes(1);
    });

    it('should log at error level for 5xx responses', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 500 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      expect(mockError).toHaveBeenCalledTimes(1);
      expect(mockError).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          durationMs: expect.any(Number),
        }),
        'request completed'
      );
    });

    it('should log at error level for 502 (Bad Gateway)', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 502 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      expect(mockError).toHaveBeenCalledTimes(1);
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('should log at error level for 503 (Service Unavailable)', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 503 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      expect(mockError).toHaveBeenCalledTimes(1);
    });

    it('should include durationMs in the log entry', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 200 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      const logArgs = mockInfo.mock.calls[0][0];
      expect(typeof logArgs.durationMs).toBe('number');
      expect(logArgs.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should include statusCode in the log entry', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 201 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      const logArgs = mockInfo.mock.calls[0][0];
      expect(logArgs.statusCode).toBe(201);
    });

    it('should use the correct log message "request completed"', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 200 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      expect(mockInfo).toHaveBeenCalledWith(expect.any(Object), 'request completed');
    });

    it('should log at info level for exact boundary status 399', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 399 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      expect(mockInfo).toHaveBeenCalledTimes(1);
      expect(mockWarn).not.toHaveBeenCalled();
      expect(mockError).not.toHaveBeenCalled();
    });

    it('should log at warn level for exact boundary status 499', () => {
      const req = mockReq();
      const res = mockRes({ statusCode: 499 });

      requestLogger(req, res, jest.fn());
      res._emit('finish');

      expect(mockWarn).toHaveBeenCalledTimes(1);
      expect(mockError).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Generated request IDs
  // --------------------------------------------------------------------------

  describe('generated request IDs', () => {
    it('should generate IDs that contain a timestamp component', () => {
      const req = mockReq();
      const res = mockRes();

      requestLogger(req, res, jest.fn());

      // The format is `${Date.now()}-${random}`
      const parts = req.id.split('-');
      expect(parts.length).toBeGreaterThanOrEqual(2);

      const timestampPart = parseInt(parts[0], 10);
      expect(timestampPart).toBeGreaterThan(0);
    });

    it('should generate unique IDs across multiple calls', () => {
      const ids = new Set();

      for (let i = 0; i < 50; i++) {
        const req = mockReq();
        const res = mockRes();
        requestLogger(req, res, jest.fn());
        ids.add(req.id);
      }

      // While theoretically IDs could collide within the same millisecond,
      // with the random component, 50 unique IDs is highly expected
      expect(ids.size).toBe(50);
    });
  });
});
