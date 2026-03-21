/**
 * TeleTime POS - Payment Complete Component
 * Success screen with receipt options
 */

import { useEffect, useState } from 'react';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { CheckCircle, CloudUpload, CreditCard, Mail, Printer, RefreshCw, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('pos_token') || localStorage.getItem('auth_token') || '';
}

/**
 * Success animation component
 */
function SuccessAnimation() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Trigger animation after mount
    const timer = setTimeout(() => setShow(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative">
      {/* Background circle */}
      <div
        className={`
          w-32 h-32 rounded-full bg-green-100
          flex items-center justify-center
          transition-transform duration-500 ease-out
          ${show ? 'scale-100' : 'scale-0'}
        `}
      >
        {/* Checkmark */}
        <CheckCircle
          className={`
            w-20 h-20 text-green-600
            transition-all duration-500 delay-200
            ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}
          `}
        />
      </div>

      {/* Confetti effect */}
      {show && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-green-400 animate-ping"
              style={{
                top: '50%',
                left: '50%',
                transform: `rotate(${i * 45}deg) translateY(-50px)`,
                animationDelay: `${i * 100}ms`,
                animationDuration: '1s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Receipt option button
 */
function ReceiptOption({ icon: Icon, label, description, onClick, selected }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex items-center gap-4 p-4
        border-2 rounded-xl
        transition-all duration-150
        ${
          selected
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 hover:border-gray-300 bg-white'
        }
      `}
    >
      <div
        className={`
          w-12 h-12 rounded-lg flex items-center justify-center
          ${selected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}
        `}
      >
        <Icon className="w-6 h-6" />
      </div>
      <div className="text-left">
        <p className="font-semibold text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </button>
  );
}

/**
 * Payment complete component
 * @param {object} props
 * @param {object} props.transaction - Completed transaction data
 * @param {function} props.onNewTransaction - Callback to start new transaction
 * @param {function} props.onPrintReceipt - Callback to print receipt
 * @param {function} props.onEmailReceipt - Callback to email receipt
 * @param {string} props.customerEmail - Customer email if available
 * @param {string} props.signatureWarning - Non-blocking signature upload warning
 */
export function PaymentComplete({
  transaction,
  payments: paymentsProp,
  onNewTransaction,
  onPrintReceipt,
  onEmailReceipt,
  customerEmail,
  signatureWarning,
  customerId,
}) {
  const [receiptOption, setReceiptOption] = useState(null);
  const [emailAddress, setEmailAddress] = useState(customerEmail || '');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [saveCardState, setSaveCardState] = useState('idle'); // idle | saving | saved | error | dismissed

  // Determine if card save is available
  const payments = paymentsProp || transaction?.payments || [];
  const cardPayment = payments.find(p =>
    ['credit', 'debit'].includes(p.paymentMethod) && p.cardLastFour
  );
  const canSaveCard = !!(customerId && cardPayment && saveCardState === 'idle');

  const handleSaveCard = async () => {
    if (!cardPayment || !customerId) return;
    setSaveCardState('saving');
    try {
      const res = await fetch(`${API_BASE}/customers/${customerId}/payment-methods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          dataKey: cardPayment.monerisDataKey || cardPayment.dataKey,
          lastFour: cardPayment.cardLastFour,
          cardBin: cardPayment.cardBin,
          cardType: cardPayment.paymentMethod === 'debit' ? 'debit' : 'credit',
          cardBrand: cardPayment.cardBrand,
          expDate: cardPayment.expDate,
          isDefault: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveCardState('saved');
      } else {
        setSaveCardState('error');
      }
    } catch {
      setSaveCardState('error');
    }
  };

  // Extract transaction details
  const transactionNumber = transaction?.transactionNumber || transaction?.transaction_number || 'N/A';
  const totalAmount = transaction?.totalAmount || transaction?.total_amount
    || transaction?.totals?.totalAmount || transaction?.totals?.amountDue || 0;

  // Handle receipt action
  const handleReceiptAction = async () => {
    if (!receiptOption) return;

    setIsSending(true);

    try {
      if (receiptOption === 'print' || receiptOption === 'both') {
        await onPrintReceipt?.(transaction);
      }

      if ((receiptOption === 'email' || receiptOption === 'both') && emailAddress) {
        await onEmailReceipt?.(transaction, emailAddress);
      }

      setSent(true);
    } catch (error) {
      console.error('Receipt error:', error);
    } finally {
      setIsSending(false);
    }
  };

  // Offline transaction variant
  const isOffline = transaction?.offline === true;

  if (isOffline) {
    return (
      <div className="flex flex-col h-full items-center overflow-y-auto p-8">
        <div className="flex-shrink-0 mt-auto" />
        {/* Offline Icon */}
        <div className="w-32 h-32 rounded-full bg-amber-100 flex items-center justify-center">
          <CloudUpload className="w-20 h-20 text-amber-600" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-2">
          Saved Offline
        </h2>

        <div className="w-full max-w-md mb-6 p-4 bg-amber-50 border-2 border-amber-200 rounded-xl text-center">
          <p className="text-sm text-amber-800 mb-2">
            Transaction saved offline — will sync automatically when connection is restored.
          </p>
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">Reference</p>
          <p className="text-sm font-mono font-bold text-amber-900 break-all">
            {transaction.clientTransactionId}
          </p>
        </div>

        <div className="text-center mb-8">
          <p className="text-3xl font-bold text-amber-600 tabular-nums">
            {formatCurrency(transaction.totalAmount || 0)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {formatDateTime(new Date(transaction.createdAt))}
          </p>
        </div>

        {/* New Transaction Button */}
        <button
          type="button"
          onClick={onNewTransaction}
          className="
            w-full max-w-md h-14
            flex items-center justify-center gap-2
            bg-green-600 hover:bg-green-700
            text-white text-lg font-bold
            rounded-xl
            transition-colors duration-150
          "
        >
          <RefreshCw className="w-6 h-6" />
          New Transaction
        </button>
        <div className="flex-shrink-0 mb-auto" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full items-center overflow-y-auto p-8">
      <div className="flex-shrink-0 mt-auto" />
      {/* Success Animation */}
      <SuccessAnimation />

      {/* Success Message */}
      <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-2">
        Payment Complete!
      </h2>

      {/* Reference Number - prominent display */}
      <div className="w-full max-w-md mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl text-center">
        <p className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-1">Reference Number</p>
        <p className="text-2xl font-mono font-bold text-blue-900 tracking-wide">
          {transactionNumber}
        </p>
      </div>

      {/* Amount & Date */}
      <div className="text-center mb-8">
        <p className="text-3xl font-bold text-green-600 tabular-nums">
          {formatCurrency(totalAmount)}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          {formatDateTime(new Date())}
        </p>
      </div>

      {/* Signature Warning */}
      {signatureWarning && (
        <div className="w-full max-w-md mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          {signatureWarning}
        </div>
      )}

      {/* Payment Summary */}
      {payments.length > 0 && (
        <div className="w-full max-w-md mb-8 p-4 bg-gray-50 rounded-xl">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Payments</h3>
          <div className="space-y-2">
            {payments.map((payment, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-gray-700 capitalize">
                  {payment.paymentMethod}
                  {payment.cardLastFour && ` •••• ${payment.cardLastFour}`}
                </span>
                <span className="font-medium text-gray-900 tabular-nums">
                  {formatCurrency(payment.amount)}
                </span>
              </div>
            ))}
            {payments.some(p => p.changeGiven > 0) && (
              <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                <span className="text-gray-700">Change Given</span>
                <span className="font-medium text-gray-900 tabular-nums">
                  {formatCurrency(payments.reduce((sum, p) => sum + (p.changeGiven || 0), 0))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save Card Prompt */}
      {canSaveCard && (
        <div className="w-full max-w-md mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
          <div className="flex items-start gap-3">
            <CreditCard className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">Save this card for future purchases?</p>
              <p className="text-xs text-blue-700 mt-0.5">
                {cardPayment.cardBrand?.toUpperCase()} ending in {cardPayment.cardLastFour}
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={handleSaveCard}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
                  Save Card
                </button>
                <button onClick={() => setSaveCardState('dismissed')}
                  className="px-4 py-1.5 text-blue-700 text-sm font-medium hover:text-blue-900">
                  No Thanks
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {saveCardState === 'saving' && (
        <div className="w-full max-w-md mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-center text-sm text-blue-700">
          Saving card securely...
        </div>
      )}
      {saveCardState === 'saved' && (
        <div className="w-full max-w-md mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-center">
          <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-1" />
          <p className="text-sm text-green-700 font-medium">Card saved for future purchases</p>
        </div>
      )}
      {saveCardState === 'error' && (
        <div className="w-full max-w-md mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-center text-sm text-amber-700">
          Could not save card. You can add it later from the customer profile.
        </div>
      )}

      {/* Receipt Options */}
      {!sent && (
        <div className="w-full max-w-md space-y-3 mb-6">
          <h3 className="text-sm font-medium text-gray-700">Receipt Options</h3>

          <ReceiptOption
            icon={Printer}
            label="Print Receipt"
            description="Print to thermal printer"
            onClick={() => setReceiptOption('print')}
            selected={receiptOption === 'print'}
          />

          <ReceiptOption
            icon={Mail}
            label="Email Receipt"
            description="Send to customer's email"
            onClick={() => setReceiptOption('email')}
            selected={receiptOption === 'email'}
          />

          <ReceiptOption
            icon={() => (
              <div className="flex">
                <Printer className="w-4 h-4" />
                <span className="mx-0.5">+</span>
                <Mail className="w-4 h-4" />
              </div>
            )}
            label="Both"
            description="Print and email receipt"
            onClick={() => setReceiptOption('both')}
            selected={receiptOption === 'both'}
          />

          <ReceiptOption
            icon={X}
            label="No Receipt"
            description="Skip receipt"
            onClick={() => setReceiptOption('none')}
            selected={receiptOption === 'none'}
          />

          {/* Email Input */}
          {(receiptOption === 'email' || receiptOption === 'both') && (
            <input
              type="email"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              placeholder="customer@email.com"
              className="
                w-full h-12 px-4
                border-2 border-gray-200 rounded-xl
                focus:border-blue-500 focus:ring-2 focus:ring-blue-100
                transition-colors duration-150
              "
            />
          )}

          {/* Action Button */}
          {receiptOption && (
            <button
              type="button"
              onClick={receiptOption === 'none' ? onNewTransaction : handleReceiptAction}
              disabled={isSending || ((receiptOption === 'email' || receiptOption === 'both') && !emailAddress)}
              className="
                w-full h-14
                flex items-center justify-center gap-2
                bg-blue-600 hover:bg-blue-700
                disabled:bg-gray-300 disabled:cursor-not-allowed
                text-white text-lg font-semibold
                rounded-xl
                transition-colors duration-150
              "
            >
              {isSending ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Sending...</span>
                </>
              ) : receiptOption === 'none' ? (
                'Continue'
              ) : (
                'Send Receipt'
              )}
            </button>
          )}
        </div>
      )}

      {/* Receipt Sent Confirmation */}
      {sent && (
        <div className="w-full max-w-md mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-center">
          <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="text-green-700 font-medium">Receipt sent successfully!</p>
        </div>
      )}

      {/* New Transaction Button */}
      <button
        type="button"
        onClick={onNewTransaction}
        className="
          w-full max-w-md h-14
          flex items-center justify-center gap-2
          bg-green-600 hover:bg-green-700
          text-white text-lg font-bold
          rounded-xl
          transition-colors duration-150
        "
      >
        <RefreshCw className="w-6 h-6" />
        New Transaction
      </button>
      <div className="flex-shrink-0 mb-auto" />
    </div>
  );
}

export default PaymentComplete;
