/**
 * Postal Code Lookup Service
 * Three-tier province resolution for tax jurisdiction:
 *   1. Primary:   geocoder.ca API (highest confidence)
 *   2. Secondary:  First-letter postal code → province map
 *   3. Tertiary:   Default to ON with error logging
 *
 * Returns { province, confidence } where confidence is 'api' | 'prefix' | 'default'.
 */

const https = require('https');
const logger = require('../utils/logger');
const POSTAL_PREFIX_MAP = require('../utils/postalCodeProvinceMap');

/**
 * Lookup address information from Canadian postal code
 * Uses Geocoder.ca free API (rate limited to ~2 requests per second)
 * @param {string} postalCode - Canadian postal code (e.g., "M5H 2N2")
 * @returns {Promise<Object>} Address information with confidence
 */
async function lookupCanadianPostalCode(postalCode) {
  // Clean and validate postal code format
  const cleanedCode = postalCode.replace(/\s+/g, '').toUpperCase();

  if (!cleanedCode.match(/^[A-Z]\d[A-Z]\d[A-Z]\d$/)) {
    throw new Error('Invalid Canadian postal code format');
  }

  // Format with space: A1A1A1 -> A1A 1A1
  const formatted = `${cleanedCode.slice(0, 3)} ${cleanedCode.slice(3)}`;

  // ── Primary: geocoder.ca API ──────────────────────────────────────
  try {
    const result = await _callGeocoderApi(formatted);
    return result;
  } catch (apiErr) {
    logger.warn({ err: apiErr.message, postalCode: formatted },
      '[PostalCodeLookup] Geocoder.ca API failed — falling back to prefix map');
  }

  // ── Secondary: first-letter prefix map ────────────────────────────
  const prefixResult = resolveFromPrefix(cleanedCode);
  return {
    postalCode: formatted,
    city: '',
    province: '',
    provinceCode: prefixResult.province,
    latitude: null,
    longitude: null,
    street: '',
    confidence: prefixResult.confidence,
  };
}

/**
 * Resolve province from postal code first letter (prefix map).
 * Returns { province, confidence } with 'prefix' or 'default'.
 * @param {string} postalCode - Cleaned postal code (no spaces, uppercase)
 * @returns {{ province: string, confidence: 'prefix' | 'default' }}
 */
function resolveFromPrefix(postalCode) {
  const firstLetter = postalCode.charAt(0).toUpperCase();
  const mapped = POSTAL_PREFIX_MAP[firstLetter];

  if (mapped) {
    // Handle ambiguous X prefix (NT/NU)
    if (mapped === 'NT_NU') {
      logger.warn({ postalCode },
        'Ambiguous postal code prefix X — cannot distinguish NT from NU. Defaulting to NT tax rates.');
      return { province: 'NT', confidence: 'prefix' };
    }
    return { province: mapped, confidence: 'prefix' };
  }

  // ── Tertiary: unknown prefix — default to ON ──────────────────────
  logger.error({ postalCode },
    'Province resolution failed completely — defaulting to ON. Manual tax review required for this transaction.');
  return { province: 'ON', confidence: 'default' };
}

/**
 * Resolve province code from any postal code input.
 * Convenience method that returns just the province and confidence.
 * @param {string} postalCode
 * @returns {Promise<{ provinceCode: string, confidence: 'api' | 'prefix' | 'default' }>}
 */
async function resolveProvince(postalCode) {
  try {
    const result = await lookupCanadianPostalCode(postalCode);
    return {
      provinceCode: result.provinceCode || result.province || 'ON',
      confidence: result.confidence || 'api',
    };
  } catch {
    const prefix = resolveFromPrefix(postalCode.replace(/\s+/g, '').toUpperCase());
    return { provinceCode: prefix.province, confidence: prefix.confidence };
  }
}

/**
 * Call geocoder.ca API (internal, unchanged from original)
 * @private
 */
function _callGeocoderApi(formatted) {
  return new Promise((resolve, reject) => {
    const url = `https://geocoder.ca/?postal=${encodeURIComponent(formatted)}&json=1`;

    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          if (response.error) {
            return reject(new Error(response.error));
          }

          const addressInfo = {
            postalCode: formatted,
            city: response.standard?.city || response.city || '',
            province: response.standard?.prov || response.prov || '',
            provinceCode: getProvinceCode(response.standard?.prov || response.prov || ''),
            latitude: response.latt || null,
            longitude: response.longt || null,
            street: response.standard?.staddress || '',
            confidence: 'api',
          };

          resolve(addressInfo);
        } catch (error) {
          reject(new Error('Failed to parse postal code lookup response'));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Postal code lookup failed: ${error.message}`));
    });
  });
}

/**
 * Convert province name to 2-letter code
 */
function getProvinceCode(provinceName) {
  const provinces = {
    'Ontario': 'ON',
    'Quebec': 'QC',
    'British Columbia': 'BC',
    'Alberta': 'AB',
    'Manitoba': 'MB',
    'Saskatchewan': 'SK',
    'Nova Scotia': 'NS',
    'New Brunswick': 'NB',
    'Prince Edward Island': 'PE',
    'Newfoundland and Labrador': 'NL',
    'Yukon': 'YT',
    'Northwest Territories': 'NT',
    'Nunavut': 'NU'
  };

  return provinces[provinceName] || provinceName;
}

/**
 * Get region info from postal code prefix (legacy compatibility)
 */
function getRegionFromPostalCode(postalCode) {
  const firstLetter = postalCode.charAt(0).toUpperCase();
  const mapped = POSTAL_PREFIX_MAP[firstLetter];

  if (!mapped) return { province: '', name: 'Unknown' };

  const province = mapped === 'NT_NU' ? 'NT' : mapped;
  return { province, name: province };
}

module.exports = {
  lookupCanadianPostalCode,
  resolveFromPrefix,
  resolveProvince,
  getRegionFromPostalCode,
  getProvinceCode
};
