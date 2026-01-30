/**
 * TeleTime POS - PDF Receipt Download
 * Downloads receipt as PDF via the backend ReceiptService
 */

import api from '../../api/axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Download a receipt PDF for a given transaction
 * @param {number} transactionId - Transaction ID
 * @param {string} transactionNumber - Transaction number for filename
 */
export async function downloadReceiptPdf(transactionId, transactionNumber) {
  const response = await fetch(`${API_BASE}/receipts/${transactionId}/pdf`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to generate PDF');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Receipt-${transactionNumber || transactionId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default downloadReceiptPdf;
