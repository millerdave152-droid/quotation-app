/**
 * QuoteViewer Component
 * Displays quote details, items, revenue features, and actions
 */

import React, { useState, useEffect } from 'react';
import { previewQuotePDF, downloadQuotePDF } from '../../services/pdfService';
import { toast } from '../ui/Toast';
import logger from '../../utils/logger';
import VersionHistory from './VersionHistory';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * Tooltip wrapper component
 */
const Tooltip = ({ children, text }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && text && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '6px',
          padding: '6px 10px',
          background: '#1f2937',
          color: 'white',
          fontSize: '11px',
          fontWeight: '500',
          borderRadius: '6px',
          whiteSpace: 'nowrap',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}>
          {text}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            borderWidth: '5px',
            borderStyle: 'solid',
            borderColor: '#1f2937 transparent transparent transparent'
          }} />
        </div>
      )}
    </div>
  );
};

/**
 * StatusBadge - Displays quote status with tooltip
 */
const StatusBadge = ({ status, createdAt, size = 'normal' }) => {
  const statusConfig = {
    DRAFT: { bg: '#3b82f6', text: 'white', label: 'DRAFT' },
    SENT: { bg: '#8b5cf6', text: 'white', label: 'SENT' },
    WON: { bg: '#10b981', text: 'white', label: 'WON' },
    LOST: { bg: '#ef4444', text: 'white', label: 'LOST' },
    PENDING_APPROVAL: { bg: '#f59e0b', text: 'white', label: 'PENDING' },
    APPROVED: { bg: '#10b981', text: 'white', label: 'APPROVED' },
    REJECTED: { bg: '#ef4444', text: 'white', label: 'REJECTED' }
  };

  const config = statusConfig[status] || { bg: '#6b7280', text: 'white', label: status };

  const formatTooltipDate = (date) => {
    if (!date) return 'Unknown date';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const sizeStyles = {
    small: { padding: '2px 8px', fontSize: '12px' },
    normal: { padding: '4px 12px', fontSize: '12px' },
    large: { padding: '6px 16px', fontSize: '14px' }
  };

  const style = sizeStyles[size] || sizeStyles.normal;

  return (
    <Tooltip text={`Created on ${formatTooltipDate(createdAt)}`}>
      <span style={{
        display: 'inline-block',
        ...style,
        borderRadius: '9999px',
        fontWeight: '600',
        background: config.bg,
        color: config.text,
        cursor: 'default'
      }}>
        {config.label}
      </span>
    </Tooltip>
  );
};

/**
 * ExpiryBadge - Displays expiry status with tooltip (only for Draft/Sent)
 */
const ExpiryBadge = ({ expiresAt, status, size = 'normal' }) => {
  if (status === 'WON' || status === 'LOST') return null;
  if (!expiresAt) return null;

  const expiryDate = new Date(expiresAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiryDate.setHours(0, 0, 0, 0);

  const diffTime = expiryDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 7) return null;

  const isExpired = diffDays < 0;
  const isExpiringSoon = diffDays >= 0 && diffDays <= 7;

  const formatExpiryDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getTooltipText = () => {
    if (isExpired) {
      const daysAgo = Math.abs(diffDays);
      if (daysAgo === 0) return 'Expired today';
      if (daysAgo === 1) return 'Expired yesterday';
      return `Expired ${daysAgo} days ago`;
    }
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    return `Expires on ${formatExpiryDate(expiresAt)}`;
  };

  const sizeStyles = {
    small: { padding: '2px 8px', fontSize: '11px', iconSize: '11px' },
    normal: { padding: '4px 10px', fontSize: '11px', iconSize: '12px' },
    large: { padding: '6px 14px', fontSize: '13px', iconSize: '14px' }
  };

  const style = sizeStyles[size] || sizeStyles.normal;

  if (isExpired) {
    return (
      <Tooltip text={getTooltipText()}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: style.padding,
          borderRadius: '9999px',
          fontSize: style.fontSize,
          fontWeight: '600',
          background: '#dc2626',
          color: 'white',
          cursor: 'default'
        }}>
          <span style={{ fontSize: style.iconSize }}>&#128308;</span>
          EXPIRED
        </span>
      </Tooltip>
    );
  }

  if (isExpiringSoon) {
    return (
      <Tooltip text={getTooltipText()}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: style.padding,
          borderRadius: '9999px',
          fontSize: style.fontSize,
          fontWeight: '600',
          background: '#f59e0b',
          color: 'white',
          cursor: 'default'
        }}>
          <span style={{ fontSize: style.iconSize }}>&#9200;</span>
          {diffDays === 0 ? 'TODAY' : diffDays === 1 ? '1 DAY' : `${diffDays} DAYS`}
        </span>
      </Tooltip>
    );
  }

  return null;
};

