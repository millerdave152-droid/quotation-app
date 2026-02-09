/**
 * TeleTime POS - Receipt Template Component
 *
 * Renders a receipt in the browser for preview/printing
 * Matches the professional styling of quote PDFs
 * Includes manufacturer rebate and trade-in information
 */

import { forwardRef, Fragment } from 'react';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  MailInRebateReceiptSection,
  ThermalRebateSection,
} from '../Rebates/RebateReceiptSection';
import { TradeInReceiptSection } from '../TradeIn/TradeInCartSection';

/**
 * Receipt Template Component
 * @param {object} props
 * @param {object} props.receipt - Receipt data from API
 * @param {string} props.variant - 'full' for full page, 'thermal' for 80mm
 * @param {boolean} props.showQR - Whether to show QR code
 * @param {object} props.rebates - Rebate information { instantRebates, mailInRebates, onlineRebates }
 * @param {array} props.tradeIns - Trade-in assessments applied to this transaction
 */
export const ReceiptTemplate = forwardRef(function ReceiptTemplate(
  { receipt, variant = 'full', showQR = true, rebates = null, tradeIns = [] },
  ref
) {
  if (!receipt) return null;

  const { company, transaction, items, totals, payments, qrCodeUrl } = receipt;
  const signatures = receipt.signatures || [];
  const hasSignatures = signatures.length > 0;

  // Extract rebate data
  const instantRebates = rebates?.instantRebates || [];
  const mailInRebates = rebates?.mailInRebates || [];
  const onlineRebates = rebates?.onlineRebates || [];
  const totalInstantSavings = rebates?.totalInstantSavings || 0;
  const hasMailInRebates = mailInRebates.length > 0 || onlineRebates.length > 0;

  // Trade-in data
  const hasTradeIns = tradeIns && tradeIns.length > 0;
  const totalTradeInCredit = hasTradeIns
    ? tradeIns.reduce((sum, ti) => sum + parseFloat(ti.final_value || ti.finalValue || 0), 0)
    : 0;

  // Get instant rebate for a specific product
  const getProductRebates = (productId) => {
    return instantRebates.filter(r => r.productId === productId);
  };

  // Format payment method display
  const formatPaymentMethod = (payment) => {
    if (payment.cardBrand && payment.cardLastFour) {
      return `${payment.cardBrand} ****${payment.cardLastFour}`;
    }
    return payment.method.toUpperCase();
  };

  const normalizeSignatureSrc = (sig) => {
    if (!sig?.signatureData) return null;
    if (sig.signatureData.startsWith('data:')) return sig.signatureData;
    const format = sig.signatureFormat || 'png';
    return `data:image/${format};base64,${sig.signatureData}`;
  };

  // Thermal receipt (80mm / 302px width)
  if (variant === 'thermal') {
    return (
      <div
        ref={ref}
        className="bg-white font-mono text-[10px] leading-tight"
        style={{ width: '302px', padding: '10px' }}
      >
        {/* Header */}
        <div className="text-center mb-2">
          <p className="font-bold text-sm">{company.name?.toUpperCase()}</p>
          {company.address && <p>{company.address}</p>}
          {company.city && <p>{company.city}</p>}
          {company.phone && <p>Tel: {company.phone}</p>}
          {company.taxNumber && <p>Tax #: {company.taxNumber}</p>}
        </div>

        <div className="border-t-2 border-dashed border-black my-2" />

        <p className="text-center font-bold">*** SALES RECEIPT ***</p>

        <div className="border-t-2 border-dashed border-black my-2" />

        {/* Transaction Info */}
        <div className="mb-2">
          <p>TXN#: {transaction.number}</p>
          <p>Date: {formatDateTime(transaction.date)}</p>
          {transaction.register && <p>Register: {transaction.register}</p>}
          <p>Cashier: {transaction.cashier || 'N/A'}</p>
          {transaction.customer && <p>Customer: {transaction.customer}</p>}
        </div>

        <div className="border-t border-dashed border-gray-400 my-2" />

        {/* Items */}
        {items.map((item, index) => {
          const itemRebates = getProductRebates(item.productId || item.id);
          return (
            <div key={index} className="mb-1">
              <p className="font-bold truncate">{item.name}</p>
              <div className="flex justify-between">
                <span>  {item.quantity} x {formatCurrency(item.unitPrice)}</span>
                <span>{formatCurrency(item.total)}</span>
              </div>
              {item.discountAmount > 0 && (
                <p className="text-right text-gray-600">
                  Disc: -{formatCurrency(item.discountAmount)}
                </p>
              )}
              {/* Instant rebates for this item */}
              {itemRebates.map((rebate, rIndex) => (
                <div key={`rebate-${rIndex}`} className="flex justify-between text-gray-600">
                  <span>  MFR Rebate ({rebate.manufacturer})</span>
                  <span>-{formatCurrency(rebate.amount)}</span>
                </div>
              ))}
              {/* Warranties under this product */}
              {item.warranties && item.warranties.length > 0 && item.warranties.map((warranty, wIndex) => (
                <div key={wIndex} className="ml-2 text-[9px]">
                  <p className="truncate">+ {warranty.name || 'Protection Plan'}</p>
                  <div className="flex justify-between">
                    <span>
                      {warranty.coverageStartDate && warranty.coverageEndDate
                        ? `    ${new Date(warranty.coverageStartDate).toLocaleDateString('en-CA')} - ${new Date(warranty.coverageEndDate).toLocaleDateString('en-CA')}`
                        : `    ${warranty.durationMonths}mo coverage`}
                    </span>
                    <span>{formatCurrency(warranty.price)}</span>
                  </div>
                  {warranty.registrationCode && (
                    <p className="text-gray-500">    Code: {warranty.registrationCode}</p>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        <div className="border-t border-dashed border-gray-400 my-2" />

        {/* Totals */}
        <div className="space-y-0.5">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatCurrency(totals.subtotal)}</span>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between">
              <span>Discount:</span>
              <span>-{formatCurrency(totals.discount)}</span>
            </div>
          )}
          {totalInstantSavings > 0 && (
            <div className="flex justify-between font-bold">
              <span>MFR Rebates:</span>
              <span>-{formatCurrency(totalInstantSavings)}</span>
            </div>
          )}
          {totalTradeInCredit > 0 && (
            <div className="flex justify-between font-bold">
              <span>Trade-In:</span>
              <span>-{formatCurrency(totalTradeInCredit)}</span>
            </div>
          )}
          {totals.hst > 0 && (
            <div className="flex justify-between">
              <span>HST (13%):</span>
              <span>{formatCurrency(totals.hst)}</span>
            </div>
          )}
          {totals.gst > 0 && (
            <div className="flex justify-between">
              <span>GST (5%):</span>
              <span>{formatCurrency(totals.gst)}</span>
            </div>
          )}
          {totals.pst > 0 && (
            <div className="flex justify-between">
              <span>PST:</span>
              <span>{formatCurrency(totals.pst)}</span>
            </div>
          )}
        </div>

        <div className="border-t-2 border-double border-black my-2" />

        <div className="flex justify-between font-bold text-sm">
          <span>TOTAL:</span>
          <span>{formatCurrency(totals.total)}</span>
        </div>

        <div className="border-t-2 border-double border-black my-2" />

        {/* Payments */}
        <div className="mb-2">
          <p className="font-bold">PAYMENT:</p>
          {payments.map((payment, index) => (
            <div key={index}>
              <div className="flex justify-between">
                <span>{formatPaymentMethod(payment)}</span>
                <span>{formatCurrency(payment.amount)}</span>
              </div>
              {payment.cashTendered && (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>  Tendered:</span>
                    <span>{formatCurrency(payment.cashTendered)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>  CHANGE:</span>
                    <span>{formatCurrency(payment.changeGiven || 0)}</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-gray-400 my-2" />

        {/* Signatures */}
        {hasSignatures && (
          <>
            <p className="font-bold">SIGNATURES ON FILE:</p>
            {signatures.map((sig) => (
              <div key={sig.id} className="mb-1">
                <p>
                  {sig.type?.toUpperCase() || 'SIGNATURE'} — {sig.signerName || 'Customer'}
                </p>
              </div>
            ))}
            <div className="border-t border-dashed border-gray-400 my-2" />
          </>
        )}

        {/* Footer */}
        <div className="text-center mt-3">
          <p>Thank you for shopping with us!</p>
          <p>Please come again</p>
          <p className="mt-2 text-[9px]">Returns accepted within 30 days</p>
          <p className="text-[9px]">with original receipt</p>
          {company.website && <p className="mt-2">{company.website}</p>}
        </div>

        {/* Trade-In Section */}
        {hasTradeIns && (
          <TradeInReceiptSection tradeIns={tradeIns} variant="thermal" />
        )}

        {/* Mail-in Rebate Section */}
        {hasMailInRebates && (
          <ThermalRebateSection
            instantRebates={instantRebates}
            mailInRebates={mailInRebates}
            onlineRebates={onlineRebates}
          />
        )}
      </div>
    );
  }

  // Full page receipt
  return (
    <div
      ref={ref}
      className="bg-white min-h-[11in] p-8 font-sans"
      style={{ width: '8.5in' }}
    >
      {/* Top accent bar */}
      <div className="h-1 bg-blue-800 -mx-8 -mt-8 mb-6" />

      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        {/* Company Info */}
        <div>
          <h1 className="text-2xl font-bold text-blue-800">{company.name}</h1>
          <div className="text-sm text-gray-500 mt-1 space-y-0.5">
            {company.address && <p>{company.address}</p>}
            {company.city && <p>{company.city}</p>}
            {company.phone && <p>Tel: {company.phone}</p>}
            {company.taxNumber && <p>Tax #: {company.taxNumber}</p>}
          </div>
        </div>

        {/* Receipt Badge */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center min-w-[160px]">
          <p className="text-xs font-bold text-green-600 mb-1">RECEIPT</p>
          <p className="text-lg font-bold text-gray-900">{transaction.number}</p>
          <p className="text-xs text-gray-500 mt-1">
            {formatDateTime(transaction.date)}
          </p>
          {transaction.register && (
            <p className="text-xs text-gray-500">{transaction.register}</p>
          )}
          {transaction.cashier && (
            <p className="text-xs text-gray-500">Cashier: {transaction.cashier}</p>
          )}
        </div>
      </div>

      {/* Customer Info */}
      {transaction.customer && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 max-w-sm">
          <p className="text-xs font-bold text-blue-500 mb-1">SOLD TO</p>
          <p className="font-bold text-gray-900">{transaction.customer}</p>
          {transaction.customerEmail && (
            <p className="text-sm text-gray-500">{transaction.customerEmail}</p>
          )}
        </div>
      )}

      {/* Items Table */}
      <table className="w-full mb-6">
        <thead>
          <tr className="bg-blue-800 text-white text-sm">
            <th className="py-3 px-4 text-left font-semibold">ITEM</th>
            <th className="py-3 px-4 text-center font-semibold w-20">QTY</th>
            <th className="py-3 px-4 text-right font-semibold w-24">PRICE</th>
            <th className="py-3 px-4 text-right font-semibold w-28">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const itemRebates = getProductRebates(item.productId || item.id);
            const itemRebateTotal = itemRebates.reduce((sum, r) => sum + r.amount, 0);
            return (
            <Fragment key={`item-group-${index}`}>
              <tr
                className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
              >
                <td className="py-3 px-4">
                  <p className="font-semibold text-gray-900">{item.name}</p>
                  {item.sku && (
                    <p className="text-xs text-gray-400">{item.sku}</p>
                  )}
                </td>
                <td className="py-3 px-4 text-center font-semibold text-gray-900">
                  {item.quantity}
                </td>
                <td className="py-3 px-4 text-right text-gray-600">
                  {formatCurrency(item.unitPrice)}
                </td>
                <td className="py-3 px-4 text-right">
                  <p className="font-semibold text-gray-900">
                    {formatCurrency(item.total)}
                  </p>
                  {item.discountAmount > 0 && (
                    <p className="text-xs text-red-600">
                      -{formatCurrency(item.discountAmount)} disc
                    </p>
                  )}
                </td>
              </tr>
              {/* Instant Rebates for this item */}
              {itemRebates.map((rebate, rIndex) => (
                <tr
                  key={`rebate-${index}-${rIndex}`}
                  className="border-b border-gray-100 bg-green-50"
                >
                  <td className="py-2 px-4 pl-8">
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 text-sm">{'\u{1F4B0}'}</span>
                      <div>
                        <p className="font-semibold text-green-700 text-sm">
                          {rebate.rebateName || 'Manufacturer Rebate'}
                        </p>
                        <p className="text-xs text-green-600">
                          {rebate.manufacturer} Instant Rebate
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-4 text-center text-sm text-gray-500">
                    {rebate.quantity || 1}
                  </td>
                  <td className="py-2 px-4 text-right text-sm text-gray-500">
                    -{formatCurrency(rebate.unitAmount || rebate.amount)}
                  </td>
                  <td className="py-2 px-4 text-right">
                    <p className="font-semibold text-green-700 text-sm">
                      -{formatCurrency(rebate.amount)}
                    </p>
                  </td>
                </tr>
              ))}
              {/* Warranties under this product */}
              {item.warranties && item.warranties.map((warranty, wIndex) => (
                <tr
                  key={`warranty-${index}-${wIndex}`}
                  className="border-b border-gray-100 bg-blue-50"
                >
                  <td className="py-2 px-4 pl-8">
                    <div className="flex items-start gap-2">
                      <span className="text-blue-500 text-sm">{'\u{21B3}'}</span>
                      <div>
                        <p className="font-semibold text-blue-600 text-sm">
                          {warranty.name || 'Protection Plan'}
                        </p>
                        <p className="text-xs text-green-600 font-medium">
                          {warranty.coverageStartDate && warranty.coverageEndDate
                            ? `Coverage: ${new Date(warranty.coverageStartDate).toLocaleDateString('en-CA')} - ${new Date(warranty.coverageEndDate).toLocaleDateString('en-CA')}`
                            : `${warranty.durationMonths} months coverage`}
                        </p>
                        {warranty.registrationCode && (
                          <p className="text-xs text-gray-400">
                            Code: {warranty.registrationCode}
                          </p>
                        )}
                        {warranty.termsUrl && (
                          <a
                            href={warranty.termsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline"
                          >
                            View Terms {'\u{2192}'}
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-4 text-center text-sm text-gray-500">
                    1
                  </td>
                  <td className="py-2 px-4 text-right text-sm text-gray-500">
                    {formatCurrency(warranty.price)}
                  </td>
                  <td className="py-2 px-4 text-right">
                    <p className="font-semibold text-blue-600 text-sm">
                      {formatCurrency(warranty.price)}
                    </p>
                  </td>
                </tr>
              ))}
            </Fragment>
          );
          })}
        </tbody>
      </table>

      {/* Totals & Payment Section */}
      <div className="flex justify-between gap-8">
        {/* Payment Details */}
        <div className="flex-1 max-w-sm">
          <h3 className="font-bold text-gray-900 mb-3">PAYMENT DETAILS</h3>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            {payments.map((payment, index) => (
              <div key={index} className="mb-2 last:mb-0">
                <div className="flex justify-between">
                  <span className="text-gray-600">{formatPaymentMethod(payment)}</span>
                  <span className="font-semibold">{formatCurrency(payment.amount)}</span>
                </div>
                {payment.cashTendered && (
                  <>
                    <div className="flex justify-between text-sm text-gray-400 mt-1">
                      <span className="pl-4">Tendered:</span>
                      <span>{formatCurrency(payment.cashTendered)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600">
                      <span className="pl-4">Change:</span>
                      <span>{formatCurrency(payment.changeGiven || 0)}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Signatures */}
          {hasSignatures && (
            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="font-bold text-gray-900 mb-3">CUSTOMER SIGNATURES</h3>
              <div className="space-y-3">
                {signatures.map((sig) => {
                  const src = normalizeSignatureSrc(sig);
                  return (
                    <div key={sig.id} className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {sig.type?.toUpperCase() || 'SIGNATURE'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {sig.signerName || 'Customer'}
                        </p>
                        {sig.capturedAt && (
                          <p className="text-[11px] text-gray-400">
                            {new Date(sig.capturedAt).toLocaleString('en-CA')}
                          </p>
                        )}
                      </div>
                      {src && (
                        <img
                          src={src}
                          alt="Signature"
                          className="h-16 w-40 object-contain border border-gray-200 bg-white rounded"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* QR Code */}
          {showQR && qrCodeUrl && (
            <div className="mt-4 text-center">
              <div className="inline-block bg-white border border-gray-200 rounded-lg p-2">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(qrCodeUrl)}`}
                  alt="Receipt QR Code"
                  className="w-20 h-20"
                />
                <p className="text-[10px] text-gray-400 mt-1">Scan for digital receipt</p>
              </div>
            </div>
          )}
        </div>

        {/* Totals Card */}
        <div className="w-56">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-700">{formatCurrency(totals.subtotal)}</span>
              </div>

              {totals.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Discount</span>
                  <span className="text-red-600">-{formatCurrency(totals.discount)}</span>
                </div>
              )}

              {totalInstantSavings > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600 font-medium">MFR Rebates</span>
                  <span className="text-green-600 font-medium">-{formatCurrency(totalInstantSavings)}</span>
                </div>
              )}

              {totalTradeInCredit > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-600 font-medium">Trade-In Credit</span>
                  <span className="text-emerald-600 font-medium">-{formatCurrency(totalTradeInCredit)}</span>
                </div>
              )}

              {totals.hst > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">HST (13%)</span>
                  <span className="text-gray-700">{formatCurrency(totals.hst)}</span>
                </div>
              )}

              {totals.gst > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">GST (5%)</span>
                  <span className="text-gray-700">{formatCurrency(totals.gst)}</span>
                </div>
              )}

              {totals.pst > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">PST</span>
                  <span className="text-gray-700">{formatCurrency(totals.pst)}</span>
                </div>
              )}
            </div>

            {/* Total Box */}
            <div className="mt-4 bg-blue-800 text-white rounded-md p-3">
              <div className="flex justify-between items-center">
                <span className="font-semibold">TOTAL</span>
                <span className="text-xl font-bold">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-lg font-bold text-blue-800">Thank you for your purchase!</p>
        <p className="text-sm text-gray-500 mt-2">Please keep this receipt for your records.</p>
        <p className="text-sm text-gray-500">Returns accepted within 30 days with receipt.</p>
      </div>

      {/* Page Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200">
        <div className="text-center text-xs text-gray-400">
          <p>
            {[company.website, company.phone, company.email].filter(Boolean).join(' | ')}
          </p>
          {company.taxNumber && (
            <p className="mt-1">Tax Registration: {company.taxNumber}</p>
          )}
        </div>
      </div>

      {/* Trade-In Details Section */}
      {hasTradeIns && (
        <TradeInReceiptSection tradeIns={tradeIns} variant="full" />
      )}

      {/* Mail-in Rebate Opportunities Section */}
      {hasMailInRebates && (
        <MailInRebateReceiptSection
          mailInRebates={mailInRebates}
          onlineRebates={onlineRebates}
          showQrCodes={showQR}
        />
      )}
    </div>
  );
});

export default ReceiptTemplate;
