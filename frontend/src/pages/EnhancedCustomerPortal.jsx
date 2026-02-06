import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import SignaturePad from '../components/common/SignaturePad';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * EnhancedCustomerPortal - Full customer quote experience
 * Features: Quote details, Accept/Decline, E-signature, Payment, Delivery scheduling
 */
const EnhancedCustomerPortal = () => {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quote, setQuote] = useState(null);
  const [step, setStep] = useState('review'); // review, delivery, signature, payment, complete
  const [deliverySlots, setDeliverySlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [signature, setSignature] = useState(null);
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [counterOffer, setCounterOffer] = useState('');
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const signaturePadRef = useRef(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const deliveryFetchTimeoutRef = useRef(null);

  useEffect(() => {
    if (token) {
      fetchQuoteDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchQuoteDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/customer-portal/quote/${token}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Invalid or expired link');
      }

      setQuote(data.data);
      setDeliveryAddress(data.data.customer?.address || '');
      setContactPhone(data.data.customer?.phone || '');

      // Check if already accepted
      if (data.data.status === 'ACCEPTED' || data.data.status === 'WON') {
        setStep('complete');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliverySlots = useCallback(async (address) => {
    try {
      const postalCode = (address || deliveryAddress).match(/[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d/)?.[0] || '';
      const response = await fetch(
        `${API_URL}/api/delivery/slots?postal_code=${postalCode}&days=14`
      );
      const data = await response.json();

      if (data.success) {
        setDeliverySlots(data.data || []);
      }
    } catch (err) {
      // Silently handle delivery slot fetch errors - non-critical
    }
  }, [deliveryAddress]);

  // Debounced delivery slot fetch
  const debouncedFetchDeliverySlots = useCallback((address) => {
    if (deliveryFetchTimeoutRef.current) {
      clearTimeout(deliveryFetchTimeoutRef.current);
    }
    deliveryFetchTimeoutRef.current = setTimeout(() => {
      fetchDeliverySlots(address);
    }, 500);
  }, [fetchDeliverySlots]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (deliveryFetchTimeoutRef.current) {
        clearTimeout(deliveryFetchTimeoutRef.current);
      }
    };
  }, []);

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format((cents || 0) / 100);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Handle signature change from SignaturePad
  const handleSignatureChange = (dataUrl) => {
    setSignature(dataUrl);
  };

  const handleAcceptQuote = async () => {
    if (!signature) {
      alert('Please provide your signature to accept the quote');
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch(`${API_URL}/api/customer-portal/quote/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          delivery_slot_id: selectedSlot?.id,
          delivery_address: deliveryAddress,
          delivery_instructions: deliveryInstructions,
          contact_phone: contactPhone
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to accept quote');
      }

      // Move to payment or complete
      if (quote.deposit_required_cents > 0) {
        setStep('payment');
      } else {
        setStep('complete');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeclineQuote = async () => {
    setProcessing(true);
    try {
      const response = await fetch(`${API_URL}/api/customer-portal/quote/${token}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: declineReason })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to decline quote');
      }

      setShowDeclineModal(false);
      setQuote({ ...quote, status: 'DECLINED' });
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleCounterOffer = async () => {
    setProcessing(true);
    try {
      const response = await fetch(`${API_URL}/api/customer-portal/quote/${token}/counter-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposed_total_cents: Math.round(parseFloat(counterOffer) * 100)
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to submit counter-offer');
      }

      setShowCounterModal(false);
      setQuote({ ...quote, status: 'COUNTER_OFFERED' });
      alert('Your counter-offer has been submitted. We will review and get back to you shortly.');
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner} />
          <p>Loading your quote...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorCard}>
          <div style={styles.errorIcon}>!</div>
          <h2>Unable to Load Quote</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Declined state
  if (quote?.status === 'DECLINED') {
    return (
      <div style={styles.container}>
        <div style={styles.statusCard}>
          <h2>Quote Declined</h2>
          <p>This quote has been declined. If you change your mind, please contact us.</p>
        </div>
      </div>
    );
  }

  // Counter-offered state
  if (quote?.status === 'COUNTER_OFFERED') {
    return (
      <div style={styles.container}>
        <div style={styles.statusCard}>
          <div style={styles.pendingIcon}>⏳</div>
          <h2>Counter-Offer Submitted</h2>
          <p>Your counter-offer is being reviewed. We'll get back to you shortly.</p>
        </div>
      </div>
    );
  }

  // Complete state
  if (step === 'complete') {
    return (
      <div style={styles.container}>
        <div style={styles.successCard}>
          <div style={styles.successIcon}>✓</div>
          <h2>Quote Accepted!</h2>
          <p>Thank you for your order. We'll be in touch shortly with next steps.</p>

          {quote.order_number && (
            <div style={styles.orderInfo}>
              <strong>Order #:</strong> {quote.order_number}
            </div>
          )}

          {selectedSlot && (
            <div style={styles.deliveryInfo}>
              <h3>Scheduled Delivery</h3>
              <p>{formatDate(selectedSlot.slot_date)}</p>
              <p>{selectedSlot.slot_start} - {selectedSlot.slot_end}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Progress Steps */}
      <div style={styles.progressBar}>
        {['Review', 'Delivery', 'Sign', 'Complete'].map((label, idx) => {
          const stepNames = ['review', 'delivery', 'signature', 'complete'];
          const currentIdx = stepNames.indexOf(step);
          const isActive = idx <= currentIdx;
          const isCurrent = idx === currentIdx;

          return (
            <div key={label} style={styles.progressStep}>
              <div style={{
                ...styles.progressDot,
                background: isActive ? '#667eea' : '#e5e7eb',
                transform: isCurrent ? 'scale(1.2)' : 'scale(1)'
              }}>
                {idx < currentIdx ? '✓' : idx + 1}
              </div>
              <span style={{
                ...styles.progressLabel,
                color: isActive ? '#374151' : '#9ca3af'
              }}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* Main Card */}
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Quote #{quote?.quote_number}</h1>
          <div style={styles.headerMeta}>
            <span>Prepared for: <strong>{quote?.customer?.name}</strong></span>
            {quote?.expires_at && (
              <span style={styles.expiryBadge}>
                Expires: {formatDate(quote.expires_at)}
              </span>
            )}
          </div>
        </div>

        {/* Review Step */}
        {step === 'review' && (
          <div style={styles.content}>
            {/* Items Table */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Quote Items</h3>
              <div style={styles.itemsTable}>
                {quote?.items?.map((item, idx) => (
                  <div key={idx} style={styles.itemRow}>
                    <div style={styles.itemInfo}>
                      <div style={styles.itemName}>
                        {item.manufacturer} {item.model}
                      </div>
                      <div style={styles.itemDesc}>{item.description}</div>
                    </div>
                    <div style={styles.itemQty}>x{item.quantity}</div>
                    <div style={styles.itemPrice}>
                      {formatCurrency(item.sell_cents * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div style={styles.totalsSection}>
              <div style={styles.totalRow}>
                <span>Subtotal</span>
                <span>{formatCurrency(quote?.subtotal_cents)}</span>
              </div>
              {quote?.discount_cents > 0 && (
                <div style={{ ...styles.totalRow, color: '#059669' }}>
                  <span>Discount</span>
                  <span>-{formatCurrency(quote.discount_cents)}</span>
                </div>
              )}
              <div style={styles.totalRow}>
                <span>Tax (HST 13%)</span>
                <span>{formatCurrency(quote?.tax_cents)}</span>
              </div>
              <div style={styles.grandTotalRow}>
                <span>Total</span>
                <span>{formatCurrency(quote?.total_cents)}</span>
              </div>
            </div>

            {/* Notes */}
            {quote?.notes && (
              <div style={styles.notesSection}>
                <h4>Notes</h4>
                <p>{quote.notes}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div style={styles.actionButtons}>
              <button
                onClick={() => {
                  fetchDeliverySlots();
                  setStep('delivery');
                }}
                style={styles.primaryButton}
              >
                Accept & Continue
              </button>
              <button
                onClick={() => setShowCounterModal(true)}
                style={styles.secondaryButton}
              >
                Make Counter-Offer
              </button>
              <button
                onClick={() => setShowDeclineModal(true)}
                style={styles.declineButton}
              >
                Decline Quote
              </button>
            </div>
          </div>
        )}

        {/* Delivery Step */}
        {step === 'delivery' && (
          <div style={styles.content}>
            <h3 style={styles.sectionTitle}>Schedule Delivery</h3>

            <div style={styles.formGroup}>
              <label style={styles.label}>Delivery Address</label>
              <textarea
                value={deliveryAddress}
                onChange={(e) => {
                  const newAddress = e.target.value;
                  setDeliveryAddress(newAddress);
                  debouncedFetchDeliverySlots(newAddress);
                }}
                style={styles.textarea}
                rows={3}
                placeholder="Enter your delivery address"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Contact Phone</label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                style={styles.input}
                placeholder="Phone number for delivery day"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Delivery Instructions (Optional)</label>
              <textarea
                value={deliveryInstructions}
                onChange={(e) => setDeliveryInstructions(e.target.value)}
                style={styles.textarea}
                rows={2}
                placeholder="Any special instructions for delivery..."
              />
            </div>

            {/* Delivery Slots */}
            <div style={styles.slotsSection}>
              <label style={styles.label}>Select Delivery Time</label>
              {deliverySlots.length > 0 ? (
                <div style={styles.slotsGrid}>
                  {deliverySlots.map((slot) => (
                    <div
                      key={slot.id}
                      onClick={() => setSelectedSlot(slot)}
                      style={{
                        ...styles.slotCard,
                        ...(selectedSlot?.id === slot.id ? styles.slotCardSelected : {})
                      }}
                    >
                      <div style={styles.slotDate}>
                        {new Date(slot.slot_date).toLocaleDateString('en-CA', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </div>
                      <div style={styles.slotTime}>
                        {slot.slot_start} - {slot.slot_end}
                      </div>
                      <div style={styles.slotAvailable}>
                        {slot.capacity - slot.booked} slots left
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={styles.noSlots}>
                  No delivery slots available for your area. We'll contact you to arrange delivery.
                </p>
              )}
            </div>

            <div style={styles.navButtons}>
              <button onClick={() => setStep('review')} style={styles.backButton}>
                Back
              </button>
              <button
                onClick={() => setStep('signature')}
                style={styles.primaryButton}
              >
                Continue to Sign
              </button>
            </div>
          </div>
        )}

        {/* Signature Step */}
        {step === 'signature' && (
          <div style={styles.content}>
            <h3 style={styles.sectionTitle}>Sign to Accept</h3>

            <div style={styles.agreementBox}>
              <p>By signing below, I agree to:</p>
              <ul>
                <li>Purchase the items listed in this quote</li>
                <li>Pay the total amount of {formatCurrency(quote?.total_cents)}</li>
                <li>The terms and conditions of sale</li>
              </ul>
            </div>

            <div style={styles.signatureArea}>
              <label style={styles.label}>Your Signature</label>
              <SignaturePad
                ref={signaturePadRef}
                width={400}
                height={180}
                strokeColor="#1a1a2e"
                strokeWidth={2}
                onChange={handleSignatureChange}
                showControls={true}
                label="Sign here"
              />
            </div>

            <div style={styles.navButtons}>
              <button onClick={() => setStep('delivery')} style={styles.backButton}>
                Back
              </button>
              <button
                onClick={handleAcceptQuote}
                disabled={!signature || processing}
                style={{
                  ...styles.primaryButton,
                  ...((!signature || processing) ? styles.buttonDisabled : {})
                }}
              >
                {processing ? 'Processing...' : 'Accept Quote'}
              </button>
            </div>
          </div>
        )}

        {/* Payment Step */}
        {step === 'payment' && (
          <div style={styles.content}>
            <h3 style={styles.sectionTitle}>Payment</h3>
            <p>
              A deposit of {formatCurrency(quote?.deposit_required_cents)} is required
              to confirm your order.
            </p>
            <a
              href={`/pay/${token}`}
              style={styles.paymentLink}
            >
              Proceed to Payment
            </a>
          </div>
        )}
      </div>

      {/* Decline Modal */}
      {showDeclineModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3>Decline Quote</h3>
            <p>We're sorry to see you go. Could you tell us why?</p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              style={styles.textarea}
              rows={4}
              placeholder="Optional: Let us know why you're declining..."
            />
            <div style={styles.modalButtons}>
              <button
                onClick={() => setShowDeclineModal(false)}
                style={styles.secondaryButton}
              >
                Cancel
              </button>
              <button
                onClick={handleDeclineQuote}
                disabled={processing}
                style={styles.declineButton}
              >
                {processing ? 'Declining...' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Counter-Offer Modal */}
      {showCounterModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3>Make a Counter-Offer</h3>
            <p>Current total: {formatCurrency(quote?.total_cents)}</p>
            <div style={styles.formGroup}>
              <label style={styles.label}>Your Offer ($)</label>
              <input
                type="number"
                value={counterOffer}
                onChange={(e) => setCounterOffer(e.target.value)}
                style={styles.input}
                placeholder="Enter your offer amount"
                step="0.01"
              />
            </div>
            <div style={styles.modalButtons}>
              <button
                onClick={() => setShowCounterModal(false)}
                style={styles.secondaryButton}
              >
                Cancel
              </button>
              <button
                onClick={handleCounterOffer}
                disabled={processing || !counterOffer}
                style={styles.primaryButton}
              >
                {processing ? 'Submitting...' : 'Submit Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f3f4f6',
    padding: '20px',
  },
  progressBar: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '40px',
    marginBottom: '24px',
    padding: '20px',
  },
  progressStep: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  progressDot: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.3s',
  },
  progressLabel: {
    fontSize: '13px',
    fontWeight: '500',
  },
  card: {
    maxWidth: '800px',
    margin: '0 auto',
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  header: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    color: 'white',
    padding: '24px 32px',
  },
  title: {
    margin: '0 0 8px',
    fontSize: '24px',
    fontWeight: '700',
  },
  headerMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '14px',
    opacity: 0.9,
  },
  expiryBadge: {
    background: 'rgba(255,255,255,0.2)',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
  },
  content: {
    padding: '32px',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    margin: '0 0 16px',
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
  },
  itemsTable: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px',
    borderBottom: '1px solid #e5e7eb',
    gap: '16px',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontWeight: '600',
    color: '#111827',
  },
  itemDesc: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '4px',
  },
  itemQty: {
    color: '#6b7280',
    minWidth: '40px',
  },
  itemPrice: {
    fontWeight: '600',
    color: '#111827',
    minWidth: '100px',
    textAlign: 'right',
  },
  totalsSection: {
    background: '#f9fafb',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '24px',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: '14px',
    color: '#4b5563',
  },
  grandTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0 0',
    marginTop: '8px',
    borderTop: '2px solid #e5e7eb',
    fontSize: '20px',
    fontWeight: '700',
    color: '#111827',
  },
  notesSection: {
    background: '#fffbeb',
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '24px',
    border: '1px solid #fcd34d',
  },
  actionButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  primaryButton: {
    padding: '16px 32px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'transform 0.2s',
  },
  secondaryButton: {
    padding: '16px 32px',
    background: 'white',
    color: '#374151',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  declineButton: {
    padding: '16px 32px',
    background: '#fef2f2',
    color: '#dc2626',
    border: '2px solid #fecaca',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  backButton: {
    padding: '12px 24px',
    background: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  navButtons: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '24px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  slotsSection: {
    marginTop: '24px',
  },
  slotsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '12px',
    marginTop: '12px',
  },
  slotCard: {
    padding: '16px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  slotCardSelected: {
    borderColor: '#667eea',
    background: '#f5f3ff',
  },
  slotDate: {
    fontWeight: '600',
    color: '#111827',
    marginBottom: '4px',
  },
  slotTime: {
    fontSize: '13px',
    color: '#6b7280',
  },
  slotAvailable: {
    fontSize: '11px',
    color: '#059669',
    marginTop: '8px',
  },
  noSlots: {
    color: '#6b7280',
    fontStyle: 'italic',
    padding: '20px',
    textAlign: 'center',
    background: '#f9fafb',
    borderRadius: '8px',
  },
  agreementBox: {
    background: '#f9fafb',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '24px',
    fontSize: '14px',
    color: '#374151',
  },
  signatureArea: {
    marginBottom: '24px',
  },
  paymentLink: {
    display: 'inline-block',
    padding: '16px 32px',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    color: 'white',
    textDecoration: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    marginTop: '16px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    background: 'white',
    padding: '32px',
    borderRadius: '16px',
    maxWidth: '450px',
    width: '100%',
  },
  modalButtons: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  loadingCard: {
    background: 'white',
    padding: '60px',
    borderRadius: '16px',
    textAlign: 'center',
    maxWidth: '400px',
    margin: '100px auto',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e7eb',
    borderTopColor: '#667eea',
    borderRadius: '50%',
    margin: '0 auto 20px',
    animation: 'spin 1s linear infinite',
  },
  errorCard: {
    background: 'white',
    padding: '60px',
    borderRadius: '16px',
    textAlign: 'center',
    maxWidth: '400px',
    margin: '100px auto',
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
    margin: '0 auto 20px',
  },
  statusCard: {
    background: 'white',
    padding: '60px',
    borderRadius: '16px',
    textAlign: 'center',
    maxWidth: '500px',
    margin: '100px auto',
  },
  pendingIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  successCard: {
    background: 'white',
    padding: '60px',
    borderRadius: '16px',
    textAlign: 'center',
    maxWidth: '500px',
    margin: '100px auto',
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
    margin: '0 auto 20px',
  },
  orderInfo: {
    marginTop: '24px',
    padding: '16px',
    background: '#f9fafb',
    borderRadius: '8px',
  },
  deliveryInfo: {
    marginTop: '16px',
    padding: '16px',
    background: '#f0fdf4',
    borderRadius: '8px',
    border: '1px solid #bbf7d0',
  },
};

export default EnhancedCustomerPortal;
