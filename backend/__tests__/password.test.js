/**
 * TeleTime - Password Utility Unit Tests
 *
 * Tests for password hashing, comparison, validation,
 * strength scoring, labeling, and random generation.
 */

const {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  calculatePasswordStrength,
  getPasswordStrengthLabel,
  generateRandomPassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH
} = require('../utils/password');

// Suppress console.error output during tests
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.error.mockRestore();
});

// ============================================================================
// CONSTANTS
// ============================================================================

describe('Password Constants', () => {
  it('should export PASSWORD_MIN_LENGTH as 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it('should export PASSWORD_MAX_LENGTH as 128', () => {
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });
});

// ============================================================================
// hashPassword
// ============================================================================

describe('hashPassword', () => {
  it('should hash a valid password and return a bcrypt hash string', async () => {
    const hash = await hashPassword('TestPass123!');
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^\$2[aby]?\$/); // bcrypt hash prefix
    expect(hash.length).toBeGreaterThan(50);
  });

  it('should produce different hashes for the same password (unique salts)', async () => {
    const hash1 = await hashPassword('SamePassword1!');
    const hash2 = await hashPassword('SamePassword1!');
    expect(hash1).not.toBe(hash2);
  });

  it('should produce different hashes for different passwords', async () => {
    const hash1 = await hashPassword('PasswordA1!');
    const hash2 = await hashPassword('PasswordB2@');
    expect(hash1).not.toBe(hash2);
  });

  it('should throw an error when password is empty string', async () => {
    await expect(hashPassword('')).rejects.toThrow('Password is required');
  });

  it('should throw an error when password is null', async () => {
    await expect(hashPassword(null)).rejects.toThrow('Password is required');
  });

  it('should throw an error when password is undefined', async () => {
    await expect(hashPassword(undefined)).rejects.toThrow('Password is required');
  });

  it('should throw an error when password is not a string', async () => {
    await expect(hashPassword(12345)).rejects.toThrow('Password must be a string');
  });

  it('should throw an error when password is an object', async () => {
    await expect(hashPassword({ password: 'test' })).rejects.toThrow('Password must be a string');
  });

  it('should throw an error when password exceeds max length', async () => {
    const longPassword = 'A'.repeat(129);
    await expect(hashPassword(longPassword)).rejects.toThrow(
      `Password must not exceed ${PASSWORD_MAX_LENGTH} characters`
    );
  });

  it('should hash a password at exactly the max length', async () => {
    const maxPassword = 'Aa1!' + 'x'.repeat(124); // exactly 128 chars
    const hash = await hashPassword(maxPassword);
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^\$2[aby]?\$/);
  });

  it('should hash passwords with special characters', async () => {
    const hash = await hashPassword('P@$$w0rd!#%^&*()');
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^\$2[aby]?\$/);
  });

  it('should hash passwords with unicode characters', async () => {
    const hash = await hashPassword('Pässwörd1!');
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^\$2[aby]?\$/);
  });

  it('should hash passwords with whitespace', async () => {
    const hash = await hashPassword('  My Pass 1!  ');
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^\$2[aby]?\$/);
  });
});

// ============================================================================
// comparePassword
// ============================================================================

