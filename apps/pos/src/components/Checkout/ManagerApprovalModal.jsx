/**
 * TeleTime POS - Manager Approval Modal
 *
 * Modal for manager PIN verification when overrides exceed thresholds.
 * Features touch-friendly numeric keypad for POS screen.
 *
 * When used for fraud overrides, shows:
 *   - Full fraud signal breakdown with point values
 *   - ID verification checkbox
 *   - Override reason dropdown
 *   - Free-text notes
 *   - Customer transaction history summary
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { formatCurrency } from '../../utils/formatters';
import { AlertTriangle, CheckCircle, CircleUser, Delete, IdCard, Lock, ShieldAlert, ShieldCheck, X } from 'lucide-react';

// ============================================================================
// PIN KEYPAD BUTTON
// ============================================================================

function KeypadButton({ children, onClick, variant = 'default', disabled = false }) {
  const variantClasses = {
    default: 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-900',
    action: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white',
    clear: 'bg-red-100 hover:bg-red-200 active:bg-red-300 text-red-700',
    success: 'bg-green-600 hover:bg-green-700 active:bg-green-800 text-white',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        h-16 w-full
        flex items-center justify-center
        text-2xl font-semibold
        rounded-xl
        transition-all duration-150
        active:scale-[0.97]
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
      `}
    >
      {children}
    </button>
  );
}

// ============================================================================
// PIN DISPLAY DOTS
// ============================================================================

function PinDots({ length, maxLength = 6 }) {
  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length: maxLength }).map((_, idx) => (
        <div
          key={idx}
          className={`
            w-4 h-4 rounded-full
            transition-all duration-150
            ${idx < length ? 'bg-blue-600 scale-110' : 'bg-gray-300'}
          `}
        />
      ))}
    </div>
  );
}

// ============================================================================
// OVERRIDE REASON DISPLAY
// ============================================================================

function OverrideReasonBadge({ overrideType, value, threshold }) {
  const getReasonText = () => {
    switch (overrideType) {
      case 'discount_percent':
        return `Discount of ${value?.toFixed(1)}% exceeds ${threshold}% threshold`;
      case 'discount_amount':
        return `Discount of ${formatCurrency(value)} exceeds ${formatCurrency(threshold)} threshold`;
      case 'price_below_margin':
        return `Margin of ${value?.toFixed(1)}% is below ${threshold}% minimum`;
      case 'price_below_cost':
        return 'Price is below product cost';
      case 'refund_override':
        return `Refund of ${formatCurrency(value)} requires approval`;
      case 'void_transaction':
        return 'Transaction void requires manager approval';
      case 'drawer_adjustment':
        return `Drawer adjustment of ${formatCurrency(value)} requires approval`;
      case 'fraud_block':
        return `Fraud block override \u2014 Risk score: ${value}/100`;
      default:
        return 'Manager approval required for this action';
    }
  };

  return (
    <div className={`p-3 rounded-lg border ${
      overrideType === 'fraud_block'
        ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-200'
    }`}>
      <div className="flex items-start gap-2">
        {overrideType === 'fraud_block' ? (
          <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        )}
        <div>
          <p className={`text-sm font-medium ${overrideType === 'fraud_block' ? 'text-red-800' : 'text-amber-800'}`}>
            {getReasonText()}
          </p>
          {value !== undefined && threshold !== undefined && overrideType !== 'fraud_block' && (
            <p className="text-xs text-amber-600 mt-1">
              Current value: {typeof value === 'number' && value < 100 ? `${value.toFixed(1)}%` : formatCurrency(value)}
              {' '}| Threshold: {typeof threshold === 'number' && threshold < 100 ? `${threshold}%` : formatCurrency(threshold)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FRAUD SIGNAL BREAKDOWN (new — for fraud overrides)
// ============================================================================

const SIGNAL_LABELS = {
  velocity: 'Transaction Velocity',
  amount_anomaly: 'Amount Anomaly',
  bin_risk: 'Card BIN Risk',
  time_anomaly: 'Off-Hours Activity',
  entry_method: 'Entry Method Risk',
  employee_risk: 'Employee Risk Profile',
  split_transaction: 'Split Transaction',
  card_testing: 'Card Testing Pattern',
  geographic_anomaly: 'Geographic Anomaly',
  decline_pattern: 'Decline Pattern',
  customer_anomaly: 'Customer Risk',
  customer_history: 'Customer History',
};

function FraudSignalBreakdown({ signals }) {
  if (!signals || Object.keys(signals).length === 0) return null;

  // Collect signals with points > 0
  const activeSignals = [];

  for (const [key, value] of Object.entries(signals)) {
    if (!value) continue;

    // Velocity has sub-dimensions
    if (key === 'velocity') {
      for (const [dim, check] of Object.entries(value)) {
        if (check.exceeded && check.riskPoints > 0) {
          activeSignals.push({
            label: `Velocity: ${dim}`,
            points: check.riskPoints,
            detail: `${check.count} events`,
          });
        }
      }
      continue;
    }

    const pts = value.riskPoints || 0;
    if (pts > 0) {
      const detail = key === 'entry_method' ? value.method
        : key === 'amount_anomaly' ? `z-score: ${value.zscore}`
        : key === 'geographic_anomaly' ? `${value.distanceKm}km / ${value.windowMinutes}min`
        : key === 'customer_anomaly' || key === 'customer_history'
          ? (value.flags || []).join(', ') || (value.chargebackCount > 0 ? `${value.chargebackCount} chargebacks` : '')
        : key === 'split_transaction' ? `${value.count} txns`
        : key === 'card_testing' ? `${value.attempts} attempts`
        : '';

      activeSignals.push({
        label: SIGNAL_LABELS[key] || key,
        points: pts,
        detail,
      });
    }
  }

  if (activeSignals.length === 0) return null;

  // Sort by points descending
  activeSignals.sort((a, b) => b.points - a.points);

  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
      <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
        Signal Breakdown
      </h4>
      <div className="space-y-1.5">
        {activeSignals.map((sig, idx) => (
          <div key={idx} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                sig.points >= 15 ? 'bg-red-500' : sig.points >= 8 ? 'bg-orange-500' : 'bg-yellow-500'
              }`} />
              <span className="text-gray-700 truncate">{sig.label}</span>
              {sig.detail && (
                <span className="text-xs text-gray-400 truncate">({sig.detail})</span>
              )}
            </div>
            <span className="text-xs font-bold text-gray-600 flex-shrink-0 ml-2">+{sig.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// FRAUD OVERRIDE FORM (new — reason, ID check, notes)
// ============================================================================

const OVERRIDE_REASONS = [
  { value: '', label: 'Select override reason...' },
  { value: 'known_regular', label: 'Known regular customer' },
  { value: 'verified_id', label: 'Verified photo ID' },
  { value: 'callback_completed', label: 'Callback completed' },
  { value: 'manager_discretion', label: 'Manager discretion' },
  { value: 'other', label: 'Other (see notes)' },
];

function FraudOverrideForm({ overrideData, onChange }) {
  return (
    <div className="space-y-3">
      {/* ID Verification Checkbox */}
      <label className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
        <input
          type="checkbox"
          checked={overrideData.idVerified}
          onChange={(e) => onChange({ ...overrideData, idVerified: e.target.checked })}
          className="mt-0.5 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <p className="text-sm font-medium text-blue-800">
            I have verified the customer&rsquo;s government-issued photo ID
          </p>
          <p className="text-xs text-blue-600 mt-0.5">
            Driver&rsquo;s license, passport, or provincial ID card
          </p>
        </div>
      </label>

      {/* Override Reason Dropdown */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Override Reason</label>
        <select
          value={overrideData.reason}
          onChange={(e) => onChange({ ...overrideData, reason: e.target.value })}
          className="w-full h-10 px-3 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {OVERRIDE_REASONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
        <textarea
          value={overrideData.notes}
          onChange={(e) => onChange({ ...overrideData, notes: e.target.value })}
          rows={2}
          placeholder="Explain the override reason..."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>
  );
}

