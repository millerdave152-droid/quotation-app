import { formatCurrency, isValidEmail, formatPhone } from './helpers';

describe('Utility Functions', () => {
  describe('formatCurrency', () => {
    test('should format positive numbers correctly', () => {
      expect(formatCurrency(100)).toBe('$100.00');
      expect(formatCurrency(1000)).toBe('$1,000.00');
      expect(formatCurrency(1000000)).toBe('$1,000,000.00');
    });

    test('should format zero correctly', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    test('should format negative numbers correctly', () => {
      expect(formatCurrency(-100)).toBe('-$100.00');
      expect(formatCurrency(-1000.50)).toBe('-$1,000.50');
    });

    test('should format decimal numbers correctly', () => {
      expect(formatCurrency(99.99)).toBe('$99.99');
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    test('should handle very small amounts', () => {
      expect(formatCurrency(0.01)).toBe('$0.01');
      expect(formatCurrency(0.99)).toBe('$0.99');
    });
  });

  describe('isValidEmail', () => {
    test('should validate correct email addresses', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user@domain.co.uk')).toBe(true);
      expect(isValidEmail('john.doe@company.org')).toBe(true);
      expect(isValidEmail('user+tag@example.com')).toBe(true);
    });

    test('should reject invalid email addresses', () => {
      expect(isValidEmail('invalidemail')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user @example.com')).toBe(false);
      expect(isValidEmail('user@example')).toBe(false);
    });

    test('should reject empty or null values', () => {
      expect(isValidEmail('')).toBe(false);
    });

    test('should reject emails with spaces', () => {
      expect(isValidEmail('test test@example.com')).toBe(false);
      expect(isValidEmail('test@exam ple.com')).toBe(false);
    });
  });

  describe('formatPhone', () => {
    test('should format 10-digit phone numbers correctly', () => {
      expect(formatPhone('1234567890')).toBe('(123) 456-7890');
      expect(formatPhone('9876543210')).toBe('(987) 654-3210');
    });

    test('should handle phone numbers with non-digit characters', () => {
      expect(formatPhone('(123) 456-7890')).toBe('(123) 456-7890');
      expect(formatPhone('123-456-7890')).toBe('(123) 456-7890');
      expect(formatPhone('123.456.7890')).toBe('(123) 456-7890');
    });

    test('should return original input for non-10-digit numbers', () => {
      expect(formatPhone('123')).toBe('123');
      expect(formatPhone('12345')).toBe('12345');
      expect(formatPhone('12345678901')).toBe('12345678901');
    });

    test('should handle empty strings', () => {
      expect(formatPhone('')).toBe('');
    });

    test('should strip all non-digit characters before formatting', () => {
      // +1 123 456 7890 = 11 digits, so returns original since it's not exactly 10
      expect(formatPhone('+1 (123) 456-7890')).toBe('+1 (123) 456-7890');
      expect(formatPhone('abc123def456ghi7890')).toBe('(123) 456-7890');
    });
  });
});
