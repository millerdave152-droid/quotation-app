/**
 * LookupService - Service for autocomplete lookups
 *
 * Handles:
 * - Canadian cities search
 * - Postal code lookup with caching
 * - Common names search
 * - Customer autocomplete for duplicate detection
 */

const pool = require('../db');
const https = require('https');

/**
 * Soundex Algorithm - Phonetic algorithm for indexing names by sound
 * Used for fuzzy name matching (e.g., "Jon" finds "John", "Micheal" finds "Michael")
 * @param {string} str - Input string
 * @returns {string} Soundex code
 */
function soundex(str) {
  if (!str || typeof str !== 'string') return '';

  // Convert to uppercase and remove non-alpha characters
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 0) return '';

  // Soundex coding map
  const codes = {
    B: 1, F: 1, P: 1, V: 1,
    C: 2, G: 2, J: 2, K: 2, Q: 2, S: 2, X: 2, Z: 2,
    D: 3, T: 3,
    L: 4,
    M: 5, N: 5,
    R: 6
  };

  // Keep first letter
  let result = s[0];
  let prevCode = codes[s[0]] || 0;

  // Process remaining characters
  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = codes[s[i]];
    if (code && code !== prevCode) {
      result += code;
    }
    prevCode = code || 0;
  }

  // Pad with zeros to ensure 4 character result
  return (result + '000').slice(0, 4);
}

/**
 * Levenshtein distance - Measures similarity between two strings
 * Used for fuzzy matching
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function levenshtein(a, b) {
  if (!a || !b) return Math.max((a || '').length, (b || '').length);

  const m = a.length;
  const n = b.length;

  // Create matrix
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // Initialize base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Common name variations mapping for fuzzy matching
 */
const NAME_VARIATIONS = {
  // First names - common variations
  'jon': ['john', 'jonathan', 'jonathon'],
  'john': ['jon', 'jonathan', 'jonathon', 'johnny'],
  'mike': ['michael', 'micheal', 'mick', 'mikey'],
  'michael': ['mike', 'micheal', 'mick', 'mikey'],
  'micheal': ['michael', 'mike'],
  'chris': ['christopher', 'kristopher', 'christian', 'kris'],
  'christopher': ['chris', 'kristopher', 'christian'],
  'matt': ['matthew', 'mathew', 'matty'],
  'matthew': ['matt', 'mathew', 'matty'],
  'dan': ['daniel', 'danny', 'danial'],
  'daniel': ['dan', 'danny', 'danial'],
  'dave': ['david', 'davey', 'davy'],
  'david': ['dave', 'davey', 'davy'],
  'jim': ['james', 'jimmy', 'jamie'],
  'james': ['jim', 'jimmy', 'jamie'],
  'bob': ['robert', 'bobby', 'rob', 'robbie'],
  'robert': ['bob', 'bobby', 'rob', 'robbie'],
  'will': ['william', 'willy', 'bill', 'billy'],
  'william': ['will', 'willy', 'bill', 'billy'],
  'bill': ['william', 'will', 'billy'],
  'tom': ['thomas', 'tommy'],
  'thomas': ['tom', 'tommy'],
  'steve': ['steven', 'stephen', 'stevie'],
  'steven': ['steve', 'stephen', 'stevie'],
  'stephen': ['steve', 'steven', 'stevie'],
  'joe': ['joseph', 'joey'],
  'joseph': ['joe', 'joey'],
  'nick': ['nicholas', 'nicolas', 'nicky'],
  'nicholas': ['nick', 'nicolas', 'nicky'],
  'alex': ['alexander', 'alexandra', 'alexis'],
  'alexander': ['alex', 'xander'],
  'kate': ['katherine', 'catherine', 'kathryn', 'kathy', 'katie'],
  'katherine': ['kate', 'kathy', 'katie', 'catherine', 'kathryn'],
  'catherine': ['kate', 'kathy', 'katie', 'katherine', 'kathryn'],
  'jen': ['jennifer', 'jenny', 'jenna'],
  'jennifer': ['jen', 'jenny', 'jenna'],
  'liz': ['elizabeth', 'lizzy', 'beth', 'betty'],
  'elizabeth': ['liz', 'lizzy', 'beth', 'betty', 'eliza'],
  'sam': ['samuel', 'samantha', 'sammy'],
  'samuel': ['sam', 'sammy'],
  'samantha': ['sam', 'sammy'],
  'ben': ['benjamin', 'benny'],
  'benjamin': ['ben', 'benny'],
  'tony': ['anthony', 'antony'],
  'anthony': ['tony', 'antony'],
  'ed': ['edward', 'eddie', 'edwin'],
  'edward': ['ed', 'eddie', 'edwin', 'ted'],
  'rick': ['richard', 'ricky', 'dick'],
  'richard': ['rick', 'ricky', 'dick', 'rich'],
  'pat': ['patrick', 'patricia', 'patty'],
  'patrick': ['pat', 'patty', 'paddy'],
  'sue': ['susan', 'susanne', 'susie'],
  'susan': ['sue', 'susie', 'susanne'],
  'meg': ['margaret', 'megan', 'maggie'],
  'margaret': ['meg', 'maggie', 'peggy'],
  // Last names - common misspellings
  'macdonald': ['mcdonald', 'mcdonnell', 'macdonnell'],
  'mcdonald': ['macdonald', 'mcdonnell', 'macdonnell'],
  'smith': ['smyth', 'smithe'],
  'smyth': ['smith', 'smithe'],
  'johnson': ['johnston', 'johnstone'],
  'johnston': ['johnson', 'johnstone'],
  'thompson': ['thomson', 'thompsen'],
  'thomson': ['thompson', 'thompsen'],
  'anderson': ['andersen', 'andreson'],
  'andersen': ['anderson', 'andreson'],
  'peterson': ['petersen', 'petersson'],
  'petersen': ['peterson', 'petersson'],
};

