import { authFetch } from '../../services/authFetch';
/**
 * Email Quote Modal
 *
 * Provides a professional interface for composing and sending quote emails.
 * Features:
 * - Email preview with template
 * - Customizable message with merge fields
 * - PDF attachment generation and preview
 * - Send status tracking
 */

import React, { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { generateCustomerPDF } from '../../services/pdfService';
import companyConfig from '../../config/companyConfig';
import { toast } from '../ui/Toast';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Default email templates
const EMAIL_TEMPLATES = {
  new_quote: {
    name: 'New Quote',
    subject: 'Quote #{quote_number} from {company_name}',
    body: `Dear {customer_name},

Thank you for your interest in our products. Please find your quote attached.

Quote Details:
- Quote Number: {quote_number}
- Total Amount: {total_amount}
- Valid Until: {expiry_date}

If you have any questions or would like to proceed with this quote, please don't hesitate to contact us.

Best regards,
{sales_rep_name}
{company_name}
{company_phone}`
  },
  follow_up: {
    name: 'Follow Up',
    subject: 'Following up on Quote #{quote_number}',
    body: `Dear {customer_name},

I wanted to follow up on the quote we sent you recently.

Quote Details:
- Quote Number: {quote_number}
- Total Amount: {total_amount}
- Valid Until: {expiry_date}

Please let me know if you have any questions or if there's anything I can help with.

Best regards,
{sales_rep_name}
{company_name}
{company_phone}`
  },
  reminder: {
    name: 'Expiry Reminder',
    subject: 'Your Quote #{quote_number} Expires Soon',
    body: `Dear {customer_name},

This is a friendly reminder that your quote expires on {expiry_date}.

Quote Details:
- Quote Number: {quote_number}
- Total Amount: {total_amount}

Please contact us soon if you'd like to proceed with this quote.

Best regards,
{sales_rep_name}
{company_name}
{company_phone}`
  }
};

// Merge field replacements
const replaceMergeFields = (text, data) => {
  const replacements = {
    '{customer_name}': data.customerName || 'Valued Customer',
    '{customer_email}': data.customerEmail || '',
    '{quote_number}': data.quoteNumber || '',
    '{total_amount}': data.totalAmount || '$0.00',
    '{expiry_date}': data.expiryDate || '',
    '{company_name}': companyConfig.name,
    '{company_phone}': companyConfig.contact.phone,
    '{company_email}': companyConfig.contact.email,
    '{sales_rep_name}': data.salesRepName || 'Sales Team'
  };

  let result = text;
  Object.entries(replacements).forEach(([key, value]) => {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  });
  return result;
};

const EmailQuoteModal = ({
  isOpen,
  onClose,
  quote,
  customer,
  items,
  onEmailSent
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState('new_quote');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [ccEmails, setCcEmails] = useState('');
  const [sending, setSending] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);

  // Prepare merge data
  const getMergeData = useCallback(() => {
    if (!quote) return {};

    const total = (quote.total_cents || 0) / 100;
    const expiryDate = quote.expires_at || quote.quote_expiry_date;

    return {
      customerName: customer?.name || 'Valued Customer',
      customerEmail: customer?.email || '',
      quoteNumber: quote.quote_number || `QT-${quote.id}`,
      totalAmount: `$${total.toLocaleString('en-CA', { minimumFractionDigits: 2 })} CAD`,
      expiryDate: expiryDate ? new Date(expiryDate).toLocaleDateString('en-CA') : 'N/A',
      salesRepName: quote.sales_rep_name || quote.created_by || 'Sales Team'
    };
  }, [quote, customer]);

  // Initialize email content when modal opens or template changes
  useEffect(() => {
    if (isOpen && quote) {
      const template = EMAIL_TEMPLATES[selectedTemplate];
      const mergeData = getMergeData();

      setSubject(replaceMergeFields(template.subject, mergeData));
      setMessage(replaceMergeFields(template.body, mergeData));
      setRecipientEmail(customer?.email || '');
    }
  }, [isOpen, quote, customer, selectedTemplate, getMergeData]);

  // Generate PDF preview
  const handlePreviewPDF = useCallback(async () => {
    if (!quote || !customer || !items) return;

    try {
      const doc = generateCustomerPDF(quote, customer, items);
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      setPdfPreviewUrl(pdfUrl);
      window.open(pdfUrl, '_blank');
    } catch (error) {
      toast.error('Failed to generate PDF preview', 'Preview Error');
    }
  }, [quote, customer, items]);

  // Send email
  const handleSendEmail = async () => {
    // Validation
    if (!recipientEmail || !recipientEmail.includes('@')) {
      toast.error('Please enter a valid email address', 'Invalid Email');
      return;
    }

    if (!subject.trim()) {
      toast.error('Please enter a subject', 'Missing Subject');
      return;
    }

    if (!items || items.length === 0) {
      toast.error('Cannot send email for quote with no items', 'Empty Quote');
      return;
    }

    setSending(true);

    try {
      // Generate PDF
      const doc = generateCustomerPDF(quote, customer, items);
      const pdfBlob = doc.output('blob');
      const pdfFile = new File([pdfBlob], `Quote_${quote.quote_number || quote.id}.pdf`, {
        type: 'application/pdf'
      });

      // Create form data
      const formData = new FormData();
      formData.append('pdf', pdfFile);
      formData.append('recipientEmail', recipientEmail);
      formData.append('recipientName', customer?.name || 'Customer');
      formData.append('subject', subject);
      formData.append('message', message);

      if (ccEmails.trim()) {
        formData.append('ccEmails', ccEmails.trim());
      }

      // Send to backend
      const response = await authFetch(`${API_URL}/api/quotations/${quote.id}/send-email`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send email');
      }

      const result = await response.json();

      toast.success(`Quote sent to ${recipientEmail}`, 'Email Sent');

      // Callback to parent
      if (onEmailSent) {
        onEmailSent(result);
      }

      onClose();
    } catch (error) {
      console.error('Email send error:', error);
      toast.error(error.message || 'Failed to send email', 'Send Error');
    } finally {
      setSending(false);
    }
  };

  // Get preview HTML - sanitized to prevent XSS
  const getPreviewHtml = () => {
    const mergeData = getMergeData();
    // Sanitize user message content to prevent XSS attacks
    const sanitizedMessage = DOMPurify.sanitize(message.replace(/\n/g, '<br/>'), {
      ALLOWED_TAGS: ['br'],
      ALLOWED_ATTR: []
    });
    const processedMessage = sanitizedMessage;

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, rgb(${companyConfig.branding.primaryColor.join(',')}) 0%, rgb(${companyConfig.branding.accentColor.join(',')}) 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Your Quote is Ready!</h1>
        </div>
        <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
          <div style="white-space: pre-wrap; line-height: 1.6; color: #374151;">
            ${processedMessage}
          </div>
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-top: 20px;">
            <table style="width: 100%;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Quote Number:</td>
                <td style="padding: 8px 0;"><strong>${mergeData.quoteNumber}</strong></td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Total Amount:</td>
                <td style="padding: 8px 0; color: #10b981; font-size: 18px; font-weight: bold;">${mergeData.totalAmount}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Valid Until:</td>
                <td style="padding: 8px 0;">${mergeData.expiryDate}</td>
              </tr>
            </table>
          </div>
          <p style="color: #6b7280; margin-top: 20px;">
            <em>Please review the attached PDF quotation.</em>
          </p>
        </div>
        <div style="background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 10px 0;"><strong>${companyConfig.name}</strong></p>
          <p style="margin: 0;">${companyConfig.contact.phone} | ${companyConfig.contact.email}</p>
        </div>
      </div>
    `;
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-modal-title"
      aria-describedby="email-modal-description"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div style={{
        background: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '900px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          color: 'white',
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 id="email-modal-title" style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
              Send Quote via Email
            </h2>
            <p id="email-modal-description" style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
              Quote #{quote?.quote_number || quote?.id}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close email modal"
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: previewMode ? '1fr 1fr' : '1fr',
          gap: '24px'
        }}>
          {/* Email Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Template Selector */}
            <div>
              <label htmlFor="email-template" style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#374151' }}>
                Email Template
              </label>
              <select
                id="email-template"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                aria-describedby="template-help"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  background: 'white'
                }}
              >
                {Object.entries(EMAIL_TEMPLATES).map(([key, template]) => (
                  <option key={key} value={key}>{template.name}</option>
                ))}
              </select>
            </div>

            {/* Recipient */}
            <div>
              <label htmlFor="recipient-email" style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#374151' }}>
                To <span aria-hidden="true">*</span><span className="sr-only">(required)</span>
              </label>
              <input
                id="recipient-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="customer@example.com"
                required
                aria-required="true"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* CC */}
            <div>
              <label htmlFor="cc-emails" style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#374151' }}>
                CC (optional)
              </label>
              <input
                id="cc-emails"
                type="text"
                value={ccEmails}
                onChange={(e) => setCcEmails(e.target.value)}
                placeholder="email1@example.com, email2@example.com"
                aria-describedby="cc-help"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Subject */}
            <div>
              <label htmlFor="email-subject" style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#374151' }}>
                Subject <span aria-hidden="true">*</span><span className="sr-only">(required)</span>
              </label>
              <input
                id="email-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                aria-required="true"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Message */}
            <div style={{ flex: 1 }}>
              <label htmlFor="email-message" style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#374151' }}>
                Message
              </label>
              <textarea
                id="email-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={10}
                aria-describedby="merge-fields-help"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: '1.5',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Merge Fields Help */}
            <div
              id="merge-fields-help"
              style={{
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '12px',
                color: '#0369a1'
              }}
            >
              <strong>Available merge fields:</strong><br/>
              {'{customer_name}'}, {'{quote_number}'}, {'{total_amount}'}, {'{expiry_date}'}, {'{company_name}'}, {'{sales_rep_name}'}
            </div>

            {/* Attachment Info */}
            <div style={{
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                background: '#fee2e2',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626',
                fontWeight: 'bold'
              }}>
                PDF
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', color: '#374151' }}>
                  Quote_{quote?.quote_number || quote?.id}.pdf
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  PDF will be attached automatically
                </div>
              </div>
              <button
                onClick={handlePreviewPDF}
                aria-label="Preview PDF attachment in new window"
                style={{
                  padding: '8px 16px',
                  background: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#374151'
                }}
              >
                Preview PDF
              </button>
            </div>
          </div>

          {/* Email Preview */}
          {previewMode && (
            <div style={{
              background: '#f3f4f6',
              borderRadius: '8px',
              padding: '20px',
              overflow: 'auto'
            }}>
              <div style={{ marginBottom: '12px', fontWeight: '600', color: '#374151' }}>
                Email Preview
              </div>
              <div
                style={{ background: 'white', borderRadius: '8px', overflow: 'hidden' }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(getPreviewHtml()) }}
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            borderTop: '1px solid #e5e7eb',
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f9fafb'
          }}
          role="group"
          aria-label="Email actions"
        >
          <button
            onClick={() => setPreviewMode(!previewMode)}
            aria-expanded={previewMode}
            aria-controls="email-preview-section"
            style={{
              padding: '10px 20px',
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#374151'
            }}
          >
            {previewMode ? 'Hide Preview' : 'Show Preview'}
          </button>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              disabled={sending}
              aria-label="Cancel and close"
              style={{
                padding: '10px 24px',
                background: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#374151'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSendEmail}
              disabled={sending || !recipientEmail || !subject}
              aria-busy={sending}
              aria-label={sending ? 'Sending email...' : 'Send email'}
              style={{
                padding: '10px 32px',
                background: sending ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: sending ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {sending ? (
                <>
                  <span
                    style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid white',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }}
                    aria-hidden="true"
                  />
                  Sending...
                </>
              ) : (
                'Send Email'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailQuoteModal;
