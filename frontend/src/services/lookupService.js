import { authFetch } from './authFetch';
/**
 * Lookup Service - Frontend API service for autocomplete lookups
 *
 * Provides methods for:
 * - Canadian cities search
 * - Postal code lookup
 * - Common names search
 * - Customer autocomplete
 */

const API_BASE = '/api';

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

/**
 * Search Canadian cities for autocomplete
 * @param {string} query - Search query
 * @param {string} province - Optional province filter (ON, QC, etc.)
 * @param {number} limit - Max results (default 10)
 * @returns {Promise<Array>} Matching cities
 */
export async function searchCities(query, province = null, limit = 10) {
  if (!query || query.length < 2) return [];

  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (province) params.append('province', province);

  const response = await authFetch(`${API_BASE}/lookup/cities?${params}`, {
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    throw new Error('Failed to search cities');
  }

  return response.json();
}

/**
 * Get list of all provinces
 * @returns {Promise<Array>} List of provinces
 */
export async function getProvinces() {
  const response = await authFetch(`${API_BASE}/lookup/provinces`, {
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    throw new Error('Failed to fetch provinces');
  }

  return response.json();
}

/**
 * Lookup postal code details
 * @param {string} postalCode - Canadian postal code (e.g., M5H 2N2)
 * @returns {Promise<Object|null>} Location data or null if not found
 */
export async function lookupPostalCode(postalCode) {
  if (!postalCode) return null;

  // Normalize postal code
  const normalized = postalCode.replace(/\s/g, '').toUpperCase();
  if (normalized.length !== 6) return null;

  try {
    const response = await authFetch(`${API_BASE}/lookup/postal-code/${normalized}`, {
      headers: getAuthHeaders()
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error('Failed to lookup postal code');
    }

    return response.json();
  } catch (err) {
    console.error('Postal code lookup error:', err);
    return null;
  }
}

/**
 * Search common Canadian names
 * @param {string} query - Search query
 * @param {string} type - 'first', 'last', or null for both
 * @param {number} limit - Max results (default 10)
 * @returns {Promise<Array>} Matching names
 */
export async function searchNames(query, type = null, limit = 10) {
  if (!query || query.length < 2) return [];

  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (type) params.append('type', type);

  const response = await authFetch(`${API_BASE}/lookup/names?${params}`, {
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    throw new Error('Failed to search names');
  }

  return response.json();
}

/**
 * Search existing customers for autocomplete (duplicate detection)
 * @param {string} query - Search query
 * @param {number} limit - Max results (default 5)
 * @returns {Promise<Array>} Matching customers
 */
export async function searchCustomers(query, limit = 5) {
  if (!query || query.length < 2) return [];

  const params = new URLSearchParams({ q: query, limit: String(limit) });

  const response = await authFetch(`${API_BASE}/customers/autocomplete?${params}`, {
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    throw new Error('Failed to search customers');
  }

  return response.json();
}

/**
 * Check for potential duplicate customers
 * @param {Object} customerData - { name, email, phone, company }
 * @returns {Promise<Object>} { hasDuplicates, duplicates }
 */
export async function checkDuplicates(customerData) {
  const response = await authFetch(`${API_BASE}/customers/check-duplicates`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(customerData)
  });

  if (!response.ok) {
    throw new Error('Failed to check duplicates');
  }

  return response.json();
}

/**
 * Get frequently used postal codes
 * @param {number} limit - Max results (default 10)
 * @returns {Promise<Array>} Most used postal codes
 */
export async function getFrequentPostalCodes(limit = 10) {
  const response = await authFetch(`${API_BASE}/lookup/frequent-postal-codes?limit=${limit}`, {
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    throw new Error('Failed to fetch frequent postal codes');
  }

  return response.json();
}

/**
 * Combined name search - searches both common names and existing customers
 * Used for the name autocomplete with duplicate detection
 * @param {string} query - Search query
 * @param {number} limit - Max results per category
 * @returns {Promise<Object>} { existingCustomers, suggestedNames }
 */
export async function searchNamesWithCustomers(query, limit = 5) {
  if (!query || query.length < 2) {
    return { existingCustomers: [], suggestedNames: [] };
  }

  // Fetch both in parallel
  const [customers, names] = await Promise.all([
    searchCustomers(query, limit).catch(() => []),
    searchNames(query, 'first', limit).catch(() => [])
  ]);

  return {
    existingCustomers: customers,
    suggestedNames: names
  };
}

/**
 * Fuzzy search names with phonetic matching
 * Finds names that sound similar (e.g., "Jon" finds "John", "Micheal" finds "Michael")
 * @param {string} query - Search query
 * @param {string} type - 'first', 'last', or null for both
 * @param {number} limit - Max results (default 15)
 * @returns {Promise<Array>} Matching names with scores
 */
export async function fuzzySearchNames(query, type = null, limit = 15) {
  if (!query || query.length < 1) return [];

  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (type) params.append('type', type);

  try {
    const response = await authFetch(`${API_BASE}/lookup/names/fuzzy?${params}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      // Fall back to regular search if fuzzy endpoint fails
      return searchNames(query, type, limit);
    }

    return response.json();
  } catch (err) {
    console.error('Fuzzy name search error:', err);
    // Fall back to regular search
    return searchNames(query, type, limit);
  }
}

/**
 * Get popular names for quick pick buttons
 * @param {string} type - 'first' or 'last'
 * @param {number} limit - Number of names (default 5)
 * @returns {Promise<Array>} Popular name strings
 */
export async function getPopularNames(type, limit = 5) {
  if (!type || (type !== 'first' && type !== 'last')) {
    return [];
  }

  try {
    const response = await authFetch(`${API_BASE}/lookup/names/popular?type=${type}&limit=${limit}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      // Return default popular names as fallback
      if (type === 'first') {
        return ['John', 'Michael', 'David', 'Chris', 'James'];
      } else {
        return ['Smith', 'Brown', 'Wilson', 'Taylor', 'Lee'];
      }
    }

    return response.json();
  } catch (err) {
    console.error('Get popular names error:', err);
    // Return default popular names as fallback
    if (type === 'first') {
      return ['John', 'Michael', 'David', 'Chris', 'James'];
    } else {
      return ['Smith', 'Brown', 'Wilson', 'Taylor', 'Lee'];
    }
  }
}

/**
 * Search company names from existing customers
 * @param {string} query - Search query
 * @param {number} limit - Max results (default 10)
 * @returns {Promise<Array>} Company name strings
 */
export async function searchCompanies(query, limit = 10) {
  if (!query || query.length < 2) return [];

  try {
    const response = await authFetch(`${API_BASE}/lookup/companies?q=${encodeURIComponent(query)}&limit=${limit}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      return [];
    }

    return response.json();
  } catch (err) {
    console.error('Search companies error:', err);
    return [];
  }
}

export default {
  searchCities,
  getProvinces,
  lookupPostalCode,
  searchNames,
  searchCustomers,
  checkDuplicates,
  getFrequentPostalCodes,
  searchNamesWithCustomers,
  fuzzySearchNames,
  getPopularNames,
  searchCompanies
};
