import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { authFetch } from '../services/authFetch';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * PaymentPortal - Customer-facing payment page
 * Accessed via payment link token from quote/invoice emails
 */
const PaymentPortal = () => {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentData, setPaymentData] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('full');
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [receipt, setReceipt] = useState(null);

  // Card form state
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardErrors, setCardErrors] = useState({});

  useEffect(() => {
    fetchPaymentDetails();
  }, [token]);

  const fetchPaymentDetails = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_URL}/api/stripe/payment-link/${token}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Invalid or expired payment link');
      }

      setPaymentData(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format((cents || 0) / 100);
  };

  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(' ') : value;
  };

  const formatExpiry = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  const validateCard = () => {
    const errors = {};

    if (!cardNumber || cardNumber.replace(/\s/g, '').length < 15) {
      errors.cardNumber = 'Valid card number required';
    }
    if (!expiry || expiry.length < 5) {
      errors.expiry = 'Valid expiry required (MM/YY)';
    }
    if (!cvc || cvc.length < 3) {
      errors.cvc = 'Valid CVC required';
    }
    if (!cardName.trim()) {
      errors.cardName = 'Cardholder name required';
    }

    setCardErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getPaymentAmount = () => {
    if (!paymentData) return 0;

    if (paymentMethod === 'deposit') {
      return paymentData.deposit_amount_cents || Math.round(paymentData.total_cents * 0.25);
    }
    return paymentData.balance_due_cents || paymentData.total_cents;
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();

    if (!validateCard()) return;

    setProcessing(true);
    try {
      const response = await authFetch(`${API_URL}/api/stripe/process-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          amount_cents: getPaymentAmount(),
          payment_type: paymentMethod,
          card: {
            number: cardNumber.replace(/\s/g, ''),
            exp_month: expiry.split('/')[0],
            exp_year: '20' + expiry.split('/')[1],
            cvc,
            name: cardName
          }
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Payment failed');
      }

      setReceipt(data.data);
      setPaymentSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.loadingSpinner} />
          <p style={styles.loadingText}>Loading payment details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !paymentData) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.errorIcon}>!</div>
          <h2 style={styles.errorTitle}>Payment Link Error</h2>
          <p style={styles.errorText}>{error}</p>
          <p style={styles.helpText}>
            If you believe this is an error, please contact us for assistance.
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (paymentSuccess) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successIcon}>✓</div>
          <h2 style={styles.successTitle}>Payment Successful!</h2>
          <p style={styles.successText}>
            Thank you for your payment of {formatCurrency(getPaymentAmount())}
          </p>

          {receipt && (
            <div style={styles.receipt}>
              <h3 style={styles.receiptTitle}>Receipt Details</h3>
              <div style={styles.receiptRow}>
                <span>Confirmation #:</span>
                <span style={styles.receiptValue}>{receipt.confirmation_number}</span>
              </div>
              <div style={styles.receiptRow}>
                <span>Date:</span>
                <span>{new Date().toLocaleDateString()}</span>
              </div>
              <div style={styles.receiptRow}>
                <span>Amount Paid:</span>
                <span style={styles.receiptValue}>{formatCurrency(getPaymentAmount())}</span>
              </div>
              {receipt.remaining_balance_cents > 0 && (
                <div style={styles.receiptRow}>
                  <span>Remaining Balance:</span>
                  <span>{formatCurrency(receipt.remaining_balance_cents)}</span>
                </div>
              )}
            </div>
          )}

          <p style={styles.confirmationText}>
            A confirmation email has been sent to {paymentData?.customer_email}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Complete Your Payment</h1>
          <p style={styles.subtitle}>
            {paymentData?.quote_number ? `Quote #${paymentData.quote_number}` :
             paymentData?.invoice_number ? `Invoice #${paymentData.invoice_number}` : ''}
          </p>
        </div>

        {/* Order Summary */}
        <div style={styles.summary}>
          <h3 style={styles.summaryTitle}>Order Summary</h3>

          {paymentData?.items?.map((item, idx) => (
            <div key={idx} style={styles.lineItem}>
              <span style={styles.itemName}>
                {item.manufacturer} {item.model}
                {item.quantity > 1 && ` x${item.quantity}`}
              </span>
              <span>{formatCurrency(item.total_cents)}</span>
            </div>
          ))}

          <div style={styles.divider} />

          <div style={styles.totalRow}>
            <span>Subtotal</span>
            <span>{formatCurrency(paymentData?.subtotal_cents)}</span>
          </div>

          {paymentData?.discount_cents > 0 && (
            <div style={styles.totalRow}>
              <span style={styles.discountText}>Discount</span>
              <span style={styles.discountText}>-{formatCurrency(paymentData.discount_cents)}</span>
            </div>
          )}

          <div style={styles.totalRow}>
            <span>Tax</span>
            <span>{formatCurrency(paymentData?.tax_cents)}</span>
          </div>

          <div style={{ ...styles.totalRow, ...styles.grandTotal }}>
            <span>Total</span>
            <span>{formatCurrency(paymentData?.total_cents)}</span>
          </div>

          {paymentData?.amount_paid_cents > 0 && (
            <>
              <div style={styles.totalRow}>
                <span>Amount Paid</span>
                <span>-{formatCurrency(paymentData.amount_paid_cents)}</span>
              </div>
              <div style={{ ...styles.totalRow, ...styles.balanceDue }}>
                <span>Balance Due</span>
                <span>{formatCurrency(paymentData.balance_due_cents)}</span>
              </div>
            </>
          )}
        </div>

        {/* Payment Options */}
        {paymentData?.allow_deposit && paymentData?.balance_due_cents === paymentData?.total_cents && (
          <div style={styles.paymentOptions}>
            <h3 style={styles.optionsTitle}>Payment Options</h3>

            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="paymentMethod"
                value="full"
                checked={paymentMethod === 'full'}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={styles.radio}
              />
              <div style={styles.radioContent}>
                <span style={styles.radioTitle}>Pay in Full</span>
                <span style={styles.radioAmount}>{formatCurrency(paymentData.total_cents)}</span>
              </div>
            </label>

            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="paymentMethod"
                value="deposit"
                checked={paymentMethod === 'deposit'}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={styles.radio}
              />
              <div style={styles.radioContent}>
                <span style={styles.radioTitle}>Pay Deposit (25%)</span>
                <span style={styles.radioAmount}>
                  {formatCurrency(paymentData.deposit_amount_cents || Math.round(paymentData.total_cents * 0.25))}
                </span>
              </div>
            </label>
          </div>
        )}

        {/* Payment Form */}
        <form onSubmit={handleSubmitPayment} style={styles.form}>
          <h3 style={styles.formTitle}>Payment Details</h3>

          {error && (
            <div style={styles.errorBanner}>
              {error}
            </div>
          )}

          <div style={styles.formGroup}>
            <label style={styles.label}>Cardholder Name</label>
            <input
              type="text"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="Name on card"
              style={{
                ...styles.input,
                ...(cardErrors.cardName ? styles.inputError : {})
              }}
            />
            {cardErrors.cardName && <span style={styles.fieldError}>{cardErrors.cardName}</span>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Card Number</label>
            <input
              type="text"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
              placeholder="1234 5678 9012 3456"
              maxLength={19}
              style={{
                ...styles.input,
                ...(cardErrors.cardNumber ? styles.inputError : {})
              }}
            />
            {cardErrors.cardNumber && <span style={styles.fieldError}>{cardErrors.cardNumber}</span>}
          </div>

          <div style={styles.formRow}>
            <div style={{ ...styles.formGroup, flex: 1 }}>
              <label style={styles.label}>Expiry Date</label>
              <input
                type="text"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                placeholder="MM/YY"
                maxLength={5}
                style={{
                  ...styles.input,
                  ...(cardErrors.expiry ? styles.inputError : {})
                }}
              />
              {cardErrors.expiry && <span style={styles.fieldError}>{cardErrors.expiry}</span>}
            </div>

            <div style={{ ...styles.formGroup, flex: 1 }}>
              <label style={styles.label}>CVC</label>
              <input
                type="text"
                value={cvc}
                onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="123"
                maxLength={4}
                style={{
                  ...styles.input,
                  ...(cardErrors.cvc ? styles.inputError : {})
                }}
              />
              {cardErrors.cvc && <span style={styles.fieldError}>{cardErrors.cvc}</span>}
            </div>
          </div>

          <button
            type="submit"
            disabled={processing}
            style={{
              ...styles.submitButton,
              ...(processing ? styles.submitButtonDisabled : {})
            }}
          >
            {processing ? (
              <>
                <span style={styles.buttonSpinner} />
                Processing...
              </>
            ) : (
              `Pay ${formatCurrency(getPaymentAmount())}`
            )}
          </button>

          <p style={styles.secureText}>
            <span style={styles.lockIcon}>🔒</span>
            Your payment is secure and encrypted
          </p>
        </form>

        {/* Footer */}
        <div style={styles.footer}>
          <p>Questions? Contact us at {paymentData?.company_phone || 'support'}</p>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    maxWidth: '500px',
    width: '100%',
    overflow: 'hidden',
  },
  header: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    color: 'white',
    padding: '24px',
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: '700',
  },
  subtitle: {
    margin: '8px 0 0',
    opacity: 0.8,
    fontSize: '14px',
  },
  summary: {
    padding: '24px',
    borderBottom: '1px solid #e5e7eb',
  },
  summaryTitle: {
    margin: '0 0 16px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
  },
  lineItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: '14px',
    color: '#4b5563',
  },
  itemName: {
    flex: 1,
    paddingRight: '16px',
  },
  divider: {
    height: '1px',
    background: '#e5e7eb',
    margin: '12px 0',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '14px',
    color: '#4b5563',
  },
  grandTotal: {
    fontWeight: '700',
    fontSize: '18px',
    color: '#111827',
    paddingTop: '12px',
    borderTop: '2px solid #e5e7eb',
    marginTop: '8px',
  },
  balanceDue: {
    fontWeight: '700',
    fontSize: '16px',
    color: '#dc2626',
  },
  discountText: {
    color: '#059669',
  },
  paymentOptions: {
    padding: '24px',
    borderBottom: '1px solid #e5e7eb',
    background: '#f9fafb',
  },
  optionsTitle: {
    margin: '0 0 16px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    marginBottom: '8px',
    background: 'white',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  radio: {
    marginRight: '12px',
    width: '18px',
    height: '18px',
  },
  radioContent: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  radioTitle: {
    fontWeight: '500',
    color: '#374151',
  },
  radioAmount: {
    fontWeight: '600',
    color: '#111827',
  },
  form: {
    padding: '24px',
  },
  formTitle: {
    margin: '0 0 20px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#374151',
  },
  formGroup: {
    marginBottom: '16px',
  },
  formRow: {
    display: 'flex',
    gap: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: '16px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  fieldError: {
    display: 'block',
    marginTop: '4px',
    fontSize: '12px',
    color: '#ef4444',
  },
  errorBanner: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  submitButton: {
    width: '100%',
    padding: '16px',
    fontSize: '18px',
    fontWeight: '600',
    color: 'white',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  submitButtonDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },
  buttonSpinner: {
    width: '20px',
    height: '20px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: 'white',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  secureText: {
    textAlign: 'center',
    marginTop: '16px',
    fontSize: '13px',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  lockIcon: {
    fontSize: '14px',
  },
  footer: {
    padding: '16px 24px',
    background: '#f9fafb',
    textAlign: 'center',
    fontSize: '13px',
    color: '#6b7280',
  },
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e7eb',
    borderTopColor: '#667eea',
    borderRadius: '50%',
    margin: '40px auto',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    textAlign: 'center',
    color: '#6b7280',
    marginBottom: '40px',
  },
  errorIcon: {
    width: '64px',
    height: '64px',
    background: '#fef2f2',
    color: '#dc2626',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    fontWeight: 'bold',
    margin: '40px auto 20px',
  },
  errorTitle: {
    textAlign: 'center',
    color: '#111827',
    margin: '0 0 12px',
  },
  errorText: {
    textAlign: 'center',
    color: '#dc2626',
    margin: '0 0 16px',
    padding: '0 24px',
  },
  helpText: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '14px',
    padding: '0 24px 40px',
  },
  successIcon: {
    width: '80px',
    height: '80px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '40px',
    margin: '40px auto 20px',
  },
  successTitle: {
    textAlign: 'center',
    color: '#111827',
    margin: '0 0 8px',
  },
  successText: {
    textAlign: 'center',
    color: '#059669',
    fontSize: '18px',
    fontWeight: '600',
    margin: '0 0 24px',
  },
  receipt: {
    background: '#f9fafb',
    borderRadius: '8px',
    padding: '20px',
    margin: '0 24px 24px',
  },
  receiptTitle: {
    margin: '0 0 16px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  receiptRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '14px',
    color: '#4b5563',
  },
  receiptValue: {
    fontWeight: '600',
    color: '#111827',
  },
  confirmationText: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '14px',
    padding: '0 24px 40px',
  },
};

// Add keyframes for spinner animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default PaymentPortal;