class LookupService {
  /**
   * Search Canadian cities by name
   * @param {string} query - Search query
   * @param {string} provinceCode - Optional province filter (ON, QC, BC, etc.)
   * @param {number} limit - Max results (default 10)
   * @returns {Promise<Array>} Matching cities sorted by population
   */
  static async searchCities(query, provinceCode = null, limit = 10) {
    if (!query || query.length < 2) {
      return [];
    }

    const searchPattern = `${query}%`;
    const params = [searchPattern, limit];
    let provinceFilter = '';

    if (provinceCode) {
      provinceFilter = 'AND province_code = $3';
      params.push(provinceCode.toUpperCase());
    }

    const result = await pool.query(`
      SELECT
        id,
        city_name,
        province_code,
        province_name,
        population,
        latitude,
        longitude
      FROM canadian_cities
      WHERE LOWER(city_name) LIKE LOWER($1)
      ${provinceFilter}
      ORDER BY population DESC, city_name ASC
      LIMIT $2
    `, params);

    return result.rows;
  }

  /**
   * Get all provinces
   * @returns {Promise<Array>} List of provinces
   */
  static async getProvinces() {
    const result = await pool.query(`
      SELECT DISTINCT
        province_code,
        province_name,
        COUNT(*) as city_count
      FROM canadian_cities
      GROUP BY province_code, province_name
      ORDER BY province_name
    `);

    return result.rows;
  }

  /**
   * Lookup postal code - checks cache first, then calls Geocoder.ca API
   * @param {string} postalCode - Canadian postal code (e.g., M5H 2N2)
   * @returns {Promise<Object|null>} Location data or null
   */
  static async lookupPostalCode(postalCode) {
    if (!postalCode) return null;

    // Normalize postal code (remove spaces, uppercase)
    const normalized = postalCode.replace(/\s/g, '').toUpperCase();

    // Validate format (Canadian postal code: A1A1A1)
    if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(normalized)) {
      return null;
    }

