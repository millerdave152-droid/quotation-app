/**
 * TeleTime POS - E-Transfer API
 * API functions for e-transfer payment processing
 */

import api from './axios';

/**
 * Generate a unique e-transfer reference code
 * @returns {Promise<{ reference: string }>}
 */
export const generateReference = () => {
  return api.post('/pos-payments/etransfer/generate-reference');
};

/**
 * Email e-transfer instructions to customer
 * @param {object} params
 * @param {number} params.transactionId
 * @param {string} params.customerEmail
 * @param {string} params.reference
 * @param {number} params.amount
 * @returns {Promise<object>}
 */
export const emailInstructions = ({ transactionId, customerEmail, reference, amount }) => {
  return api.post('/pos-payments/etransfer/email-instructions', {
    transactionId,
    customerEmail,
    reference,
    amount,
  });
};
