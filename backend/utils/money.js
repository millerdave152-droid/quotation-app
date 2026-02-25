/**
 * Canonical money utility — shared helpers for dollar/cent conversions.
 *
 * The database stores money as DECIMAL(10,2) dollars (legacy POS) or
 * INTEGER cents (newer systems).  These five functions replace the
 * ad-hoc Math.round / parseFloat / toFixed patterns scattered across
 * the codebase and guard against floating-point precision errors.
 */

/**
 * Convert a dollar amount to integer cents.
 * Replaces `Math.round(x * 100)`.
 * @param {number|string} dollars
 * @returns {number} integer cents
 */
function dollarsToCents(dollars) {
  return Math.round(Number(dollars) * 100);
}

/**
 * Convert integer cents to a dollar number.
 * Replaces `x / 100`.
 * @param {number|string} cents
 * @returns {number} dollars (may have decimals)
 */
function centsToDollars(cents) {
  return Number(cents) / 100;
}

/**
 * Round a dollar amount to two decimal places.
 * Replaces `parseFloat(x.toFixed(2))` and `Math.round(x * 100) / 100`.
 * @param {number|string} dollars
 * @returns {number} dollars rounded to nearest cent
 */
function roundDollars(dollars) {
  return Math.round(Number(dollars) * 100) / 100;
}

/**
 * Format cents as a display-ready dollar string with commas.
 * e.g. 123456 → "$1,234.56"
 * @param {number|string} cents
 * @returns {string}
 */
function formatDollars(cents) {
  const dollars = Number(cents) / 100;
  return '$' + dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Safely parse a PostgreSQL DECIMAL column value to a JS number.
 * Replaces `parseFloat(row.col) || 0`.
 * @param {*} dbValue - value from a PG DECIMAL column (string, number, or null)
 * @param {number} [fallback=0] - value to return when dbValue is null/undefined/NaN
 * @returns {number}
 */
function parseDollars(dbValue, fallback = 0) {
  if (dbValue === null || dbValue === undefined) return fallback;
  const n = parseFloat(dbValue);
  return Number.isNaN(n) ? fallback : n;
}

module.exports = {
  dollarsToCents,
  centsToDollars,
  roundDollars,
  formatDollars,
  parseDollars,
};