    // Format with space for display
    const formatted = `${normalized.slice(0, 3)} ${normalized.slice(3)}`;

    // Check cache first
    const cached = await this.getPostalCodeFromCache(formatted);
    if (cached) {
      // Update usage stats
      await this.updatePostalCodeUsage(formatted);
      return cached;
    }

    // Fetch from Geocoder.ca API
    const apiResult = await this.fetchFromGeocoderApi(formatted);

    if (apiResult) {
      // Cache the result
      await this.cachePostalCode(formatted, apiResult);
      return apiResult;
    }

    return null;
  }

  /**
   * Get postal code from cache
   * @private
   */
  static async getPostalCodeFromCache(postalCode) {
    const result = await pool.query(`
      SELECT
        postal_code,
        city,
        province_code,
        province_name,
        latitude,
        longitude
      FROM postal_code_cache
      WHERE postal_code = $1
    `, [postalCode]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Update postal code usage stats
   * @private
   */
  static async updatePostalCodeUsage(postalCode) {
    await pool.query(`
      UPDATE postal_code_cache
      SET lookup_count = lookup_count + 1, last_used_at = NOW()
      WHERE postal_code = $1
    `, [postalCode]);
  }

  /**
   * Cache a postal code result
   * @private
   */
  static async cachePostalCode(postalCode, data) {
    try {
      await pool.query(`
        INSERT INTO postal_code_cache (postal_code, city, province_code, province_name, latitude, longitude)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (postal_code) DO UPDATE SET
          city = EXCLUDED.city,
          province_code = EXCLUDED.province_code,
          province_name = EXCLUDED.province_name,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          lookup_count = postal_code_cache.lookup_count + 1,
          last_used_at = NOW()
      `, [
        postalCode,
        data.city,
        data.province_code,
        data.province_name,
        data.latitude,
        data.longitude
      ]);
    } catch (err) {
      console.error('Error caching postal code:', err.message);
    }
  }

  /**
   * Fetch postal code data from Geocoder.ca API
   * @private
   */
  static fetchFromGeocoderApi(postalCode) {
    return new Promise((resolve) => {
      const url = `https://geocoder.ca/?postal=${encodeURIComponent(postalCode)}&geoit=XML&json=1`;

      const req = https.get(url, { timeout: 5000 }, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const json = JSON.parse(data);

            if (json.error) {
              resolve(null);
              return;
            }

            // Map province abbreviations to full names
            const provinceNames = {
              'ON': 'Ontario',
              'QC': 'Quebec',
              'BC': 'British Columbia',
              'AB': 'Alberta',
              'MB': 'Manitoba',
              'SK': 'Saskatchewan',
              'NS': 'Nova Scotia',
              'NB': 'New Brunswick',
              'NL': 'Newfoundland and Labrador',
              'PE': 'Prince Edward Island',
              'NT': 'Northwest Territories',
              'YT': 'Yukon',
              'NU': 'Nunavut'
            };

            const provinceCode = json.prov || json.standard?.prov || '';
            const provinceName = provinceNames[provinceCode] || provinceCode;

            resolve({
              postal_code: postalCode,
              city: json.city || json.standard?.city || '',
              province_code: provinceCode,
              province_name: provinceName,
              latitude: parseFloat(json.latt) || null,
              longitude: parseFloat(json.longt) || null
            });
          } catch (err) {
            console.error('Error parsing Geocoder.ca response:', err.message);
            resolve(null);
          }
        });
      });

      req.on('error', (err) => {
        console.error('Geocoder.ca API error:', err.message);
        resolve(null);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  /**
   * Search common Canadian names
   * @param {string} query - Search query
   * @param {string} type - 'first', 'last', or null for both
   * @param {number} limit - Max results (default 10)
   * @returns {Promise<Array>} Matching names sorted by frequency
   */
  static async searchNames(query, type = null, limit = 10) {
    if (!query || query.length < 2) {
      return [];
    }

    const searchPattern = `${query}%`;
    const params = [searchPattern, limit];
    let typeFilter = '';

    if (type === 'first' || type === 'last') {
      typeFilter = 'AND name_type = $3';
      params.push(type);
    }

    const result = await pool.query(`
      SELECT
        id,
        name,
        name_type,
        frequency
      FROM canadian_names
      WHERE LOWER(name) LIKE LOWER($1)
      ${typeFilter}
      ORDER BY frequency DESC, name ASC
      LIMIT $2
    `, params);

    return result.rows;
  }

  /**
   * Search existing customers for autocomplete/duplicate detection
   * @param {string} query - Search query (searches name, email, company, phone)
   * @param {number} limit - Max results (default 5)
   * @returns {Promise<Array>} Matching customers
   */
  static async searchCustomers(query, limit = 5) {
    if (!query || query.length < 2) {
      return [];
    }

    const searchPattern = `%${query}%`;

    const result = await pool.query(`
      SELECT
        id,
        name,
        email,
        phone,
        company,
        city,
        province
      FROM customers
      WHERE
        LOWER(name) LIKE LOWER($1)
        OR LOWER(email) LIKE LOWER($1)
        OR LOWER(company) LIKE LOWER($1)
        OR phone LIKE $1
      ORDER BY
        CASE WHEN LOWER(name) LIKE LOWER($1) THEN 0 ELSE 1 END,
        name ASC
      LIMIT $2
    `, [searchPattern, limit]);

    return result.rows;
  }

  /**
   * Find potential duplicate customers
   * @param {Object} customerData - Customer data to check
   * @returns {Promise<Array>} Potential duplicates with match scores
   */
  static async findPotentialDuplicates(customerData) {
    const { name, email, phone, company } = customerData;
    const duplicates = [];

    // Check by email (exact match)
    if (email) {
      const emailMatch = await pool.query(`
        SELECT id, name, email, phone, company
        FROM customers
        WHERE LOWER(email) = LOWER($1)
      `, [email]);

      emailMatch.rows.forEach(row => {
        duplicates.push({ ...row, matchType: 'email', confidence: 'high' });
      });
    }

    // Check by phone (exact match)
    if (phone) {
      const phoneMatch = await pool.query(`
        SELECT id, name, email, phone, company
        FROM customers
        WHERE phone = $1
        AND id NOT IN (SELECT UNNEST($2::int[]))
      `, [phone, duplicates.map(d => d.id)]);

      phoneMatch.rows.forEach(row => {
        duplicates.push({ ...row, matchType: 'phone', confidence: 'high' });
      });
    }

    // Check by name (fuzzy match)
    if (name && name.length >= 3) {
      const nameMatch = await pool.query(`
        SELECT id, name, email, phone, company
        FROM customers
        WHERE
          LOWER(name) LIKE LOWER($1)
          AND id NOT IN (SELECT UNNEST($2::int[]))
        LIMIT 5
      `, [`%${name}%`, duplicates.map(d => d.id)]);

      nameMatch.rows.forEach(row => {
        duplicates.push({ ...row, matchType: 'name', confidence: 'medium' });
      });
    }

    // Check by company (fuzzy match)
    if (company && company.length >= 3) {
      const companyMatch = await pool.query(`
        SELECT id, name, email, phone, company
        FROM customers
        WHERE
          LOWER(company) LIKE LOWER($1)
          AND id NOT IN (SELECT UNNEST($2::int[]))
        LIMIT 3
      `, [`%${company}%`, duplicates.map(d => d.id)]);

      companyMatch.rows.forEach(row => {
        duplicates.push({ ...row, matchType: 'company', confidence: 'low' });
      });
    }

    return duplicates;
  }

  /**
   * Get frequently used postal codes
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Most used postal codes
   */
  static async getFrequentPostalCodes(limit = 10) {
    const result = await pool.query(`
      SELECT
        postal_code,
        city,
        province_code,
        province_name,
        lookup_count
      FROM postal_code_cache
      ORDER BY lookup_count DESC, last_used_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Fuzzy search names with phonetic matching
   * Finds names that sound similar (e.g., "Jon" finds "John", "Micheal" finds "Michael")
   *
   * @param {string} query - Search query
   * @param {string} type - 'first', 'last', or null for both
   * @param {number} limit - Max results (default 15)
   * @returns {Promise<Array>} Matching names with relevance scores
   */
  static async fuzzySearchNames(query, type = null, limit = 15) {
    if (!query || query.length < 1) {
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    const querySoundex = soundex(normalizedQuery);

    // Get known variations for the query
    const variations = NAME_VARIATIONS[normalizedQuery] || [];

    // Build search patterns
    const exactPattern = `${normalizedQuery}%`;
    const containsPattern = `%${normalizedQuery}%`;

    // Build type filter
    let typeFilter = '';
    const params = [exactPattern, containsPattern, limit * 2]; // Get more results for scoring
    let paramIndex = 4;

    if (type === 'first' || type === 'last') {
      typeFilter = `AND name_type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    // Query database for potential matches
    const result = await pool.query(`
      SELECT
        id,
        name,
        name_type,
        frequency
      FROM canadian_names
      WHERE (
        LOWER(name) LIKE $1
        OR LOWER(name) LIKE $2
      )
      ${typeFilter}
      ORDER BY
        CASE WHEN LOWER(name) LIKE $1 THEN 0 ELSE 1 END,
        frequency DESC,
        name ASC
      LIMIT $3
    `, params);

    let matches = result.rows.map(row => {
      const nameLower = row.name.toLowerCase();
      let score = 0;
      let matchType = 'partial';

      // Exact match
      if (nameLower === normalizedQuery) {
        score = 100;
        matchType = 'exact';
      }
      // Starts with query
      else if (nameLower.startsWith(normalizedQuery)) {
        score = 80 + (normalizedQuery.length / nameLower.length) * 15;
        matchType = 'prefix';
      }
      // Known variation
      else if (variations.includes(nameLower)) {
        score = 75;
        matchType = 'variation';
      }
      // Soundex match (phonetic similarity)
      else if (soundex(nameLower) === querySoundex) {
        score = 65;
        matchType = 'phonetic';
      }
      // Contains query
      else if (nameLower.includes(normalizedQuery)) {
        score = 50 + (normalizedQuery.length / nameLower.length) * 10;
        matchType = 'contains';
      }
      // Levenshtein distance (edit distance)
      else {
        const distance = levenshtein(normalizedQuery, nameLower);
        const maxLen = Math.max(normalizedQuery.length, nameLower.length);
        const similarity = 1 - (distance / maxLen);
        score = similarity * 40;
        matchType = 'fuzzy';
      }

      // Boost by frequency (popular names rank higher)
      const frequencyBoost = Math.min(row.frequency / 100, 10);
      score += frequencyBoost;

      return {
        ...row,
        score: Math.round(score * 10) / 10,
        matchType
      };
    });

    // Also search for known variations that might not be in results
    if (variations.length > 0) {
      const variationParams = variations.map((_, i) => `$${i + 1}`).join(', ');
      const variationQuery = await pool.query(`
        SELECT
          id,
          name,
          name_type,
          frequency
        FROM canadian_names
        WHERE LOWER(name) IN (${variationParams})
        ${type ? `AND name_type = $${variations.length + 1}` : ''}
        ORDER BY frequency DESC
        LIMIT 10
      `, type ? [...variations, type] : variations);

      // Add variations not already in matches
      const existingNames = new Set(matches.map(m => m.name.toLowerCase()));
      variationQuery.rows.forEach(row => {
        if (!existingNames.has(row.name.toLowerCase())) {
          matches.push({
            ...row,
            score: 70, // High score for known variations
            matchType: 'variation'
          });
        }
      });
    }

    // Sort by score descending, then by frequency
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.frequency - a.frequency;
    });

    // Return top results
    return matches.slice(0, limit);
  }

  /**
   * Get popular first names for quick pick buttons
   * @param {number} limit - Number of names to return (default 5)
   * @returns {Promise<Array>} Most popular first names
   */
  static async getPopularFirstNames(limit = 5) {
    const result = await pool.query(`
      SELECT name, frequency
      FROM canadian_names
      WHERE name_type = 'first'
      ORDER BY frequency DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(r => r.name);
  }

  /**
   * Get popular last names for quick pick buttons
   * @param {number} limit - Number of names to return (default 5)
   * @returns {Promise<Array>} Most popular last names
   */
  static async getPopularLastNames(limit = 5) {
    const result = await pool.query(`
      SELECT name, frequency
      FROM canadian_names
      WHERE name_type = 'last'
      ORDER BY frequency DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(r => r.name);
  }

  /**
   * Get company suggestions from existing customers
   * @param {string} query - Search query
   * @param {number} limit - Max results (default 10)
   * @returns {Promise<Array>} Matching company names
   */
  static async searchCompanies(query, limit = 10) {
    if (!query || query.length < 2) {
      return [];
    }

    const searchPattern = `%${query}%`;

    const result = await pool.query(`
      SELECT DISTINCT company
      FROM customers
      WHERE company IS NOT NULL
        AND company != ''
        AND LOWER(company) LIKE LOWER($1)
      ORDER BY company ASC
      LIMIT $2
    `, [searchPattern, limit]);

    return result.rows.map(r => r.company);
  }

  /**
   * Save a new name to the canadian_names table if it doesn't exist
   * Used to learn new names from customer entries
   * @param {string} name - The name to save
   * @param {string} type - 'first' or 'last'
   * @returns {Promise<boolean>} True if name was saved, false if already exists
   */
  static async saveNewName(name, type) {
    if (!name || name.length < 2 || !['first', 'last'].includes(type)) {
      return false;
    }

    // Normalize the name (capitalize first letter, lowercase rest)
    const normalized = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

    try {
      // Check if name already exists
      const existing = await pool.query(`
        SELECT id FROM canadian_names
        WHERE LOWER(name) = LOWER($1) AND name_type = $2
      `, [normalized, type]);

      if (existing.rows.length > 0) {
        // Name exists - increment frequency
        await pool.query(`
          UPDATE canadian_names
          SET frequency = frequency + 1
          WHERE LOWER(name) = LOWER($1) AND name_type = $2
        `, [normalized, type]);
        return false;
      }

      // Insert new name with low initial frequency (new names start at 1)
      await pool.query(`
        INSERT INTO canadian_names (name, name_type, frequency)
        VALUES ($1, $2, 1)
      `, [normalized, type]);

      console.log(`[LookupService] Saved new ${type} name: ${normalized}`);
      return true;
    } catch (err) {
      // Ignore duplicate key errors (race condition)
      if (err.code === '23505') {
        return false;
      }
      console.error(`[LookupService] Error saving name ${normalized}:`, err.message);
      return false;
    }
  }

  /**
   * Save first and last names from a customer entry
   * @param {string} fullName - Full customer name (e.g., "John Smith")
   * @returns {Promise<{firstName: boolean, lastName: boolean}>} Results
   */
  static async saveNamesFromCustomer(fullName) {
    if (!fullName) {
      return { firstName: false, lastName: false };
    }

    // Split the name into parts
    const parts = fullName.trim().split(/\s+/);

    if (parts.length === 0) {
      return { firstName: false, lastName: false };
    }

    const firstName = parts[0];
    const lastName = parts.length > 1 ? parts[parts.length - 1] : null;

    const results = {
      firstName: await this.saveNewName(firstName, 'first'),
      lastName: lastName ? await this.saveNewName(lastName, 'last') : false
    };

    return results;
  }
}

module.exports = LookupService;
