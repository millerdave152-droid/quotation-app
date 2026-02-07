/**
 * TeleTime POS - Cash Payment Component
 * Cash payment entry with quick amounts and numpad
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { ArrowLeftIcon, BackspaceIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

const shakeKeyframes = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
.animate-shake { animation: shake 0.3s ease-in-out; }
`;

const MAX_INPUT_LENGTH = 10;

const sanitizeCashInput = (value) => {
  if (!value) return '';
  const cleaned = value.replace(/[^0-9.]/g, '');
  const dotIndex = cleaned.indexOf('.');
  let whole = cleaned;
  let decimals = '';

  if (dotIndex !== -1) {
    whole = cleaned.slice(0, dotIndex);
    decimals = cleaned.slice(dotIndex + 1).replace(/\./g, '');
  }

  if (whole.length > 1) {
    whole = whole.replace(/^0+/, '') || '0';
  }

  if (decimals.length > 2) decimals = decimals.slice(0, 2);

  return decimals ? `${whole}.${decimals}` : whole;
};

/**
 * Numpad button component
 */
function NumpadButton({ children, onClick, variant = 'default', className = '', ariaLabel = '' }) {
  const variantClasses = {
    default: 'bg-gray-100 hover:bg-gray-200 text-gray-900',
    action: 'bg-blue-600 hover:bg-blue-700 text-white',
    clear: 'bg-red-100 hover:bg-red-200 text-red-700',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || (typeof children === 'string' ? `Enter ${children}` : undefined)}
      className={`
        h-16 w-full
        flex items-center justify-center
        text-2xl font-semibold
        rounded-xl
        transition-colors duration-150
        active:scale-[0.98]
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </button>
  );
}

/**
 * Quick amount button component
 */
function QuickAmountButton({ amount, label, onClick, isExact }) {
  return (
    <button
      type="button"
      onClick={() => onClick(amount)}
      className={`
        h-14 px-4
        flex flex-col items-center justify-center
        rounded-xl
        transition-all duration-150
        active:scale-[0.98]
        ${
          isExact
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
        }
      `}
    >
      <span className="text-lg font-bold tabular-nums">
        {formatCurrency(amount)}
      </span>
      {label && <span className="text-xs opacity-75">{label}</span>}
    </button>
  );
}

/**
 * Cash payment component
 * @param {object} props
 * @param {number} props.amountDue - Amount to collect
 * @param {function} props.onComplete - Callback when payment completed
 * @param {function} props.onBack - Callback to go back
 * @param {boolean} props.isPartial - Whether this is a partial payment
 */
export function CashPayment({
  amountDue,
  onComplete,
  onBack,
  isPartial = false,
}) {
  const [inputValue, setInputValue] = useState('');
  const [shake, setShake] = useState(false);
  const [showHighlight, setShowHighlight] = useState(true);
  const tenderedRef = useRef(null);

  // Auto-dismiss highlight after mount
  useEffect(() => {
    const timer = setTimeout(() => setShowHighlight(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Shake feedback helper
  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }, []);

  // Parse tendered amount
  const tenderedAmount = useMemo(() => {
    if (!inputValue) return 0;
    return parseFloat(inputValue) || 0;
  }, [inputValue]);

  // Calculate change
  const changeAmount = useMemo(() => {
    return Math.max(0, tenderedAmount - amountDue);
  }, [tenderedAmount, amountDue]);

  // Check if enough tendered
  const isEnough = tenderedAmount >= amountDue;

  // Generate quick amounts
  const quickAmounts = useMemo(() => {
    const amounts = [];

    // Exact amount
    amounts.push({ amount: amountDue, label: 'Exact', isExact: true });

    // Round up to nearest $5
    const roundTo5 = Math.ceil(amountDue / 5) * 5;
    if (roundTo5 > amountDue) {
      amounts.push({ amount: roundTo5, label: null });
    }

    // Round up to nearest $10
    const roundTo10 = Math.ceil(amountDue / 10) * 10;
    if (roundTo10 > amountDue && roundTo10 !== roundTo5) {
      amounts.push({ amount: roundTo10, label: null });
    }

    // Round up to nearest $20
    const roundTo20 = Math.ceil(amountDue / 20) * 20;
    if (roundTo20 > amountDue && roundTo20 !== roundTo10) {
      amounts.push({ amount: roundTo20, label: null });
    }

    // $50 if reasonable
    if (50 >= amountDue && 50 <= amountDue * 2) {
      amounts.push({ amount: 50, label: null });
    }

    // $100 if reasonable
    if (100 >= amountDue && 100 <= amountDue * 3) {
      amounts.push({ amount: 100, label: null });
    }

    // Deduplicate and limit to 5
    const unique = [...new Map(amounts.map(a => [a.amount, a])).values()];
    return unique.slice(0, 5);
  }, [amountDue]);

  // Handle numpad input
  const handleNumpadPress = useCallback((key) => {
    let rejected = false;

    setInputValue((prev) => {
      const next = key === '.' ? `${prev}.` : `${prev}${key}`;
      const sanitized = sanitizeCashInput(next);
      if (sanitized.length > MAX_INPUT_LENGTH) { rejected = true; return prev; }
      return sanitized;
    });

    // Trigger shake after state update if input was rejected
    if (rejected) triggerShake();
  }, [triggerShake]);

  // Handle backspace
  const handleBackspace = useCallback(() => {
    setInputValue((prev) => prev.slice(0, -1));
  }, []);

  // Handle clear
  const handleClear = useCallback(() => {
    setInputValue('');
  }, []);

  const handleInputChange = useCallback((e) => {
    const sanitized = sanitizeCashInput(e.target.value);
    if (sanitized.length > MAX_INPUT_LENGTH) {
      triggerShake();
      return;
    }
    setInputValue(sanitized);
  }, [triggerShake]);

  // Handle quick amount selection
  const handleQuickAmount = useCallback((amount) => {
    setInputValue(amount.toFixed(2));
  }, []);

  // Handle complete (full payment)
  const handleComplete = useCallback(() => {
    if (!isEnough) return;

    onComplete?.({
      paymentMethod: 'cash',
      amount: isPartial ? tenderedAmount : amountDue,
      cashTendered: tenderedAmount,
      changeGiven: changeAmount,
    });
  }, [isEnough, onComplete, isPartial, tenderedAmount, amountDue, changeAmount]);

  // Handle partial payment (for split payment flow)
  const handlePartialPayment = useCallback(() => {
    if (tenderedAmount <= 0 || isEnough) return;

    onComplete?.({
      paymentMethod: 'cash',
      amount: tenderedAmount,
      cashTendered: tenderedAmount,
      changeGiven: 0,
    });
  }, [tenderedAmount, isEnough, onComplete]);

  return (
    <div className="flex flex-col h-full">
      <style>{shakeKeyframes}</style>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back to payment selection"
          className="
            w-10 h-10
            flex items-center justify-center
            text-gray-500 hover:text-gray-700
            hover:bg-gray-100
            rounded-lg
            transition-colors duration-150
          "
        >
          <ArrowLeftIcon className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold text-gray-900">Cash Payment</h2>
      </div>

      {/* Amount Due */}
      <div className="text-center mb-6">
        <p className="text-sm text-gray-500 mb-1">Amount Due</p>
        <p className="text-3xl font-bold text-gray-900 tabular-nums">
          {formatCurrency(amountDue)}
        </p>
      </div>

      {/* Quick Amounts */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        {quickAmounts.map((qa, index) => (
          <QuickAmountButton
            key={index}
            amount={qa.amount}
            label={qa.label}
            onClick={handleQuickAmount}
            isExact={qa.isExact}
          />
        ))}
      </div>

      {/* Tendered Display */}
      <div
        ref={tenderedRef}
        className={`
          mb-4 p-4 bg-gray-50 rounded-xl transition-all duration-300
          ${showHighlight ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
          ${shake ? 'animate-shake' : ''}
        `}
      >
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-500">
            Cash Tendered <span className="text-red-500">*</span>
          </span>
          <div className="flex items-center gap-1">
            <span className="text-3xl font-bold text-gray-900">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="0.00"
              aria-label="Cash tendered amount"
              className="
                w-32
                text-3xl font-bold text-gray-900 tabular-nums text-right
                bg-transparent outline-none
                placeholder:text-gray-400
              "
            />
          </div>
        </div>

        {!inputValue && (
          <p className="text-xs text-gray-400 mb-2">
            Enter amount or tap a quick option above
          </p>
        )}

        {tenderedAmount > 0 && (
          <div className="flex justify-between items-center pt-2 border-t border-gray-200">
            <span className="text-sm text-gray-500">Change Due</span>
            <span
              className={`text-2xl font-bold tabular-nums ${
                isEnough ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {isEnough ? formatCurrency(changeAmount) : `-${formatCurrency(amountDue - tenderedAmount)}`}
            </span>
          </div>
        )}
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
          <NumpadButton key={key} onClick={() => handleNumpadPress(key)}>
            {key}
          </NumpadButton>
        ))}
        <NumpadButton onClick={() => handleNumpadPress('.')} ariaLabel="Enter decimal point">.</NumpadButton>
        <NumpadButton onClick={() => handleNumpadPress('0')}>0</NumpadButton>
        <NumpadButton onClick={handleBackspace} ariaLabel="Backspace">
          <BackspaceIcon className="w-6 h-6" />
        </NumpadButton>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 mt-auto">
        <NumpadButton variant="clear" onClick={handleClear}>
          Clear
        </NumpadButton>
        {isEnough ? (
          <button
            type="button"
            onClick={handleComplete}
            className="
              h-16
              flex items-center justify-center
              bg-green-600 hover:bg-green-700
              text-white text-xl font-bold
              rounded-xl
              transition-colors duration-150
              active:scale-[0.98]
            "
          >
            Complete
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePartialPayment}
            disabled={tenderedAmount <= 0}
            className="
              h-16
              flex flex-col items-center justify-center
              bg-blue-600 hover:bg-blue-700
              disabled:bg-gray-300 disabled:cursor-not-allowed
              text-white font-bold
              rounded-xl
              transition-colors duration-150
              active:scale-[0.98]
            "
          >
            <span className="text-lg">Apply Partial</span>
            {tenderedAmount > 0 && (
              <span className="text-xs font-normal opacity-90">
                {formatCurrency(amountDue - tenderedAmount)} remaining
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default CashPayment;