// ============================================================================
// SUCCESS STATE
// ============================================================================

function ApprovalSuccess({ managerName }) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-pulse">
        <CheckCircle className="w-12 h-12 text-green-600" />
      </div>
      <h3 className="text-xl font-bold text-green-800 mb-2">
        Approved
      </h3>
      <div className="flex items-center gap-2 text-gray-600">
        <CircleUser className="w-5 h-5" />
        <span className="text-sm">Approved by {managerName}</span>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN MODAL COMPONENT
// ============================================================================

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000;

/**
 * Manager approval modal with numeric PIN keypad
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {object} props.pendingOverride - Override details (may include signals, triggeredRules for fraud)
 * @param {function} props.onVerifyPin - Callback to verify PIN
 * @param {function} props.onCancel
 * @param {boolean} props.isLoading
 * @param {string} props.error
 * @param {object} props.approvalResult
 * @param {function} props.onClearError
 */
export function ManagerApprovalModal({
  isOpen,
  pendingOverride,
  onVerifyPin,
  onCancel,
  isLoading = false,
  error = null,
  approvalResult = null,
  onClearError,
}) {
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const maxPinLength = 6;

  // Fraud override form state (only used when overrideType === 'fraud_block')
  const isFraudOverride = pendingOverride?.overrideType === 'fraud_block';
  const [fraudForm, setFraudForm] = useState({ idVerified: false, reason: '', notes: '' });

  const isLockedOut = lockoutUntil && Date.now() < lockoutUntil;

  // Whether the fraud override form is complete enough to submit
  const fraudFormValid = !isFraudOverride || (fraudForm.reason !== '');

  // Update lockout countdown
  useEffect(() => {
    if (!lockoutUntil) return;
    const updateRemaining = () => {
      const remaining = Math.max(0, lockoutUntil - Date.now());
      setLockoutRemaining(remaining);
      if (remaining === 0) {
        setLockoutUntil(null);
        setAttempts(0);
      }
    };
    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  // Clear PIN and reset on modal open/close
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setFraudForm({ idVerified: false, reason: '', notes: '' });
      const storedLockout = sessionStorage.getItem('pin_lockout_until');
      if (storedLockout) {
        const lockoutTime = parseInt(storedLockout, 10);
        if (Date.now() < lockoutTime) {
          setLockoutUntil(lockoutTime);
        } else {
          sessionStorage.removeItem('pin_lockout_until');
          sessionStorage.removeItem('pin_attempts');
        }
      }
      const storedAttempts = sessionStorage.getItem('pin_attempts');
      if (storedAttempts) {
        setAttempts(parseInt(storedAttempts, 10));
      }
    }
  }, [isOpen]);

  // Clear PIN on error
  useEffect(() => {
    if (error) setPin('');
  }, [error]);

  // Handle keypad press
  const handleKeyPress = useCallback((key) => {
    if (isLoading) return;
    if (error && onClearError) onClearError();
    setPin((prev) => prev.length >= maxPinLength ? prev : prev + key);
  }, [isLoading, error, onClearError, maxPinLength]);

  // Handle backspace
  const handleBackspace = useCallback(() => {
    if (isLoading) return;
    setPin((prev) => prev.slice(0, -1));
  }, [isLoading]);

  // Handle clear
  const handleClear = useCallback(() => {
    if (isLoading) return;
    setPin('');
    if (error && onClearError) onClearError();
  }, [isLoading, error, onClearError]);

  // Handle submit with retry limiting
  const handleSubmit = useCallback(async () => {
    if (!pin || pin.length < 4 || isLoading || isLockedOut) return;
    if (!fraudFormValid) return;

    try {
      // For fraud overrides, include the form data with the PIN verification
      const extraData = isFraudOverride ? {
        fraudOverride: {
          idVerified: fraudForm.idVerified,
          reason: fraudForm.reason,
          notes: fraudForm.notes,
          riskScore: pendingOverride?.value,
          signals: pendingOverride?.signals,
        },
      } : {};

      const result = await onVerifyPin?.(pin, extraData);

      if (!result || result.error || !result.approved) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        sessionStorage.setItem('pin_attempts', newAttempts.toString());
        if (newAttempts >= MAX_PIN_ATTEMPTS) {
          const lockoutTime = Date.now() + LOCKOUT_DURATION_MS;
          setLockoutUntil(lockoutTime);
          sessionStorage.setItem('pin_lockout_until', lockoutTime.toString());
        }
      } else {
        setAttempts(0);
        sessionStorage.removeItem('pin_attempts');
        sessionStorage.removeItem('pin_lockout_until');
      }
    } catch {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      sessionStorage.setItem('pin_attempts', newAttempts.toString());
      if (newAttempts >= MAX_PIN_ATTEMPTS) {
        const lockoutTime = Date.now() + LOCKOUT_DURATION_MS;
        setLockoutUntil(lockoutTime);
        sessionStorage.setItem('pin_lockout_until', lockoutTime.toString());
      }
    }
  }, [pin, isLoading, onVerifyPin, attempts, isLockedOut, isFraudOverride, fraudForm, fraudFormValid, pendingOverride]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setPin('');
    onCancel?.();
  }, [onCancel]);

  // Keyboard support
  useEffect(() => {
    if (!isOpen || approvalResult) return;
    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') handleKeyPress(e.key);
      else if (e.key === 'Backspace') handleBackspace();
      else if (e.key === 'Escape') handleCancel();
      else if (e.key === 'Enter' && pin.length >= 4) handleSubmit();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, approvalResult, handleKeyPress, handleBackspace, handleCancel, handleSubmit, pin.length]);

  if (!isOpen) return null;

  // Show success state
  if (approvalResult?.approved) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4">
          <ApprovalSuccess managerName={approvalResult.managerName} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className={`bg-white rounded-2xl shadow-xl w-full mx-4 overflow-hidden ${
        isFraudOverride ? 'max-w-lg' : 'max-w-md'
      }`} style={{ maxHeight: '95vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b border-gray-200 ${
          isFraudOverride
            ? 'bg-gradient-to-r from-red-600 to-red-700'
            : 'bg-gradient-to-r from-blue-600 to-blue-700'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              {isFraudOverride ? (
                <ShieldAlert className="w-5 h-5 text-white" />
              ) : (
                <Lock className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isFraudOverride ? 'Fraud Override' : 'Manager Approval'}
              </h2>
              <p className={`text-sm ${isFraudOverride ? 'text-red-100' : 'text-blue-100'}`}>
                Enter manager PIN to continue
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="w-8 h-8 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Override reason badge */}
          {pendingOverride && (
            <OverrideReasonBadge
              overrideType={pendingOverride.overrideType}
              value={pendingOverride.displayValue || pendingOverride.overrideValue || pendingOverride.value}
              threshold={pendingOverride.threshold}
            />
          )}

          {/* Fraud signal breakdown — only for fraud overrides */}
          {isFraudOverride && pendingOverride?.signals && (
            <FraudSignalBreakdown signals={pendingOverride.signals} />
          )}

          {/* Fraud override form — ID verification, reason, notes */}
          {isFraudOverride && (
            <FraudOverrideForm overrideData={fraudForm} onChange={setFraudForm} />
          )}

          {/* Product info (if applicable — non-fraud overrides) */}
          {!isFraudOverride && pendingOverride?.productName && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Product</p>
              <p className="text-sm font-medium text-gray-900">{pendingOverride.productName}</p>
              {pendingOverride.quantity > 1 && (
                <p className="text-xs text-gray-500 mt-1">Quantity: {pendingOverride.quantity}</p>
              )}
            </div>
          )}

          {/* PIN Display */}
          <div className="py-4">
            <PinDots length={pin.length} maxLength={maxPinLength} />
          </div>

          {/* Validation: fraud form must have a reason */}
          {isFraudOverride && !fraudFormValid && pin.length >= 4 && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">Please select an override reason before submitting</p>
            </div>
          )}

          {/* Lockout message */}
          {isLockedOut && (
            <div className="p-3 bg-red-100 border border-red-300 rounded-lg">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">Too many failed attempts</p>
                  <p className="text-xs text-red-600">
                    Try again in {Math.ceil(lockoutRemaining / 1000)} seconds
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && !isLockedOut && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-sm text-red-700">{error}</p>
                  {attempts > 0 && attempts < MAX_PIN_ATTEMPTS && (
                    <p className="text-xs text-red-500 mt-1">
                      {MAX_PIN_ATTEMPTS - attempts} attempt{MAX_PIN_ATTEMPTS - attempts !== 1 ? 's' : ''} remaining
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Badge swipe placeholder */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <IdCard className="w-6 h-6 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Or swipe manager badge</p>
              <p className="text-xs text-gray-400">Badge reader coming soon</p>
            </div>
          </div>

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
              <KeypadButton
                key={key}
                onClick={() => handleKeyPress(key)}
                disabled={isLoading || pin.length >= maxPinLength}
              >
                {key}
              </KeypadButton>
            ))}
            <KeypadButton
              variant="clear"
              onClick={handleClear}
              disabled={isLoading}
            >
              Clear
            </KeypadButton>
            <KeypadButton
              onClick={() => handleKeyPress('0')}
              disabled={isLoading || pin.length >= maxPinLength}
            >
              0
            </KeypadButton>
            <KeypadButton
              onClick={handleBackspace}
              disabled={isLoading || pin.length === 0}
            >
              <Delete className="w-6 h-6" />
            </KeypadButton>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="
              flex-1 h-14
              text-gray-700 font-medium
              bg-gray-100 hover:bg-gray-200
              disabled:opacity-50 disabled:cursor-not-allowed
              rounded-xl
              transition-colors
            "
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || pin.length < 4 || isLockedOut || !fraudFormValid}
            className="
              flex-1 h-14
              flex items-center justify-center gap-2
              text-white font-bold
              bg-green-600 hover:bg-green-700
              disabled:bg-gray-300 disabled:cursor-not-allowed
              rounded-xl
              transition-colors
            "
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Verifying...
              </>
            ) : isLockedOut ? (
              <>
                <Lock className="w-5 h-5" />
                Locked
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5" />
                Verify & Approve
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ManagerApprovalModal;
