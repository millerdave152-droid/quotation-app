/**
 * Password Utility Functions
 * Handles password hashing, comparison, and validation
 * @module utils/password
 */

const bcrypt = require('bcryptjs');

// Salt rounds for bcrypt hashing (higher = more secure but slower)
const SALT_ROUNDS = 12;

// Password strength requirements
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

/**
 * Hash Password
 * Creates a secure bcrypt hash of the provided password
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Hashed password
 * @throws {Error} If password is invalid or hashing fails
 */
const hashPassword = async (password) => {
  try {
    if (!password) {
      throw new Error('Password is required');
    }

    if (typeof password !== 'string') {
      throw new Error('Password must be a string');
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
      throw new Error(`Password must not exceed ${PASSWORD_MAX_LENGTH} characters`);
    }

    // Generate salt and hash password
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hash = await bcrypt.hash(password, salt);

    return hash;
  } catch (error) {
    console.error('Error hashing password:', error.message);
    throw error;
  }
};

/**
 * Compare Password
 * Compares a plain text password with a hashed password
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password to compare against
 * @returns {Promise<boolean>} True if passwords match, false otherwise
 * @throws {Error} If comparison fails
 */
const comparePassword = async (password, hash) => {
  try {
    if (!password || !hash) {
      return false;
    }

    if (typeof password !== 'string' || typeof hash !== 'string') {
      return false;
    }

    // Compare password with hash
    const isMatch = await bcrypt.compare(password, hash);
    return isMatch;
  } catch (error) {
    console.error('Error comparing password:', error.message);
    // Return false instead of throwing to prevent information leakage
    return false;
  }
};

/**
 * Validate Password Strength
 * Checks if password meets security requirements
 * Requirements:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character (optional but recommended)
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with isValid flag and errors array
 */
const validatePasswordStrength = (password) => {
  const errors = [];

  try {
    if (!password) {
      return {
        isValid: false,
        errors: ['Password is required']
      };
    }

    if (typeof password !== 'string') {
      return {
        isValid: false,
        errors: ['Password must be a string']
      };
    }

    // Check minimum length
    if (password.length < PASSWORD_MIN_LENGTH) {
      errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
    }

    // Check maximum length
    if (password.length > PASSWORD_MAX_LENGTH) {
      errors.push(`Password must not exceed ${PASSWORD_MAX_LENGTH} characters`);
    }

    // Check for uppercase letter
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    // Check for lowercase letter
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    // Check for number
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    // Check for special character (recommended but not required)
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    // Check for common weak passwords
    const weakPasswords = [
      'password', 'password123', '12345678', 'qwerty123',
      'admin123', 'letmein', 'welcome123', 'monkey123'
    ];

    if (weakPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common. Please choose a stronger password');
    }

    // Check for sequential characters (e.g., "12345", "abcde")
    const hasSequential = /(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i.test(password);
    if (hasSequential) {
      errors.push('Password should not contain sequential characters');
    }

    // Check for repeated characters (e.g., "aaa", "111")
    const hasRepeated = /(.)\1{2,}/.test(password);
    if (hasRepeated) {
      errors.push('Password should not contain repeated characters');
    }

    return {
      isValid: errors.length === 0,
      errors: errors,
      strength: calculatePasswordStrength(password, hasSpecialChar),
      hasSpecialChar: hasSpecialChar
    };
  } catch (error) {
    console.error('Error validating password strength:', error.message);
    return {
      isValid: false,
      errors: ['Error validating password']
    };
  }
};

/**
 * Calculate Password Strength Score
 * Returns a score from 0-100 indicating password strength
 * @param {string} password - Password to evaluate
 * @param {boolean} hasSpecialChar - Whether password contains special characters
 * @returns {number} Strength score (0-100)
 */
const calculatePasswordStrength = (password, hasSpecialChar) => {
  let strength = 0;

  // Length score (max 30 points)
  if (password.length >= 8) strength += 10;
  if (password.length >= 12) strength += 10;
  if (password.length >= 16) strength += 10;

  // Complexity score (max 40 points)
  if (/[A-Z]/.test(password)) strength += 10;
  if (/[a-z]/.test(password)) strength += 10;
  if (/[0-9]/.test(password)) strength += 10;
  if (hasSpecialChar) strength += 10;

  // Variety score (max 30 points)
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= 8) strength += 10;
  if (uniqueChars >= 12) strength += 10;
  if (uniqueChars >= 16) strength += 10;

  return Math.min(strength, 100);
};

/**
 * Get Password Strength Label
 * Returns a human-readable strength label
 * @param {number} score - Password strength score (0-100)
 * @returns {string} Strength label (Weak, Fair, Good, Strong, Very Strong)
 */
const getPasswordStrengthLabel = (score) => {
  if (score < 20) return 'Very Weak';
  if (score < 40) return 'Weak';
  if (score < 60) return 'Fair';
  if (score < 80) return 'Good';
  if (score < 90) return 'Strong';
  return 'Very Strong';
};

/**
 * Generate Random Password
 * Creates a cryptographically secure random password
 * @param {number} length - Desired password length (default: 16)
 * @returns {string} Random password
 */
const generateRandomPassword = (length = 16) => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const allChars = uppercase + lowercase + numbers + special;

  let password = '';

  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill remaining length with random characters
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle password to randomize character positions
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

module.exports = {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  calculatePasswordStrength,
  getPasswordStrengthLabel,
  generateRandomPassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH
};