describe('comparePassword', () => {
  it('should return true when password matches hash', async () => {
    const password = 'TestPass123!';
    const hash = await hashPassword(password);
    const result = await comparePassword(password, hash);
    expect(result).toBe(true);
  });

  it('should return false when password does not match hash', async () => {
    const hash = await hashPassword('CorrectPassword1!');
    const result = await comparePassword('WrongPassword1!', hash);
    expect(result).toBe(false);
  });

  it('should return false when password is null', async () => {
    const result = await comparePassword(null, '$2b$12$somehash');
    expect(result).toBe(false);
  });

  it('should return false when hash is null', async () => {
    const result = await comparePassword('TestPass123!', null);
    expect(result).toBe(false);
  });

  it('should return false when password is undefined', async () => {
    const result = await comparePassword(undefined, '$2b$12$somehash');
    expect(result).toBe(false);
  });

  it('should return false when hash is undefined', async () => {
    const result = await comparePassword('TestPass123!', undefined);
    expect(result).toBe(false);
  });

  it('should return false when password is empty string', async () => {
    const result = await comparePassword('', '$2b$12$somehash');
    expect(result).toBe(false);
  });

  it('should return false when hash is empty string', async () => {
    const result = await comparePassword('TestPass123!', '');
    expect(result).toBe(false);
  });

  it('should return false when password is not a string', async () => {
    const result = await comparePassword(12345, '$2b$12$somehash');
    expect(result).toBe(false);
  });

  it('should return false when hash is not a string', async () => {
    const result = await comparePassword('TestPass123!', 12345);
    expect(result).toBe(false);
  });

  it('should return false for an invalid/malformed hash (not throw)', async () => {
    const result = await comparePassword('TestPass123!', 'not-a-valid-hash');
    expect(result).toBe(false);
  });

  it('should correctly round-trip: hash then compare', async () => {
    const passwords = [
      'SimplePass1!',
      'C0mpl3x!P@$$w0rd',
      '  spaces  Around1! ',
      'Ünïcödé_Pässwörd1!'
    ];

    for (const pw of passwords) {
      const hash = await hashPassword(pw);
      const match = await comparePassword(pw, hash);
      expect(match).toBe(true);
    }
  });

  it('should be case-sensitive', async () => {
    const hash = await hashPassword('TestPass123!');
    const result = await comparePassword('testpass123!', hash);
    expect(result).toBe(false);
  });
});

// ============================================================================
// validatePasswordStrength
// ============================================================================

