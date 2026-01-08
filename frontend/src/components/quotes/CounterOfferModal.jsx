/**
 * CounterOfferModal - Modal for submitting counter-offers on quotes
 * Used by salespeople and supervisors
 */

import React, { useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const CounterOfferModal = ({
  isOpen,
  onClose,
  quote,
  onSuccess,
  mode = 'create', // 'create' for new counter, 'respond' for responding to customer's counter
  existingOffer = null // If responding to a customer's counter-offer
}) => {
  const [counterAmount, setCounterAmount] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(cents / 100);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const counterCents = Math.round(parseFloat(counterAmount) * 100);

      let endpoint;
      let body;

      if (mode === 'respond' && existingOffer) {
        // Supervisor responding to customer's counter
        endpoint = `${API_URL}/api/counter-offers/${existingOffer.id}/counter`;
        body = {
          newOfferTotalCents: counterCents,
          message
        };
      } else {
        // Creating new counter-offer
        endpoint = `${API_URL}/api/quotes/${quote.id}/counter-offers`;
        body = {
          counterOfferTotalCents: counterCents,
          message
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (data.success) {
        onSuccess?.(data);
        onClose();
        setCounterAmount('');
        setMessage('');
      } else {
        setError(data.message || 'Failed to submit counter-offer');
      }
    } catch (err) {
      console.error('Error submitting counter-offer:', err);
      setError('Failed to submit counter-offer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!existingOffer) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/counter-offers/${existingOffer.id}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message })
      });

      const data = await response.json();

      if (data.success) {
        onSuccess?.(data);
        onClose();
      } else {
        setError(data.message || 'Failed to accept offer');
      }
    } catch (err) {
      setError('Failed to accept offer');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!existingOffer || !message.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/counter-offers/${existingOffer.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message })
      });

      const data = await response.json();

      if (data.success) {
        onSuccess?.(data);
        onClose();
      } else {
        setError(data.message || 'Failed to reject offer');
      }
    } catch (err) {
      setError('Failed to reject offer');
    } finally {
      setLoading(false);
    }
  };

  const currentTotal = quote?.total_cents || 0;
  const customerOffer = existingOffer?.counter_offer_total_cents || 0;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '500px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '24px',
          color: 'white'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '20px' }}>
              {mode === 'respond' ? 'Respond to Counter-Offer' : 'Submit Counter-Offer'}
            </h2>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '18px'
              }}
            >
              x
            </button>
          </div>
          <p style={{ margin: '8px 0 0 0', opacity: 0.9, fontSize: '14px' }}>
            Quote: {quote?.quote_number}
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {/* Current Quote Info */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mode === 'respond' ? '1fr 1fr' : '1fr',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div style={{
              background: '#f9fafb',
              padding: '16px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                Current Quote Total
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#374151' }}>
                {formatCurrency(currentTotal)}
              </div>
            </div>

            {mode === 'respond' && existingOffer && (
              <div style={{
                background: '#fef3c7',
                padding: '16px',
                borderRadius: '8px',
                textAlign: 'center',
                border: '2px solid #f59e0b'
              }}>
                <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>
                  Customer's Offer
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706' }}>
                  {formatCurrency(customerOffer)}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '16px'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                color: '#374151'
              }}>
                Your Counter-Offer Amount (CAD)
              </label>
              <input
                type="number"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                min="0.01"
                step="0.01"
                required
                placeholder="Enter amount"
                style={{
                  width: '100%',
                  padding: '16px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                color: '#374151'
              }}>
                Message {mode === 'respond' ? '(Required for rejection)' : '(Optional)'}
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows="3"
                placeholder={mode === 'respond'
                  ? 'Explain your counter-offer or provide rejection reason...'
                  : 'Add a message with your offer...'}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {mode === 'respond' && existingOffer && (
                <>
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={loading}
                    style={{
                      flex: 1,
                      minWidth: '120px',
                      padding: '14px',
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      opacity: loading ? 0.7 : 1
                    }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={loading}
                    style={{
                      flex: 1,
                      minWidth: '120px',
                      padding: '14px',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      opacity: loading ? 0.7 : 1
                    }}
                  >
                    Reject
                  </button>
                </>
              )}
              <button
                type="submit"
                disabled={loading || !counterAmount}
                style={{
                  flex: 2,
                  minWidth: '200px',
                  padding: '14px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  opacity: loading || !counterAmount ? 0.7 : 1
                }}
              >
                {loading ? 'Submitting...' : 'Send Counter-Offer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CounterOfferModal;
