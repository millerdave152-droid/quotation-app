import { authFetch } from '../services/authFetch';
/**
 * CustomerQuoteView - Public page for customers to view quotes via magic link
 * Allows customers to view quote details, accept, or submit counter-offers
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const CustomerQuoteView = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [counterOffer, setCounterOffer] = useState(null);
  const [quoteItems, setQuoteItems] = useState([]);
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [counterAmount, setCounterAmount] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchCounterOffer();
  }, [token]);

  const fetchCounterOffer = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_URL}/api/counter-offers/magic/${token}`);
      const data = await response.json();

      if (!data.success) {
        setError(data.message || 'Invalid or expired link');
        return;
      }

      setCounterOffer(data.data.counterOffer);
      setQuoteItems(data.data.quoteItems || []);
      setCustomerEmail(data.data.counterOffer.customer_email || '');
      setCustomerName(data.data.counterOffer.customer_name || '');
    } catch (err) {
      console.error('Error fetching counter-offer:', err);
      setError('Failed to load quote. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    try {
      setSubmitting(true);
      const response = await authFetch(`${API_URL}/api/counter-offers/magic/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          name: customerName,
          email: customerEmail,
          message: message
        })
      });

      const data = await response.json();
      if (data.success) {
        setSuccess('accepted');
      } else {
        setError(data.message || 'Failed to accept offer');
      }
    } catch (err) {
      setError('Failed to process your response');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCounter = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const counterCents = Math.round(parseFloat(counterAmount) * 100);

      const response = await authFetch(`${API_URL}/api/counter-offers/magic/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'counter',
          name: customerName,
          email: customerEmail,
          newOfferCents: counterCents,
          message: message
        })
      });

      const data = await response.json();
      if (data.success) {
        setSuccess('countered');
      } else {
        setError(data.message || 'Failed to submit counter-offer');
      }
    } catch (err) {
      setError('Failed to submit counter-offer');
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(cents / 100);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '16px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>Loading...</div>
          <p>Please wait while we load your quote</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '16px',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>Link Error</div>
          <p style={{ color: '#ef4444', fontWeight: 'bold' }}>{error}</p>
          <p style={{ color: '#6b7280', marginTop: '16px' }}>
            This link may have expired or already been used. Please contact the sender for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '16px',
          textAlign: 'center',
          maxWidth: '500px'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>
            {success === 'accepted' ? 'Accepted' : 'Sent'}
          </div>
          <h2 style={{ color: '#059669', marginBottom: '16px' }}>
            {success === 'accepted' ? 'Offer Accepted!' : 'Counter-Offer Submitted!'}
          </h2>
          <p style={{ color: '#374151' }}>
            {success === 'accepted'
              ? 'Thank you! Your acceptance has been recorded. We will be in touch shortly to finalize the details.'
              : 'Your counter-offer has been submitted. You will receive an email once we have reviewed it.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f9fafb 0%, #e5e7eb 100%)',
      padding: '24px'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '16px 16px 0 0',
          padding: '32px',
          color: 'white',
          textAlign: 'center'
        }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px' }}>Quote Review</h1>
          <p style={{ margin: 0, opacity: 0.9 }}>
            {counterOffer.quote_number}
          </p>
        </div>

        {/* Offer Card */}
        <div style={{
          background: 'white',
          padding: '32px',
          borderRadius: '0 0 16px 16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          {/* Current Offer */}
          <div style={{
            background: '#f0fdf4',
            border: '2px solid #22c55e',
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center',
            marginBottom: '24px'
          }}>
            <p style={{ margin: '0 0 8px 0', color: '#166534' }}>Current Offer</p>
            <div style={{
              fontSize: '36px',
              fontWeight: 'bold',
              color: '#15803d'
            }}>
              {formatCurrency(counterOffer.counter_offer_total_cents)}
            </div>
            {counterOffer.message && (
              <p style={{
                marginTop: '16px',
                padding: '12px',
                background: 'white',
                borderRadius: '8px',
                color: '#374151',
                fontStyle: 'italic'
              }}>
                "{counterOffer.message}"
              </p>
            )}
          </div>

          {/* Original vs Current */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div style={{
              background: '#f9fafb',
              padding: '16px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <p style={{ margin: '0 0 4px 0', color: '#6b7280', fontSize: '14px' }}>Original Quote</p>
              <div style={{ fontSize: '20px', fontWeight: '600', color: '#374151' }}>
                {formatCurrency(counterOffer.original_total_cents)}
              </div>
            </div>
            <div style={{
              background: '#f9fafb',
              padding: '16px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <p style={{ margin: '0 0 4px 0', color: '#6b7280', fontSize: '14px' }}>Difference</p>
              <div style={{
                fontSize: '20px',
                fontWeight: '600',
                color: counterOffer.difference_cents < 0 ? '#22c55e' : '#ef4444'
              }}>
                {counterOffer.difference_cents < 0 ? '-' : '+'}
                {formatCurrency(Math.abs(counterOffer.difference_cents))}
              </div>
            </div>
          </div>

          {/* Quote Items */}
          {quoteItems.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ marginBottom: '12px', color: '#374151' }}>Items in This Quote</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '8px 4px' }}>Item</th>
                    <th style={{ textAlign: 'center', padding: '8px 4px' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '8px 4px' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '8px 4px' }}>
                        <div style={{ fontWeight: '500' }}>{item.manufacturer} {item.model}</div>
                        {item.description && (
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>{item.description}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 4px' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right', padding: '8px 4px' }}>
                        {formatCurrency(item.sell_cents * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Action Buttons */}
          {!showCounterForm ? (
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button
                onClick={handleAccept}
                disabled={submitting}
                style={{
                  padding: '16px 48px',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  opacity: submitting ? 0.7 : 1
                }}
              >
                {submitting ? 'Processing...' : 'Accept Offer'}
              </button>
              <button
                onClick={() => setShowCounterForm(true)}
                disabled={submitting}
                style={{
                  padding: '16px 48px',
                  background: 'white',
                  color: '#667eea',
                  border: '2px solid #667eea',
                  borderRadius: '12px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Make Counter-Offer
              </button>
            </div>
          ) : (
            <form onSubmit={handleCounter} style={{ marginTop: '24px' }}>
              <h3 style={{ marginBottom: '16px' }}>Your Counter-Offer</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '16px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                    Your Email
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '16px'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                  Your Offer Amount (CAD)
                </label>
                <input
                  type="number"
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(e.target.value)}
                  min="1"
                  step="0.01"
                  required
                  placeholder="Enter your offer"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '24px',
                    fontWeight: 'bold'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                  Message (Optional)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows="3"
                  placeholder="Add a message with your offer..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: '16px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    opacity: submitting ? 0.7 : 1
                  }}
                >
                  {submitting ? 'Submitting...' : 'Submit Counter-Offer'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCounterForm(false)}
                  style={{
                    padding: '16px 24px',
                    background: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '16px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          marginTop: '24px',
          color: '#6b7280',
          fontSize: '14px'
        }}>
          <p>Questions? Contact us at support@example.com</p>
        </div>
      </div>
    </div>
  );
};

export default CustomerQuoteView;
