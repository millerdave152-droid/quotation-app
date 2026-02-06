/**
 * TeleTime POS - Email Receipt Component
 * HTML email template for receipts
 */

import { formatCurrency, formatDate, formatTime, formatPhone } from '../../utils/formatters';
import { escapeHtml } from '../../utils/sanitize';

/**
 * Generate HTML email receipt
 * @param {object} transaction - Transaction data
 * @param {object} storeInfo - Store information
 * @returns {string} HTML email content
 */
export function generateEmailReceiptHtml(transaction, storeInfo = {}) {
  // Default store info
  const store = {
    name: 'TeleTime',
    address: '123 Main Street',
    city: 'Toronto, ON M5V 1A1',
    phone: '(416) 555-0123',
    email: 'support@teletime.ca',
    website: 'www.teletime.ca',
    logoUrl: null,
    ...storeInfo,
  };

  // Extract transaction data
  const txnNumber = transaction?.transactionNumber || transaction?.transaction_number || 'N/A';
  const txnDate = transaction?.createdAt || transaction?.created_at || new Date();
  const cashierName = transaction?.cashierName || transaction?.cashier_name || 'Staff';

  const customer = transaction?.customer;
  const customerName = customer?.customerName || customer?.customer_name || customer?.name || 'Valued Customer';
  const quoteNumber = transaction?.quoteNumber || transaction?.quote_number;

  const items = transaction?.items || [];
  const subtotal = transaction?.subtotal || 0;
  const discountAmount = transaction?.discountAmount || transaction?.discount_amount || 0;
  const discountReason = transaction?.discountReason || transaction?.discount_reason;
  const hstAmount = transaction?.hstAmount || transaction?.hst_amount || 0;
  const gstAmount = transaction?.gstAmount || transaction?.gst_amount || 0;
  const pstAmount = transaction?.pstAmount || transaction?.pst_amount || 0;
  const totalAmount = transaction?.totalAmount || transaction?.total_amount || 0;

  const payments = transaction?.payments || [];

  // Parse date
  const dateObj = txnDate instanceof Date ? txnDate : new Date(txnDate);

  // Generate items HTML (escape user-controllable data to prevent XSS)
  const itemsHtml = items.map((item) => {
    const qty = item.quantity || 1;
    const unitPrice = item.unitPrice || item.unit_price || item.price || 0;
    const discount = item.discountPercent || item.discount_percent || 0;
    const lineTotal = unitPrice * qty * (1 - discount / 100);
    const productName = escapeHtml(item.productName || item.product_name || item.name);

    return `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">
          <div style="font-weight: 500;">${qty > 1 ? `${qty} × ` : ''}${productName}</div>
          ${qty > 1 ? `<div style="color: #666; font-size: 12px;">@ ${formatCurrency(unitPrice)} each</div>` : ''}
          ${discount > 0 ? `<div style="color: #059669; font-size: 12px;">Discount: -${discount}%</div>` : ''}
        </td>
        <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #eee; white-space: nowrap;">
          ${formatCurrency(lineTotal)}
        </td>
      </tr>
    `;
  }).join('');

  // Generate payments HTML (escape user-controllable data to prevent XSS)
  const paymentsHtml = payments.map((payment) => {
    const method = payment.paymentMethod || payment.payment_method;
    const amount = payment.amount || 0;
    const lastFour = payment.cardLastFour || payment.card_last_four;
    const brand = payment.cardBrand || payment.card_brand;

    let methodDisplay = method?.charAt(0).toUpperCase() + method?.slice(1) || 'Payment';
    if (brand) methodDisplay = brand.charAt(0).toUpperCase() + brand.slice(1);
    if (lastFour) methodDisplay += ` ****${escapeHtml(lastFour)}`;

    return `
      <tr>
        <td style="padding: 4px 0;">${escapeHtml(methodDisplay)}</td>
        <td style="padding: 4px 0; text-align: right;">${formatCurrency(amount)}</td>
      </tr>
    `;
  }).join('');

  // Escape all user-controllable strings for XSS protection
  const safeStoreName = escapeHtml(store.name);
  const safeStoreAddress = escapeHtml(store.address);
  const safeStoreCity = escapeHtml(store.city);
  const safeStoreEmail = escapeHtml(store.email);
  const safeStoreWebsite = escapeHtml(store.website);
  const safeTxnNumber = escapeHtml(txnNumber);
  const safeCashierName = escapeHtml(cashierName);
  const safeCustomerName = escapeHtml(customerName);
  const safeQuoteNumber = escapeHtml(quoteNumber);
  const safeDiscountReason = escapeHtml(discountReason);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt from ${safeStoreName} - ${safeTxnNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: #2563eb; padding: 30px; text-align: center;">
              ${store.logoUrl
                ? `<img src="${escapeHtml(store.logoUrl)}" alt="${safeStoreName}" style="height: 50px; margin-bottom: 10px;">`
                : `<h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold;">${safeStoreName}</h1>`
              }
              <p style="margin: 10px 0 0; color: #bfdbfe; font-size: 14px;">Your Receipt</p>
            </td>
          </tr>

          <!-- Thank You Message -->
          <tr>
            <td style="padding: 30px 30px 20px;">
              <h2 style="margin: 0 0 10px; color: #111827; font-size: 24px;">Thank you, ${safeCustomerName}!</h2>
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Here's your receipt for your purchase on ${formatDate(dateObj)}.
              </p>
            </td>
          </tr>

          <!-- Transaction Info -->
          <tr>
            <td style="padding: 0 30px 20px;">
              <table width="100%" style="background-color: #f9fafb; border-radius: 8px; padding: 15px;">
                <tr>
                  <td style="padding: 5px 15px;">
                    <div style="color: #6b7280; font-size: 12px;">Transaction #</div>
                    <div style="color: #111827; font-weight: 600;">${safeTxnNumber}</div>
                  </td>
                  <td style="padding: 5px 15px;">
                    <div style="color: #6b7280; font-size: 12px;">Date & Time</div>
                    <div style="color: #111827; font-weight: 600;">${formatDate(dateObj)} at ${formatTime(dateObj)}</div>
                  </td>
                  <td style="padding: 5px 15px;">
                    <div style="color: #6b7280; font-size: 12px;">Served by</div>
                    <div style="color: #111827; font-weight: 600;">${safeCashierName}</div>
                  </td>
                </tr>
              </table>
              ${safeQuoteNumber ? `
                <p style="margin: 10px 0 0; padding: 10px 15px; background-color: #dbeafe; border-radius: 6px; color: #1e40af; font-size: 13px;">
                  📋 Quote Converted: ${safeQuoteNumber}
                </p>
              ` : ''}
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td style="padding: 0 30px 20px;">
              <h3 style="margin: 0 0 15px; color: #111827; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
                Order Details
              </h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${itemsHtml}
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding: 0 30px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; padding: 15px;">
                <tr>
                  <td style="padding: 5px 0; color: #6b7280;">Subtotal</td>
                  <td style="padding: 5px 0; text-align: right; color: #111827;">${formatCurrency(subtotal)}</td>
                </tr>
                ${discountAmount > 0 ? `
                  <tr>
                    <td style="padding: 5px 0; color: #059669;">Discount${safeDiscountReason ? ` (${safeDiscountReason})` : ''}</td>
                    <td style="padding: 5px 0; text-align: right; color: #059669;">-${formatCurrency(discountAmount)}</td>
                  </tr>
                ` : ''}
                ${hstAmount > 0 ? `
                  <tr>
                    <td style="padding: 5px 0; color: #6b7280;">HST (13%)</td>
                    <td style="padding: 5px 0; text-align: right; color: #111827;">${formatCurrency(hstAmount)}</td>
                  </tr>
                ` : ''}
                ${gstAmount > 0 ? `
                  <tr>
                    <td style="padding: 5px 0; color: #6b7280;">GST (5%)</td>
                    <td style="padding: 5px 0; text-align: right; color: #111827;">${formatCurrency(gstAmount)}</td>
                  </tr>
                ` : ''}
                ${pstAmount > 0 ? `
                  <tr>
                    <td style="padding: 5px 0; color: #6b7280;">PST</td>
                    <td style="padding: 5px 0; text-align: right; color: #111827;">${formatCurrency(pstAmount)}</td>
                  </tr>
                ` : ''}
                <tr>
                  <td colspan="2" style="padding: 10px 0 5px;"><hr style="border: none; border-top: 1px solid #e5e7eb;"></td>
                </tr>
                <tr>
                  <td style="padding: 5px 0; color: #111827; font-size: 18px; font-weight: bold;">Total</td>
                  <td style="padding: 5px 0; text-align: right; color: #111827; font-size: 18px; font-weight: bold;">${formatCurrency(totalAmount)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Payments -->
          <tr>
            <td style="padding: 0 30px 20px;">
              <h3 style="margin: 0 0 10px; color: #111827; font-size: 14px;">Payment Method${payments.length > 1 ? 's' : ''}</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="color: #6b7280; font-size: 14px;">
                ${paymentsHtml}
              </table>
            </td>
          </tr>

          <!-- Return Policy -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <div style="background-color: #fef3c7; border-radius: 8px; padding: 15px; text-align: center;">
                <p style="margin: 0; color: #92400e; font-size: 13px;">
                  📦 <strong>Return Policy:</strong> Returns accepted within 30 days with receipt. Electronics must be unopened.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px; color: #111827; font-weight: 600;">
                Questions about your purchase?
              </p>
              <p style="margin: 0 0 20px; color: #6b7280; font-size: 14px;">
                Contact us at <a href="mailto:${safeStoreEmail}" style="color: #2563eb;">${safeStoreEmail}</a>
                <br>or call ${formatPhone(store.phone)}
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                ${safeStoreName} | ${safeStoreAddress}, ${safeStoreCity}
                <br><a href="https://${safeStoreWebsite}" style="color: #6b7280;">${safeStoreWebsite}</a>
              </p>
            </td>
          </tr>

        </table>

        <!-- Email Footer -->
        <table width="600" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 20px; text-align: center; color: #9ca3af; font-size: 11px;">
              This email was sent to you because you made a purchase at ${safeStoreName}.
              <br>Transaction: ${safeTxnNumber} | ${formatDate(dateObj)}
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Email Receipt component (for preview)
 * @param {object} props
 * @param {object} props.transaction - Transaction data
 * @param {object} props.storeInfo - Store information
 */
export function EmailReceipt({ transaction, storeInfo }) {
  const html = generateEmailReceiptHtml(transaction, storeInfo);

  return (
    <div
      className="email-receipt-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Send email receipt via API
 * @param {object} transaction - Transaction data
 * @param {string} email - Recipient email address
 * @param {object} storeInfo - Store information
 * @returns {Promise<object>} API response
 */
export async function sendEmailReceipt(transaction, email, storeInfo = {}) {
  const html = generateEmailReceiptHtml(transaction, storeInfo);

  const txnNumber = transaction?.transactionNumber || transaction?.transaction_number || 'Receipt';
  const storeName = storeInfo?.name || 'TeleTime';

  try {
    const response = await fetch('/api/email/receipt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: email,
        subject: `Your ${storeName} Receipt - ${txnNumber}`,
        html,
        transactionId: transaction?.transactionId || transaction?.transaction_id,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send email');
    }

    return { success: true };
  } catch (error) {
    console.error('[EmailReceipt] Send error:', error);
    return { success: false, error: error.message };
  }
}

export default EmailReceipt;
