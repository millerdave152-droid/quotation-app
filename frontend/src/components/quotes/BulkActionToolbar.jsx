import { authFetch } from '../../services/authFetch';
/**
 * BulkActionToolbar Component
 *
 * Displays a floating toolbar when quotes are selected, providing bulk actions:
 * - Change Status
 * - Extend Expiry Date
 * - Assign Salesperson
 * - Send Email
 * - Export to CSV
 * - Delete Selected
 */

import React, { useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Email templates for bulk email
const EMAIL_TEMPLATES = [
  {
    id: 'quote_reminder',
    name: 'Quote Reminder',
    subject: 'Reminder: Your Quote {quote_number}',
    message: `We wanted to follow up on the quote we sent you recently.

Your quote {quote_number} for {total} is still valid and we'd love to help you complete your purchase.

If you have any questions or would like to discuss the quote, please don't hesitate to reach out.`
  },
  {
    id: 'special_offer',
    name: 'Special Offer',
    subject: 'Special Offer on Your Quote {quote_number}',
    message: `Great news! We have a special offer for you.

Your quote {quote_number} is eligible for additional savings. Contact us today to learn more about this limited-time offer.

Don't miss out on this opportunity!`
  },
  {
    id: 'expiry_notice',
    name: 'Expiry Notice',
    subject: 'Your Quote {quote_number} is Expiring Soon',
    message: `This is a friendly reminder that your quote {quote_number} will be expiring soon.

The total amount of {total} is locked in until the expiry date. After that, prices may change.

Please reach out if you'd like to proceed or if you need any modifications to the quote.`
  },
  {
    id: 'thank_you',
    name: 'Thank You',
    subject: 'Thank You for Your Interest - Quote {quote_number}',
    message: `Thank you for considering us for your needs.

We've prepared quote {quote_number} with a total of {total} based on our discussion.

We're here to answer any questions and help you make the best decision for your requirements.`
  }
];

const BulkActionToolbar = ({
  selectedIds,
  selectedQuotes,
  onClearSelection,
  onActionComplete,
  formatCurrency
}) => {
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [salespeople, setSalespeople] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });

  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState('Your Quote from Us');
  const [emailMessage, setEmailMessage] = useState('');
  const [updateStatusOnSend, setUpdateStatusOnSend] = useState(true);
  const [attachPdf, setAttachPdf] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewQuoteIndex, setPreviewQuoteIndex] = useState(0);

  // Fetch salespeople for assignment dropdown
  useEffect(() => {
    const fetchSalespeople = async () => {
      try {
        const res = await authFetch(`${API_URL}/api/quotations/salespeople`);
        if (res.ok) {
          const data = await res.json();
          setSalespeople(data);
        }
      } catch (error) {
        console.error('Error fetching salespeople:', error);
      }
    };
    fetchSalespeople();
  }, []);

  if (selectedIds.length === 0) {
    return null;
  }

  // Calculate totals for selected quotes
  const selectedTotal = selectedQuotes.reduce((sum, q) => sum + (q.total_cents || 0), 0);

  const handleBulkStatus = async (status) => {
    setLoading(true);
    setActionType('status');
    setProgress({ current: 0, total: selectedIds.length, message: `Updating status to ${status}...` });

    try {
      const res = await authFetch(`${API_URL}/api/quotations/bulk/status`, {
        method: 'POST',
        body: JSON.stringify({ quoteIds: selectedIds, status })
      });

      const data = await res.json();

      if (res.ok) {
        setProgress({
          current: data.data?.updated || selectedIds.length,
          total: selectedIds.length,
          message: `Updated ${data.data?.updated || 0} quotes to ${status}`
        });
        onActionComplete?.({
          action: 'status',
          success: data.data?.updated || 0,
          failed: data.data?.failed || 0,
          message: data.message
        });
        onClearSelection();
      } else {
        throw new Error(data.message || 'Failed to update status');
      }
    } catch (error) {
      console.error('Bulk status update error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setActionType(null);
    }
  };

  const handleBulkExtendExpiry = async (days) => {
    setLoading(true);
    setActionType('expiry');
    setProgress({ current: 0, total: selectedIds.length, message: `Extending expiry by ${days} days...` });

    try {
      const res = await authFetch(`${API_URL}/api/quotations/bulk/extend-expiry`, {
        method: 'POST',
        body: JSON.stringify({ quoteIds: selectedIds, days })
      });

      const data = await res.json();

      if (res.ok) {
        setProgress({
          current: data.data?.updated || selectedIds.length,
          total: selectedIds.length,
          message: `Extended expiry for ${data.data?.updated || 0} quotes`
        });
        onActionComplete?.({
          action: 'expiry',
          success: data.data?.updated || 0,
          failed: data.data?.failed || 0,
          message: data.message
        });
        onClearSelection();
      } else {
        throw new Error(data.message || 'Failed to extend expiry');
      }
    } catch (error) {
      console.error('Bulk expiry update error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setActionType(null);
    }
  };

  const handleBulkAssign = async (salesRepId, salesRepName) => {
    setLoading(true);
    setActionType('assign');
    setProgress({ current: 0, total: selectedIds.length, message: `Assigning to ${salesRepName}...` });

    try {
      const res = await authFetch(`${API_URL}/api/quotations/bulk/assign`, {
        method: 'POST',
        body: JSON.stringify({ quoteIds: selectedIds, salesRepId, salesRepName })
      });

      const data = await res.json();

      if (res.ok) {
        setProgress({
          current: data.data?.updated || selectedIds.length,
          total: selectedIds.length,
          message: `Assigned ${data.data?.updated || 0} quotes to ${salesRepName}`
        });
        onActionComplete?.({
          action: 'assign',
          success: data.data?.updated || 0,
          failed: data.data?.failed || 0,
          message: data.message
        });
        onClearSelection();
      } else {
        throw new Error(data.message || 'Failed to assign quotes');
      }
    } catch (error) {
      console.error('Bulk assign error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setActionType(null);
    }
  };

  const handleBulkExport = async () => {
    setLoading(true);
    setActionType('export');
    setProgress({ current: 0, total: selectedIds.length, message: 'Generating CSV export...' });

    try {
      const res = await authFetch(`${API_URL}/api/quotations/bulk/export`, {
        method: 'POST',
        body: JSON.stringify({ quoteIds: selectedIds })
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quotes-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setProgress({
          current: selectedIds.length,
          total: selectedIds.length,
          message: `Exported ${selectedIds.length} quotes`
        });
        onActionComplete?.({
          action: 'export',
          success: selectedIds.length,
          failed: 0,
          message: `Exported ${selectedIds.length} quotes to CSV`
        });
      } else {
        throw new Error('Failed to export quotes');
      }
    } catch (error) {
      console.error('Bulk export error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setActionType(null);
    }
  };

  const handleBulkDelete = async () => {
    setLoading(true);
    setActionType('delete');
    setProgress({ current: 0, total: selectedIds.length, message: 'Deleting quotes...' });

    try {
      const res = await authFetch(`${API_URL}/api/quotations/bulk`, {
        method: 'DELETE',
        body: JSON.stringify({ quoteIds: selectedIds })
      });

      const data = await res.json();

      if (res.ok) {
        setProgress({
          current: data.data?.deleted || selectedIds.length,
          total: selectedIds.length,
          message: `Deleted ${data.data?.deleted || 0} quotes`
        });
        onActionComplete?.({
          action: 'delete',
          success: data.data?.deleted || 0,
          failed: data.data?.failed || 0,
          message: data.message
        });
        onClearSelection();
      } else {
        throw new Error(data.message || 'Failed to delete quotes');
      }
    } catch (error) {
      console.error('Bulk delete error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setActionType(null);
      setShowConfirmDialog(false);
    }
  };

  const confirmDelete = () => {
    setConfirmAction('delete');
    setShowConfirmDialog(true);
  };

  // Handle template selection
  const handleTemplateSelect = (templateId) => {
    const template = EMAIL_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setEmailSubject(template.subject);
      setEmailMessage(template.message);
      setSelectedTemplate(templateId);
    }
  };

  // Get preview quote (use selected quote for preview)
  const getPreviewQuote = () => {
    const quotesWithEmail = selectedQuotes.filter(q => q.customer_email);
    if (quotesWithEmail.length === 0) return selectedQuotes[0] || {};
    const index = Math.min(previewQuoteIndex, quotesWithEmail.length - 1);
    return quotesWithEmail[index] || {};
  };

  // Generate preview with merged fields
  const generatePreview = (text, quote) => {
    if (!text) return '';
    return text
      .replace(/\{customer_name\}/gi, quote.customer_name || 'Valued Customer')
      .replace(/\{quote_number\}/gi, quote.quotation_number || quote.quote_number || 'Q-XXXX-XXXX')
      .replace(/\{company\}/gi, quote.customer_company || '')
      .replace(/\{total\}/gi, formatCurrency
        ? formatCurrency(quote.total_cents || 0)
        : `$${((quote.total_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  };

  // Open email modal
  const openEmailModal = () => {
    // Count quotes with valid emails
    const quotesWithEmail = selectedQuotes.filter(q => q.customer_email);
    if (quotesWithEmail.length === 0) {
      alert('None of the selected quotes have customer email addresses.');
      return;
    }
    setShowEmailModal(true);
  };

  // Send bulk emails
  const handleBulkEmail = async () => {
    if (!emailSubject.trim() || !emailMessage.trim()) {
      alert('Please enter both subject and message.');
      return;
    }

    setLoading(true);
    setActionType('email');
    setProgress({
      current: 0,
      total: selectedIds.length,
      message: attachPdf ? 'Generating PDFs and sending emails...' : 'Sending emails...'
    });

    try {
      const res = await authFetch(`${API_URL}/api/quotations/bulk/email`, {
        method: 'POST',
        body: JSON.stringify({
          quoteIds: selectedIds,
          subject: emailSubject,
          message: emailMessage,
          updateStatus: updateStatusOnSend,
          attachPdf: attachPdf
        })
      });

      const data = await res.json();

      if (res.ok) {
        const sent = data.data?.sent || 0;
        const failed = data.data?.failed || 0;
        const skipped = data.data?.skipped || 0;

        setProgress({
          current: sent,
          total: selectedIds.length,
          message: `Sent ${sent} emails`
        });

        onActionComplete?.({
          action: 'email',
          success: sent,
          failed: failed,
          skipped: skipped,
          message: data.message
        });

        setShowEmailModal(false);
        setEmailSubject('Your Quote from Us');
        setEmailMessage('');
        setSelectedTemplate('');
        setAttachPdf(true);
        onClearSelection();
      } else {
        throw new Error(data.message || 'Failed to send emails');
      }
    } catch (error) {
      console.error('Bulk email error:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setActionType(null);
    }
  };

  return (
    <>
      {/* Bulk Action Toolbar */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1f2937',
        color: 'white',
        padding: '16px 24px',
        borderRadius: '12px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        zIndex: 1000,
        minWidth: '600px'
      }}>
        {/* Selection Info */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #374151',
          paddingRight: '16px'
        }}>
          <span style={{ fontSize: '16px', fontWeight: 'bold' }}>
            {selectedIds.length} quote{selectedIds.length !== 1 ? 's' : ''} selected
          </span>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
            Total: {formatCurrency ? formatCurrency(selectedTotal) : `$${(selectedTotal / 100).toFixed(2)}`}
          </span>
        </div>

        {/* Progress Indicator */}
        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 16px',
            borderRight: '1px solid #374151'
          }}>
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid #3b82f6',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <span style={{ fontSize: '14px', color: '#93c5fd' }}>
              {progress.message}
            </span>
          </div>
        )}

        {/* Action Buttons */}
        {!loading && (
          <>
            {/* Change Status Dropdown */}
            <div style={{ position: 'relative' }}>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkStatus(e.target.value);
                    e.target.value = '';
                  }
                }}
                style={{
                  padding: '8px 12px',
                  background: '#374151',
                  color: 'white',
                  border: '1px solid #4b5563',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                defaultValue=""
              >
                <option value="" disabled>Change Status</option>
                <option value="DRAFT">Draft</option>
                <option value="SENT">Sent</option>
                <option value="WON">Won</option>
                <option value="LOST">Lost</option>
              </select>
            </div>

            {/* Extend Expiry Dropdown */}
            <div style={{ position: 'relative' }}>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkExtendExpiry(parseInt(e.target.value));
                    e.target.value = '';
                  }
                }}
                style={{
                  padding: '8px 12px',
                  background: '#374151',
                  color: 'white',
                  border: '1px solid #4b5563',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                defaultValue=""
              >
                <option value="" disabled>Extend Expiry</option>
                <option value="7">+7 Days</option>
                <option value="14">+14 Days</option>
                <option value="30">+30 Days</option>
                <option value="60">+60 Days</option>
                <option value="90">+90 Days</option>
              </select>
            </div>

            {/* Assign Salesperson Dropdown */}
            {salespeople.length > 0 && (
              <div style={{ position: 'relative' }}>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      const [id, name] = e.target.value.split('|');
                      handleBulkAssign(parseInt(id), name);
                      e.target.value = '';
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    background: '#374151',
                    color: 'white',
                    border: '1px solid #4b5563',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Assign To</option>
                  {salespeople.map(sp => (
                    <option key={sp.id} value={`${sp.id}|${sp.name}`}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Email Button */}
            <button
              onClick={openEmailModal}
              style={{
                padding: '8px 16px',
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>Send Email</span>
            </button>

            {/* Export Button */}
            <button
              onClick={handleBulkExport}
              style={{
                padding: '8px 16px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>Export CSV</span>
            </button>

            {/* Delete Button */}
            <button
              onClick={confirmDelete}
              style={{
                padding: '8px 16px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>Delete</span>
            </button>
          </>
        )}

        {/* Clear Selection */}
        <button
          onClick={onClearSelection}
          disabled={loading}
          style={{
            padding: '8px',
            background: 'transparent',
            color: '#9ca3af',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '20px',
            marginLeft: 'auto'
          }}
          title="Clear selection"
        >
          ×
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
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
          zIndex: 1001
        }}>
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 16px', color: '#1f2937' }}>
              Confirm Delete
            </h3>
            <p style={{ margin: '0 0 24px', color: '#6b7280' }}>
              Are you sure you want to delete {selectedIds.length} quote{selectedIds.length !== 1 ? 's' : ''}?
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirmDialog(false)}
                style={{
                  padding: '10px 20px',
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                style={{
                  padding: '10px 20px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Delete {selectedIds.length} Quote{selectedIds.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Compose Modal */}
      {showEmailModal && (
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
          zIndex: 1001
        }}>
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            maxWidth: showPreview ? '900px' : '600px',
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            transition: 'max-width 0.3s ease'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#1f2937' }}>
                Send Email to {selectedIds.length} Quote{selectedIds.length !== 1 ? 's' : ''}
              </h3>
              <button
                onClick={() => { setShowEmailModal(false); setShowPreview(false); }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >
                ×
              </button>
            </div>

            {/* Edit/Preview Toggle */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '16px',
              background: '#f3f4f6',
              padding: '4px',
              borderRadius: '8px'
            }}>
              <button
                onClick={() => setShowPreview(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: !showPreview ? '#3b82f6' : 'transparent',
                  color: !showPreview ? 'white' : '#6b7280',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>✏️</span> Compose
              </button>
              <button
                onClick={() => setShowPreview(true)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: showPreview ? '#3b82f6' : 'transparent',
                  color: showPreview ? 'white' : '#6b7280',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>👁️</span> Preview
              </button>
            </div>

            {/* Recipients Info */}
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '14px', color: '#15803d', fontWeight: '500' }}>
                Recipients: {selectedQuotes.filter(q => q.customer_email).length} customers with email addresses
              </div>
              {selectedQuotes.filter(q => !q.customer_email).length > 0 && (
                <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
                  {selectedQuotes.filter(q => !q.customer_email).length} quote(s) will be skipped (no email)
                </div>
              )}
            </div>

            {/* Compose Mode */}
            {!showPreview && (
              <>
                {/* Template Selection */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    Email Template
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">-- Select a template or write custom --</option>
                    {EMAIL_TEMPLATES.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* Subject */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    Subject
                  </label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Email subject..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Message */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#374151' }}>
                    Message
                  </label>
                  <textarea
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    placeholder="Enter your message..."
                    rows={8}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      resize: 'vertical',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    Available merge fields: {'{customer_name}'}, {'{quote_number}'}, {'{company}'}, {'{total}'}
                  </div>
                </div>

                {/* Options */}
                <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    color: '#374151'
                  }}>
                    <input
                      type="checkbox"
                      checked={attachPdf}
                      onChange={(e) => setAttachPdf(e.target.checked)}
                      style={{ width: '16px', height: '16px' }}
                    />
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '16px' }}>📎</span>
                      Attach PDF quote to each email
                    </span>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    color: '#374151'
                  }}>
                    <input
                      type="checkbox"
                      checked={updateStatusOnSend}
                      onChange={(e) => setUpdateStatusOnSend(e.target.checked)}
                      style={{ width: '16px', height: '16px' }}
                    />
                    <span>Update Draft quotes to "Sent" status after sending</span>
                  </label>
                </div>

                {/* PDF Generation Note */}
                {attachPdf && (
                  <div style={{
                    background: '#fef3c7',
                    border: '1px solid #fcd34d',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                    fontSize: '13px',
                    color: '#92400e'
                  }}>
                    <strong>Note:</strong> PDFs will be generated server-side for each quote.
                    This may take a moment for large batches.
                  </div>
                )}
              </>
            )}

            {/* Preview Mode */}
            {showPreview && (
              <>
                {/* Preview Quote Selector */}
                {selectedQuotes.filter(q => q.customer_email).length > 1 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '16px',
                    padding: '12px',
                    background: '#f3f4f6',
                    borderRadius: '8px'
                  }}>
                    <span style={{ fontSize: '14px', color: '#374151', fontWeight: '500' }}>Preview for:</span>
                    <select
                      value={previewQuoteIndex}
                      onChange={(e) => setPreviewQuoteIndex(parseInt(e.target.value))}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        flex: 1
                      }}
                    >
                      {selectedQuotes.filter(q => q.customer_email).map((quote, idx) => (
                        <option key={quote.id} value={idx}>
                          {quote.quotation_number || quote.quote_number} - {quote.customer_name || 'Unknown'} ({quote.customer_email})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Email Preview */}
                <div style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: '#f9fafb'
                }}>
                  {/* Email Header */}
                  <div style={{
                    background: '#1f2937',
                    color: 'white',
                    padding: '16px 20px'
                  }}>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>FROM</div>
                    <div style={{ fontSize: '14px', marginBottom: '12px' }}>{process.env.REACT_APP_COMPANY_NAME || 'Your Company'}</div>

                    <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>TO</div>
                    <div style={{ fontSize: '14px', marginBottom: '12px' }}>{getPreviewQuote().customer_email || 'customer@example.com'}</div>

                    <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>SUBJECT</div>
                    <div style={{ fontSize: '16px', fontWeight: '600' }}>
                      {generatePreview(emailSubject, getPreviewQuote()) || '(No subject)'}
                    </div>
                  </div>

                  {/* Email Body Preview */}
                  <div style={{ padding: '20px' }}>
                    {/* Simulated Email Content */}
                    <div style={{
                      background: 'white',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}>
                      {/* Header Banner */}
                      <div style={{
                        background: '#3b82f6',
                        color: 'white',
                        padding: '20px',
                        textAlign: 'center'
                      }}>
                        <h2 style={{ margin: 0, fontSize: '20px' }}>
                          Quote {getPreviewQuote().quotation_number || getPreviewQuote().quote_number || 'Q-XXXX-XXXX'}
                        </h2>
                      </div>

                      {/* Content */}
                      <div style={{ padding: '20px', background: '#f9fafb' }}>
                        <p style={{ margin: '0 0 16px', color: '#374151' }}>
                          Dear {getPreviewQuote().customer_name || 'Valued Customer'},
                        </p>
                        <div style={{
                          whiteSpace: 'pre-wrap',
                          color: '#374151',
                          lineHeight: '1.6'
                        }}>
                          {generatePreview(emailMessage, getPreviewQuote()) || '(No message content)'}
                        </div>

                        {/* Quote Info Box */}
                        <div style={{
                          background: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          padding: '16px',
                          marginTop: '20px'
                        }}>
                          <div style={{ marginBottom: '8px' }}>
                            <strong>Quote Reference:</strong> {getPreviewQuote().quotation_number || getPreviewQuote().quote_number || 'Q-XXXX-XXXX'}
                          </div>
                          <div>
                            <strong>Total Amount:</strong> {formatCurrency
                              ? formatCurrency(getPreviewQuote().total_cents || 0)
                              : `$${((getPreviewQuote().total_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                          </div>
                        </div>

                        {/* PDF Attachment Note */}
                        {attachPdf && (
                          <div style={{
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            padding: '12px',
                            borderRadius: '6px',
                            marginTop: '16px',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span>📎</span>
                            Your detailed quote is attached as a PDF document.
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div style={{
                        padding: '16px 20px',
                        textAlign: 'center',
                        color: '#6b7280',
                        fontSize: '12px',
                        borderTop: '1px solid #e5e7eb'
                      }}>
                        Thank you for your business!
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview Note */}
                <div style={{
                  marginTop: '16px',
                  padding: '12px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#1e40af'
                }}>
                  <strong>Preview Note:</strong> This shows how the email will appear to the selected recipient.
                  Merge fields like {'{customer_name}'} and {'{quote_number}'} will be personalized for each recipient.
                </div>
              </>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                onClick={() => { setShowEmailModal(false); setShowPreview(false); }}
                disabled={loading}
                style={{
                  padding: '10px 20px',
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkEmail}
                disabled={loading || !emailSubject.trim() || !emailMessage.trim()}
                style={{
                  padding: '10px 20px',
                  background: loading || !emailSubject.trim() || !emailMessage.trim() ? '#9ca3af' : '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading || !emailSubject.trim() || !emailMessage.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {loading ? (
                  <>
                    <div style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid white',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    Sending...
                  </>
                ) : (
                  `Send to ${selectedQuotes.filter(q => q.customer_email).length} Customer${selectedQuotes.filter(q => q.customer_email).length !== 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default BulkActionToolbar;