describe('validatePasswordStrength', () => {
  describe('missing or invalid input', () => {
    it('should return invalid when password is null', () => {
      const result = validatePasswordStrength(null);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password is required');
    });

    it('should return invalid when password is undefined', () => {
      const result = validatePasswordStrength(undefined);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password is required');
    });

    it('should return invalid when password is empty string', () => {
      const result = validatePasswordStrength('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password is required');
    });

    it('should return invalid when password is not a string', () => {
      const result = validatePasswordStrength(12345);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be a string');
    });

    it('should return invalid when password is a boolean', () => {
      const result = validatePasswordStrength(true);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be a string');
    });
  });

  describe('minimum length requirement', () => {
    it('should fail when password is shorter than minimum length', () => {
      const result = validatePasswordStrength('Aa1!xyz');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`
      );
    });

    it('should pass the length check when password is exactly minimum length', () => {
      // "Aa1!wxyz" = 8 chars, no sequential, no repeated
      const result = validatePasswordStrength('Aa1!wxyz');
      const hasLengthError = result.errors.some((e) => e.includes('at least'));
      expect(hasLengthError).toBe(false);
    });
  });

  describe('maximum length requirement', () => {
    it('should fail when password exceeds maximum length', () => {
      const longPassword = 'Aa1!' + 'x'.repeat(125); // 129 chars
      const result = validatePasswordStrength(longPassword);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        `Password must not exceed ${PASSWORD_MAX_LENGTH} characters`
      );
    });

    it('should pass max length check when password is exactly max length', () => {
      const maxPassword = 'Aa1!' + 'x'.repeat(124); // 128 chars
      const result = validatePasswordStrength(maxPassword);
      const hasMaxError = result.errors.some((e) => e.includes('exceed'));
      expect(hasMaxError).toBe(false);
    });
  });

  describe('uppercase letter requirement', () => {
    it('should fail when password has no uppercase letter', () => {
      const result = validatePasswordStrength('nouppercase1!zqk');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should pass when password has an uppercase letter', () => {
      const result = validatePasswordStrength('HasUpper1!zqk');
      const hasUpperError = result.errors.some((e) => e.includes('uppercase'));
      expect(hasUpperError).toBe(false);
    });
  });

  describe('lowercase letter requirement', () => {
    it('should fail when password has no lowercase letter', () => {
      const result = validatePasswordStrength('NOLOWERCASE1!ZQK');
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should pass when password has a lowercase letter', () => {
      const result = validatePasswordStrength('HASLOWERa1!ZQK');
      const hasLowerError = result.errors.some((e) => e.includes('lowercase'));
      expect(hasLowerError).toBe(false);
    });
  });

  describe('number requirement', () => {
    it('should fail when password has no number', () => {
      const result = validatePasswordStrength('NoNumberHere!zqk');
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should pass when password has a number', () => {
      const result = validatePasswordStrength('HasNumber7!zqk');
      const hasNumberError = result.errors.some((e) => e.includes('number'));
      expect(hasNumberError).toBe(false);
    });
  });

  describe('special character detection', () => {
    it('should indicate hasSpecialChar is true when special char present', () => {
      const result = validatePasswordStrength('GoodPw9!zqk');
      expect(result.hasSpecialChar).toBe(true);
    });

    it('should indicate hasSpecialChar is false when no special char present', () => {
      const result = validatePasswordStrength('GoodPw9xzqk');
      expect(result.hasSpecialChar).toBe(false);
    });
  });

  describe('weak/common passwords', () => {
    const weakPasswords = [
      'password', 'Password', 'PASSWORD',
      'password123', 'Password123',
      '12345678',
      'qwerty123', 'Qwerty123',
      'admin123', 'Admin123',
      'letmein', 'Letmein',
      'welcome123', 'Welcome123',
      'monkey123', 'Monkey123'
    ];

    it.each(weakPasswords)(
      'should reject common weak password: "%s"',
      (weakPw) => {
        const result = validatePasswordStrength(weakPw);
        const hasWeakError = result.errors.some((e) => e.includes('too common'));
        expect(hasWeakError).toBe(true);
      }
    );
  });

  describe('sequential characters', () => {
    it('should flag sequential alphabetic characters (abc)', () => {
      const result = validatePasswordStrength('Pabc9!xzqk');
      const hasSequentialError = result.errors.some((e) => e.includes('sequential'));
      expect(hasSequentialError).toBe(true);
    });

    it('should flag sequential numeric characters (123)', () => {
      const result = validatePasswordStrength('P123w!xzqk');
      const hasSequentialError = result.errors.some((e) => e.includes('sequential'));
      expect(hasSequentialError).toBe(true);
    });

    it('should flag case-insensitive sequential chars (ABC)', () => {
      const result = validatePasswordStrength('PABC9!xzqk');
      const hasSequentialError = result.errors.some((e) => e.includes('sequential'));
      expect(hasSequentialError).toBe(true);
    });

    it('should not flag non-sequential characters', () => {
      const result = validatePasswordStrength('Pxqz9!wfhk');
      const hasSequentialError = result.errors.some((e) => e.includes('sequential'));
      expect(hasSequentialError).toBe(false);
    });
  });

  describe('repeated characters', () => {
    it('should flag three or more repeated characters (aaa)', () => {
      const result = validatePasswordStrength('Paaaw9!xzqk');
      const hasRepeatedError = result.errors.some((e) => e.includes('repeated'));
      expect(hasRepeatedError).toBe(true);
    });

    it('should flag repeated digits (111)', () => {
      const result = validatePasswordStrength('Pw111!xzqk');
      const hasRepeatedError = result.errors.some((e) => e.includes('repeated'));
      expect(hasRepeatedError).toBe(true);
    });

    it('should not flag two repeated characters (aa)', () => {
      const result = validatePasswordStrength('Paaw9!xzqk');
      const hasRepeatedError = result.errors.some((e) => e.includes('repeated'));
      expect(hasRepeatedError).toBe(false);
    });
  });

  describe('valid strong passwords', () => {
    it('should accept a strong password with all requirements met', () => {
      const result = validatePasswordStrength('Str0ng!Pw9zqk');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.strength).toBeDefined();
      expect(typeof result.strength).toBe('number');
    });

    it('should accept a password without special characters (still valid)', () => {
      // No special char is allowed; it just affects the strength score
      const result = validatePasswordStrength('Str0ngPw9zqk');
      expect(result.isValid).toBe(true);
      expect(result.hasSpecialChar).toBe(false);
    });
  });

  describe('multiple errors', () => {
    it('should return multiple errors for a very weak password', () => {
      const result = validatePasswordStrength('aaa');
      expect(result.isValid).toBe(false);
      // Should have errors for: min length, uppercase, number, repeated
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// ============================================================================
// calculatePasswordStrength
// ============================================================================

describe('calculatePasswordStrength', () => {
  it('should return a low score for a minimal single-char password', () => {
    // 'a': length < 8 (0), lowercase +10, unique < 8 (0), no special => 10
    const score = calculatePasswordStrength('a', false);
    expect(score).toBe(10);
  });

  it('should award points for length >= 8', () => {
    const score = calculatePasswordStrength('abcdefgh', false);
    // length >= 8: +10, lowercase: +10, uniqueChars >= 8: +10 => 30
    expect(score).toBe(30);
  });

  it('should award additional points for length >= 12', () => {
    const score = calculatePasswordStrength('abcdefghijkl', false);
    // length >= 8: +10, length >= 12: +10, lowercase: +10, uniqueChars >= 8: +10, uniqueChars >= 12: +10 => 50
    expect(score).toBe(50);
  });

  it('should award additional points for length >= 16', () => {
    const score = calculatePasswordStrength('abcdefghijklmnop', false);
    // length: +30, lowercase: +10, unique >= 8: +10, unique >= 12: +10, unique >= 16: +10 => 70
    expect(score).toBe(70);
  });

  it('should award points for uppercase letters', () => {
    const scoreWithout = calculatePasswordStrength('abcdefgh', false);
    const scoreWith = calculatePasswordStrength('Abcdefgh', false);
    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('should award points for numbers', () => {
    const scoreWithout = calculatePasswordStrength('abcdefgh', false);
    const scoreWith = calculatePasswordStrength('abcdefg1', false);
    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('should award points for special characters', () => {
    const scoreWithout = calculatePasswordStrength('Abcdefg1', false);
    const scoreWith = calculatePasswordStrength('Abcdefg1', true);
    expect(scoreWith).toBe(scoreWithout + 10);
  });

  it('should award points for unique character variety', () => {
    // 8 unique chars
    const score8 = calculatePasswordStrength('abcdefgh', false);
    // All same char, 1 unique
    const score1 = calculatePasswordStrength('aaaaaaaa', false);
    expect(score8).toBeGreaterThan(score1);
  });

  it('should cap the score at 100', () => {
    // Maximize everything: long, all types, many unique chars, special
    const maxPassword = 'Abcdefghijklmnop1234!@#$';
    const score = calculatePasswordStrength(maxPassword, true);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should return a maximum of 100 for an ideal password', () => {
    // 20+ chars, upper, lower, digit, special, 16+ unique chars
    const idealPw = 'Abcdefghijklmnop1234!@#$';
    const score = calculatePasswordStrength(idealPw, true);
    expect(score).toBe(100);
  });
});

// ============================================================================
// getPasswordStrengthLabel
// ============================================================================

describe('getPasswordStrengthLabel', () => {
  it('should return "Very Weak" for score < 20', () => {
    expect(getPasswordStrengthLabel(0)).toBe('Very Weak');
    expect(getPasswordStrengthLabel(10)).toBe('Very Weak');
    expect(getPasswordStrengthLabel(19)).toBe('Very Weak');
  });

  it('should return "Weak" for score 20-39', () => {
    expect(getPasswordStrengthLabel(20)).toBe('Weak');
    expect(getPasswordStrengthLabel(30)).toBe('Weak');
    expect(getPasswordStrengthLabel(39)).toBe('Weak');
  });

  it('should return "Fair" for score 40-59', () => {
    expect(getPasswordStrengthLabel(40)).toBe('Fair');
    expect(getPasswordStrengthLabel(50)).toBe('Fair');
    expect(getPasswordStrengthLabel(59)).toBe('Fair');
  });

  it('should return "Good" for score 60-79', () => {
    expect(getPasswordStrengthLabel(60)).toBe('Good');
    expect(getPasswordStrengthLabel(70)).toBe('Good');
    expect(getPasswordStrengthLabel(79)).toBe('Good');
  });

  it('should return "Strong" for score 80-89', () => {
    expect(getPasswordStrengthLabel(80)).toBe('Strong');
    expect(getPasswordStrengthLabel(85)).toBe('Strong');
    expect(getPasswordStrengthLabel(89)).toBe('Strong');
  });

  it('should return "Very Strong" for score >= 90', () => {
    expect(getPasswordStrengthLabel(90)).toBe('Very Strong');
    expect(getPasswordStrengthLabel(95)).toBe('Very Strong');
    expect(getPasswordStrengthLabel(100)).toBe('Very Strong');
  });

  it('should handle boundary values correctly', () => {
    expect(getPasswordStrengthLabel(19)).toBe('Very Weak');
    expect(getPasswordStrengthLabel(20)).toBe('Weak');
    expect(getPasswordStrengthLabel(39)).toBe('Weak');
    expect(getPasswordStrengthLabel(40)).toBe('Fair');
    expect(getPasswordStrengthLabel(59)).toBe('Fair');
    expect(getPasswordStrengthLabel(60)).toBe('Good');
    expect(getPasswordStrengthLabel(79)).toBe('Good');
    expect(getPasswordStrengthLabel(80)).toBe('Strong');
    expect(getPasswordStrengthLabel(89)).toBe('Strong');
    expect(getPasswordStrengthLabel(90)).toBe('Very Strong');
  });
});

// ============================================================================
// generateRandomPassword
// ============================================================================

describe('generateRandomPassword', () => {
  it('should generate a password with default length of 16', () => {
    const pw = generateRandomPassword();
    expect(pw.length).toBe(16);
  });

  it('should generate a password with the specified length', () => {
    const pw = generateRandomPassword(24);
    expect(pw.length).toBe(24);
  });

  it('should generate a password with minimum viable length (4)', () => {
    // At least 4, since it guarantees one of each type
    const pw = generateRandomPassword(4);
    expect(pw.length).toBe(4);
  });

  it('should include at least one uppercase letter', () => {
    // Run multiple times for statistical confidence
    for (let i = 0; i < 10; i++) {
      const pw = generateRandomPassword(16);
      expect(/[A-Z]/.test(pw)).toBe(true);
    }
  });

  it('should include at least one lowercase letter', () => {
    for (let i = 0; i < 10; i++) {
      const pw = generateRandomPassword(16);
      expect(/[a-z]/.test(pw)).toBe(true);
    }
  });

  it('should include at least one number', () => {
    for (let i = 0; i < 10; i++) {
      const pw = generateRandomPassword(16);
      expect(/[0-9]/.test(pw)).toBe(true);
    }
  });

  it('should include at least one special character', () => {
    for (let i = 0; i < 10; i++) {
      const pw = generateRandomPassword(16);
      expect(/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(pw)).toBe(true);
    }
  });

  it('should generate different passwords on successive calls', () => {
    const passwords = new Set();
    for (let i = 0; i < 20; i++) {
      passwords.add(generateRandomPassword(16));
    }
    // Extremely unlikely to have duplicates in 20 random 16-char passwords
    expect(passwords.size).toBeGreaterThan(1);
  });

  it('should return a string', () => {
    const pw = generateRandomPassword();
    expect(typeof pw).toBe('string');
  });

  it('should generate passwords that pass strength validation', () => {
    for (let i = 0; i < 5; i++) {
      const pw = generateRandomPassword(20);
      const result = validatePasswordStrength(pw);
      // Generated passwords should have all required character types
      const hasUpperError = result.errors.some((e) => e.includes('uppercase'));
      const hasLowerError = result.errors.some((e) => e.includes('lowercase'));
      const hasNumberError = result.errors.some((e) => e.includes('number'));
      expect(hasUpperError).toBe(false);
      expect(hasLowerError).toBe(false);
      expect(hasNumberError).toBe(false);
    }
  });
});

// ============================================================================
// Integration: hash + compare + validate round-trip
// ============================================================================

describe('Integration: hash, compare, and validate', () => {
  it('should validate, hash, and verify a strong password end-to-end', async () => {
    const password = 'MyStr0ng!Pw9zqk';

    // Step 1: Validate
    const validation = validatePasswordStrength(password);
    expect(validation.isValid).toBe(true);

    // Step 2: Hash
    const hash = await hashPassword(password);
    expect(typeof hash).toBe('string');

    // Step 3: Compare
    const isMatch = await comparePassword(password, hash);
    expect(isMatch).toBe(true);

    // Step 4: Wrong password should not match
    const isWrongMatch = await comparePassword('WrongPassword1!', hash);
    expect(isWrongMatch).toBe(false);
  });

  it('should generate a random password that can be hashed and verified', async () => {
    const password = generateRandomPassword(20);

    const hash = await hashPassword(password);
    const isMatch = await comparePassword(password, hash);
    expect(isMatch).toBe(true);
  });

  it('should assign an appropriate strength label for generated passwords', () => {
    const password = generateRandomPassword(20);
    const validation = validatePasswordStrength(password);

    if (validation.strength !== undefined) {
      const label = getPasswordStrengthLabel(validation.strength);
      expect(['Fair', 'Good', 'Strong', 'Very Strong']).toContain(label);
    }
  });
});
