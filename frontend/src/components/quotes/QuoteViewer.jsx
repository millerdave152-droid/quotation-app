/**
 * QuoteViewer Component
 * Displays quote details, items, revenue features, and actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { previewQuotePDF, downloadQuotePDF } from '../../services/pdfService';
import { toast } from '../ui/Toast';
import logger from '../../utils/logger';
import VersionHistory from './VersionHistory';
import QuotePromotionAlerts from './QuotePromotionAlerts';

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
  // Standardized color palette (WCAG 2.1 AA compliant - 4.5:1 contrast)
  const statusConfig = {
    DRAFT: { bg: '#6b7280', text: 'white', label: 'DRAFT' },         // Gray - neutral
    SENT: { bg: '#8b5cf6', text: 'white', label: 'SENT' },           // Purple - in progress
    VIEWED: { bg: '#0ea5e9', text: 'white', label: 'VIEWED' },       // Sky blue - engaged
    PENDING_APPROVAL: { bg: '#f59e0b', text: '#000000', label: 'PENDING' }, // Amber - needs attention
    APPROVED: { bg: '#10b981', text: 'white', label: 'APPROVED' },   // Green - positive
    WON: { bg: '#059669', text: 'white', label: 'WON' },             // Darker green - success
    LOST: { bg: '#dc2626', text: 'white', label: 'LOST' },           // Red - negative
    REJECTED: { bg: '#ef4444', text: 'white', label: 'REJECTED' }    // Lighter red - negative
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
          padding: style.padding,
          borderRadius: '9999px',
          fontSize: style.fontSize,
          fontWeight: '600',
          background: '#dc2626',
          color: 'white',
          cursor: 'default'
        }}>
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
          padding: style.padding,
          borderRadius: '9999px',
          fontSize: style.fontSize,
          fontWeight: '600',
          background: '#f97316',
          color: 'white',
          cursor: 'default'
        }}>
          {diffDays === 0 ? 'EXPIRES TODAY' : diffDays === 1 ? 'EXPIRES IN 1 DAY' : `EXPIRES IN ${diffDays} DAYS`}
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

  // Win probability state
  const [winProbability, setWinProbability] = useState(null);
  const [winProbabilityLoading, setWinProbabilityLoading] = useState(false);

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

  // Fetch win probability when quote is loaded
  useEffect(() => {
    const fetchWinProbability = async () => {
      if (!quote?.id || quote.status === 'WON' || quote.status === 'LOST' || quote.status === 'EXPIRED') {
        setWinProbability(null);
        return;
      }

      setWinProbabilityLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/quotations/${quote.id}/win-probability`);
        if (response.ok) {
          const data = await response.json();
          setWinProbability(data.data);
        }
      } catch (error) {
        logger.error('Error fetching win probability:', error);
      } finally {
        setWinProbabilityLoading(false);
      }
    };

    fetchWinProbability();
  }, [quote?.id, quote?.status]);

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
    // Validate quote exists and has an ID
    if (!quote?.id) {
      toast.error('Cannot generate PDF: Quote has not been saved yet.', 'Save Required');
      return;
    }

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

  // Check if quote needs approval before sending
  const needsApproval = quote.approval_required && quote.status !== 'APPROVED';
  const canSend = !needsApproval;
  const pendingApprover = hasPendingApproval
    ? quoteApprovals.find(a => a.status === 'PENDING')
    : null;

  return (
    <div style={{ padding: '24px' }}>
      {/* Animation keyframes */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.85; transform: scale(1.02); }
          }
        `}
      </style>

      {/* Approval Required Banner */}
      {needsApproval && (
        <div style={{
          background: hasPendingApproval
            ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
            : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
          border: hasPendingApproval ? '2px solid #f59e0b' : '2px solid #ef4444',
          borderRadius: '12px',
          padding: '16px 24px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: hasPendingApproval
            ? '0 2px 8px rgba(245, 158, 11, 0.2)'
            : '0 2px 8px rgba(239, 68, 68, 0.2)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            background: hasPendingApproval ? '#f59e0b' : '#ef4444',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <span style={{ fontSize: '24px' }}>{hasPendingApproval ? '\u23F3' : '\u26A0\uFE0F'}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color: hasPendingApproval ? '#92400e' : '#991b1b',
              marginBottom: '4px'
            }}>
              {hasPendingApproval ? 'Awaiting Manager Approval' : 'Approval Required - Low Margin'}
            </div>
            <div style={{ fontSize: '14px', color: hasPendingApproval ? '#a16207' : '#b91c1c' }}>
              {hasPendingApproval ? (
                <>Pending approval from <strong>{pendingApprover?.approver_name}</strong> ({pendingApprover?.approver_email})</>
              ) : (
                <>This quote has a margin of <strong>{(quote.margin_percent || 0).toFixed(1)}%</strong> and requires manager approval before it can be sent to the customer.</>
              )}
            </div>
          </div>
          {quote.margin_percent !== undefined && (
            <div style={{
              background: 'white',
              padding: '8px 16px',
              borderRadius: '8px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Margin</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>
                {(quote.margin_percent || 0).toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* Approved Banner */}
      {quote.status === 'APPROVED' && (
        <div style={{
          background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
          border: '2px solid #10b981',
          borderRadius: '12px',
          padding: '16px 24px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            background: '#10b981',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <span style={{ fontSize: '24px', color: 'white' }}>\u2713</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#065f46', marginBottom: '4px' }}>
              Quote Approved
            </div>
            <div style={{ fontSize: '14px', color: '#047857' }}>
              This quote has been approved{quote.approved_by ? ` by ${quote.approved_by}` : ''}. You can now send it to the customer.
            </div>
          </div>
        </div>
      )}

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
            onClick={() => canSend ? onSendEmail?.(quote) : null}
            disabled={!canSend}
            title={!canSend ? 'Approval required before sending' : 'Send quote to customer'}
            style={{
              padding: '12px 24px',
              background: canSend ? '#10b981' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: canSend ? 'pointer' : 'not-allowed',
              opacity: canSend ? 1 : 0.7
            }}
          >
            {canSend ? 'Send Email' : 'Requires Approval'}
          </button>

          {/* Show Request Approval when approval is required OR when quote is in draft/sent */}
          {(needsApproval || quote.status === 'DRAFT' || quote.status === 'SENT') && (
            <button
              onClick={onRequestApproval}
              disabled={hasPendingApproval}
              style={{
                padding: '12px 24px',
                background: hasPendingApproval ? '#9ca3af' : needsApproval ? '#ef4444' : '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: hasPendingApproval ? 'not-allowed' : 'pointer',
                animation: needsApproval && !hasPendingApproval ? 'pulse 2s infinite' : 'none'
              }}
            >
              {hasPendingApproval ? 'Pending Approval' : needsApproval ? 'Request Approval Now' : 'Request Approval'}
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
          {/* Bill To Section */}
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
              Bill To
            </h3>
            <div style={{ color: '#374151' }}>
              <div style={{ fontWeight: '600', fontSize: '15px', marginBottom: '4px' }}>
                {quote.customer_name || 'N/A'}
              </div>
              {quote.customer_company && (
                <div style={{ marginBottom: '4px', fontStyle: 'italic' }}>
                  {quote.customer_company}
                </div>
              )}
              {quote.customer_address && (
                <div style={{ marginBottom: '2px' }}>{quote.customer_address}</div>
              )}
              {(quote.customer_city || quote.customer_province || quote.customer_postal_code) && (
                <div style={{ marginBottom: '4px' }}>
                  {[quote.customer_city, quote.customer_province, quote.customer_postal_code]
                    .filter(Boolean)
                    .join(', ')}
                </div>
              )}
            </div>

            {/* Contact Information */}
            <h4 style={{ fontSize: '14px', fontWeight: '600', marginTop: '16px', marginBottom: '8px', color: '#6b7280' }}>
              Contact
            </h4>
            <div style={{ color: '#374151' }}>
              {quote.customer_email && (
                <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#6b7280', width: '50px', fontSize: '13px' }}>Email:</span>
                  <a href={`mailto:${quote.customer_email}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>
                    {quote.customer_email}
                  </a>
                </div>
              )}
              {quote.customer_phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#6b7280', width: '50px', fontSize: '13px' }}>Phone:</span>
                  <a href={`tel:${quote.customer_phone}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>
                    {quote.customer_phone}
                  </a>
                </div>
              )}
              {!quote.customer_email && !quote.customer_phone && (
                <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>No contact information</div>
              )}
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

        {/* Win Probability Section */}
        {winProbability && !['WON', 'LOST', 'EXPIRED'].includes(quote.status) && (
          <div style={{
            marginTop: '24px',
            padding: '16px',
            background: winProbability.winProbability >= 60 ? '#d1fae5' :
                        winProbability.winProbability >= 40 ? '#fef3c7' : '#fee2e2',
            borderRadius: '8px',
            border: `1px solid ${winProbability.winProbability >= 60 ? '#10b981' :
                                 winProbability.winProbability >= 40 ? '#f59e0b' : '#ef4444'}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                  Win Probability Analysis
                </h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    fontSize: '32px',
                    fontWeight: 'bold',
                    color: winProbability.winProbability >= 60 ? '#059669' :
                           winProbability.winProbability >= 40 ? '#d97706' : '#dc2626'
                  }}>
                    {winProbability.winProbability}%
                  </div>
                  <div style={{ width: '120px', height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${winProbability.winProbability}%`,
                      height: '100%',
                      background: winProbability.winProbability >= 60 ? '#10b981' :
                                  winProbability.winProbability >= 40 ? '#f59e0b' : '#ef4444',
                      transition: 'width 0.5s ease'
                    }} />
                  </div>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600',
                    background: winProbability.riskLevel === 'low' ? '#d1fae5' :
                                winProbability.riskLevel === 'medium' ? '#fef3c7' : '#fee2e2',
                    color: winProbability.riskLevel === 'low' ? '#065f46' :
                           winProbability.riskLevel === 'medium' ? '#92400e' : '#991b1b'
                  }}>
                    {winProbability.riskLevel.toUpperCase()} RISK
                  </span>
                </div>
              </div>

              {/* Key Factors */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {winProbability.factors?.customerTier && (
                  <div style={{ padding: '8px 12px', background: 'white', borderRadius: '6px', fontSize: '12px' }}>
                    <span style={{ color: '#6b7280' }}>Customer: </span>
                    <span style={{ fontWeight: '600' }}>{winProbability.factors.customerTier.tier}</span>
                  </div>
                )}
                {winProbability.factors?.quoteAge && (
                  <div style={{ padding: '8px 12px', background: 'white', borderRadius: '6px', fontSize: '12px' }}>
                    <span style={{ color: '#6b7280' }}>Age: </span>
                    <span style={{ fontWeight: '600' }}>{winProbability.factors.quoteAge.daysOld} days</span>
                  </div>
                )}
                {winProbability.factors?.engagement && (
                  <div style={{ padding: '8px 12px', background: 'white', borderRadius: '6px', fontSize: '12px' }}>
                    <span style={{ color: '#6b7280' }}>Views: </span>
                    <span style={{ fontWeight: '600' }}>{winProbability.factors.engagement.views}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Recommendations */}
            {winProbability.recommendations?.length > 0 && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '6px' }}>Recommendations:</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {winProbability.recommendations.slice(0, 3).map((rec, idx) => (
                    <div key={idx} style={{
                      padding: '6px 10px',
                      background: 'white',
                      borderRadius: '4px',
                      fontSize: '11px',
                      borderLeft: `3px solid ${rec.priority === 'high' ? '#ef4444' : '#f59e0b'}`
                    }}>
                      {rec.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {winProbabilityLoading && (
          <div style={{ marginTop: '24px', padding: '16px', background: '#f3f4f6', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ color: '#6b7280' }}>Loading win probability analysis...</span>
          </div>
        )}
      </div>

      {/* Manufacturer Promotions */}
      {quote?.id && (
        <QuotePromotionAlerts
          quotationId={quote.id}
          onPromotionChange={() => {
            // Refresh quote data when a promotion is applied/removed
            if (window.location.reload) {
              window.location.reload();
            }
          }}
        />
      )}

      {/* Quote Items */}
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Items</h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', width: '100px' }}>SKU</th>
                <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', width: '100px' }}>MFR</th>
                <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 'bold', fontSize: '13px' }}>DESCRIPTION</th>
                <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', width: '60px' }}>QTY</th>
                <th style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px', width: '90px' }}>PRICE</th>
                <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', width: '70px' }}>DISC</th>
                <th style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px', width: '100px' }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {quote.items?.map((item, idx) => {
                const unitPrice = (item.sell_cents || item.unit_price_cents || 0) / 100;
                const lineTotal = (item.line_total_cents || 0) / 100;
                const discountPercent = item.discount_percent || 0;

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '13px', color: '#374151' }}>
                      {item.sku || item.model || '-'}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '13px', fontWeight: '500', color: '#374151' }}>
                      {item.manufacturer || '-'}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'left', fontSize: '13px', color: '#374151' }}>
                      <div style={{ fontWeight: '500' }}>{item.model || item.description || '-'}</div>
                      {item.description && item.model && (
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{item.description}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '13px', color: '#374151' }}>
                      {item.quantity}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '13px', color: '#374151' }}>
                      ${unitPrice.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '13px', color: discountPercent > 0 ? '#dc2626' : '#374151' }}>
                      {discountPercent > 0 ? `${discountPercent}%` : '-'}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                      ${lineTotal.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

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
          {quote.promo_discount_cents > 0 && (
            <div style={{ marginBottom: '8px', color: '#059669' }}>
              <span style={{ marginRight: '40px' }}>Manufacturer Promo:</span>
              <span style={{ fontWeight: 'bold' }}>-${((quote.promo_discount_cents || 0) / 100).toFixed(2)}</span>
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
