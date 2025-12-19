/**
 * Company Configuration
 *
 * This file contains all company-specific information used throughout the app.
 * Update these values to match your business details.
 *
 * For production, these can be overridden via environment variables:
 * REACT_APP_COMPANY_NAME, REACT_APP_COMPANY_ADDRESS, etc.
 */

const companyConfig = {
  // Company Identity
  name: process.env.REACT_APP_COMPANY_NAME || 'Your Company Name',
  legalName: process.env.REACT_APP_COMPANY_LEGAL_NAME || 'Your Company Name Inc.',

  // Address
  address: {
    street: process.env.REACT_APP_COMPANY_STREET || '123 Business Street',
    city: process.env.REACT_APP_COMPANY_CITY || 'Toronto',
    province: process.env.REACT_APP_COMPANY_PROVINCE || 'ON',
    postalCode: process.env.REACT_APP_COMPANY_POSTAL || 'M5H 2N2',
    country: process.env.REACT_APP_COMPANY_COUNTRY || 'Canada'
  },

  // Contact Information
  contact: {
    phone: process.env.REACT_APP_COMPANY_PHONE || '(416) 555-1234',
    email: process.env.REACT_APP_COMPANY_EMAIL || 'info@yourcompany.ca',
    website: process.env.REACT_APP_COMPANY_WEBSITE || 'www.yourcompany.ca',
    fax: process.env.REACT_APP_COMPANY_FAX || ''
  },

  // Business Information
  business: {
    hstNumber: process.env.REACT_APP_HST_NUMBER || '',
    businessNumber: process.env.REACT_APP_BUSINESS_NUMBER || ''
  },

  // Tax Configuration
  tax: {
    defaultRate: parseFloat(process.env.REACT_APP_TAX_RATE) || 0.13, // 13% HST
    taxName: process.env.REACT_APP_TAX_NAME || 'HST',
    includeTax: process.env.REACT_APP_INCLUDE_TAX === 'true'
  },

  // Quote Settings
  quotes: {
    defaultValidityDays: parseInt(process.env.REACT_APP_QUOTE_VALIDITY_DAYS) || 14,
    defaultTerms: process.env.REACT_APP_DEFAULT_TERMS ||
      'Payment due within 30 days of acceptance. All prices in CAD. Prices and availability subject to change without notice. Delivery times are estimates only.',
    prefix: process.env.REACT_APP_QUOTE_PREFIX || 'QT'
  },

  // Payment Methods Accepted
  paymentMethods: [
    'Cash',
    'Debit',
    'Credit Card (Visa, MasterCard, Amex)',
    'E-Transfer',
    'Cheque',
    'Financing (subject to approval)'
  ],

  // Logo (base64 or URL)
  // To add a logo, convert your logo image to base64 and paste here
  // Or provide a URL if hosted externally
  logo: {
    base64: process.env.REACT_APP_LOGO_BASE64 || null,
    url: process.env.REACT_APP_LOGO_URL || null,
    width: 30, // mm
    height: 20 // mm
  },

  // PDF Branding Colors
  branding: {
    primaryColor: [102, 126, 234], // RGB - Blue
    secondaryColor: [118, 75, 162], // RGB - Purple
    accentColor: [16, 185, 129], // RGB - Green
    headerTextColor: [255, 255, 255], // RGB - White
    warningColor: [220, 38, 38], // RGB - Red
    cautionColor: [234, 179, 8] // RGB - Yellow
  }
};

// Helper function to get formatted address
export const getFormattedAddress = () => {
  const { street, city, province, postalCode } = companyConfig.address;
  return `${street}, ${city}, ${province} ${postalCode}`;
};

// Helper function to get single line address
export const getAddressLine = () => {
  const { street, city, province, postalCode } = companyConfig.address;
  return `${city}, ${province} ${postalCode}`;
};

// Helper to format customer address
export const formatCustomerAddress = (customer) => {
  if (!customer) return null;

  const parts = [];
  if (customer.address) parts.push(customer.address);
  if (customer.city || customer.province || customer.postal_code) {
    const cityLine = [
      customer.city,
      customer.province,
      customer.postal_code
    ].filter(Boolean).join(', ');
    if (cityLine) parts.push(cityLine);
  }

  return parts.length > 0 ? parts : null;
};

export default companyConfig;
