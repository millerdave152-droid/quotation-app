import React, { useState, useEffect } from 'react';

import { authFetch } from '../../services/authFetch';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function TransactionSummary({ quoteId, token, convertedToOrderId }) {
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!convertedToOrderId) {
      setLoading(false);
      return;
    }
    fetchTransaction();
  }, [quoteId, token, convertedToOrderId]);

  const fetchTransaction = async () => {
    try {
      setLoading(true);
      const url = token
        ? `${API_URL}/api/customer-portal/quotes/${token}/${quoteId}/transaction`
        : `${API_URL}/api/customer-portal/internal/quotes/${quoteId}/transaction`;

      const headers = {};
      if (!token) {
        const authToken = localStorage.getItem('auth_token');
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await authFetch(url, { headers });
      const result = await response.json();

      if (result.success) {
        setTransaction(result.data);
      } else {
        setError(result.error || 'Failed to load transaction');
      }
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

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingText}>Loading transaction details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorText}>Unable to load transaction: {error}</div>
      </div>
    );
  }

  if (!transaction) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerIcon}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#059669"/>
          </svg>
        </div>
        <div>
          <h3 style={styles.title}>Sale Completed</h3>
          <p style={styles.subtitle}>
            Transaction #{transaction.transactionNumber} &mdash; {formatDate(transaction.transactionDate)}
          </p>
        </div>
      </div>

      {/* Summary row */}
      <div style={styles.summaryRow}>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Total Paid</span>
          <span style={styles.summaryValue}>{formatCurrency(transaction.totalCents)}</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Subtotal</span>
          <span style={styles.summaryValueSmall}>{formatCurrency(transaction.subtotalCents)}</span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Tax</span>
          <span style={styles.summaryValueSmall}>{formatCurrency(transaction.taxCents)}</span>
        </div>
        {transaction.salesperson && (
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Salesperson</span>
            <span style={styles.summaryValueSmall}>{transaction.salesperson}</span>
          </div>
        )}
      </div>

      {/* Items */}
      {transaction.items && transaction.items.length > 0 && (
        <div style={styles.itemsSection}>
          <h4 style={styles.sectionTitle}>Items Purchased</h4>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Product</th>
                <th style={{ ...styles.th, textAlign: 'center' }}>Qty</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Unit Price</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {transaction.items.map(item => (
                <tr key={item.id}>
                  <td style={styles.td}>
                    <div style={styles.productName}>
                      {item.manufacturer} {item.model}
                    </div>
                    {item.description && (
                      <div style={styles.productDesc}>{item.description}</div>
                    )}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{formatCurrency(item.unitPriceCents)}</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
                    {formatCurrency(item.lineTotalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payments */}
      {transaction.payments && transaction.payments.length > 0 && (
        <div style={styles.paymentsSection}>
          <h4 style={styles.sectionTitle}>Payments</h4>
          {transaction.payments.map((payment, idx) => (
            <div key={idx} style={styles.paymentRow}>
              <span style={styles.paymentMethod}>
                {payment.method.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              <span style={styles.paymentAmount}>{formatCurrency(payment.amountCents)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: '12px',
    padding: '20px',
    marginTop: '16px'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px'
  },
  headerIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#dcfce7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 700,
    color: '#166534'
  },
  subtitle: {
    margin: '2px 0 0',
    fontSize: '13px',
    color: '#15803d'
  },
  summaryRow: {
    display: 'flex',
    gap: '24px',
    padding: '12px 16px',
    background: 'white',
    borderRadius: '8px',
    marginBottom: '16px',
    flexWrap: 'wrap'
  },
  summaryItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  summaryLabel: {
    fontSize: '11px',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  summaryValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#166534'
  },
  summaryValueSmall: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#111827'
  },
  itemsSection: {
    marginTop: '12px'
  },
  sectionTitle: {
    margin: '0 0 8px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'white',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  th: {
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    borderBottom: '1px solid #e5e7eb',
    textAlign: 'left'
  },
  td: {
    padding: '10px 12px',
    fontSize: '13px',
    color: '#111827',
    borderBottom: '1px solid #f3f4f6'
  },
  productName: {
    fontWeight: 600,
    fontSize: '13px'
  },
  productDesc: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '2px'
  },
  paymentsSection: {
    marginTop: '12px'
  },
  paymentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'white',
    borderRadius: '6px',
    marginBottom: '4px'
  },
  paymentMethod: {
    fontSize: '13px',
    color: '#374151',
    fontWeight: 500
  },
  paymentAmount: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#111827'
  },
  loadingText: {
    textAlign: 'center',
    color: '#6b7280',
    padding: '20px',
    fontSize: '14px'
  },
  errorText: {
    textAlign: 'center',
    color: '#dc2626',
    padding: '20px',
    fontSize: '14px'
  }
};

export default TransactionSummary;