const QuoteViewer = ({
  // Data
  quote,
  quoteEvents = [],
  quoteApprovals = [],

  // Actions
  onBack,
  onEdit,
  onDuplicate,
  onDelete,
  onUpdateStatus,
  onSendEmail,
  onRequestApproval,
  onAddEvent,

  // Dialog state
  showAddEventDialog,
  setShowAddEventDialog,
  newEventDescription,
  setNewEventDescription,
  onSaveEvent,

  // Version history
  onVersionRestore,
  formatCurrency
}) => {
  // Loading states for PDF operations
  const [pdfLoading, setPdfLoading] = useState({
    previewCustomer: false,
    downloadCustomer: false,
    previewInternal: false,
    downloadInternal: false
  });

  // Version history toggle
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Status change dialog states
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [lostReason, setLostReason] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

  // Signatures state
  const [signatures, setSignatures] = useState([]);
  const [signaturesLoading, setSignaturesLoading] = useState(false);

  // Fetch signatures when quote is loaded
  useEffect(() => {
    const fetchSignatures = async () => {
      if (!quote?.id) return;

      setSignaturesLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/quotations/${quote.id}/signatures`);
        if (response.ok) {
          const data = await response.json();
          setSignatures(data.signatures || []);
        }
      } catch (error) {
        logger.error('Error fetching signatures:', error);
      } finally {
        setSignaturesLoading(false);
      }
    };

    fetchSignatures();
  }, [quote?.id]);

  if (!quote) return null;

  // Status transition rules
  const STATUS_TRANSITIONS = {
    DRAFT: ['SENT', 'LOST'],
    SENT: ['WON', 'LOST', 'DRAFT'],
    WON: ['DRAFT'],
    LOST: ['DRAFT'],
    PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'DRAFT'],
    APPROVED: ['SENT', 'DRAFT'],
    REJECTED: ['DRAFT']
  };

  const allowedTransitions = STATUS_TRANSITIONS[quote.status] || [];

  // Status button configurations
  const statusButtons = {
    SENT: { label: 'Mark as Sent', icon: '📧', color: '#3b82f6', confirm: false },
    WON: { label: 'Mark as Won', icon: '🎉', color: '#10b981', confirm: true },
    LOST: { label: 'Mark as Lost', icon: '❌', color: '#ef4444', confirm: true, needsReason: true },
    DRAFT: { label: 'Reopen as Draft', icon: '📝', color: '#6b7280', confirm: true }
  };

  // Handle status button click
  const handleStatusClick = (newStatus) => {
    const config = statusButtons[newStatus];
    if (config?.confirm || config?.needsReason) {
      setPendingStatus(newStatus);
      setLostReason('');
      setShowStatusDialog(true);
    } else {
      confirmStatusChange(newStatus);
    }
  };

  // Confirm and execute status change
  const confirmStatusChange = async (status, reason = null) => {
    setStatusLoading(true);
    try {
      await onUpdateStatus?.(quote.id, status, { lostReason: reason });
      setShowStatusDialog(false);
      setPendingStatus(null);
      setLostReason('');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(error.message || 'Failed to update status');
    } finally {
      setStatusLoading(false);
    }
  };

  // Helper function to safely format dates
  const formatDate = (dateValue) => {
    if (!dateValue) return 'Not set';
    const date = new Date(dateValue);
    // Check for invalid date (epoch zero or NaN)
    if (isNaN(date.getTime()) || date.getFullYear() < 2000) {
      return 'Not set';
    }
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    });
  };

  // Helper function to calculate days until expiry
  const getDaysUntilExpiry = (expiresAt) => {
    if (!expiresAt) return null;
    const expiry = new Date(expiresAt);
    if (isNaN(expiry.getTime()) || expiry.getFullYear() < 2000) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysUntilExpiry = getDaysUntilExpiry(quote.expires_at);
  const expiryStatus = daysUntilExpiry === null ? null :
    daysUntilExpiry < 0 ? 'expired' :
    daysUntilExpiry === 0 ? 'today' :
    daysUntilExpiry <= 7 ? 'warning' : 'ok';

  // PDF operation handlers with loading state
  const handlePdfAction = async (action, type) => {
    const stateKey = `${action}${type.charAt(0).toUpperCase() + type.slice(1)}`;
    setPdfLoading(prev => ({ ...prev, [stateKey]: true }));

    try {
      if (action === 'preview') {
        await previewQuotePDF(quote.id, type);
      } else {
        await downloadQuotePDF(quote.id, type);
      }
      toast.success(
        `${type.charAt(0).toUpperCase() + type.slice(1)} PDF ${action === 'preview' ? 'opened' : 'downloaded'} successfully`,
        'PDF Ready'
      );
    } catch (error) {
      logger.error(`PDF ${action} failed:`, error);
      toast.error(
        `Failed to ${action} ${type} PDF. Please try again.`,
        'PDF Error'
      );
    } finally {
      setPdfLoading(prev => ({ ...prev, [stateKey]: false }));
    }
  };

  // Parse revenue features
  let revenueFeatures = null;
  try {
    revenueFeatures = quote.revenue_features ?
      (typeof quote.revenue_features === 'string' ?
        JSON.parse(quote.revenue_features) :
        quote.revenue_features) :
      null;
  } catch (e) {
    logger.warn('Could not parse revenue_features:', e);
  }

  const hasRevenueFeatures = revenueFeatures && (
    revenueFeatures.delivery ||
    revenueFeatures.warranties?.length > 0 ||
    revenueFeatures.financing ||
    revenueFeatures.rebates?.length > 0 ||
    revenueFeatures.tradeIns?.length > 0
  );

  // Status colors
  const getStatusStyle = (status) => {
    const styles = {
      DRAFT: { bg: '#e0e7ff', color: '#3730a3' },
      SENT: { bg: '#dbeafe', color: '#1e40af' },
      WON: { bg: '#d1fae5', color: '#065f46' },
      LOST: { bg: '#fee2e2', color: '#991b1b' },
      PENDING_APPROVAL: { bg: '#fef3c7', color: '#92400e' },
      APPROVED: { bg: '#d1fae5', color: '#065f46' },
      REJECTED: { bg: '#fee2e2', color: '#991b1b' }
    };
    return styles[status] || styles.DRAFT;
  };

  const statusStyle = getStatusStyle(quote.status);
  const hasPendingApproval = quoteApprovals.some(a => a.status === 'PENDING');

  return (
    <div style={{ padding: '24px' }}>
      {/* Spinner animation keyframes */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', margin: 0 }}>
          Quote {quote.quote_number}
        </h1>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => onSendEmail?.(quote)}
            style={{
              padding: '12px 24px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Send Email
          </button>

          {(quote.status === 'DRAFT' || quote.status === 'SENT') && (
            <button
              onClick={onRequestApproval}
              disabled={hasPendingApproval}
              style={{
                padding: '12px 24px',
                background: hasPendingApproval ? '#9ca3af' : '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: hasPendingApproval ? 'not-allowed' : 'pointer'
              }}
            >
              Request Approval
            </button>
          )}

          <button
            onClick={onBack}
            style={{
              padding: '12px 24px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Back to List
          </button>
        </div>
      </div>

      {/* Quote Header Info */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
              Customer Information
            </h3>
            <div style={{ color: '#6b7280' }}>
              <div style={{ marginBottom: '4px' }}>{quote.customer_name}</div>
              <div style={{ marginBottom: '4px' }}>{quote.customer_email}</div>
              <div>{quote.customer_phone}</div>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
              Quote Information
            </h3>
            <div style={{ color: '#6b7280' }}>
              <div style={{ marginBottom: '4px' }}>
                Date: {formatDate(quote.created_at)}
              </div>
              <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Valid Until: {formatDate(quote.expires_at)}</span>
                {expiryStatus && (
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    background: expiryStatus === 'expired' ? '#fee2e2' :
                               expiryStatus === 'today' ? '#fef3c7' :
                               expiryStatus === 'warning' ? '#fef3c7' : '#d1fae5',
                    color: expiryStatus === 'expired' ? '#991b1b' :
                           expiryStatus === 'today' ? '#92400e' :
                           expiryStatus === 'warning' ? '#92400e' : '#065f46'
                  }}>
                    {expiryStatus === 'expired' ? `Expired ${Math.abs(daysUntilExpiry)} days ago` :
                     expiryStatus === 'today' ? 'Expires today' :
                     `${daysUntilExpiry} days left`}
                  </span>
                )}
              </div>
              <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>Status:</span>
                <StatusBadge status={quote.status} createdAt={quote.created_at} size="small" />
                <ExpiryBadge expiresAt={quote.expires_at} status={quote.status} size="small" />
              </div>
              {quote.created_by && (
                <div style={{ marginBottom: '4px' }}>
                  Created by: <span style={{ fontWeight: '500' }}>{quote.created_by}</span>
                </div>
              )}
              {quote.modified_by && (
                <div style={{ marginBottom: '4px' }}>
                  Last modified by: <span style={{ fontWeight: '500' }}>{quote.modified_by}</span>
                  {quote.updated_at && quote.updated_at !== quote.created_at && (
                    <span style={{ marginLeft: '8px', fontSize: '12px' }}>
                      ({formatDate(quote.updated_at)})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quote Items */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Items</h3>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Item</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>Qty</th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Unit Price</th>
              <th style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items?.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ fontWeight: 'bold' }}>{item.manufacturer} - {item.model}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>SKU: {item.sku || item.model}</div>
                  {item.description && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{item.description}</div>
                  )}
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ padding: '12px', textAlign: 'right' }}>
                  ${((item.sell_cents || item.unit_price_cents || 0) / 100).toFixed(2)}
                </td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                  ${((item.line_total_cents || 0) / 100).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '2px solid #e5e7eb', textAlign: 'right' }}>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ marginRight: '40px' }}>Subtotal:</span>
            <span style={{ fontWeight: 'bold' }}>${((quote.subtotal_cents || 0) / 100).toFixed(2)}</span>
          </div>
          {quote.discount_percent > 0 && (
            <div style={{ marginBottom: '8px', color: '#ef4444' }}>
              <span style={{ marginRight: '40px' }}>Discount ({quote.discount_percent}%):</span>
              <span style={{ fontWeight: 'bold' }}>-${((quote.discount_cents || 0) / 100).toFixed(2)}</span>
            </div>
          )}
          <div style={{ marginBottom: '8px' }}>
            <span style={{ marginRight: '40px' }}>HST (13%):</span>
            <span style={{ fontWeight: 'bold' }}>${((quote.tax_cents || 0) / 100).toFixed(2)}</span>
          </div>
          <div style={{ fontSize: '24px', marginTop: '16px', paddingTop: '16px', borderTop: '2px solid #e5e7eb' }}>
            <span style={{ marginRight: '40px', fontWeight: 'bold' }}>TOTAL:</span>
            <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>${((quote.total_cents || 0) / 100).toFixed(2)}</span>
          </div>
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            background: '#fef2f2',
            borderRadius: '6px',
            border: '1px dashed #ef4444',
            fontSize: '14px'
          }}>
            <span style={{ color: '#991b1b', marginRight: '8px', fontSize: '12px' }}>🔒 INTERNAL</span>
            <span style={{ marginRight: '40px', color: '#10b981' }}>Gross Profit:</span>
            <span style={{ fontWeight: 'bold', color: '#10b981' }}>${((quote.gross_profit_cents || 0) / 100).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Revenue Features */}
      {hasRevenueFeatures && (
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: '2px solid #4CAF50'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#4CAF50' }}>
            Value-Added Services
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            {/* Delivery */}
            {revenueFeatures.delivery?.service && (
              <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#166534' }}>Delivery & Installation</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>{revenueFeatures.delivery.service.service_name}</div>
                {revenueFeatures.delivery.calculation && (
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#166534', marginTop: '8px' }}>
                    ${(revenueFeatures.delivery.calculation.totalCents / 100).toFixed(2)}
                  </div>
                )}
              </div>
            )}

            {/* Warranties */}
            {revenueFeatures.warranties?.length > 0 && (
              <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#166534' }}>Extended Warranty</div>
                {revenueFeatures.warranties.map((w, idx) => (
                  <div key={idx} style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                    {w.plan?.plan_name || 'Warranty'} - ${(w.cost / 100).toFixed(2)}
                  </div>
                ))}
              </div>
            )}

            {/* Financing */}
            {revenueFeatures.financing?.plan && (
              <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e40af' }}>Financing Available</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>{revenueFeatures.financing.plan.plan_name}</div>
                {revenueFeatures.financing.calculation && (
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e40af', marginTop: '8px' }}>
                    ${(revenueFeatures.financing.calculation.monthlyPaymentCents / 100).toFixed(2)}/month
                  </div>
                )}
              </div>
            )}

            {/* Trade-Ins */}
            {revenueFeatures.tradeIns?.length > 0 && (
              <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e40af' }}>Trade-In Credit</div>
                {revenueFeatures.tradeIns.map((t, idx) => (
                  <div key={idx} style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>
                    {t.item_description || 'Trade-In'} - ${(t.estimatedValueCents / 100).toFixed(2)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes and Terms */}
      {(quote.notes || quote.internal_notes || quote.terms) && (
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          {quote.notes && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Customer Notes:</h4>
              <p style={{ color: '#6b7280', margin: 0 }}>{quote.notes}</p>
            </div>
          )}

          {quote.internal_notes && (
            <div style={{ marginBottom: '16px', padding: '12px', background: '#fef2f2', borderRadius: '8px', border: '2px solid #fee2e2' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#991b1b' }}>Internal Notes (Private):</h4>
              <p style={{ color: '#6b7280', margin: 0 }}>{quote.internal_notes}</p>
            </div>
          )}

          {quote.terms && (
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Terms & Conditions:</h4>
              <p style={{ color: '#6b7280', margin: 0 }}>{quote.terms}</p>
            </div>
          )}
        </div>
      )}

      {/* Signatures Section */}
      {signatures.length > 0 && (
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: '2px solid #10b981'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#059669', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>✍️</span>
            Signatures ({signatures.length})
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px'
          }}>
            {signatures.map((sig) => (
              <div
                key={sig.id}
                style={{
                  padding: '16px',
                  background: '#f9fafb',
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb'
                }}
              >
                {/* Signature Type Badge */}
                <div style={{ marginBottom: '12px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    background: sig.signature_type === 'staff' ? '#dbeafe' : '#d1fae5',
                    color: sig.signature_type === 'staff' ? '#1e40af' : '#065f46',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '700',
                    textTransform: 'uppercase'
                  }}>
                    {sig.signature_type === 'staff' ? 'Staff Signature' : 'Customer Signature'}
                  </span>
                </div>

                {/* Signature Image */}
                {sig.signature_data && (
                  <div style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '8px',
                    marginBottom: '12px',
                    border: '1px solid #d1d5db'
                  }}>
                    <img
                      src={sig.signature_data}
                      alt={`Signature by ${sig.signer_name}`}
                      style={{
                        width: '100%',
                        maxHeight: '80px',
                        objectFit: 'contain'
                      }}
                    />
                  </div>
                )}

                {/* Signer Info */}
                <div style={{ fontSize: '14px' }}>
                  <div style={{ fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
                    {sig.signer_name}
                  </div>
                  {sig.signer_email && (
                    <div style={{ color: '#6b7280', fontSize: '13px', marginBottom: '4px' }}>
                      {sig.signer_email}
                    </div>
                  )}
                  <div style={{ color: '#9ca3af', fontSize: '12px' }}>
                    Signed: {new Date(sig.signed_at).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PDF Options */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>PDF Options</h3>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => handlePdfAction('preview', 'customer')}
            disabled={pdfLoading.previewCustomer}
            style={{
              padding: '12px 24px',
              background: pdfLoading.previewCustomer ? '#a78bfa' : '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: pdfLoading.previewCustomer ? 'wait' : 'pointer',
              opacity: pdfLoading.previewCustomer ? 0.8 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {pdfLoading.previewCustomer && (
              <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            )}
            {pdfLoading.previewCustomer ? 'Generating...' : 'Preview Customer PDF'}
          </button>

          <button
            onClick={() => handlePdfAction('download', 'customer')}
            disabled={pdfLoading.downloadCustomer}
            style={{
              padding: '12px 24px',
              background: pdfLoading.downloadCustomer ? '#60a5fa' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: pdfLoading.downloadCustomer ? 'wait' : 'pointer',
              opacity: pdfLoading.downloadCustomer ? 0.8 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {pdfLoading.downloadCustomer && (
              <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            )}
            {pdfLoading.downloadCustomer ? 'Generating...' : 'Download Customer PDF'}
          </button>

          <button
            onClick={() => handlePdfAction('preview', 'internal')}
            disabled={pdfLoading.previewInternal}
            style={{
              padding: '12px 24px',
              background: pdfLoading.previewInternal ? '#fbbf24' : '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: pdfLoading.previewInternal ? 'wait' : 'pointer',
              opacity: pdfLoading.previewInternal ? 0.8 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {pdfLoading.previewInternal && (
              <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            )}
            {pdfLoading.previewInternal ? 'Generating...' : 'Preview Internal PDF'}
          </button>

          <button
            onClick={() => handlePdfAction('download', 'internal')}
            disabled={pdfLoading.downloadInternal}
            style={{
              padding: '12px 24px',
              background: pdfLoading.downloadInternal ? '#f472b6' : '#ec4899',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: pdfLoading.downloadInternal ? 'wait' : 'pointer',
              opacity: pdfLoading.downloadInternal ? 0.8 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {pdfLoading.downloadInternal && (
              <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            )}
            {pdfLoading.downloadInternal ? 'Generating...' : 'Download Internal PDF'}
          </button>
        </div>

        {/* PDF Type Explanations */}
        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ padding: '12px', background: '#dcfce7', borderRadius: '8px', border: '2px solid #22c55e' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '16px' }}>✅</span>
              <strong style={{ color: '#15803d' }}>Customer PDF (Safe to Send)</strong>
            </div>
            <div style={{ fontSize: '12px', color: '#166534' }}>
              Clean pricing only - NO cost, profit, or margin data
            </div>
          </div>
          <div style={{ padding: '12px', background: '#fef2f2', borderRadius: '8px', border: '2px solid #ef4444' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <strong style={{ color: '#991b1b' }}>Internal PDF (DO NOT SEND)</strong>
            </div>
            <div style={{ fontSize: '12px', color: '#991b1b' }}>
              Contains CONFIDENTIAL cost, profit & margin analysis
            </div>
          </div>
        </div>
      </div>

      {/* Quote Status Actions */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Quote Status & Actions</h3>

        {/* Current Status Display */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '20px',
          padding: '16px',
          background: '#f9fafb',
          borderRadius: '8px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>Current Status:</span>
            <StatusBadge status={quote.status} createdAt={quote.created_at} size="large" />
            <ExpiryBadge expiresAt={quote.expires_at} status={quote.status} size="large" />
          </div>

          {/* Status Dates */}
          {quote.sent_at && (
            <div style={{ fontSize: '13px', color: '#6b7280' }}>
              Sent: {formatDate(quote.sent_at)}
            </div>
          )}
          {quote.won_at && (
            <div style={{ fontSize: '13px', color: '#10b981', fontWeight: '600' }}>
              Won: {formatDate(quote.won_at)}
            </div>
          )}
          {quote.lost_at && (
            <div style={{ fontSize: '13px', color: '#ef4444' }}>
              Lost: {formatDate(quote.lost_at)}
              {quote.lost_reason && <span> - {quote.lost_reason}</span>}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <button
            onClick={() => onEdit?.(quote)}
            style={{
              padding: '12px 24px',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>Edit Quote</span>
          </button>

          <button
            onClick={() => onDuplicate?.(quote)}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(6, 182, 212, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(6, 182, 212, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(6, 182, 212, 0.3)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span>Clone Quote</span>
          </button>
        </div>

        {/* Status Transition Buttons */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
            Change Status:
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {allowedTransitions.map(status => {
              const config = statusButtons[status];
              if (!config) return null;

              return (
                <button
                  key={status}
                  onClick={() => handleStatusClick(status)}
                  disabled={statusLoading}
                  style={{
                    padding: '12px 24px',
                    background: statusLoading ? '#9ca3af' : config.color,
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: statusLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    opacity: statusLoading ? 0.7 : 1
                  }}
                >
                  <span>{config.icon}</span>
                  <span>{config.label}</span>
                </button>
              );
            })}

            {allowedTransitions.length === 0 && (
              <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
                No status changes available for {quote.status} quotes
              </div>
            )}
          </div>
        </div>

        {/* Delete Button */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to delete this quote? This action cannot be undone.')) {
                onDelete?.(quote.id);
              }
            }}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              color: '#ef4444',
              border: '2px solid #ef4444',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>Delete Quote</span>
          </button>
        </div>
      </div>

      {/* Status Change Confirmation Dialog */}
      {showStatusDialog && pendingStatus && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '32px',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>
              {statusButtons[pendingStatus]?.icon} Confirm Status Change
            </h3>

            <p style={{ color: '#4b5563', marginBottom: '20px' }}>
              {pendingStatus === 'WON' && (
                <>Are you sure you want to mark this quote as <strong style={{ color: '#10b981' }}>Won</strong>? This will record the sale and update your revenue metrics.</>
              )}
              {pendingStatus === 'LOST' && (
                <>Are you sure you want to mark this quote as <strong style={{ color: '#ef4444' }}>Lost</strong>? Please provide a reason below.</>
              )}
              {pendingStatus === 'DRAFT' && (
                <>Are you sure you want to <strong>reopen</strong> this quote as a Draft? This will clear the won/lost date.</>
              )}
            </p>

            {/* Lost Reason Input */}
            {pendingStatus === 'LOST' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                  Reason for Loss (optional):
                </label>
                <select
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    marginBottom: '8px'
                  }}
                >
                  <option value="">Select a reason...</option>
                  <option value="Price too high">Price too high</option>
                  <option value="Competitor won">Competitor won</option>
                  <option value="Customer changed mind">Customer changed mind</option>
                  <option value="Budget constraints">Budget constraints</option>
                  <option value="Timeline issues">Timeline issues</option>
                  <option value="Product not available">Product not available</option>
                  <option value="No response">No response from customer</option>
                  <option value="Other">Other</option>
                </select>
                {lostReason === 'Other' && (
                  <input
                    type="text"
                    placeholder="Enter custom reason..."
                    onChange={(e) => setLostReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  />
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowStatusDialog(false);
                  setPendingStatus(null);
                  setLostReason('');
                }}
                disabled={statusLoading}
                style={{
                  padding: '12px 24px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmStatusChange(pendingStatus, lostReason || null)}
                disabled={statusLoading}
                style={{
                  padding: '12px 24px',
                  background: statusLoading ? '#9ca3af' : (statusButtons[pendingStatus]?.color || '#3b82f6'),
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: statusLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {statusLoading && (
                  <span style={{
                    display: 'inline-block',
                    width: '16px',
                    height: '16px',
                    border: '2px solid white',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                )}
                {statusLoading ? 'Updating...' : `Confirm ${statusButtons[pendingStatus]?.label}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Timeline */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Activity Timeline</h3>
          <button
            onClick={() => setShowAddEventDialog?.(true)}
            style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            + Add Note
          </button>
        </div>

        {quoteEvents.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
            No activity recorded yet. Add notes to track interactions!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {quoteEvents.map((event) => {
              const eventColors = {
                CREATED: { bg: '#dbeafe', border: '#3b82f6', icon: '✨' },
                UPDATED: { bg: '#fef3c7', border: '#f59e0b', icon: '✏️' },
                STATUS_CHANGED: { bg: '#e0e7ff', border: '#6366f1', icon: '🔄' },
                EMAIL_SENT: { bg: '#d1fae5', border: '#10b981', icon: '📧' },
                APPROVAL_REQUESTED: { bg: '#fef3c7', border: '#f59e0b', icon: '✅' },
                APPROVED: { bg: '#d1fae5', border: '#10b981', icon: '✅' },
                REJECTED: { bg: '#fee2e2', border: '#ef4444', icon: '❌' },
                NOTE: { bg: '#f3f4f6', border: '#6b7280', icon: '📝' }
              };
              const style = eventColors[event.event_type] || eventColors.NOTE;

              return (
                <div
                  key={event.id}
                  style={{
                    padding: '12px',
                    background: style.bg,
                    borderRadius: '6px',
                    borderLeft: `4px solid ${style.border}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 'bold', color: style.border }}>
                      {style.icon} {event.event_type.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                  {event.description && (
                    <div style={{ fontSize: '14px', color: '#374151', marginTop: '8px' }}>{event.description}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Approval History */}
      {quoteApprovals.length > 0 && (
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Approval History</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {quoteApprovals.map((approval) => {
              const statusColors = {
                PENDING: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
                APPROVED: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
                REJECTED: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' }
              };
              const style = statusColors[approval.status] || statusColors.PENDING;

              return (
                <div
                  key={approval.id}
                  style={{
                    padding: '16px',
                    background: style.bg,
                    borderRadius: '8px',
                    borderLeft: `4px solid ${style.border}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: style.text, marginBottom: '4px' }}>
                        {approval.status === 'PENDING' && 'Pending Approval'}
                        {approval.status === 'APPROVED' && 'Approved'}
                        {approval.status === 'REJECTED' && 'Rejected'}
                      </div>
                      <div style={{ fontSize: '14px', color: '#6b7280' }}>
                        Requested by: {approval.requested_by} ({approval.requested_by_email})
                      </div>
                      {approval.approver_name && (
                        <div style={{ fontSize: '14px', color: '#6b7280' }}>
                          Approver: {approval.approver_name} ({approval.approver_email})
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        Requested: {new Date(approval.requested_at).toLocaleString()}
                      </div>
                      {approval.reviewed_at && (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          Reviewed: {new Date(approval.reviewed_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {approval.comments && (
                    <div style={{ padding: '12px', background: 'white', borderRadius: '6px', fontSize: '14px', color: '#374151' }}>
                      <strong>Comments:</strong> {approval.comments}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Version History Section */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        border: '2px solid #e0e7ff'
      }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer'
          }}
          onClick={() => setShowVersionHistory(!showVersionHistory)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>📜</span>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#3730a3' }}>
                Version History
              </h3>
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                {quote.current_version ? `Current: v${quote.current_version}` : 'Track changes to this quote'}
              </div>
            </div>
          </div>
          <button
            style={{
              padding: '8px 16px',
              background: showVersionHistory ? '#4f46e5' : '#e0e7ff',
              color: showVersionHistory ? 'white' : '#4f46e5',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span style={{
              transform: showVersionHistory ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s'
            }}>
              ▼
            </span>
            {showVersionHistory ? 'Hide' : 'Show'}
          </button>
        </div>

        {showVersionHistory && (
          <div style={{ marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '20px' }}>
            <VersionHistory
              quoteId={quote.id}
              currentVersion={quote.current_version || 1}
              onRestore={(restoredQuote) => {
                if (onVersionRestore) {
                  onVersionRestore(restoredQuote);
                }
              }}
              formatCurrency={formatCurrency}
            />
          </div>
        )}
      </div>

      {/* Add Event Dialog */}
      {showAddEventDialog && (
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
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '32px',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            minWidth: '400px',
            maxWidth: '500px'
          }}>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>Add Activity Note</h3>

            <textarea
              value={newEventDescription}
              onChange={(e) => setNewEventDescription?.(e.target.value)}
              placeholder="Enter note about this quote..."
              rows="4"
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                resize: 'vertical',
                marginBottom: '16px'
              }}
              autoFocus
            />

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowAddEventDialog?.(false); setNewEventDescription?.(''); }}
                style={{ padding: '12px 24px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={onSaveEvent}
                disabled={!newEventDescription?.trim()}
                style={{
                  padding: '12px 24px',
                  background: newEventDescription?.trim() ? '#3b82f6' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: newEventDescription?.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteViewer;
