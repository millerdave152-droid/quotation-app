/**
 * QuoteViewer Component
 * Displays quote details, items, revenue features, and actions
 */

import React, { useState } from 'react';
import { previewQuotePDF, downloadQuotePDF } from '../../services/pdfService';
import { toast } from '../ui/Toast';
import logger from '../../utils/logger';

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
  onSaveEvent
}) => {
  // Loading states for PDF operations
  const [pdfLoading, setPdfLoading] = useState({
    previewCustomer: false,
    downloadCustomer: false,
    previewInternal: false,
    downloadInternal: false
  });

  if (!quote) return null;

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
                Date: {new Date(quote.created_at).toLocaleDateString()}
              </div>
              <div style={{ marginBottom: '4px' }}>
                Valid Until: {new Date(quote.expires_at).toLocaleDateString()}
              </div>
              <div>
                Status: <span style={{
                  padding: '2px 8px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  background: statusStyle.bg,
                  color: statusStyle.color
                }}>
                  {quote.status}
                </span>
              </div>
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
          <div style={{ marginTop: '12px', fontSize: '14px', color: '#10b981' }}>
            <span style={{ marginRight: '40px' }}>Gross Profit:</span>
            <span style={{ fontWeight: 'bold' }}>${((quote.gross_profit_cents || 0) / 100).toFixed(2)}</span>
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

        <div style={{ marginTop: '12px', fontSize: '13px', color: '#6b7280' }}>
          <strong>Customer PDF:</strong> Clean quote (no costs/margins) • <strong>Internal PDF:</strong> Includes cost analysis & profit margins
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
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>Quote Status</h3>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => onEdit?.(quote)} style={{ padding: '12px 24px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            Edit Quote
          </button>

          <button onClick={() => onDuplicate?.(quote.id)} style={{ padding: '12px 24px', background: '#06b6d4', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            Duplicate Quote
          </button>

          <button
            onClick={() => onUpdateStatus?.(quote.id, 'SENT')}
            disabled={quote.status !== 'DRAFT'}
            style={{
              padding: '12px 24px',
              background: quote.status === 'DRAFT' ? '#3b82f6' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: quote.status === 'DRAFT' ? 'pointer' : 'not-allowed'
            }}
          >
            Mark as Sent
          </button>

          <button
            onClick={() => onUpdateStatus?.(quote.id, 'WON')}
            disabled={quote.status === 'WON'}
            style={{
              padding: '12px 24px',
              background: quote.status !== 'WON' ? '#10b981' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: quote.status !== 'WON' ? 'pointer' : 'not-allowed'
            }}
          >
            Mark as Won
          </button>

          <button
            onClick={() => onUpdateStatus?.(quote.id, 'LOST')}
            disabled={quote.status === 'LOST'}
            style={{
              padding: '12px 24px',
              background: quote.status !== 'LOST' ? '#ef4444' : '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: quote.status !== 'LOST' ? 'pointer' : 'not-allowed'
            }}
          >
            Mark as Lost
          </button>

          <button
            onClick={() => onDelete?.(quote.id)}
            style={{
              padding: '12px 24px',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginLeft: 'auto'
            }}
          >
            Delete Quote
          </button>
        </div>
      </div>

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
