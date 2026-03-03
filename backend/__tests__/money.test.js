/**
 * TeleTime - Money Utility Unit Tests
 *
 * Comprehensive tests for the canonical money utility functions.
 * Covers dollar/cent conversions, rounding, formatting, and parsing
 * with edge cases for zero, negative, very large numbers, floating-point
 * precision, and string/null/undefined inputs.
 */

const {
  dollarsToCents,
  centsToDollars,
  roundDollars,
  formatDollars,
  parseDollars,
} = require('../utils/money');

// ============================================================================
// dollarsToCents
// ============================================================================

describe('dollarsToCents', () => {
  it('should convert whole dollar amounts to cents', () => {
    expect(dollarsToCents(1)).toBe(100);
    expect(dollarsToCents(10)).toBe(1000);
    expect(dollarsToCents(100)).toBe(10000);
  });

  it('should convert dollars with cents correctly', () => {
    expect(dollarsToCents(1.99)).toBe(199);
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(1299.99)).toBe(129999);
    expect(dollarsToCents(0.01)).toBe(1);
    expect(dollarsToCents(0.50)).toBe(50);
  });

  it('should return 0 for zero input', () => {
    expect(dollarsToCents(0)).toBe(0);
  });

  it('should handle negative dollar amounts', () => {
    expect(dollarsToCents(-1)).toBe(-100);
    expect(dollarsToCents(-19.99)).toBe(-1999);
    expect(dollarsToCents(-0.01)).toBe(-1);
  });

  it('should handle very large dollar amounts', () => {
    expect(dollarsToCents(1000000)).toBe(100000000);
    expect(dollarsToCents(999999.99)).toBe(99999999);
  });

  it('should handle floating-point precision issues', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in JS — Math.round handles this
    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
    // 19.99 can have precision issues but Math.round handles it
    expect(dollarsToCents(19.99)).toBe(1999);
  });

  it('should reflect known IEEE 754 half-cent rounding behavior', () => {
    // 1.005 is stored as 1.00499999999999989... in IEEE 754,
    // so Math.round(1.005 * 100) = Math.round(100.4999...) = 100 (not 101).
    // This is a known JS limitation; callers should use string input
    // or pre-rounded values to avoid this edge case.
    expect(dollarsToCents(1.005)).toBe(100);
    // However, passing as string avoids IEEE 754 representation issues
    // since Number('1.005') * 100 has the same IEEE 754 representation
    expect(dollarsToCents('1.005')).toBe(100);
  });

  it('should accept string inputs and convert them', () => {
    expect(dollarsToCents('19.99')).toBe(1999);
    expect(dollarsToCents('0')).toBe(0);
    expect(dollarsToCents('1299.99')).toBe(129999);
    expect(dollarsToCents('0.01')).toBe(1);
  });

  it('should handle sub-cent fractions by rounding', () => {
    // $1.234 -> 123.4 cents -> rounds to 123
    expect(dollarsToCents(1.234)).toBe(123);
    // $1.235 -> 123.5 cents -> rounds to 124
    expect(dollarsToCents(1.235)).toBe(124);
    // $1.999 -> 199.9 cents -> rounds to 200
    expect(dollarsToCents(1.999)).toBe(200);
  });

  it('should return NaN for non-numeric strings', () => {
    expect(dollarsToCents('abc')).toBeNaN();
    expect(dollarsToCents('')).toBe(0);
  });

  it('should return NaN for NaN input', () => {
    expect(dollarsToCents(NaN)).toBeNaN();
  });
});

// ============================================================================
// centsToDollars
// ============================================================================

describe('centsToDollars', () => {
  it('should convert cents to whole dollar amounts', () => {
    expect(centsToDollars(100)).toBe(1);
    expect(centsToDollars(1000)).toBe(10);
    expect(centsToDollars(10000)).toBe(100);
  });

  it('should convert cents with remainder to decimal dollars', () => {
    expect(centsToDollars(199)).toBe(1.99);
    expect(centsToDollars(1999)).toBe(19.99);
    expect(centsToDollars(129999)).toBe(1299.99);
    expect(centsToDollars(1)).toBe(0.01);
    expect(centsToDollars(50)).toBe(0.5);
  });

  it('should return 0 for zero input', () => {
    expect(centsToDollars(0)).toBe(0);
  });

  it('should handle negative cent amounts', () => {
    expect(centsToDollars(-100)).toBe(-1);
    expect(centsToDollars(-1999)).toBe(-19.99);
    expect(centsToDollars(-1)).toBe(-0.01);
  });

  it('should handle very large cent amounts', () => {
    expect(centsToDollars(100000000)).toBe(1000000);
    expect(centsToDollars(99999999)).toBe(999999.99);
  });

  it('should accept string inputs and convert them', () => {
    expect(centsToDollars('1999')).toBe(19.99);
    expect(centsToDollars('0')).toBe(0);
    expect(centsToDollars('129999')).toBe(1299.99);
  });

  it('should be the inverse of dollarsToCents for integer cents', () => {
    const testValues = [0, 1, 50, 99, 100, 199, 1999, 129999, 100000000];
    for (const cents of testValues) {
      expect(dollarsToCents(centsToDollars(cents))).toBe(cents);
    }
  });

  it('should handle NaN input', () => {
    expect(centsToDollars(NaN)).toBeNaN();
  });
});

