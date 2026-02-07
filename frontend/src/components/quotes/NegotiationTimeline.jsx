import { authFetch } from '../../services/authFetch';
/**
 * NegotiationTimeline - Shows the history of counter-offers on a quote
 */

import React, { useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const NegotiationTimeline = ({ quoteId, onRefresh }) => {
  const [counterOffers, setCounterOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (quoteId) {
      fetchCounterOffers();
    }
  }, [quoteId]);

  const fetchCounterOffers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(`${API_URL}/api/quotes/${quoteId}/counter-offers`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setCounterOffers(data.data.counterOffers || []);
      } else {
        setError(data.message || 'Failed to load negotiation history');
      }
    } catch (err) {
      console.error('Error fetching counter-offers:', err);
      setError('Failed to load negotiation history');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(cents / 100);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: { bg: '#fef3c7', color: '#92400e', text: 'Pending' },
      accepted: { bg: '#dcfce7', color: '#166534', text: 'Accepted' },
      rejected: { bg: '#fee2e2', color: '#991b1b', text: 'Rejected' },
      countered: { bg: '#dbeafe', color: '#1e40af', text: 'Countered' },
      expired: { bg: '#f3f4f6', color: '#6b7280', text: 'Expired' }
    };
    const style = styles[status] || styles.pending;

    return (
      <span style={{
        background: style.bg,
        color: style.color,
        padding: '4px 12px',
        borderRadius: '16px',
        fontSize: '12px',
        fontWeight: '600'
      }}>
        {style.text}
      </span>
    );
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'customer':
        return { icon: 'Customer', bg: '#fef3c7', color: '#92400e' };
      case 'salesperson':
        return { icon: 'Sales', bg: '#dbeafe', color: '#1e40af' };
      case 'supervisor':
        return { icon: 'Supervisor', bg: '#f3e8ff', color: '#7c3aed' };
      default:
        return { icon: 'User', bg: '#f3f4f6', color: '#6b7280' };
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
        Loading negotiation history...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '16px',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '8px',
        color: '#dc2626'
      }}>
        {error}
      </div>
    );
  }

  if (counterOffers.length === 0) {
    return (
      <div style={{
        padding: '32px',
        textAlign: 'center',
        color: '#6b7280',
        background: '#f9fafb',
        borderRadius: '8px'
      }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>No Negotiations</div>
        <p>No counter-offers have been made on this quote yet.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: '#374151' }}>
          Negotiation History ({counterOffers.length})
        </h3>
        <button
          onClick={fetchCounterOffers}
          style={{
            padding: '6px 12px',
            background: '#f3f4f6',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer',
            color: '#6b7280'
          }}
        >
          Refresh
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        {/* Timeline line */}
        <div style={{
          position: 'absolute',
          left: '20px',
          top: '0',
          bottom: '0',
          width: '2px',
          background: '#e5e7eb'
        }} />

        {counterOffers.map((offer, index) => {
          const typeInfo = getTypeIcon(offer.submitted_by_type);

          return (
            <div
              key={offer.id}
              style={{
                position: 'relative',
                paddingLeft: '48px',
                marginBottom: index < counterOffers.length - 1 ? '24px' : 0
              }}
            >
              {/* Timeline dot */}
              <div style={{
                position: 'absolute',
                left: '12px',
                top: '4px',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: typeInfo.bg,
                border: `2px solid ${typeInfo.color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: typeInfo.color
                }} />
              </div>

              {/* Offer card */}
              <div style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                {/* Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '12px'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        background: typeInfo.bg,
                        color: typeInfo.color,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'uppercase'
                      }}>
                        {offer.submitted_by_type}
                      </span>
                      {getStatusBadge(offer.status)}
                    </div>
                    <div style={{
                      marginTop: '4px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151'
                    }}>
                      {offer.submitted_by_name || offer.submitted_by_email}
                    </div>
                  </div>
                  <div style={{
                    textAlign: 'right',
                    fontSize: '12px',
                    color: '#6b7280'
                  }}>
                    {formatDate(offer.created_at)}
                  </div>
                </div>

                {/* Amount */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  marginBottom: offer.message ? '12px' : 0
                }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Offer Amount</div>
                    <div style={{
                      fontSize: '20px',
                      fontWeight: 'bold',
                      color: '#111827'
                    }}>
                      {formatCurrency(offer.counter_offer_total_cents)}
                    </div>
                  </div>
                  {offer.difference_cents !== 0 && (
                    <div style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600',
                      background: offer.difference_cents < 0 ? '#dcfce7' : '#fee2e2',
                      color: offer.difference_cents < 0 ? '#166534' : '#991b1b'
                    }}>
                      {offer.difference_cents < 0 ? '' : '+'}
                      {formatCurrency(offer.difference_cents)}
                    </div>
                  )}
                </div>

                {/* Message */}
                {offer.message && (
                  <div style={{
                    background: '#f9fafb',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#4b5563',
                    fontStyle: 'italic'
                  }}>
                    "{offer.message}"
                  </div>
                )}

                {/* Response */}
                {offer.status !== 'pending' && offer.response_message && (
                  <div style={{
                    marginTop: '12px',
                    padding: '12px',
                    background: offer.status === 'accepted' ? '#f0fdf4' : '#fef2f2',
                    borderRadius: '6px',
                    borderLeft: `3px solid ${offer.status === 'accepted' ? '#22c55e' : '#ef4444'}`
                  }}>
                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '4px'
                    }}>
                      Response from {offer.response_by_name || 'Staff'}:
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: offer.status === 'accepted' ? '#166534' : '#991b1b'
                    }}>
                      {offer.response_message}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NegotiationTimeline;
