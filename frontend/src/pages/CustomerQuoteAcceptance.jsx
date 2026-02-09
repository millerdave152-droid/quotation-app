/**
 * CustomerQuoteAcceptance - Public page for customers to accept quotes via magic link
 * No authentication required
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const CustomerQuoteAcceptance = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quoteData, setQuoteData] = useState(null);
  const [expired, setExpired] = useState(false);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    fetchQuote();
  }, [token]);

  const fetchQuote = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/quote-accept/${token}`);
      const data = await response.json();

      if (!data.success) {
        setError(data.message || 'Invalid or expired link');
        return;
      }

      if (data.expired) {
        setExpired(true);
        setQuoteData(data.data);
        return;
      }

      if (data.already_accepted) {
        setAlreadyAccepted(true);
        setQuoteData(data.data);
        return;
      }

      setQuoteData(data.data);
    } catch (err) {
      setError('Failed to load quote. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    try {
      setAccepting(true);
      const response = await fetch(`${API_URL}/api/quote-accept/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (data.success) {
        setAccepted(true);
      } else {
        setError(data.message || 'Failed to accept quote');
      }
    } catch (err) {
      setError('Failed to accept quote. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  const formatCurrency = (cents) => {
    if (!cents) return '$0.00';
    return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  // Loading state
  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: '#6b7280', fontSize: '16px' }}>Loading your quote...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !quoteData) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
            <h2 style={{ margin: '0 0 8px', color: '#dc2626' }}>Link Invalid</h2>
            <p style={{ color: '#6b7280' }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Expired state
  if (expired) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏰</div>
            <h2 style={{ margin: '0 0 8px', color: '#d97706' }}>Link Expired</h2>
            <p style={{ color: '#6b7280' }}>This acceptance link has expired. Please contact your sales representative for a new link.</p>
            {quoteData && (
              <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '12px' }}>
                Quote: {quoteData.quotation_number || quoteData.quote_number}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Already accepted state
  if (alreadyAccepted || accepted) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ margin: '0 0 8px', color: '#15803d' }}>Quote Accepted!</h2>
            <p style={{ color: '#6b7280' }}>
              {accepted
                ? 'Thank you! Your acceptance has been recorded. Our team will follow up with next steps shortly.'
                : 'This quote has already been accepted.'}
            </p>
            {quoteData && (
              <div style={{ marginTop: '20px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', display: 'inline-block' }}>
                <div style={{ fontWeight: '600', color: '#111827' }}>{quoteData.quotation_number || quoteData.quote_number}</div>
                <div style={{ color: '#15803d', fontWeight: '700', fontSize: '20px', marginTop: '4px' }}>{formatCurrency(quoteData.total_cents)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main acceptance view
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          padding: '24px 32px',
          borderRadius: '12px 12px 0 0',
          color: 'white',
        }}>
          <h1 style={{ margin: '0 0 8px', fontSize: '24px' }}>Quote {quoteData.quotation_number || quoteData.quote_number}</h1>
          <p style={{ margin: 0, opacity: 0.9, fontSize: '15px' }}>
            Prepared for {quoteData.customer_name || 'Valued Customer'}
            {quoteData.customer_company && ` at ${quoteData.customer_company}`}
          </p>
        </div>

        {/* Quote Items */}
        <div style={{ padding: '24px 32px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#374151' }}>Quote Details</h3>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '10px 0', textAlign: 'left', fontSize: '12px', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Item</th>
                <th style={{ padding: '10px 0', textAlign: 'center', fontSize: '12px', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Qty</th>
                <th style={{ padding: '10px 0', textAlign: 'right', fontSize: '12px', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Unit Price</th>
                <th style={{ padding: '10px 0', textAlign: 'right', fontSize: '12px', color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(quoteData.items || []).map((item, idx) => (
                <tr key={item.id || idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 0' }}>
                    <div style={{ fontWeight: '500', color: '#111827', fontSize: '14px' }}>
                      {item.product_name || item.model || 'Item'}
                    </div>
                    {item.manufacturer && (
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{item.manufacturer}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 0', textAlign: 'center', color: '#374151' }}>{item.quantity}</td>
                  <td style={{ padding: '12px 0', textAlign: 'right', color: '#374151' }}>{formatCurrency(item.unit_price_cents)}</td>
                  <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: '600', color: '#111827' }}>{formatCurrency(item.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total */}
          <div style={{
            marginTop: '20px',
            padding: '16px 20px',
            background: '#f9fafb',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>Total</span>
            <span style={{ fontSize: '24px', fontWeight: '700', color: '#111827' }}>{formatCurrency(quoteData.total_cents)}</span>
          </div>

          {/* Accept Button */}
          <div style={{ marginTop: '32px', textAlign: 'center' }}>
            {error && (
              <div style={{ color: '#dc2626', marginBottom: '16px', fontSize: '14px' }}>{error}</div>
            )}
            <button
              onClick={handleAccept}
              disabled={accepting}
              style={{
                padding: '16px 48px',
                background: accepting ? '#9ca3af' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '18px',
                fontWeight: '700',
                cursor: accepting ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                transition: 'all 0.2s',
              }}
            >
              {accepting ? 'Processing...' : 'Accept Quote'}
            </button>
            <p style={{ color: '#9ca3af', fontSize: '13px', marginTop: '12px' }}>
              By clicking Accept, you agree to the terms of this quotation.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 32px',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center',
          fontSize: '12px',
          color: '#9ca3af',
        }}>
          Powered by TeleTime Solutions
        </div>
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '40px 20px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '640px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
};

export default CustomerQuoteAcceptance;
