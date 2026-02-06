/**
 * TeleTime POS - Receipt Component
 * Printable receipt format for 80mm thermal printers
 */

import { forwardRef } from 'react';
import { formatCurrency, formatDate, formatTime, formatPhone } from '../../utils/formatters';

/**
 * Receipt divider
 */
function Divider({ style = 'dashed' }) {
  return (
    <div
      className={`
        my-2 border-t
        ${style === 'dashed' ? 'border-dashed' : 'border-solid'}
        border-gray-400
      `}
    />
  );
}

/**
 * Receipt line item
 */
function LineItem({ item }) {
  const qty = item.quantity || 1;
  const unitPrice = item.unitPrice || item.unit_price || item.price || 0;
  const discount = item.discountPercent || item.discount_percent || 0;
  const lineTotal = unitPrice * qty * (1 - discount / 100);

  return (
    <div className="mb-1">
      <div className="flex justify-between">
        <span className="flex-1 pr-2">
          {qty > 1 && <span>{qty} × </span>}
          {item.productName || item.product_name || item.name}
        </span>
        <span className="tabular-nums text-right">
          {formatCurrency(lineTotal)}
        </span>
      </div>
      {qty > 1 && (
        <div className="text-xs text-gray-600 pl-4">
          @ {formatCurrency(unitPrice)} each
        </div>
      )}
      {discount > 0 && (
        <div className="text-xs text-gray-600 pl-4">
          Discount: -{discount}% (-{formatCurrency(unitPrice * qty * discount / 100)})
        </div>
      )}
    </div>
  );
}

/**
 * Payment line
 */
function PaymentLine({ payment }) {
  const method = payment.paymentMethod || payment.payment_method;
  const amount = payment.amount || 0;
  const lastFour = payment.cardLastFour || payment.card_last_four;
  const brand = payment.cardBrand || payment.card_brand;

  // Format method name
  let methodDisplay = method?.charAt(0).toUpperCase() + method?.slice(1) || 'Payment';
  if (brand) {
    methodDisplay = brand.charAt(0).toUpperCase() + brand.slice(1);
  }
  if (lastFour) {
    methodDisplay += ` ****${lastFour}`;
  }

  return (
    <div className="flex justify-between">
      <span>{methodDisplay}</span>
      <span className="tabular-nums">{formatCurrency(amount)}</span>
    </div>
  );
}

/**
 * Main Receipt component
 * @param {object} props
 * @param {object} props.transaction - Transaction data
 * @param {object} props.storeInfo - Store information
 * @param {boolean} props.showBarcode - Whether to show barcode
 * @param {string} props.className - Additional CSS classes
 */
