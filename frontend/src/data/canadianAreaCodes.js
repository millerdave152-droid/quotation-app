/**
 * Canadian Area Codes Database
 * Organized by province/region with city descriptions
 * Used for phone number entry with area code dropdown
 */

export const canadianAreaCodes = [
  // Ontario - Toronto & GTA
  { code: '416', city: 'Toronto', region: 'Downtown Toronto', province: 'ON' },
  { code: '647', city: 'Toronto', region: 'Toronto (Overlay)', province: 'ON' },
  { code: '437', city: 'Toronto', region: 'Toronto (New)', province: 'ON' },
  { code: '905', city: 'GTA', region: 'Mississauga/Brampton/Hamilton', province: 'ON' },
  { code: '289', city: 'GTA', region: 'GTA (Overlay)', province: 'ON' },
  { code: '365', city: 'GTA', region: 'GTA (New)', province: 'ON' },

  // Ontario - Other regions
  { code: '519', city: 'London', region: 'London/Windsor/Kitchener', province: 'ON' },
  { code: '226', city: 'Southwestern ON', region: 'Southwestern Ontario (Overlay)', province: 'ON' },
  { code: '548', city: 'Southwestern ON', region: 'Southwestern Ontario (New)', province: 'ON' },
  { code: '613', city: 'Ottawa', region: 'Ottawa/Kingston', province: 'ON' },
  { code: '343', city: 'Ottawa', region: 'Ottawa (Overlay)', province: 'ON' },
  { code: '705', city: 'Northern ON', region: 'Barrie/Sudbury/North Bay', province: 'ON' },
  { code: '249', city: 'Northern ON', region: 'Northern Ontario (Overlay)', province: 'ON' },
  { code: '807', city: 'Thunder Bay', region: 'Thunder Bay/NW Ontario', province: 'ON' },
  { code: '382', city: 'Northern ON', region: 'Northern Ontario (New)', province: 'ON' },

  // Quebec
  { code: '514', city: 'Montreal', region: 'Montreal', province: 'QC' },
  { code: '438', city: 'Montreal', region: 'Montreal (Overlay)', province: 'QC' },
  { code: '450', city: 'Montreal Suburbs', region: 'Laval/South Shore', province: 'QC' },
  { code: '579', city: 'Montreal Suburbs', region: 'Montreal Suburbs (Overlay)', province: 'QC' },
  { code: '418', city: 'Quebec City', region: 'Quebec City/Eastern QC', province: 'QC' },
  { code: '581', city: 'Quebec City', region: 'Quebec City (Overlay)', province: 'QC' },
  { code: '819', city: 'Sherbrooke', region: 'Sherbrooke/Gatineau', province: 'QC' },
  { code: '873', city: 'Sherbrooke', region: 'Sherbrooke/Gatineau (Overlay)', province: 'QC' },

  // British Columbia
  { code: '604', city: 'Vancouver', region: 'Vancouver/Lower Mainland', province: 'BC' },
  { code: '778', city: 'Vancouver', region: 'BC (Overlay)', province: 'BC' },
  { code: '236', city: 'Vancouver', region: 'BC (New)', province: 'BC' },
  { code: '250', city: 'Victoria', region: 'Victoria/Interior BC', province: 'BC' },
  { code: '672', city: 'BC Interior', region: 'BC Interior (Overlay)', province: 'BC' },

  // Alberta
  { code: '403', city: 'Calgary', region: 'Calgary/Southern Alberta', province: 'AB' },
  { code: '587', city: 'Calgary', region: 'Alberta (Overlay)', province: 'AB' },
  { code: '825', city: 'Calgary', region: 'Alberta (New)', province: 'AB' },
  { code: '780', city: 'Edmonton', region: 'Edmonton/Northern Alberta', province: 'AB' },
  { code: '368', city: 'Alberta', region: 'Alberta (New)', province: 'AB' },

  // Saskatchewan
  { code: '306', city: 'Saskatchewan', region: 'All Saskatchewan', province: 'SK' },
  { code: '639', city: 'Saskatchewan', region: 'Saskatchewan (Overlay)', province: 'SK' },

  // Manitoba
  { code: '204', city: 'Manitoba', region: 'All Manitoba', province: 'MB' },
  { code: '431', city: 'Manitoba', region: 'Manitoba (Overlay)', province: 'MB' },

  // Atlantic Provinces
  { code: '506', city: 'New Brunswick', region: 'All New Brunswick', province: 'NB' },
  { code: '902', city: 'Nova Scotia', region: 'Nova Scotia/PEI', province: 'NS/PE' },
  { code: '782', city: 'Nova Scotia', region: 'Nova Scotia/PEI (Overlay)', province: 'NS/PE' },
  { code: '709', city: 'Newfoundland', region: 'Newfoundland & Labrador', province: 'NL' },
  { code: '879', city: 'Newfoundland', region: 'Newfoundland (Overlay)', province: 'NL' },

  // Territories
  { code: '867', city: 'Territories', region: 'Yukon/NWT/Nunavut', province: 'YT/NT/NU' },
];

/**
 * Get area code display label
 * @param {Object} areaCode - Area code object
 * @returns {string} Formatted display label
 */
export const getAreaCodeLabel = (areaCode) => {
  return `${areaCode.code} - ${areaCode.city}`;
};

/**
 * Get area code full description
 * @param {Object} areaCode - Area code object
 * @returns {string} Full description with region
 */
export const getAreaCodeDescription = (areaCode) => {
  return `${areaCode.code} - ${areaCode.region}`;
};

/**
 * Search area codes by code, city, or region
 * @param {string} query - Search query
 * @returns {Array} Matching area codes
 */
export const searchAreaCodes = (query) => {
  if (!query) return canadianAreaCodes;

  const lowerQuery = query.toLowerCase().trim();
  return canadianAreaCodes.filter(ac =>
    ac.code.includes(lowerQuery) ||
    ac.city.toLowerCase().includes(lowerQuery) ||
    ac.region.toLowerCase().includes(lowerQuery) ||
    ac.province.toLowerCase().includes(lowerQuery)
  );
};

/**
 * Find area code by code string
 * @param {string} code - Area code (e.g., "416")
 * @returns {Object|null} Area code object or null
 */
export const findAreaCodeByCode = (code) => {
  return canadianAreaCodes.find(ac => ac.code === code) || null;
};

/**
 * Popular area codes (shown first in dropdown)
 */
export const popularAreaCodes = ['416', '647', '905', '289', '514', '604', '403', '780'];

/**
 * Get sorted area codes with popular ones first
 * @returns {Array} Sorted area codes
 */
export const getSortedAreaCodes = () => {
  const popular = canadianAreaCodes.filter(ac => popularAreaCodes.includes(ac.code));
  const others = canadianAreaCodes.filter(ac => !popularAreaCodes.includes(ac.code));
  return [...popular, ...others];
};

export default canadianAreaCodes;
