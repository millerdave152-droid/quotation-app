/**
 * TeleTime - TaxDisplay Component
 *
 * Displays tax breakdown for receipts, invoices, and checkout summaries.
 * Shows individual tax lines (HST, GST, PST/QST) with amounts.
 */

import React from 'react';
import { useTax } from '../../hooks/useTax';
import { formatCurrency } from '../../utils/formatters';

/**
 * TaxBreakdown - Detailed tax breakdown for receipts
 */
export function TaxBreakdown({
  amountCents,
  province = 'ON',
  isTaxExempt = false,
  showSubtotal = true,
  showTotal = true,
  className = '',
}) {
  const { calculateTax, formatTaxBreakdown, currentRates } = useTax({
    defaultProvince: province,
    autoFetch: false,
  });

  const taxResult = calculateTax(amountCents, province, isTaxExempt);
  const breakdown = formatTaxBreakdown(taxResult);

  return (
    <div className={`tax-breakdown ${className}`}>
      {showSubtotal && (
        <div className="tax-line subtotal">
          <span className="label">Subtotal</span>
          <span className="amount">{formatCurrency(amountCents / 100)}</span>
        </div>
      )}

      {breakdown.map((line, index) => (
        <div key={index} className="tax-line tax-item">
          <span className="label">{line.label}</span>
          <span className="amount">{formatCurrency(line.amount)}</span>
        </div>
      ))}

      {showTotal && (
        <div className="tax-line total">
          <span className="label">Total</span>
          <span className="amount">{formatCurrency(taxResult.grandTotalCents / 100)}</span>
        </div>
      )}

      <style jsx>{`
        .tax-breakdown {
          font-family: inherit;
        }
        .tax-line {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
        }
        .tax-line.subtotal {
          border-bottom: 1px dashed #ccc;
          margin-bottom: 4px;
        }
        .tax-line.total {
          border-top: 2px solid #333;
          margin-top: 4px;
          font-weight: bold;
        }
        .tax-item {
          color: #666;
          font-size: 0.9em;
        }
      `}</style>
    </div>
  );
}

/**
 * TaxSummaryLine - Single line tax summary (e.g., "HST 13%: $13.00")
 */
export function TaxSummaryLine({
  amountCents,
  province = 'ON',
  isTaxExempt = false,
  showLabel = true,
  className = '',
}) {
  const { calculateTax, currentRates } = useTax({
    defaultProvince: province,
    autoFetch: false,
  });

  const taxResult = calculateTax(amountCents, province, isTaxExempt);

  if (isTaxExempt) {
    return (
      <span className={`tax-summary exempt ${className}`}>
        Tax Exempt
      </span>
    );
  }

  return (
    <span className={`tax-summary ${className}`}>
      {showLabel && <span className="tax-label">{taxResult.label}: </span>}
      <span className="tax-amount">{formatCurrency(taxResult.totalTaxCents / 100)}</span>
    </span>
  );
}

/**
 * ProvinceSelector - Dropdown for selecting province
 */