export const Receipt = forwardRef(function Receipt({
  transaction,
  storeInfo = {},
  showBarcode = true,
  className = '',
}, ref) {
  // Default store info
  const store = {
    name: 'TeleTime',
    address: '123 Main Street',
    city: 'Toronto, ON M5V 1A1',
    phone: '(416) 555-0123',
    website: 'www.teletime.ca',
    ...storeInfo,
  };

  // Extract transaction data
  const txnNumber = transaction?.transactionNumber || transaction?.transaction_number || 'N/A';
  const txnDate = transaction?.createdAt || transaction?.created_at || new Date();
  const cashierName = transaction?.cashierName || transaction?.cashier_name || transaction?.userName || 'Staff';
  const registerName = transaction?.registerName || transaction?.register_name || 'POS 1';

  const customer = transaction?.customer;
  const quoteNumber = transaction?.quoteNumber || transaction?.quote_number;

  const items = transaction?.items || [];
  const subtotal = transaction?.subtotal || 0;
  const discountAmount = transaction?.discountAmount || transaction?.discount_amount || 0;
  const discountReason = transaction?.discountReason || transaction?.discount_reason;
  const taxAmount = transaction?.taxAmount || transaction?.tax_amount || 0;
  const hstAmount = transaction?.hstAmount || transaction?.hst_amount || 0;
  const gstAmount = transaction?.gstAmount || transaction?.gst_amount || 0;
  const pstAmount = transaction?.pstAmount || transaction?.pst_amount || 0;
  const totalAmount = transaction?.totalAmount || transaction?.total_amount || 0;

  const payments = transaction?.payments || [];
  const cashTendered = payments.find(p => p.paymentMethod === 'cash')?.cashTendered;
  const changeGiven = payments.find(p => p.paymentMethod === 'cash')?.changeGiven;

  // Parse date
  const dateObj = txnDate instanceof Date ? txnDate : new Date(txnDate);

  return (
    <div
      ref={ref}
      className={`
        receipt
        w-[80mm] max-w-[80mm]
        mx-auto
        bg-white
        p-4
        font-mono text-xs
        leading-tight
        ${className}
      `}
    >
      {/* ===== STORE HEADER ===== */}
      <div className="text-center mb-4">
        {/* Logo placeholder */}
        {store.logo ? (
          <img
            src={store.logo}
            alt={store.name}
            className="h-10 mx-auto mb-2"
          />
        ) : (
          <div className="text-2xl font-bold mb-1">{store.name}</div>
        )}
        <div className="text-xs">
          <p>{store.address}</p>
          <p>{store.city}</p>
          <p>Tel: {formatPhone(store.phone)}</p>
          {store.website && <p>{store.website}</p>}
        </div>
      </div>

      <Divider style="solid" />

      {/* ===== TRANSACTION INFO ===== */}
      <div className="mb-2">
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{formatDate(dateObj)}</span>
        </div>
        <div className="flex justify-between">
          <span>Time:</span>
          <span>{formatTime(dateObj)}</span>
        </div>
        <div className="flex justify-between">
          <span>Transaction:</span>
          <span className="font-bold">{txnNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Cashier:</span>
          <span>{cashierName}</span>
        </div>
        <div className="flex justify-between">
          <span>Register:</span>
          <span>{registerName}</span>
        </div>
      </div>

      {/* ===== CUSTOMER INFO ===== */}
      {customer && (
        <>
          <Divider />
          <div className="mb-2">
            <p className="font-bold">Customer:</p>
            <p>{customer.customerName || customer.customer_name || customer.name}</p>
            {customer.phone && <p>Tel: {formatPhone(customer.phone)}</p>}
            {quoteNumber && (
              <p className="text-xs mt-1">
                Quote Converted: {quoteNumber}
              </p>
            )}
          </div>
        </>
      )}

      <Divider style="solid" />

      {/* ===== ITEMS ===== */}
      <div className="mb-2">
        {items.map((item, index) => (
          <LineItem key={index} item={item} />
        ))}
      </div>

      <Divider />

      {/* ===== TOTALS ===== */}
      <div className="mb-2">
        {/* Subtotal */}
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>

        {/* Discount */}
        {discountAmount > 0 && (
          <div className="flex justify-between text-gray-700">
            <span>
              Discount{discountReason ? ` (${discountReason})` : ''}:
            </span>
            <span className="tabular-nums">-{formatCurrency(discountAmount)}</span>
          </div>
        )}

        {/* Tax Breakdown */}
        {hstAmount > 0 ? (
          <div className="flex justify-between">
            <span>HST (13%):</span>
            <span className="tabular-nums">{formatCurrency(hstAmount)}</span>
          </div>
        ) : (
          <>
            {gstAmount > 0 && (
              <div className="flex justify-between">
                <span>GST (5%):</span>
                <span className="tabular-nums">{formatCurrency(gstAmount)}</span>
              </div>
            )}
            {pstAmount > 0 && (
              <div className="flex justify-between">
                <span>PST:</span>
                <span className="tabular-nums">{formatCurrency(pstAmount)}</span>
              </div>
            )}
          </>
        )}

        {/* Total */}
        <Divider />
        <div className="flex justify-between text-base font-bold">
          <span>TOTAL:</span>
          <span className="tabular-nums">{formatCurrency(totalAmount)}</span>
        </div>
      </div>

      <Divider style="solid" />

      {/* ===== PAYMENTS ===== */}
      <div className="mb-2">
        <p className="font-bold mb-1">Payment{payments.length > 1 ? 's' : ''}:</p>
        {payments.map((payment, index) => (
          <PaymentLine key={index} payment={payment} />
        ))}

        {/* Cash details */}
        {cashTendered && cashTendered > totalAmount && (
          <>
            <div className="flex justify-between mt-1 pt-1 border-t border-dashed border-gray-400">
              <span>Cash Tendered:</span>
              <span className="tabular-nums">{formatCurrency(cashTendered)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Change:</span>
              <span className="tabular-nums">{formatCurrency(changeGiven || 0)}</span>
            </div>
          </>
        )}
      </div>

      <Divider style="solid" />

      {/* ===== FOOTER ===== */}
      <div className="text-center text-xs mt-4">
        <p className="mb-2">
          Returns accepted within 30 days with receipt.
          <br />
          Electronics must be unopened.
        </p>

        <Divider />

        <p className="font-bold text-sm my-2">
          Thank you for shopping with TeleTime!
        </p>

        {/* Barcode/QR placeholder */}
        {showBarcode && (
          <div className="mt-4">
            {/* Simple barcode representation using CSS */}
            <div className="flex justify-center items-end h-10 gap-px">
              {txnNumber.split('').map((char, i) => {
                const width = (char.charCodeAt(0) % 3) + 1;
                return (
                  <div
                    key={i}
                    className="bg-black"
                    style={{
                      width: `${width}px`,
                      height: `${20 + (char.charCodeAt(0) % 20)}px`,
                    }}
                  />
                );
              })}
            </div>
            <p className="text-xs mt-1 font-mono">{txnNumber}</p>
          </div>
        )}

        <p className="text-xs text-gray-500 mt-4">
          {store.website}
        </p>
      </div>
    </div>
  );
});

export default Receipt;
