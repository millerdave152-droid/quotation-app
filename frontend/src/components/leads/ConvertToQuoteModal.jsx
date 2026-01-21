/**
 * ConvertToQuoteModal - Convert a lead to a quotation
 */

import React, { useState } from 'react';
import { convertToQuote } from './hooks/useLeads';
import { useToast } from '../ui/Toast';

function ConvertToQuoteModal({ lead, onSuccess, onClose }) {
  const toast = useToast();
  const [converting, setConverting] = useState(false);
  const [notes, setNotes] = useState('');

  const handleConvert = async () => {
    setConverting(true);
    try {
      const result = await convertToQuote(lead.id, { notes });
      onSuccess(result.data || result);
    } catch (error) {
      toast.error(error.message);
      setConverting(false);
    }
  };

  return (
    <div className="convert-modal" onClick={onClose}>
      <div className="convert-modal-content" onClick={e => e.stopPropagation()}>
        <div className="convert-modal-header">
          <h3>Convert to Quote</h3>
        </div>

        <div className="convert-modal-body">
          <p style={{ marginBottom: '1rem' }}>
            This will create a new quotation from lead <strong>{lead.lead_number}</strong>.
          </p>

          {/* Lead Summary */}
          <div className="convert-summary">
            <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Lead Summary</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-item-label">Customer</span>
                <span className="detail-item-value">{lead.contact_name}</span>
              </div>
              {lead.contact_email && (
                <div className="detail-item">
                  <span className="detail-item-label">Email</span>
                  <span className="detail-item-value">{lead.contact_email}</span>
                </div>
              )}
              {lead.contact_phone && (
                <div className="detail-item">
                  <span className="detail-item-label">Phone</span>
                  <span className="detail-item-value">{lead.contact_phone}</span>
                </div>
              )}
              {lead.timeline && (
                <div className="detail-item">
                  <span className="detail-item-label">Timeline</span>
                  <span className="detail-item-value" style={{ textTransform: 'capitalize' }}>
                    {lead.timeline.replace('_', ' ')}
                  </span>
                </div>
              )}
            </div>

            {/* Requirements Summary */}
            {lead.requirements?.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <strong>Requirements:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
                  {lead.requirements.map((req, idx) => (
                    <li key={idx}>
                      {req.category}
                      {req.quantity > 1 && ` x${req.quantity}`}
                      {req.brand_preferences?.length > 0 && ` (${req.brand_preferences.join(', ')})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Customer Creation Notice */}
          {!lead.customer_id && (
            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '6px',
                padding: '0.75rem',
                marginBottom: '1rem',
                fontSize: '0.875rem'
              }}
            >
              <strong>Note:</strong> A new customer record will be created for{' '}
              <strong>{lead.contact_name}</strong> since this lead is not linked to an existing customer.
            </div>
          )}

          {/* Quote Notes */}
          <div className="form-group">
            <label htmlFor="quote_notes">Quote Notes (optional)</label>
            <textarea
              id="quote_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes for the new quotation..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.625rem',
                border: '1px solid var(--border-color)',
                borderRadius: '6px'
              }}
            />
          </div>

          {/* What happens next */}
          <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            <strong>What happens next:</strong>
            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
              <li>A new draft quotation will be created</li>
              <li>The lead status will change to "Quote Created"</li>
              <li>You can add products to the quote from the quotations page</li>
            </ul>
          </div>
        </div>

        <div className="convert-modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={converting}>
            Cancel
          </button>
          <button className="btn btn-success" onClick={handleConvert} disabled={converting}>
            {converting ? 'Creating Quote...' : 'Create Quote'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConvertToQuoteModal;
