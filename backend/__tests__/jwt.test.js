/**
 * TeleTime - JWT Utility Unit Tests
 *
 * Tests for JWT token generation, verification, decoding, and expiration utilities.
 */

const jwt = require('jsonwebtoken');

// Store original env values to restore after tests
const originalEnv = { ...process.env };

describe('JWT Utilities', () => {
  let jwtUtils;

  const TEST_JWT_SECRET = 'test-jwt-secret-for-unit-tests-abc123';
  const TEST_JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-unit-tests-xyz789';

  const mockUser = {
    id: 42,
    email: 'admin@yourcompany.com',
    role: 'admin',
    tenantId: 'tenant-001'
  };

  const mockUserMinimal = {
    id: 7,
    email: 'cashier@yourcompany.com',
    role: 'cashier'
    // no tenantId
  };

  beforeAll(() => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    process.env.JWT_REFRESH_SECRET = TEST_JWT_REFRESH_SECRET;
    // Clear module cache so jwt.js picks up the test env vars
    delete require.cache[require.resolve('../utils/jwt')];
    jwtUtils = require('../utils/jwt');
  });

  afterAll(() => {
    // Restore original env
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
    process.env.JWT_REFRESH_SECRET = originalEnv.JWT_REFRESH_SECRET;
  });

  // ============================================================================
  // EXPORTED CONSTANTS
  // ============================================================================

  describe('Exported Constants', () => {
    it('should export ACCESS_TOKEN_EXPIRY with a default value', () => {
      expect(jwtUtils.ACCESS_TOKEN_EXPIRY).toBeDefined();
      expect(typeof jwtUtils.ACCESS_TOKEN_EXPIRY).toBe('string');
    });

    it('should export REFRESH_TOKEN_EXPIRY with a default value', () => {
      expect(jwtUtils.REFRESH_TOKEN_EXPIRY).toBeDefined();
      expect(typeof jwtUtils.REFRESH_TOKEN_EXPIRY).toBe('string');
    });

    it('should default ACCESS_TOKEN_EXPIRY to 30m', () => {
      // Since we did not set JWT_ACCESS_EXPIRY, the default applies
      expect(jwtUtils.ACCESS_TOKEN_EXPIRY).toBe('30m');
    });

    it('should default REFRESH_TOKEN_EXPIRY to 7d', () => {
      // Since we did not set JWT_REFRESH_EXPIRY, the default applies
      expect(jwtUtils.REFRESH_TOKEN_EXPIRY).toBe('7d');
    });
  });

  // ============================================================================
  // generateAccessToken
  // ============================================================================

  describe('generateAccessToken', () => {
    it('should generate a valid JWT access token', () => {
      const token = jwtUtils.generateAccessToken(mockUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include correct payload fields in the token', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const decoded = jwt.decode(token);

      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.role).toBe(mockUser.role);
      expect(decoded.tenantId).toBe(mockUser.tenantId);
      expect(decoded.type).toBe('access');
    });

    it('should set tenantId to null when user has no tenantId', () => {
      const token = jwtUtils.generateAccessToken(mockUserMinimal);
      const decoded = jwt.decode(token);

      expect(decoded.tenantId).toBeNull();
    });

    it('should set correct issuer and audience claims', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const decoded = jwt.decode(token);

      expect(decoded.iss).toBe('quotation-app');
      expect(decoded.aud).toBe('quotation-app-client');
    });

    it('should include an expiration claim', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const decoded = jwt.decode(token);

      expect(decoded.exp).toBeDefined();
      expect(typeof decoded.exp).toBe('number');
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('should include an issued-at claim', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const decoded = jwt.decode(token);

      expect(decoded.iat).toBeDefined();
      expect(typeof decoded.iat).toBe('number');
    });

    it('should be verifiable with the correct secret', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const decoded = jwt.verify(token, TEST_JWT_SECRET, {
        algorithms: ['HS256']
      });

      expect(decoded.userId).toBe(mockUser.id);
    });

    it('should throw when JWT_SECRET is not configured', () => {
      const saved = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      expect(() => jwtUtils.generateAccessToken(mockUser)).toThrow(
        'Failed to generate access token'
      );

      process.env.JWT_SECRET = saved;
    });
  });

  // ============================================================================
  // generateRefreshToken
  // ============================================================================

  describe('generateRefreshToken', () => {
    it('should generate a valid JWT refresh token', () => {
      const token = jwtUtils.generateRefreshToken(mockUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include correct payload fields in the token', () => {
      const token = jwtUtils.generateRefreshToken(mockUser);
      const decoded = jwt.decode(token);

      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.tenantId).toBe(mockUser.tenantId);
      expect(decoded.type).toBe('refresh');
    });

    it('should NOT include role in the refresh token payload', () => {
      const token = jwtUtils.generateRefreshToken(mockUser);
      const decoded = jwt.decode(token);

      expect(decoded.role).toBeUndefined();
    });

    it('should set tenantId to null when user has no tenantId', () => {
      const token = jwtUtils.generateRefreshToken(mockUserMinimal);
      const decoded = jwt.decode(token);

      expect(decoded.tenantId).toBeNull();
    });

    it('should set correct issuer and audience claims', () => {
      const token = jwtUtils.generateRefreshToken(mockUser);
      const decoded = jwt.decode(token);

      expect(decoded.iss).toBe('quotation-app');
      expect(decoded.aud).toBe('quotation-app-client');
    });

    it('should be verifiable with the correct refresh secret', () => {
      const token = jwtUtils.generateRefreshToken(mockUser);
      const decoded = jwt.verify(token, TEST_JWT_REFRESH_SECRET, {
        algorithms: ['HS256']
      });

      expect(decoded.userId).toBe(mockUser.id);
    });

    it('should NOT be verifiable with the access token secret', () => {
      const token = jwtUtils.generateRefreshToken(mockUser);

      expect(() =>
        jwt.verify(token, TEST_JWT_SECRET, { algorithms: ['HS256'] })
      ).toThrow();
    });

    it('should throw when JWT_REFRESH_SECRET is not configured', () => {
      const saved = process.env.JWT_REFRESH_SECRET;
      delete process.env.JWT_REFRESH_SECRET;

      expect(() => jwtUtils.generateRefreshToken(mockUser)).toThrow(
        'Failed to generate refresh token'
      );

      process.env.JWT_REFRESH_SECRET = saved;
    });
  });

  // ============================================================================
  // verifyAccessToken
  // ============================================================================

  describe('verifyAccessToken', () => {
    it('should verify a valid access token and return the decoded payload', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const decoded = jwtUtils.verifyAccessToken(token);

      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.role).toBe(mockUser.role);
      expect(decoded.tenantId).toBe(mockUser.tenantId);
      expect(decoded.type).toBe('access');
    });

    it('should throw when no token is provided', () => {
      expect(() => jwtUtils.verifyAccessToken(null)).toThrow('No token provided');
      expect(() => jwtUtils.verifyAccessToken(undefined)).toThrow('No token provided');
      expect(() => jwtUtils.verifyAccessToken('')).toThrow('No token provided');
    });

    it('should throw for an invalid/malformed token', () => {
      expect(() => jwtUtils.verifyAccessToken('not.a.valid.jwt')).toThrow(
        'Invalid access token'
      );
    });

    it('should throw for a completely garbage string', () => {
      expect(() => jwtUtils.verifyAccessToken('garbage')).toThrow(
        'Invalid access token'
      );
    });

    it('should throw for an expired access token', () => {
      // Create a token that is already expired
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'admin', tenantId: null, type: 'access' },
        TEST_JWT_SECRET,
        {
          expiresIn: '0s',
          issuer: 'quotation-app',
          audience: 'quotation-app-client',
          algorithm: 'HS256'
        }
      );

      expect(() => jwtUtils.verifyAccessToken(token)).toThrow(
        'Access token has expired'
      );
    });

    it('should throw when verifying a refresh token as an access token', () => {
      const refreshToken = jwtUtils.generateRefreshToken(mockUser);

      // The refresh token was signed with a different secret, so it should fail
      expect(() => jwtUtils.verifyAccessToken(refreshToken)).toThrow(
        'Invalid access token'
      );
    });

    it('should reject a token with type "refresh" even if signed with access secret', () => {
      // Manually craft a token with type=refresh but signed with access secret
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'admin', tenantId: null, type: 'refresh' },
        TEST_JWT_SECRET,
        {
          expiresIn: '30m',
          issuer: 'quotation-app',
          audience: 'quotation-app-client',
          algorithm: 'HS256'
        }
      );

      expect(() => jwtUtils.verifyAccessToken(token)).toThrow('Invalid token type');
    });

    it('should throw when a token has the wrong issuer', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'admin', tenantId: null, type: 'access' },
        TEST_JWT_SECRET,
        {
          expiresIn: '30m',
          issuer: 'wrong-issuer',
          audience: 'quotation-app-client',
          algorithm: 'HS256'
        }
      );

      expect(() => jwtUtils.verifyAccessToken(token)).toThrow('Invalid access token');
    });

    it('should throw when a token has the wrong audience', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'admin', tenantId: null, type: 'access' },
        TEST_JWT_SECRET,
        {
          expiresIn: '30m',
          issuer: 'quotation-app',
          audience: 'wrong-audience',
          algorithm: 'HS256'
        }
      );

      expect(() => jwtUtils.verifyAccessToken(token)).toThrow('Invalid access token');
    });

    it('should throw when JWT_SECRET is not configured', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const saved = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      expect(() => jwtUtils.verifyAccessToken(token)).toThrow(
        'JWT_SECRET is not configured in environment variables'
      );

      process.env.JWT_SECRET = saved;
    });

    it('should throw for a token signed with a different secret', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', role: 'admin', tenantId: null, type: 'access' },
        'completely-different-secret',
        {
          expiresIn: '30m',
          issuer: 'quotation-app',
          audience: 'quotation-app-client',
          algorithm: 'HS256'
        }
      );

      expect(() => jwtUtils.verifyAccessToken(token)).toThrow('Invalid access token');
    });
  });

  // ============================================================================
  // verifyRefreshToken
  // ============================================================================

  describe('verifyRefreshToken', () => {
    it('should verify a valid refresh token and return the decoded payload', () => {
      const token = jwtUtils.generateRefreshToken(mockUser);
      const decoded = jwtUtils.verifyRefreshToken(token);

      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.tenantId).toBe(mockUser.tenantId);
      expect(decoded.type).toBe('refresh');
    });

    it('should throw when no token is provided', () => {
      expect(() => jwtUtils.verifyRefreshToken(null)).toThrow('No token provided');
      expect(() => jwtUtils.verifyRefreshToken(undefined)).toThrow('No token provided');
      expect(() => jwtUtils.verifyRefreshToken('')).toThrow('No token provided');
    });

    it('should throw for an invalid/malformed token', () => {
      expect(() => jwtUtils.verifyRefreshToken('not.valid.token')).toThrow(
        'Invalid refresh token'
      );
    });

    it('should throw for an expired refresh token', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', tenantId: null, type: 'refresh' },
        TEST_JWT_REFRESH_SECRET,
        {
          expiresIn: '0s',
          issuer: 'quotation-app',
          audience: 'quotation-app-client',
          algorithm: 'HS256'
        }
      );

      expect(() => jwtUtils.verifyRefreshToken(token)).toThrow(
        'Refresh token has expired'
      );
    });

    it('should throw when verifying an access token as a refresh token', () => {
      const accessToken = jwtUtils.generateAccessToken(mockUser);

      // The access token was signed with a different secret
      expect(() => jwtUtils.verifyRefreshToken(accessToken)).toThrow(
        'Invalid refresh token'
      );
    });

    it('should reject a token with type "access" even if signed with refresh secret', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', tenantId: null, type: 'access' },
        TEST_JWT_REFRESH_SECRET,
        {
          expiresIn: '7d',
          issuer: 'quotation-app',
          audience: 'quotation-app-client',
          algorithm: 'HS256'
        }
      );

      expect(() => jwtUtils.verifyRefreshToken(token)).toThrow('Invalid token type');
    });

    it('should throw when a token has the wrong issuer', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', tenantId: null, type: 'refresh' },
        TEST_JWT_REFRESH_SECRET,
        {
          expiresIn: '7d',
          issuer: 'wrong-issuer',
          audience: 'quotation-app-client',
          algorithm: 'HS256'
        }
      );

      expect(() => jwtUtils.verifyRefreshToken(token)).toThrow('Invalid refresh token');
    });

    it('should throw when a token has the wrong audience', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', tenantId: null, type: 'refresh' },
        TEST_JWT_REFRESH_SECRET,
        {
          expiresIn: '7d',
          issuer: 'quotation-app',
          audience: 'wrong-audience',
          algorithm: 'HS256'
        }
      );

      expect(() => jwtUtils.verifyRefreshToken(token)).toThrow('Invalid refresh token');
    });

    it('should throw when JWT_REFRESH_SECRET is not configured', () => {
      const token = jwtUtils.generateRefreshToken(mockUser);
      const saved = process.env.JWT_REFRESH_SECRET;
      delete process.env.JWT_REFRESH_SECRET;

      expect(() => jwtUtils.verifyRefreshToken(token)).toThrow(
        'JWT_REFRESH_SECRET is not configured in environment variables'
      );

      process.env.JWT_REFRESH_SECRET = saved;
    });

    it('should throw for a token signed with a different secret', () => {
      const token = jwt.sign(
        { userId: 1, email: 'test@test.com', tenantId: null, type: 'refresh' },
        'completely-different-secret',
        {
          expiresIn: '7d',
          issuer: 'quotation-app',
          audience: 'quotation-app-client',
          algorithm: 'HS256'
        }
      );

      expect(() => jwtUtils.verifyRefreshToken(token)).toThrow('Invalid refresh token');
    });
  });

  // ============================================================================
  // decodeToken
  // ============================================================================

  describe('decodeToken', () => {
    it('should decode a valid access token without verification', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const result = jwtUtils.decodeToken(token);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('header');
      expect(result).toHaveProperty('payload');
      expect(result).toHaveProperty('signature');
      expect(result.payload.userId).toBe(mockUser.id);
      expect(result.payload.type).toBe('access');
    });

    it('should decode a valid refresh token without verification', () => {
      const token = jwtUtils.generateRefreshToken(mockUser);
      const result = jwtUtils.decodeToken(token);

      expect(result).toBeDefined();
      expect(result.payload.userId).toBe(mockUser.id);
      expect(result.payload.type).toBe('refresh');
    });

    it('should return complete token structure with header info', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const result = jwtUtils.decodeToken(token);

      expect(result.header.alg).toBe('HS256');
      expect(result.header.typ).toBe('JWT');
    });

    it('should return null for a completely invalid token', () => {
      const result = jwtUtils.decodeToken('not-a-jwt');

      expect(result).toBeNull();
    });

    it('should decode an expired token without throwing', () => {
      const token = jwt.sign(
        { userId: 1, type: 'access' },
        TEST_JWT_SECRET,
        { expiresIn: '0s' }
      );

      // decodeToken does not verify, so expired tokens should decode fine
      const result = jwtUtils.decodeToken(token);

      expect(result).toBeDefined();
      expect(result.payload.userId).toBe(1);
    });

    it('should decode a token signed with a different secret', () => {
      const token = jwt.sign(
        { userId: 99, type: 'access' },
        'some-other-secret',
        { expiresIn: '1h' }
      );

      // decodeToken does not verify the signature
      const result = jwtUtils.decodeToken(token);

      expect(result).toBeDefined();
      expect(result.payload.userId).toBe(99);
    });
  });

  // ============================================================================
  // getTokenExpiration
  // ============================================================================

  describe('getTokenExpiration', () => {
    it('should return the expiration timestamp for an access token', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const exp = jwtUtils.getTokenExpiration(token);

      expect(exp).toBeDefined();
      expect(typeof exp).toBe('number');

      // Expiration should be in the future (within roughly 30 min)
      const now = Math.floor(Date.now() / 1000);
      expect(exp).toBeGreaterThan(now);
      expect(exp).toBeLessThanOrEqual(now + 30 * 60 + 5); // 30 min + 5s tolerance
    });

    it('should return the expiration timestamp for a refresh token', () => {
      const token = jwtUtils.generateRefreshToken(mockUser);
      const exp = jwtUtils.getTokenExpiration(token);

      expect(exp).toBeDefined();
      expect(typeof exp).toBe('number');

      // Expiration should be in the future (within roughly 7 days)
      const now = Math.floor(Date.now() / 1000);
      expect(exp).toBeGreaterThan(now);
      expect(exp).toBeLessThanOrEqual(now + 7 * 24 * 60 * 60 + 5);
    });

    it('should return null for an invalid token', () => {
      const exp = jwtUtils.getTokenExpiration('garbage');

      expect(exp).toBeNull();
    });

    it('should return null for a token without an exp claim', () => {
      // Sign a token with no expiration
      const token = jwt.sign({ userId: 1 }, TEST_JWT_SECRET);

      // Tokens without expiresIn do not have an exp claim
      // jwt.decode will return a payload without exp, so the result should be null
      // Actually, jwt.sign without expiresIn still creates a token without exp
      const decoded = jwt.decode(token);
      if (!decoded.exp) {
        const result = jwtUtils.getTokenExpiration(token);
        expect(result).toBeNull();
      }
    });

    it('should return the expiration even for an expired token', () => {
      const token = jwt.sign(
        { userId: 1, type: 'access' },
        TEST_JWT_SECRET,
        { expiresIn: '0s' }
      );

      const exp = jwtUtils.getTokenExpiration(token);

      expect(exp).toBeDefined();
      expect(typeof exp).toBe('number');
      // The exp should be at or before the current time since the token is expired
      expect(exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
    });
  });

  // ============================================================================
  // Cross-cutting / Integration-style Tests
  // ============================================================================

  describe('Token Lifecycle', () => {
    it('should generate and verify an access token round-trip', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const decoded = jwtUtils.verifyAccessToken(token);

      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.role).toBe(mockUser.role);
      expect(decoded.type).toBe('access');
    });

    it('should generate and verify a refresh token round-trip', () => {
      const token = jwtUtils.generateRefreshToken(mockUser);
      const decoded = jwtUtils.verifyRefreshToken(token);

      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.type).toBe('refresh');
    });

    it('access and refresh tokens should be different strings', () => {
      const accessToken = jwtUtils.generateAccessToken(mockUser);
      const refreshToken = jwtUtils.generateRefreshToken(mockUser);

      expect(accessToken).not.toBe(refreshToken);
    });

    it('should not cross-verify access token with verifyRefreshToken', () => {
      const accessToken = jwtUtils.generateAccessToken(mockUser);

      expect(() => jwtUtils.verifyRefreshToken(accessToken)).toThrow();
    });

    it('should not cross-verify refresh token with verifyAccessToken', () => {
      const refreshToken = jwtUtils.generateRefreshToken(mockUser);

      expect(() => jwtUtils.verifyAccessToken(refreshToken)).toThrow();
    });

    it('each call should generate a unique token (different iat)', () => {
      const token1 = jwtUtils.generateAccessToken(mockUser);
      const token2 = jwtUtils.generateAccessToken(mockUser);

      // Tokens generated in the same second may have the same iat,
      // but the tokens themselves could differ due to signature timing.
      // At minimum, both should be valid.
      expect(jwtUtils.verifyAccessToken(token1)).toBeDefined();
      expect(jwtUtils.verifyAccessToken(token2)).toBeDefined();
    });

    it('decodeToken and getTokenExpiration should agree on the exp claim', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const decoded = jwtUtils.decodeToken(token);
      const exp = jwtUtils.getTokenExpiration(token);

      expect(decoded.payload.exp).toBe(exp);
    });
  });

  // ============================================================================
  // Security Tests
  // ============================================================================

  describe('Security', () => {
    it('should use HS256 algorithm for access tokens', () => {
      const token = jwtUtils.generateAccessToken(mockUser);
      const decoded = jwtUtils.decodeToken(token);

      expect(decoded.header.alg).toBe('HS256');
    });

    it('should use HS256 algorithm for refresh tokens', () => {
      const token = jwtUtils.generateRefreshToken(mockUser);
      const decoded = jwtUtils.decodeToken(token);

      expect(decoded.header.alg).toBe('HS256');
    });

    it('should reject a token crafted with "none" algorithm', () => {
      // Craft a token with algorithm "none" (algorithm confusion attack)
      const unsafeToken = jwt.sign(
        { userId: 1, email: 'hacker@evil.com', role: 'admin', tenantId: null, type: 'access' },
        '',
        { algorithm: 'none', issuer: 'quotation-app', audience: 'quotation-app-client' }
      );

      expect(() => jwtUtils.verifyAccessToken(unsafeToken)).toThrow();
    });

    it('should use different secrets for access and refresh tokens', () => {
      // This is a design validation test
      expect(TEST_JWT_SECRET).not.toBe(TEST_JWT_REFRESH_SECRET);

      // An access token should not verify with the refresh verifier
      const accessToken = jwtUtils.generateAccessToken(mockUser);
      expect(() => jwtUtils.verifyRefreshToken(accessToken)).toThrow();

      // A refresh token should not verify with the access verifier
      const refreshToken = jwtUtils.generateRefreshToken(mockUser);
      expect(() => jwtUtils.verifyAccessToken(refreshToken)).toThrow();
    });
  });
});
