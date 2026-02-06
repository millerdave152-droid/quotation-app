/**
 * TeleTime POS - Manager Approval Modal
 *
 * Modal for manager PIN verification when overrides exceed thresholds.
 * Features touch-friendly numeric keypad for POS screen.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  XMarkIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  BackspaceIcon,
  CheckCircleIcon,
  UserCircleIcon,
  IdentificationIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

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
      default:
        return 'Manager approval required for this action';
    }
  };

  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-start gap-2">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">
            {getReasonText()}
          </p>
          {value !== undefined && threshold !== undefined && (
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
// SUCCESS STATE
// ============================================================================

function ApprovalSuccess({ managerName, onClose }) {
  useEffect(() => {
    // Auto-close after showing success
    const timer = setTimeout(onClose, 1500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-pulse">
        <CheckCircleIcon className="w-12 h-12 text-green-600" />
      </div>
      <h3 className="text-xl font-bold text-green-800 mb-2">
        Approved
      </h3>
      <div className="flex items-center gap-2 text-gray-600">
        <UserCircleIcon className="w-5 h-5" />
        <span className="text-sm">Approved by {managerName}</span>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN MODAL COMPONENT
// ============================================================================

// PIN retry limiting constants
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Manager approval modal with numeric PIN keypad
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {object} props.pendingOverride - Override details
 * @param {function} props.onVerifyPin - Callback to verify PIN
 * @param {function} props.onCancel - Callback to cancel
 * @param {boolean} props.isLoading - Loading state
 * @param {string} props.error - Error message
 * @param {object} props.approvalResult - Approval result (if approved)
 * @param {function} props.onClearError - Clear error callback
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

  // Check if currently locked out
  const isLockedOut = lockoutUntil && Date.now() < lockoutUntil;

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

  // Clear PIN and reset attempts when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setPin('');
      // Check for existing lockout in sessionStorage
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
    if (error) {
      setPin('');
    }
  }, [error]);

  // Handle keypad press
  const handleKeyPress = useCallback((key) => {
    if (isLoading) return;

    // Clear any existing error when typing
    if (error && onClearError) {
      onClearError();
    }

    setPin((prev) => {
      if (prev.length >= maxPinLength) return prev;
      return prev + key;
    });
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
    if (error && onClearError) {
      onClearError();
    }
  }, [isLoading, error, onClearError]);

  // Handle submit with retry limiting
  const handleSubmit = useCallback(async () => {
    if (!pin || pin.length < 4 || isLoading || isLockedOut) return;

    try {
      const result = await onVerifyPin?.(pin);

      // If PIN verification failed, increment attempts
      if (!result || result.error || !result.approved) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        sessionStorage.setItem('pin_attempts', newAttempts.toString());

        // Check if should lock out
        if (newAttempts >= MAX_PIN_ATTEMPTS) {
          const lockoutTime = Date.now() + LOCKOUT_DURATION_MS;
          setLockoutUntil(lockoutTime);
          sessionStorage.setItem('pin_lockout_until', lockoutTime.toString());
        }
      } else {
        // Success - clear attempts
        setAttempts(0);
        sessionStorage.removeItem('pin_attempts');
        sessionStorage.removeItem('pin_lockout_until');
      }
    } catch (err) {
      // Network error or other failure - still count as attempt
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      sessionStorage.setItem('pin_attempts', newAttempts.toString());

      if (newAttempts >= MAX_PIN_ATTEMPTS) {
        const lockoutTime = Date.now() + LOCKOUT_DURATION_MS;
        setLockoutUntil(lockoutTime);
        sessionStorage.setItem('pin_lockout_until', lockoutTime.toString());
      }
    }
  }, [pin, isLoading, onVerifyPin, attempts, isLockedOut]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setPin('');
    onCancel?.();
  }, [onCancel]);

  // Keyboard support
  useEffect(() => {
    if (!isOpen || approvalResult) return;

    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && pin.length >= 4) {
        handleSubmit();
      }
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
          <ApprovalSuccess
            managerName={approvalResult.managerName}
            onClose={handleCancel}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <LockClosedIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Manager Approval</h2>
              <p className="text-sm text-blue-100">Enter manager PIN to continue</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="w-8 h-8 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Override reason */}
          {pendingOverride && (
            <OverrideReasonBadge
              overrideType={pendingOverride.overrideType}
              value={pendingOverride.displayValue || pendingOverride.overrideValue}
              threshold={pendingOverride.threshold}
            />
          )}

          {/* Product info (if applicable) */}
          {pendingOverride?.productName && (
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

          {/* Lockout message */}
          {isLockedOut && (
            <div className="p-3 bg-red-100 border border-red-300 rounded-lg">
              <div className="flex items-center gap-2">
                <LockClosedIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
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
                <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
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
            <IdentificationIcon className="w-6 h-6 text-gray-400" />
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
              <BackspaceIcon className="w-6 h-6" />
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
            disabled={isLoading || pin.length < 4 || isLockedOut}
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
                <LockClosedIcon className="w-5 h-5" />
                Locked
              </>
            ) : (
              <>
                <ShieldCheckIcon className="w-5 h-5" />
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