// ============================================================================
// roundDollars
// ============================================================================

describe('roundDollars', () => {
  it('should keep exact dollar-and-cent amounts unchanged', () => {
    expect(roundDollars(1.99)).toBe(1.99);
    expect(roundDollars(19.99)).toBe(19.99);
    expect(roundDollars(0.01)).toBe(0.01);
    expect(roundDollars(100)).toBe(100);
  });

  it('should round down sub-cent fractions below half', () => {
    expect(roundDollars(1.234)).toBe(1.23);
    expect(roundDollars(1.001)).toBe(1);
    expect(roundDollars(9.994)).toBe(9.99);
  });

  it('should round up sub-cent fractions at half or above', () => {
    expect(roundDollars(1.235)).toBe(1.24);
    expect(roundDollars(1.999)).toBe(2);
    expect(roundDollars(2.556)).toBe(2.56);
    expect(roundDollars(10.006)).toBe(10.01);
  });

  it('should reflect known IEEE 754 half-cent rounding behavior', () => {
    // Some .005 values are stored as slightly less in IEEE 754,
    // causing them to round down instead of up. This is expected
    // behavior with Math.round and is a known JS limitation.
    // 1.005 -> 1.00499999... -> rounds to 1.00
    expect(roundDollars(1.005)).toBe(1);
    // 9.995 -> 9.99499999... -> rounds to 9.99
    expect(roundDollars(9.995)).toBe(9.99);
  });

  it('should return 0 for zero input', () => {
    expect(roundDollars(0)).toBe(0);
  });

  it('should handle negative amounts', () => {
    expect(roundDollars(-1.99)).toBe(-1.99);
    expect(roundDollars(-1.234)).toBe(-1.23);
    expect(roundDollars(-1.235)).toBe(-1.24);
  });

  it('should handle very large amounts', () => {
    expect(roundDollars(999999.999)).toBe(1000000);
    expect(roundDollars(1000000.001)).toBe(1000000);
  });

  it('should accept string inputs', () => {
    expect(roundDollars('19.999')).toBe(20);
    expect(roundDollars('1.234')).toBe(1.23);
    expect(roundDollars('0')).toBe(0);
  });

  it('should handle floating-point precision edge cases', () => {
    // 0.1 + 0.2 = 0.30000000000000004
    expect(roundDollars(0.1 + 0.2)).toBe(0.3);
  });

  it('should return NaN for NaN input', () => {
    expect(roundDollars(NaN)).toBeNaN();
  });
});

// ============================================================================
// formatDollars
// ============================================================================

describe('formatDollars', () => {
  it('should format cents as a dollar string with $ prefix', () => {
    expect(formatDollars(100)).toBe('$1.00');
    expect(formatDollars(1999)).toBe('$19.99');
    expect(formatDollars(1)).toBe('$0.01');
    expect(formatDollars(50)).toBe('$0.50');
  });

  it('should format zero cents as $0.00', () => {
    expect(formatDollars(0)).toBe('$0.00');
  });

  it('should include commas for amounts >= $1,000', () => {
    expect(formatDollars(123456)).toBe('$1,234.56');
    expect(formatDollars(100000)).toBe('$1,000.00');
    expect(formatDollars(100000000)).toBe('$1,000,000.00');
  });

  it('should handle negative cent amounts', () => {
    const result = formatDollars(-1999);
    // Should produce a negative dollar string
    expect(result).toMatch(/^-?\$?-?19\.99$/);
    expect(result).toContain('19.99');
  });

  it('should always show exactly two decimal places', () => {
    expect(formatDollars(100)).toBe('$1.00');
    expect(formatDollars(10)).toBe('$0.10');
    expect(formatDollars(1000)).toBe('$10.00');
  });

  it('should accept string inputs', () => {
    expect(formatDollars('1999')).toBe('$19.99');
    expect(formatDollars('0')).toBe('$0.00');
    expect(formatDollars('123456')).toBe('$1,234.56');
  });

  it('should handle very large amounts with proper comma formatting', () => {
    expect(formatDollars(999999999)).toBe('$9,999,999.99');
  });

  it('should format typical product prices correctly', () => {
    // $1,299.99 fridge
    expect(formatDollars(129999)).toBe('$1,299.99');
    // $499.99 TV
    expect(formatDollars(49999)).toBe('$499.99');
    // $2,499.99 washer/dryer set
    expect(formatDollars(249999)).toBe('$2,499.99');
  });
});

