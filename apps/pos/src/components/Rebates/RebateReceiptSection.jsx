/**
 * TeleTime POS - Rebate Receipt Section
 * Rebate information for printed/digital receipts
 */

import {
  GiftIcon,
  EnvelopeIcon,
  ClockIcon,
  ArrowTopRightOnSquareIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

/**
 * Format currency
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(value || 0);
}

/**
 * Format date for receipt
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Instant Rebates Line Item Section
 * Shows applied instant rebates as discounts
 */
export function InstantRebateLineItem({ rebate, quantity = 1 }) {
  const totalAmount = (rebate.unitAmount || rebate.amount) * quantity;

  return (
    <div className="flex justify-between text-sm py-1 pl-4 text-green-700">
      <span className="flex items-center gap-1">
        <span>{'\u{1F4B0}'}</span>
        <span>
          {rebate.rebateName || rebate.name}
          {rebate.manufacturer && ` (${rebate.manufacturer})`}
        </span>
      </span>
      <span>-{formatCurrency(totalAmount)}</span>
    </div>
  );
}

/**
 * Applied Rebates Summary (for receipt totals section)
 */
export function AppliedRebatesSummary({ instantRebates = [], totalSavings = 0 }) {
  if (!instantRebates.length && !totalSavings) return null;

  return (
    <div className="border-t border-dashed border-gray-300 pt-2 mt-2">
      <div className="flex justify-between text-sm font-medium text-green-700">
        <span className="flex items-center gap-1">
          <GiftIcon className="w-4 h-4" />
          Manufacturer Rebates Applied
        </span>
        <span>-{formatCurrency(totalSavings)}</span>
      </div>
    </div>
  );
}

/**
 * Mail-in Rebate Opportunities Section
 * Printed at bottom of receipt with submission details
 */
export function MailInRebateReceiptSection({
  mailInRebates = [],
  onlineRebates = [],
  showQrCodes = true,
}) {
  const allRebates = [...mailInRebates, ...onlineRebates];

  if (allRebates.length === 0) return null;

  const totalPotential = allRebates.reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <div className="mt-6 pt-4 border-t-2 border-dashed border-gray-400">
      {/* Header */}
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <EnvelopeIcon className="w-5 h-5" />
          <span className="text-lg font-bold">REBATE OPPORTUNITIES</span>
        </div>
        <p className="text-sm text-gray-600">
          Save an additional {formatCurrency(totalPotential)} with these rebates!
        </p>
      </div>

      {/* Rebate List */}
      <div className="space-y-4">
        {allRebates.map((rebate, index) => (
          <div
            key={rebate.rebateId || index}
            className="border border-gray-300 rounded-lg p-3 print:break-inside-avoid"
          >
            {/* Rebate Header */}
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-semibold">{rebate.rebateName || rebate.name}</p>
                <p className="text-sm text-gray-600">
                  {rebate.manufacturer} - {rebate.productName}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-blue-600">
                  {formatCurrency(rebate.amount)}
                </p>
                <p className="text-xs text-gray-500">
                  {rebate.rebateType === 'online' ? 'Online' : 'Mail-in'}
                </p>
              </div>
            </div>

            {/* Deadline Warning */}
            <div className={`
              flex items-center gap-2 p-2 rounded text-sm mb-3
              ${rebate.daysRemaining && rebate.daysRemaining <= 14
                ? 'bg-orange-100 text-orange-800'
                : 'bg-gray-100 text-gray-700'
              }
            `}>
              {rebate.daysRemaining && rebate.daysRemaining <= 14 ? (
                <ExclamationTriangleIcon className="w-4 h-4" />
              ) : (
                <ClockIcon className="w-4 h-4" />
              )}
              <span>
                <strong>DEADLINE:</strong> {formatDate(rebate.deadline)}
                {rebate.daysRemaining && ` (${rebate.daysRemaining} days)`}
              </span>
            </div>

            {/* How to Submit */}
            <div className="text-sm">
              <p className="font-medium mb-1">How to Submit:</p>
              {rebate.rebateType === 'online' ? (
                <ol className="list-decimal list-inside space-y-1 text-gray-700">
                  <li>Visit the URL below</li>
                  <li>Register your product (if required)</li>
                  <li>Upload your receipt</li>
                  <li>Enter product serial number</li>
                </ol>
              ) : (
                <ol className="list-decimal list-inside space-y-1 text-gray-700">
                  <li>Visit the URL below to download form</li>
                  <li>Fill out the rebate form completely</li>
                  {rebate.requiresReceipt && <li>Include a copy of this receipt</li>}
                  {rebate.requiresUpc && <li>Cut out and include the UPC barcode</li>}
                  <li>Mail all documents to the address on the form</li>
                </ol>
              )}
            </div>

            {/* Submission URL */}
            {rebate.submissionUrl && (
              <div className="mt-3 p-2 bg-blue-50 rounded">
                <p className="text-xs font-medium text-gray-600 mb-1">Submit at:</p>
                <p className="text-sm font-mono break-all text-blue-700">
                  {rebate.submissionUrl}
                </p>
              </div>
            )}

            {/* QR Code placeholder */}
            {showQrCodes && rebate.submissionUrl && (
              <div className="mt-2 flex justify-center print:block">
                <div className="w-20 h-20 bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                  [QR Code]
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer Note */}
      <div className="mt-4 text-center text-xs text-gray-500">
        <p>Keep this receipt for your records.</p>
        <p>Rebate offers subject to manufacturer terms and conditions.</p>
        <p>Processing typically takes 6-8 weeks.</p>
      </div>
    </div>
  );
}

/**
 * Thermal Receipt Rebate Section
 * Compact format for 80mm thermal printers
 */
export function ThermalRebateSection({
  instantRebates = [],
  mailInRebates = [],
  onlineRebates = [],
}) {
  const allMailIn = [...mailInRebates, ...onlineRebates];
  const totalInstant = instantRebates.reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalMailIn = allMailIn.reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <div className="font-mono text-xs" style={{ width: '300px' }}>
      {/* Instant Rebates Applied */}
      {totalInstant > 0 && (
        <div className="border-t border-dashed pt-2 mt-2">
          <p className="font-bold">INSTANT REBATES APPLIED</p>
          {instantRebates.map((rebate, index) => (
            <div key={index} className="flex justify-between">
              <span className="truncate pr-2" style={{ maxWidth: '200px' }}>
                {rebate.manufacturer}: {rebate.rebateName}
              </span>
              <span>-{formatCurrency(rebate.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold mt-1">
            <span>TOTAL SAVED</span>
            <span>-{formatCurrency(totalInstant)}</span>
          </div>
        </div>
      )}

      {/* Mail-in Rebates */}
      {allMailIn.length > 0 && (
        <div className="border-t border-dashed pt-2 mt-2">
          <p className="font-bold text-center">
            *** REBATE OPPORTUNITIES ***
          </p>
          <p className="text-center mb-2">
            Save {formatCurrency(totalMailIn)} more!
          </p>

          {allMailIn.map((rebate, index) => (
            <div key={index} className="mb-3">
              <p className="font-bold">{rebate.manufacturer}</p>
              <p>{rebate.rebateName}</p>
              <p>Amount: {formatCurrency(rebate.amount)}</p>
              <p>Deadline: {formatDate(rebate.deadline)}</p>
              {rebate.submissionUrl && (
                <p className="break-all">{rebate.submissionUrl}</p>
              )}
              <p>---</p>
            </div>
          ))}

          <p className="text-center mt-2">
            See reverse for instructions
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Email Receipt Rebate Section
 * HTML formatted for email receipts
 */
export function EmailRebateSection({
  mailInRebates = [],
  onlineRebates = [],
}) {
  const allRebates = [...mailInRebates, ...onlineRebates];

  if (allRebates.length === 0) return null;

  const totalPotential = allRebates.reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <div style={{
      marginTop: '24px',
      padding: '16px',
      backgroundColor: '#EFF6FF',
      borderRadius: '8px',
      border: '1px solid #BFDBFE',
    }}>
      <h3 style={{
        margin: '0 0 12px 0',
        fontSize: '18px',
        fontWeight: 'bold',
        color: '#1E40AF',
      }}>
        {'\u{1F4EC}'} Rebate Opportunities - Save {formatCurrency(totalPotential)}!
      </h3>

      {allRebates.map((rebate, index) => (
        <div
          key={index}
          style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            border: '1px solid #E5E7EB',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: '0', fontWeight: 'bold', color: '#111827' }}>
                {rebate.rebateName || rebate.name}
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6B7280' }}>
                {rebate.manufacturer} - {rebate.productName}
              </p>
            </div>
            <p style={{ margin: '0', fontSize: '20px', fontWeight: 'bold', color: '#2563EB' }}>
              {formatCurrency(rebate.amount)}
            </p>
          </div>

          <div style={{
            marginTop: '12px',
            padding: '8px',
            backgroundColor: rebate.daysRemaining <= 14 ? '#FEF3C7' : '#F3F4F6',
            borderRadius: '4px',
            fontSize: '14px',
          }}>
            <strong>Deadline:</strong> {formatDate(rebate.deadline)}
            {rebate.daysRemaining && (
              <span style={{ color: rebate.daysRemaining <= 14 ? '#D97706' : '#6B7280' }}>
                {' '}({rebate.daysRemaining} days remaining)
              </span>
            )}
          </div>

          {rebate.submissionUrl && (
            <a
              href={rebate.submissionUrl}
              style={{
                display: 'inline-block',
                marginTop: '12px',
                padding: '10px 20px',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                textDecoration: 'none',
                borderRadius: '6px',
                fontWeight: '500',
              }}
            >
              Submit Rebate Claim \u2192
            </a>
          )}
        </div>
      ))}

      <p style={{
        margin: '16px 0 0 0',
        fontSize: '12px',
        color: '#6B7280',
        textAlign: 'center',
      }}>
        Rebate offers subject to manufacturer terms. Processing typically takes 6-8 weeks.
      </p>
    </div>
  );
}

/**
 * Combined Receipt Rebate Display
 * Use this in the main receipt template
 */
export function ReceiptRebateDisplay({
  instantRebates = [],
  mailInRebates = [],
  onlineRebates = [],
  format = 'standard', // 'standard', 'thermal', 'email'
  showQrCodes = false,
}) {
  if (format === 'thermal') {
    return (
      <ThermalRebateSection
        instantRebates={instantRebates}
        mailInRebates={mailInRebates}
        onlineRebates={onlineRebates}
      />
    );
  }

  if (format === 'email') {
    return (
      <EmailRebateSection
        mailInRebates={mailInRebates}
        onlineRebates={onlineRebates}
      />
    );
  }

  // Standard format
  return (
    <>
      {/* Instant rebates shown inline with line items */}
      {instantRebates.length > 0 && (
        <AppliedRebatesSummary
          instantRebates={instantRebates}
          totalSavings={instantRebates.reduce((sum, r) => sum + (r.amount || 0), 0)}
        />
      )}

      {/* Mail-in rebates shown as separate section */}
      <MailInRebateReceiptSection
        mailInRebates={mailInRebates}
        onlineRebates={onlineRebates}
        showQrCodes={showQrCodes}
      />
    </>
  );
}

export default ReceiptRebateDisplay;