export function ProvinceSelector({
  value,
  onChange,
  showRate = true,
  disabled = false,
  className = '',
}) {
  const { provinceOptions, isLoading } = useTax({ autoFetch: true });

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || isLoading}
      className={`province-selector ${className}`}
    >
      {provinceOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.shortLabel} - {showRate ? `${option.rate.toFixed(0)}%` : option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * TaxExemptBadge - Badge indicating tax-exempt status
 */
export function TaxExemptBadge({ reason = null, className = '' }) {
  return (
    <span className={`tax-exempt-badge ${className}`}>
      Tax Exempt
      {reason && <span className="reason">({reason})</span>}
      <style jsx>{`
        .tax-exempt-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          background: #e8f5e9;
          color: #2e7d32;
          border-radius: 4px;
          font-size: 0.85em;
          font-weight: 500;
        }
        .reason {
          font-weight: normal;
          font-size: 0.9em;
        }
      `}</style>
    </span>
  );
}

/**
 * ReceiptTaxSection - Full tax section for receipts
 */
export function ReceiptTaxSection({
  subtotalCents,
  discountCents = 0,
  province = 'ON',
  isTaxExempt = false,
  customerName = null,
  showRegistrationNumber = true,
  businessNumber = '123456789RT0001', // Your GST/HST registration
}) {
  const { calculateTax, formatTaxBreakdown } = useTax({
    defaultProvince: province,
    autoFetch: false,
  });

  const taxableAmount = subtotalCents - discountCents;
  const taxResult = calculateTax(taxableAmount, province, isTaxExempt);
  const breakdown = formatTaxBreakdown(taxResult);

  return (
    <div className="receipt-tax-section">
      {/* Subtotal */}
      <div className="receipt-line">
        <span>Subtotal</span>
        <span>{formatCurrency(subtotalCents / 100)}</span>
      </div>

      {/* Discount (if any) */}
      {discountCents > 0 && (
        <div className="receipt-line discount">
          <span>Discount</span>
          <span>-{formatCurrency(discountCents / 100)}</span>
        </div>
      )}

      {/* Tax lines */}
      {breakdown.map((line, index) => (
        <div key={index} className="receipt-line tax">
          <span>{line.label}</span>
          <span>{formatCurrency(line.amount)}</span>
        </div>
      ))}

      {/* Total */}
      <div className="receipt-line total">
        <span>TOTAL</span>
        <span>{formatCurrency(taxResult.grandTotalCents / 100)}</span>
      </div>

      {/* Registration number */}
      {showRegistrationNumber && !isTaxExempt && (
        <div className="registration-number">
          GST/HST Reg#: {businessNumber}
        </div>
      )}

      {/* Tax-exempt notice */}
      {isTaxExempt && customerName && (
        <div className="exempt-notice">
          Tax Exempt: {customerName}
        </div>
      )}

      <style jsx>{`
        .receipt-tax-section {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          padding: 8px 0;
          border-top: 1px dashed #000;
          border-bottom: 1px dashed #000;
        }
        .receipt-line {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
        }
        .receipt-line.discount {
          color: #c00;
        }
        .receipt-line.tax {
          font-size: 11px;
        }
        .receipt-line.total {
          font-weight: bold;
          font-size: 14px;
          border-top: 1px solid #000;
          margin-top: 4px;
          padding-top: 4px;
        }
        .registration-number {
          text-align: center;
          font-size: 10px;
          color: #666;
          margin-top: 8px;
        }
        .exempt-notice {
          text-align: center;
          font-size: 10px;
          color: #2e7d32;
          margin-top: 8px;
          font-weight: bold;
        }
      `}</style>
    </div>
  );
}

/**
 * InvoiceTaxTable - Tax table for formal invoices
 */
export function InvoiceTaxTable({
  subtotalCents,
  discountCents = 0,
  province = 'ON',
  isTaxExempt = false,
  className = '',
}) {
  const { calculateTax, currentRates, getProvinceInfo } = useTax({
    defaultProvince: province,
    autoFetch: false,
  });

  const taxableAmount = subtotalCents - discountCents;
  const taxResult = calculateTax(taxableAmount, province, isTaxExempt);
  const provinceInfo = getProvinceInfo(province);

  return (
    <table className={`invoice-tax-table ${className}`}>
      <tbody>
        <tr className="subtotal-row">
          <td>Subtotal</td>
          <td className="amount">{formatCurrency(subtotalCents / 100)}</td>
        </tr>

        {discountCents > 0 && (
          <tr className="discount-row">
            <td>Less: Discount</td>
            <td className="amount negative">({formatCurrency(discountCents / 100)})</td>
          </tr>
        )}

        {!isTaxExempt && taxResult.hstCents > 0 && (
          <tr className="tax-row">
            <td>HST ({provinceInfo?.hstRate || 13}%)</td>
            <td className="amount">{formatCurrency(taxResult.hstCents / 100)}</td>
          </tr>
        )}

        {!isTaxExempt && taxResult.gstCents > 0 && (
          <tr className="tax-row">
            <td>GST (5%)</td>
            <td className="amount">{formatCurrency(taxResult.gstCents / 100)}</td>
          </tr>
        )}

        {!isTaxExempt && taxResult.pstCents > 0 && (
          <tr className="tax-row">
            <td>{province === 'QC' ? 'QST (9.975%)' : `PST (${provinceInfo?.pstRate || 7}%)`}</td>
            <td className="amount">{formatCurrency(taxResult.pstCents / 100)}</td>
          </tr>
        )}

        {isTaxExempt && (
          <tr className="exempt-row">
            <td colSpan={2}>Tax Exempt</td>
          </tr>
        )}

        <tr className="total-row">
          <td><strong>Total Due</strong></td>
          <td className="amount"><strong>{formatCurrency(taxResult.grandTotalCents / 100)}</strong></td>
        </tr>
      </tbody>

      <style jsx>{`
        .invoice-tax-table {
          width: 100%;
          border-collapse: collapse;
          margin: 16px 0;
        }
        .invoice-tax-table td {
          padding: 8px 12px;
          border-bottom: 1px solid #eee;
        }
        .invoice-tax-table .amount {
          text-align: right;
          font-family: monospace;
        }
        .invoice-tax-table .negative {
          color: #c00;
        }
        .invoice-tax-table .tax-row td {
          color: #666;
          font-size: 0.95em;
        }
        .invoice-tax-table .exempt-row td {
          color: #2e7d32;
          font-style: italic;
          text-align: center;
        }
        .invoice-tax-table .total-row td {
          border-top: 2px solid #333;
          border-bottom: 2px solid #333;
          background: #f5f5f5;
        }
      `}</style>
    </table>
  );
}

// Default export
export default {
  TaxBreakdown,
  TaxSummaryLine,
  ProvinceSelector,
  TaxExemptBadge,
  ReceiptTaxSection,
  InvoiceTaxTable,
};
