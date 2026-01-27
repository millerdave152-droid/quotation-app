/**
 * TeleTime POS - Financing Terms Acceptance Component
 * Displays financing terms and captures signature for acceptance
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  DocumentTextIcon,
  CheckCircleIcon,
  PencilIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Format date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Signature pad component
 */
function SignaturePad({ onSignatureChange, disabled = false }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Setup canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    // Set canvas size to match display size
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Style
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw baseline
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, rect.height - 30);
    ctx.lineTo(rect.width - 20, rect.height - 30);
    ctx.stroke();

    // Reset for drawing
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
  }, []);

  // Get coordinates from event
  const getCoordinates = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    if (e.touches) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }

    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // Start drawing
  const startDrawing = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }, [disabled, getCoordinates]);

  // Draw
  const draw = useCallback((e) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing, disabled, getCoordinates]);

  // Stop drawing
  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (hasSignature) {
      const canvas = canvasRef.current;
      const dataUrl = canvas.toDataURL('image/png');
      onSignatureChange?.(dataUrl);
    }
  }, [isDrawing, hasSignature, onSignatureChange]);

  // Clear signature
  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Redraw baseline
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, rect.height - 30);
    ctx.lineTo(rect.width - 20, rect.height - 30);
    ctx.stroke();

    // Reset for drawing
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;

    setHasSignature(false);
    onSignatureChange?.(null);
  }, [onSignatureChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <PencilIcon className="w-4 h-4" />
          Customer Signature
        </label>
        {hasSignature && (
          <button
            type="button"
            onClick={clearSignature}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>
      <div className="relative border-2 border-gray-200 rounded-xl bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-32 touch-none cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-400 text-sm">Sign here</p>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500">
        Sign using your finger or stylus
      </p>
    </div>
  );
}

/**
 * Terms checkbox
 */
function TermsCheckbox({ id, checked, onChange, label, required = false }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
      />
      <span className="text-sm text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
    </label>
  );
}

/**
 * Financing terms acceptance component
 * @param {object} props
 * @param {object} props.agreement - Agreement details
 * @param {object} props.paymentPlan - Payment plan details
 * @param {object} props.customer - Customer info
 * @param {function} props.onAccept - Accept terms with signature
 * @param {function} props.onBack - Go back
 * @param {boolean} props.submitting - Submitting state
 */
export function FinancingTermsAcceptance({
  agreement,
  paymentPlan,
  customer,
  onAccept,
  onBack,
  submitting = false,
}) {
  const [signature, setSignature] = useState(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedAutoPay, setAcceptedAutoPay] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = signature && acceptedTerms;

  // Handle accept
  const handleAccept = () => {
    if (!canSubmit) {
      setError('Please sign and accept the terms to continue');
      return;
    }
    setError(null);
    onAccept?.(signature);
  };

  return (
    <div className="space-y-6">
      {/* Agreement Header */}
      <div className="text-center pb-4 border-b border-gray-200">
        <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <DocumentTextIcon className="w-10 h-10 text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Financing Agreement</h2>
        <p className="text-gray-500 mt-1">
          Please review and sign to complete your financing
        </p>
      </div>

      {/* Key Terms Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <CurrencyDollarIcon className="w-4 h-4" />
            <span className="text-xs font-medium uppercase">Financed Amount</span>
          </div>
          <p className="text-xl font-bold text-gray-900 tabular-nums">
            {formatCurrency(paymentPlan?.principal || 0)}
          </p>
        </div>

        <div className="p-4 bg-green-50 rounded-xl">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <BanknotesIcon className="w-4 h-4" />
            <span className="text-xs font-medium uppercase">Monthly Payment</span>
          </div>
          <p className="text-xl font-bold text-green-700 tabular-nums">
            {formatCurrency(agreement?.monthlyPayment || paymentPlan?.monthlyPayment || 0)}
          </p>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <CalendarDaysIcon className="w-4 h-4" />
            <span className="text-xs font-medium uppercase">First Payment</span>
          </div>
          <p className="text-sm font-medium text-gray-900">
            {formatDate(agreement?.firstPaymentDate || paymentPlan?.firstPaymentDate)}
          </p>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <span className="text-xs font-medium uppercase">Term & APR</span>
          </div>
          <p className="text-sm font-medium text-gray-900">
            {paymentPlan?.termMonths} months @ {paymentPlan?.apr === 0 ? '0% APR' : `${paymentPlan?.apr}% APR`}
          </p>
        </div>
      </div>

      {/* Terms Document */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <h3 className="font-medium text-gray-900">Terms and Conditions</h3>
        </div>
        <div className="p-4 max-h-48 overflow-y-auto text-sm text-gray-600 space-y-3">
          <p>
            <strong>1. Payment Agreement:</strong> By signing below, I agree to make {paymentPlan?.termMonths} monthly
            payments of {formatCurrency(agreement?.monthlyPayment || paymentPlan?.monthlyPayment || 0)} starting on{' '}
            {formatDate(agreement?.firstPaymentDate || paymentPlan?.firstPaymentDate)}.
          </p>
          <p>
            <strong>2. Interest Rate:</strong> This financing agreement has an Annual Percentage Rate (APR)
            of {paymentPlan?.apr}%.{' '}
            {paymentPlan?.apr === 0
              ? 'This is a promotional 0% APR offer. Standard rates may apply if payments are missed.'
              : `Total interest charges will be ${formatCurrency(paymentPlan?.totalInterest || 0)}.`
            }
          </p>
          <p>
            <strong>3. Late Payments:</strong> Payments are due on the same day each month. Late payments
            may result in a late fee of up to $25 and may affect your promotional APR rate.
          </p>
          <p>
            <strong>4. Early Payoff:</strong> You may pay off the remaining balance at any time without
            penalty. Contact us for your current payoff amount.
          </p>
          <p>
            <strong>5. Default:</strong> Failure to make payments as agreed may result in collection
            activity and reporting to credit bureaus.
          </p>
          <p>
            <strong>6. Dispute Resolution:</strong> Any disputes will be resolved through binding
            arbitration in accordance with the terms outlined in our full financing agreement.
          </p>
        </div>
      </div>

      {/* Checkboxes */}
      <div className="space-y-3">
        <TermsCheckbox
          id="accept-terms"
          checked={acceptedTerms}
          onChange={setAcceptedTerms}
          label="I have read and agree to the financing terms and conditions"
          required
        />
        <TermsCheckbox
          id="accept-autopay"
          checked={acceptedAutoPay}
          onChange={setAcceptedAutoPay}
          label="Enable automatic monthly payments (optional - can be changed later)"
        />
      </div>

      {/* Signature Pad */}
      <SignaturePad
        onSignatureChange={setSignature}
        disabled={submitting}
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Customer Confirmation */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-700">
          <strong>Signing as:</strong> {customer?.name || customer?.customerName || 'Customer'}
          {customer?.email && ` (${customer.email})`}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex-1 h-14 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={!canSubmit || submitting}
          className={`
            flex-1 h-14 text-lg font-bold rounded-xl transition-colors
            flex items-center justify-center gap-2
            ${canSubmit && !submitting
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <CheckCircleIcon className="w-6 h-6" />
              <span>Complete Financing</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default FinancingTermsAcceptance;
