// Format currency consistently
export const formatCurrency = (amount) => 
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);

// Validate email
export const isValidEmail = (email) => 
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Format phone number
export const formatPhone = (phone) => {
  // Basic Canadian phone formatting
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
  }
  return phone;
};  