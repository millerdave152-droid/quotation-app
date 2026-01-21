/**
 * Common Email Domains List
 * Used for email entry with domain dropdown
 * Organized by category with popular domains first
 */

export const emailDomains = [
  // Popular Global Providers
  { domain: 'gmail.com', label: 'Gmail', category: 'popular' },
  { domain: 'yahoo.com', label: 'Yahoo', category: 'popular' },
  { domain: 'yahoo.ca', label: 'Yahoo Canada', category: 'popular' },
  { domain: 'hotmail.com', label: 'Hotmail', category: 'popular' },
  { domain: 'outlook.com', label: 'Outlook', category: 'popular' },
  { domain: 'icloud.com', label: 'iCloud', category: 'popular' },
  { domain: 'live.com', label: 'Live', category: 'popular' },
  { domain: 'msn.com', label: 'MSN', category: 'global' },
  { domain: 'aol.com', label: 'AOL', category: 'global' },
  { domain: 'protonmail.com', label: 'ProtonMail', category: 'global' },
  { domain: 'me.com', label: 'Apple Me', category: 'global' },
  { domain: 'mac.com', label: 'Apple Mac', category: 'global' },

  // Canadian ISP Providers
  { domain: 'bell.net', label: 'Bell', category: 'canadian' },
  { domain: 'sympatico.ca', label: 'Sympatico (Bell)', category: 'canadian' },
  { domain: 'rogers.com', label: 'Rogers', category: 'canadian' },
  { domain: 'shaw.ca', label: 'Shaw', category: 'canadian' },
  { domain: 'telus.net', label: 'Telus', category: 'canadian' },
  { domain: 'videotron.ca', label: 'Videotron', category: 'canadian' },
  { domain: 'cogeco.ca', label: 'Cogeco', category: 'canadian' },
  { domain: 'eastlink.ca', label: 'Eastlink', category: 'canadian' },
  { domain: 'sasktel.net', label: 'SaskTel', category: 'canadian' },
  { domain: 'mts.net', label: 'MTS', category: 'canadian' },

  // Business/Professional
  { domain: 'outlook.ca', label: 'Outlook Canada', category: 'business' },
  { domain: 'office365.com', label: 'Office 365', category: 'business' },
  { domain: 'zoho.com', label: 'Zoho', category: 'business' },
];

/**
 * Get domain display label
 * @param {Object} domainObj - Domain object
 * @returns {string} Domain string
 */
export const getDomainLabel = (domainObj) => {
  return domainObj.domain;
};

/**
 * Search domains by domain name or label
 * @param {string} query - Search query
 * @returns {Array} Matching domains
 */
export const searchDomains = (query) => {
  if (!query) return emailDomains;

  const lowerQuery = query.toLowerCase().trim();
  return emailDomains.filter(d =>
    d.domain.toLowerCase().includes(lowerQuery) ||
    d.label.toLowerCase().includes(lowerQuery)
  );
};

/**
 * Find domain by domain string
 * @param {string} domain - Domain string (e.g., "gmail.com")
 * @returns {Object|null} Domain object or null
 */
export const findDomainByName = (domain) => {
  if (!domain) return null;
  return emailDomains.find(d => d.domain.toLowerCase() === domain.toLowerCase()) || null;
};

/**
 * Popular domains (shown first in dropdown)
 */
export const popularDomains = [
  'gmail.com',
  'yahoo.com',
  'yahoo.ca',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'live.com',
  'bell.net',
  'rogers.com',
  'shaw.ca',
  'sympatico.ca'
];

/**
 * Get sorted domains with popular ones first
 * @returns {Array} Sorted domain objects
 */
export const getSortedDomains = () => {
  const popular = emailDomains.filter(d => popularDomains.includes(d.domain));
  const others = emailDomains.filter(d => !popularDomains.includes(d.domain));
  return [...popular, ...others];
};

/**
 * Get domains grouped by category
 * @returns {Object} Domains grouped by category
 */
export const getDomainsByCategory = () => {
  return emailDomains.reduce((acc, domain) => {
    if (!acc[domain.category]) {
      acc[domain.category] = [];
    }
    acc[domain.category].push(domain);
    return acc;
  }, {});
};

export default emailDomains;