// ============================================================================
// parseDollars
// ============================================================================

describe('parseDollars', () => {
  it('should parse numeric values directly', () => {
    expect(parseDollars(19.99)).toBe(19.99);
    expect(parseDollars(0)).toBe(0);
    expect(parseDollars(100)).toBe(100);
    expect(parseDollars(0.01)).toBe(0.01);
  });

  it('should parse string representations from PostgreSQL DECIMAL columns', () => {
    expect(parseDollars('19.99')).toBe(19.99);
    expect(parseDollars('0.00')).toBe(0);
    expect(parseDollars('1299.99')).toBe(1299.99);
    expect(parseDollars('0.01')).toBe(0.01);
  });

  it('should return fallback for null', () => {
    expect(parseDollars(null)).toBe(0);
    expect(parseDollars(null, 99)).toBe(99);
  });

  it('should return fallback for undefined', () => {
    expect(parseDollars(undefined)).toBe(0);
    expect(parseDollars(undefined, 42)).toBe(42);
  });

  it('should return fallback for NaN-producing strings', () => {
    expect(parseDollars('abc')).toBe(0);
    expect(parseDollars('abc', 10)).toBe(10);
    expect(parseDollars('not-a-number')).toBe(0);
  });

  it('should use default fallback of 0', () => {
    expect(parseDollars(null)).toBe(0);
    expect(parseDollars(undefined)).toBe(0);
    expect(parseDollars('xyz')).toBe(0);
  });

  it('should use custom fallback value when provided', () => {
    expect(parseDollars(null, -1)).toBe(-1);
    expect(parseDollars(undefined, 999.99)).toBe(999.99);
    expect(parseDollars('bad', 42)).toBe(42);
  });

  it('should handle empty string (parseFloat returns NaN)', () => {
    expect(parseDollars('')).toBe(0);
    expect(parseDollars('', 5)).toBe(5);
  });

  it('should parse negative values', () => {
    expect(parseDollars(-19.99)).toBe(-19.99);
    expect(parseDollars('-19.99')).toBe(-19.99);
  });

  it('should parse string with leading number followed by text', () => {
    // parseFloat('123abc') returns 123
    expect(parseDollars('123abc')).toBe(123);
  });

  it('should handle very large values from PostgreSQL', () => {
    expect(parseDollars('999999.99')).toBe(999999.99);
    expect(parseDollars('1000000.00')).toBe(1000000);
  });

  it('should not return NaN for zero fallback', () => {
    expect(parseDollars(NaN)).toBe(0);
    expect(parseDollars(NaN, 50)).toBe(50);
  });
});

// ============================================================================
// Integration: Round-trip conversions
// ============================================================================

describe('Round-trip conversions', () => {
  it('should preserve value through dollarsToCents -> centsToDollars', () => {
    const prices = [0, 0.01, 0.50, 1.00, 19.99, 99.99, 1299.99, 9999.99];
    for (const price of prices) {
      expect(centsToDollars(dollarsToCents(price))).toBe(price);
    }
  });

  it('should preserve value through centsToDollars -> dollarsToCents', () => {
    const cents = [0, 1, 50, 100, 1999, 9999, 129999, 999999];
    for (const c of cents) {
      expect(dollarsToCents(centsToDollars(c))).toBe(c);
    }
  });

  it('should produce consistent results: dollarsToCents + formatDollars', () => {
    const dollars = 1299.99;
    const cents = dollarsToCents(dollars);
    expect(cents).toBe(129999);
    expect(formatDollars(cents)).toBe('$1,299.99');
  });

  it('should produce consistent results: parseDollars + dollarsToCents', () => {
    const dbValue = '1299.99';
    const dollars = parseDollars(dbValue);
    const cents = dollarsToCents(dollars);
    expect(cents).toBe(129999);
  });

  it('should produce consistent results: roundDollars + dollarsToCents', () => {
    const imprecise = 19.994;
    const rounded = roundDollars(imprecise);
    expect(rounded).toBe(19.99);
    expect(dollarsToCents(rounded)).toBe(1999);
  });
});
