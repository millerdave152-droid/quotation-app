/**
 * Postal Code Lookup Service
 * Provides address auto-completion from postal codes
 */

const https = require('https');

/**
 * Lookup address information from Canadian postal code
 * Uses Geocoder.ca free API (rate limited to ~2 requests per second)
 * @param {string} postalCode - Canadian postal code (e.g., "M5H 2N2")
 * @returns {Promise<Object>} Address information
 */
async function lookupCanadianPostalCode(postalCode) {
  // Clean and validate postal code format
  const cleanedCode = postalCode.replace(/\s+/g, '').toUpperCase();

  if (!cleanedCode.match(/^[A-Z]\d[A-Z]\d[A-Z]\d$/)) {
    throw new Error('Invalid Canadian postal code format');
  }

  // Format with space: A1A1A1 -> A1A 1A1
  const formatted = `${cleanedCode.slice(0, 3)} ${cleanedCode.slice(3)}`;

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

          // Check for errors from the API
          if (response.error) {
            return reject(new Error(response.error));
          }

          // Extract and format the address data
          const addressInfo = {
            postalCode: formatted,
            city: response.standard?.city || response.city || '',
            province: response.standard?.prov || response.prov || '',
            provinceCode: getProvinceCode(response.standard?.prov || response.prov || ''),
            latitude: response.latt || null,
            longitude: response.longt || null,
            // Some APIs also return street info
            street: response.standard?.staddress || '',
            confidence: response.standard?.confidence || 0
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
 * Fallback: Extract basic info from postal code pattern
 * First letter indicates general region
 */
function getRegionFromPostalCode(postalCode) {
  const firstLetter = postalCode.charAt(0).toUpperCase();

  const regions = {
    'A': { province: 'NL', name: 'Newfoundland and Labrador' },
    'B': { province: 'NS', name: 'Nova Scotia' },
    'C': { province: 'PE', name: 'Prince Edward Island' },
    'E': { province: 'NB', name: 'New Brunswick' },
    'G': { province: 'QC', name: 'Quebec (Eastern)' },
    'H': { province: 'QC', name: 'Quebec (Montreal)' },
    'J': { province: 'QC', name: 'Quebec (Western)' },
    'K': { province: 'ON', name: 'Ontario (Eastern)' },
    'L': { province: 'ON', name: 'Ontario (Central)' },
    'M': { province: 'ON', name: 'Ontario (Toronto)' },
    'N': { province: 'ON', name: 'Ontario (Southwestern)' },
    'P': { province: 'ON', name: 'Ontario (Northern)' },
    'R': { province: 'MB', name: 'Manitoba' },
    'S': { province: 'SK', name: 'Saskatchewan' },
    'T': { province: 'AB', name: 'Alberta' },
    'V': { province: 'BC', name: 'British Columbia' },
    'X': { province: 'NU/NT', name: 'Nunavut/Northwest Territories' },
    'Y': { province: 'YT', name: 'Yukon' }
  };

  return regions[firstLetter] || { province: '', name: 'Unknown' };
}

module.exports = {
  lookupCanadianPostalCode,
  getRegionFromPostalCode,
  getProvinceCode
};
