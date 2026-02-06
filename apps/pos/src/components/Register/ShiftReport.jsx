/**
 * TeleTime POS - Shift Report Component
 * Printable end-of-day report with shift details and statistics
 */

import { forwardRef, useEffect, useState } from 'react';
import { useRegister } from '../../context/RegisterContext';
import { formatCurrency, formatDate, formatTime, formatDateTime } from '../../utils/formatters';

/**
 * Report section component
 */
function ReportSection({ title, children }) {
  return (
    <div className="mb-6 print:mb-4">
      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2 pb-1 border-b border-gray-300 print:text-black">
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * Report row component
 */
function ReportRow({ label, value, bold = false, highlight = false }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? 'font-semibold' : ''} ${highlight ? 'bg-gray-50 px-2 -mx-2 rounded' : ''}`}>
      <span className="text-gray-600 print:text-gray-800">{label}</span>
      <span className={`tabular-nums ${bold ? 'text-gray-900' : 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

/**
 * Shift report component - can be printed
 * @param {object} props
 * @param {object} props.shift - Shift data
 * @param {object} props.summary - Shift summary data
 * @param {number} props.closingCash - Closing cash count
 * @param {number} props.variance - Cash variance
 * @param {Array} props.transactions - Transaction list (optional)
 * @param {Array} props.topProducts - Top selling products (optional)
 */
export const ShiftReport = forwardRef(function ShiftReport({
  shift,
  summary,
  closingCash,
  variance,
  transactions = [],
  topProducts = [],
  previousShiftSummary,
}, ref) {
  const storeInfo = {
    name: import.meta.env.VITE_STORE_NAME || 'TeleTime Communications',
    address: import.meta.env.VITE_STORE_ADDRESS || '123 Main Street',
    city: import.meta.env.VITE_STORE_CITY || 'Toronto, ON M5V 1A1',
    phone: import.meta.env.VITE_STORE_PHONE || '(416) 555-1234',
  };

  const openedAt = shift?.openedAt || shift?.opened_at;
  const closedAt = shift?.closedAt || shift?.closed_at || new Date().toISOString();
  const openingCash = shift?.openingCash || shift?.opening_cash || 0;
  const registerName = shift?.registerName || shift?.register_name || 'Register';
  const userName = shift?.userName || shift?.user_name || 'Staff';

  const paymentBreakdown = summary?.paymentBreakdown || {};
  const transactionCount = summary?.transactionCount || 0;
  const totalSales = summary?.totalSales || 0;
  const voidCount = summary?.voidCount || 0;
  const refundCount = summary?.refundCount || 0;
  const refundTotal = summary?.refundTotal || 0;

  // Calculate shift duration
  const getShiftDuration = () => {
    if (!openedAt) return 'N/A';
    const start = new Date(openedAt);
    const end = new Date(closedAt);
    const diff = end - start;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Get variance status
  const getVarianceStatus = () => {
    if (variance === null || variance === undefined) return null;
    const absVariance = Math.abs(variance);
    if (absVariance <= 5) return { label: 'OK', color: 'text-green-600' };
    if (absVariance <= 20) return { label: 'WARNING', color: 'text-yellow-600' };
    return { label: 'OVER LIMIT', color: 'text-red-600' };
  };

  const varianceStatus = getVarianceStatus();

  return (
    <div
      ref={ref}
      className="
        bg-white p-6 max-w-2xl mx-auto
        print:p-4 print:max-w-none print:mx-0
        font-mono text-sm
      "
    >
      {/* Header */}
      <div className="text-center mb-6 print:mb-4">
        <h1 className="text-xl font-bold print:text-lg">{storeInfo.name}</h1>
        <p className="text-gray-600">{storeInfo.address}</p>
        <p className="text-gray-600">{storeInfo.city}</p>
        <p className="text-gray-600">{storeInfo.phone}</p>
      </div>

      {/* Report Title */}
      <div className="text-center mb-6 print:mb-4 py-2 bg-gray-100 print:bg-gray-200 rounded">
        <h2 className="text-lg font-bold uppercase">End of Day Report</h2>
        <p className="text-gray-600">{formatDate(closedAt)}</p>
      </div>

      {/* Shift Details */}
      <ReportSection title="Shift Details">
        <ReportRow label="Register" value={registerName} />
        <ReportRow label="Cashier" value={userName} />
        <ReportRow label="Shift Opened" value={formatDateTime(openedAt)} />
        <ReportRow label="Shift Closed" value={formatDateTime(closedAt)} />
        <ReportRow label="Duration" value={getShiftDuration()} bold />
      </ReportSection>

      {/* Transaction Summary */}
      <ReportSection title="Transaction Summary">
        <ReportRow label="Total Transactions" value={transactionCount} />
        <ReportRow label="Gross Sales" value={formatCurrency(totalSales + refundTotal)} />
        <ReportRow label="Refunds" value={`-${formatCurrency(refundTotal)} (${refundCount})`} />
        <ReportRow label="Voids" value={voidCount.toString()} />
        <div className="border-t border-gray-300 mt-2 pt-2">
          <ReportRow label="Net Sales" value={formatCurrency(totalSales)} bold highlight />
        </div>
      </ReportSection>

      {/* Payment Methods */}
      <ReportSection title="Payment Method Breakdown">
        {Object.entries(paymentBreakdown).length > 0 ? (
          <>
            {Object.entries(paymentBreakdown).map(([method, data]) => (
              <ReportRow
                key={method}
                label={`${method.charAt(0).toUpperCase() + method.slice(1)} (${data.count || 0})`}
                value={formatCurrency(data.total || 0)}
              />
            ))}
            <div className="border-t border-gray-300 mt-2 pt-2">
              <ReportRow
                label="Total"
                value={formatCurrency(
                  Object.values(paymentBreakdown).reduce((sum, p) => sum + (p.total || 0), 0)
                )}
                bold
              />
            </div>
          </>
        ) : (
          <p className="text-gray-500 text-center py-2">No payments recorded</p>
        )}
      </ReportSection>

      {/* Cash Drawer */}
      <ReportSection title="Cash Drawer Reconciliation">
        <ReportRow label="Opening Cash" value={formatCurrency(openingCash)} />
        <ReportRow label="Cash Sales" value={`+${formatCurrency(paymentBreakdown.cash?.total || 0)}`} />
        {refundTotal > 0 && paymentBreakdown.cash && (
          <ReportRow label="Cash Refunds" value={`-${formatCurrency(0)}`} />
        )}
        <div className="border-t border-gray-300 mt-2 pt-2">
          <ReportRow label="Expected Cash" value={formatCurrency(openingCash + (paymentBreakdown.cash?.total || 0))} />
          <ReportRow label="Counted Cash" value={formatCurrency(closingCash || 0)} />
        </div>
        {variance !== null && variance !== undefined && (
          <div className="border-t border-gray-300 mt-2 pt-2">
            <div className="flex justify-between py-1 font-bold">
              <span>Variance</span>
              <span className={variance >= 0 ? 'text-green-600' : 'text-red-600'}>
                {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                {varianceStatus && (
                  <span className={`ml-2 ${varianceStatus.color}`}>
                    [{varianceStatus.label}]
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </ReportSection>

      {/* Top Products */}
      {topProducts.length > 0 && (
        <ReportSection title="Top Selling Items">
          {topProducts.slice(0, 10).map((product, index) => (
            <ReportRow
              key={product.productId || index}
              label={`${index + 1}. ${product.productName || product.name}`}
              value={`${product.quantity} sold`}
            />
          ))}
        </ReportSection>
      )}

      {/* Comparison to Previous Shift */}
      {previousShiftSummary && (
        <ReportSection title="Comparison to Previous Shift">
          <ReportRow
            label="Sales Change"
            value={
              totalSales >= (previousShiftSummary.totalSales || 0)
                ? `+${formatCurrency(totalSales - (previousShiftSummary.totalSales || 0))}`
                : `-${formatCurrency((previousShiftSummary.totalSales || 0) - totalSales)}`
            }
          />
          <ReportRow
            label="Transaction Change"
            value={
              transactionCount >= (previousShiftSummary.transactionCount || 0)
                ? `+${transactionCount - (previousShiftSummary.transactionCount || 0)}`
                : `${transactionCount - (previousShiftSummary.transactionCount || 0)}`
            }
          />
        </ReportSection>
      )}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t-2 border-gray-400 text-center">
        <p className="text-gray-600">
          Report generated on {formatDateTime(new Date().toISOString())}
        </p>
        <p className="text-xs text-gray-500 mt-2">
          This is an official end-of-day report. Please retain for your records.
        </p>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .shift-report,
          .shift-report * {
            visibility: visible;
          }
          .shift-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
});

/**
 * Printable shift report wrapper
 * Handles print functionality
 */
export function PrintableShiftReport({
  shift,
  summary,
  closingCash,
  variance,
  transactions,
  topProducts,
  onClose,
}) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 no-print">
          <h2 className="text-lg font-bold text-gray-900">End of Day Report Preview</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Print Report
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Report Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100">
          <ShiftReport
            shift={shift}
            summary={summary}
            closingCash={closingCash}
            variance={variance}
            transactions={transactions}
            topProducts={topProducts}
          />
        </div>
      </div>
    </div>
  );
}

export default ShiftReport;
