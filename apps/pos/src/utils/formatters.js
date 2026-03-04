/**
 * Formatting utilities for TeleTime POS
 */

/**
 * Format currency value
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: CAD)
 * @param {string} locale - Locale (default: en-CA)
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount, currency = 'CAD', locale = 'en-CA') {
  if (amount === null || amount === undefined) return '$0.00';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format number with commas
 * @param {number} num - Number to format
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted number string
 */
export function formatNumber(num, decimals = 0) {
  if (num === null || num === undefined) return '0';

  return new Intl.NumberFormat('en-CA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format date
 * @param {Date|string} date - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export function formatDate(date, options = {}) {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;

  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  };

  return new Intl.DateTimeFormat('en-CA', defaultOptions).format(d);
}

/**
 * Format time
 * @param {Date|string} date - Date to format
 * @param {boolean} includeSeconds - Include seconds
 * @returns {string} Formatted time string
 */
export function formatTime(date, includeSeconds = false) {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;

  const options = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(includeSeconds && { second: '2-digit' }),
  };

  return new Intl.DateTimeFormat('en-CA', options).format(d);
}

/**
 * Format date and time together
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted datetime string
 */
export function formatDateTime(date) {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

/**
 * Format phone number
 * @param {string} phone - Phone number
 * @returns {string} Formatted phone number
 */
export function formatPhone(phone) {
  if (!phone) return '';

  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');

  // Format as (XXX) XXX-XXXX
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // Format with country code
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone;
}

/**
 * Format payment method for display
 * @param {string} method - Payment method code
 * @returns {string} Human-readable payment method
 */
export function formatPaymentMethod(method) {
  const methods = {
    cash: 'Cash',
    credit: 'Credit Card',
    debit: 'Debit Card',
    gift_card: 'Gift Card',
  };

  return methods[method] || method;
}

/**
 * Format percentage
 * @param {number} value - Percentage value (0-100)
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted percentage
 */
export function formatPercent(value, decimals = 0) {
  if (value === null || value === undefined) return '0%';
  return `${formatNumber(value, decimals)}%`;
}

export default {
  formatCurrency,
  formatNumber,
  formatDate,
  formatTime,
  formatDateTime,
  formatPhone,
  formatPaymentMethod,
  formatPercent,
};
