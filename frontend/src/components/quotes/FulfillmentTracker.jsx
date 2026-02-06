import React, { useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const STATUSES = [
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'ready_for_pickup', label: 'Ready for Pickup' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' }
];

const DELIVERY_STATUSES = ['pending', 'processing', 'out_for_delivery', 'in_transit', 'delivered'];
const PICKUP_STATUSES = ['pending', 'processing', 'ready_for_pickup', 'delivered'];

function FulfillmentTracker({ quoteId, token, convertedToOrderId }) {
  const [fulfillment, setFulfillment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!convertedToOrderId) {
      setLoading(false);
      return;
    }
    fetchFulfillment();
  }, [quoteId, token, convertedToOrderId]);

  const fetchFulfillment = async () => {
    try {
      setLoading(true);
      const url = token
        ? `${API_URL}/api/customer-portal/quotes/${token}/${quoteId}/fulfillment`
        : `${API_URL}/api/customer-portal/internal/quotes/${quoteId}/fulfillment`;

      const headers = {};
      if (!token) {
        const authToken = localStorage.getItem('auth_token');
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(url, { headers });
      const result = await response.json();

      if (result.success) {
        setFulfillment(result.data);
      } else {
        setError(result.error || 'Failed to load fulfillment');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    return timeStr.substring(0, 5);
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingText}>Loading fulfillment status...</div>
      </div>
    );
  }

  if (error || !fulfillment) return null;

  const isPickup = fulfillment.fulfillmentType === 'pickup' || fulfillment.fulfillmentType === 'in_store_pickup';
  const isDelivery = !isPickup;
  const statusFlow = isDelivery ? DELIVERY_STATUSES : PICKUP_STATUSES;
  const isFailed = ['failed_delivery', 'returned', 'cancelled'].includes(fulfillment.status);
  const currentIndex = statusFlow.indexOf(fulfillment.status);

  const getStepState = (index) => {
    if (isFailed) return index <= 1 ? 'completed' : 'failed';
    if (index < currentIndex) return 'completed';
    if (index === currentIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          {isDelivery ? 'Delivery Tracking' : 'Pickup Status'}
        </h3>
        {isFailed && (
          <span style={styles.failedBadge}>
            {fulfillment.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </span>
        )}
      </div>

      {/* Status Timeline */}
      <div style={styles.timeline}>
        {statusFlow.map((status, index) => {
          const state = getStepState(index);
          const stepLabel = STATUSES.find(s => s.key === status)?.label || status;
          return (
            <div key={status} style={styles.timelineStep}>
              {/* Connector line */}
              {index > 0 && (
                <div style={{
                  ...styles.connector,
                  background: state === 'upcoming' ? '#e5e7eb' : '#059669'
                }} />
              )}
              {/* Circle */}
              <div style={{
                ...styles.circle,
                ...(state === 'completed' ? styles.circleCompleted : {}),
                ...(state === 'current' ? styles.circleCurrent : {}),
                ...(state === 'upcoming' ? styles.circleUpcoming : {}),
                ...(state === 'failed' ? styles.circleFailed : {})
              }}>
                {state === 'completed' && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {state === 'current' && <div style={styles.circlePulse} />}
              </div>
              {/* Label */}
              <div style={{
                ...styles.stepLabel,
                fontWeight: state === 'current' ? 700 : 500,
                color: state === 'upcoming' ? '#9ca3af' : '#111827'
              }}>
                {stepLabel}
              </div>
            </div>
          );
        })}
      </div>

      {/* Details */}
      <div style={styles.details}>
        {fulfillment.scheduledDate && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Scheduled</span>
            <span style={styles.detailValue}>
              {formatDate(fulfillment.scheduledDate)}
              {fulfillment.timeSlotStart && ` ${formatTime(fulfillment.timeSlotStart)}`}
              {fulfillment.timeSlotEnd && ` - ${formatTime(fulfillment.timeSlotEnd)}`}
            </span>
          </div>
        )}
        {fulfillment.trackingNumber && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Tracking #</span>
            <span style={styles.detailValue}>
              {fulfillment.trackingUrl ? (
                <a href={fulfillment.trackingUrl} target="_blank" rel="noopener noreferrer" style={styles.trackingLink}>
                  {fulfillment.trackingNumber}
                </a>
              ) : (
                fulfillment.trackingNumber
              )}
            </span>
          </div>
        )}
        {isDelivery && fulfillment.deliveryAddress && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Delivery Address</span>
            <span style={styles.detailValue}>{fulfillment.deliveryAddress}</span>
          </div>
        )}
        {fulfillment.deliveredAt && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>
              {isPickup ? 'Picked Up' : 'Delivered'}
            </span>
            <span style={styles.detailValue}>
              {formatDate(fulfillment.deliveredAt)}
              {fulfillment.deliveredTo && ` - Received by: ${fulfillment.deliveredTo}`}
            </span>
          </div>
        )}
        {fulfillment.customerNotes && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Notes</span>
            <span style={styles.detailValue}>{fulfillment.customerNotes}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '20px',
    marginTop: '16px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 700,
    color: '#1e293b'
  },
  failedBadge: {
    padding: '4px 10px',
    background: '#fef2f2',
    color: '#dc2626',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: 600
  },
  timeline: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    position: 'relative',
    marginBottom: '24px',
    padding: '0 8px'
  },
  timelineStep: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    flex: 1
  },
  connector: {
    position: 'absolute',
    top: '14px',
    right: '50%',
    width: '100%',
    height: '3px',
    zIndex: 0
  },
  circle: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    position: 'relative'
  },
  circleCompleted: {
    background: '#059669'
  },
  circleCurrent: {
    background: '#2563eb',
    boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.2)'
  },
  circleUpcoming: {
    background: '#e5e7eb'
  },
  circleFailed: {
    background: '#dc2626'
  },
  circlePulse: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: 'white'
  },
  stepLabel: {
    marginTop: '8px',
    fontSize: '11px',
    textAlign: 'center',
    lineHeight: 1.3
  },
  details: {
    background: 'white',
    borderRadius: '8px',
    padding: '12px 16px'
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #f3f4f6'
  },
  detailLabel: {
    fontSize: '13px',
    color: '#6b7280',
    fontWeight: 500
  },
  detailValue: {
    fontSize: '13px',
    color: '#111827',
    fontWeight: 600,
    textAlign: 'right'
  },
  trackingLink: {
    color: '#2563eb',
    textDecoration: 'underline'
  },
  loadingText: {
    textAlign: 'center',
    color: '#6b7280',
    padding: '20px',
    fontSize: '14px'
  }
};

export default FulfillmentTracker;
