/**
 * LeadDetail - Detailed view of a single lead
 */

import React, { useState } from 'react';
import LeadStatusBadge from './LeadStatusBadge';
import LeadPriorityBadge from './LeadPriorityBadge';
import LeadTimeline from './LeadTimeline';
import AIHelperPanel from './AIHelperPanel';
import ConvertToQuoteModal from './ConvertToQuoteModal';
import { useLead, updateLeadStatus, addLeadActivity, deleteLead } from './hooks/useLeads';
import { useToast } from '../ui/Toast';
import { useConfirmDialog } from '../ui/ConfirmDialog';

function LeadDetail({ leadId, onEdit, onUpdate, onClose }) {
  const toast = useToast();
  const confirm = useConfirmDialog();
  const { lead, loading, error, refresh } = useLead(leadId);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleStatusChange = async (newStatus) => {
    if (newStatus === lead.status) return;

    // If marking as lost, ask for reason
    let lostReason = null;
    if (newStatus === 'lost') {
      const reason = window.prompt('Why was this lead lost? (optional)');
      if (reason === null) return; // Cancelled
      lostReason = reason;
    }

    setStatusUpdating(true);
    try {
      await updateLeadStatus(leadId, newStatus, lostReason);
      refresh();
      onUpdate();
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;

    try {
      await addLeadActivity(leadId, 'note', noteText);
      setNoteText('');
      setShowAddNote(false);
      refresh();
      toast.success('Note added');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete Lead',
      message: `Are you sure you want to delete lead ${lead.lead_number}? This action cannot be undone.`,
      confirmText: 'Delete',
      danger: true
    });

    if (confirmed) {
      try {
        await deleteLead(leadId);
        onUpdate();
        onClose();
        toast.success('Lead deleted');
      } catch (error) {
        toast.error(error.message);
      }
    }
  };

  const handleConvertSuccess = (result) => {
    setShowConvertModal(false);
    refresh();
    onUpdate();
    toast.success(`Created quote ${result.quotation.quote_number}`);
  };

  if (loading) {
    return (
      <div className="lead-detail">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading lead details...</p>
        </div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="lead-detail">
        <div className="empty-state">
          <div className="empty-state-title">Lead Not Found</div>
          <p className="empty-state-description">{error || 'The lead could not be loaded.'}</p>
          <button className="btn btn-primary" onClick={onClose}>Go Back</button>
        </div>
      </div>
    );
  }

  const reasonLabels = {
    browsing: 'Browsing / Exploring',
    researching: 'Researching',
    moving: 'Moving to New Home',
    renovation: 'Renovation',
    replacement: 'Replacing Existing',
    upgrade: 'Upgrading',
    builder_project: 'Builder Project',
    other: 'Other'
  };

  const timelineLabels = {
    asap: 'ASAP',
    '1_2_weeks': '1-2 Weeks',
    '1_3_months': '1-3 Months',
    '3_6_months': '3-6 Months',
    just_researching: 'Just Researching'
  };

  const sourceLabels = {
    walk_in: 'Walk-in',
    phone: 'Phone Call',
    website: 'Website',
    referral: 'Referral',
    realtor: 'Realtor',
    builder: 'Builder/Contractor',
    social_media: 'Social Media',
    other: 'Other'
  };

  return (
    <div className="lead-detail">
      <div className="lead-detail-header">
        <div className="lead-detail-header-top">
          <div className="lead-detail-title">
            <h2>{lead.contact_name}</h2>
            <span className="lead-detail-number">{lead.lead_number}</span>
          </div>
          <div className="lead-detail-actions">
            <button className="btn btn-sm btn-secondary" onClick={() => onEdit(lead)}>
              Edit
            </button>
            {lead.status !== 'converted' && lead.status !== 'lost' && (
              <button
                className="btn btn-sm btn-success"
                onClick={() => setShowConvertModal(true)}
              >
                Convert to Quote
              </button>
            )}
            <button className="btn-icon" onClick={onClose} title="Close">
              ✕
            </button>
          </div>
        </div>
        <div className="lead-detail-badges">
          <LeadStatusBadge status={lead.status} />
          <LeadPriorityBadge priority={lead.priority} />
          {lead.quote_number && (
            <span className="status-badge" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
              Quote: {lead.quote_number}
            </span>
          )}
        </div>
      </div>

      <div className="lead-detail-body">
        {/* Contact Information */}
        <div className="detail-section">
          <h4 className="detail-section-title">Contact Information</h4>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-item-label">Email</span>
              <span className="detail-item-value">
                {lead.contact_email ? (
                  <a href={`mailto:${lead.contact_email}`}>{lead.contact_email}</a>
                ) : '-'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-item-label">Phone</span>
              <span className="detail-item-value">
                {lead.contact_phone ? (
                  <a href={`tel:${lead.contact_phone}`}>{lead.contact_phone}</a>
                ) : '-'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-item-label">Preferred Contact</span>
              <span className="detail-item-value" style={{ textTransform: 'capitalize' }}>
                {lead.preferred_contact_method || '-'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-item-label">Best Time</span>
              <span className="detail-item-value">{lead.best_time_to_contact || '-'}</span>
            </div>
          </div>
        </div>

        {/* Lead Source */}
        <div className="detail-section">
          <h4 className="detail-section-title">Lead Source</h4>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-item-label">Source</span>
              <span className="detail-item-value">
                {sourceLabels[lead.lead_source] || lead.lead_source || '-'}
              </span>
            </div>
            {lead.source_details && (
              <div className="detail-item">
                <span className="detail-item-label">Details</span>
                <span className="detail-item-value">{lead.source_details}</span>
              </div>
            )}
          </div>
        </div>

        {/* Context & Timing */}
        <div className="detail-section">
          <h4 className="detail-section-title">Context & Timing</h4>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-item-label">Inquiry Reason</span>
              <span className="detail-item-value">
                {reasonLabels[lead.inquiry_reason] || lead.inquiry_reason || '-'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-item-label">Timeline</span>
              <span className="detail-item-value">
                {timelineLabels[lead.timeline] || lead.timeline || '-'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-item-label">Move-in Date</span>
              <span className="detail-item-value">{formatDate(lead.move_in_date)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-item-label">Follow-up Date</span>
              <span className="detail-item-value">{formatDate(lead.follow_up_date)}</span>
            </div>
          </div>
        </div>

        {/* Requirements */}
        {(lead.requirements?.length > 0 || lead.requirements_notes) && (
          <div className="detail-section">
            <h4 className="detail-section-title">Requirements</h4>
            {lead.requirements?.map((req, idx) => (
              <div key={idx} className="requirement-section" style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                  {req.category}
                  {req.subcategory && ` - ${req.subcategory}`}
                  {req.quantity > 1 && ` (x${req.quantity})`}
                </div>
                <div className="detail-grid" style={{ fontSize: '0.875rem' }}>
                  {(req.budget_min_cents || req.budget_max_cents) && (
                    <div className="detail-item">
                      <span className="detail-item-label">Budget</span>
                      <span className="detail-item-value">
                        {req.budget_min_cents && `$${(req.budget_min_cents / 100).toFixed(0)}`}
                        {req.budget_min_cents && req.budget_max_cents && ' - '}
                        {req.budget_max_cents && `$${(req.budget_max_cents / 100).toFixed(0)}`}
                      </span>
                    </div>
                  )}
                  {req.brand_preferences?.length > 0 && (
                    <div className="detail-item">
                      <span className="detail-item-label">Brands</span>
                      <span className="detail-item-value">{req.brand_preferences.join(', ')}</span>
                    </div>
                  )}
                  {req.color_preferences?.length > 0 && (
                    <div className="detail-item">
                      <span className="detail-item-label">Colors</span>
                      <span className="detail-item-value">{req.color_preferences.join(', ')}</span>
                    </div>
                  )}
                </div>
                {req.notes && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {req.notes}
                  </div>
                )}
              </div>
            ))}
            {lead.requirements_notes && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                  Additional Notes:
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {lead.requirements_notes}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status Actions */}
        <div className="detail-section">
          <h4 className="detail-section-title">Update Status</h4>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['new', 'contacted', 'qualified', 'quote_created', 'converted', 'lost'].map(status => (
              <button
                key={status}
                className={`btn btn-sm ${lead.status === status ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleStatusChange(status)}
                disabled={statusUpdating || lead.status === status}
                style={{ textTransform: 'capitalize' }}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* AI Helper Panel */}
        <AIHelperPanel leadId={leadId} lead={lead} onUpdate={refresh} />

        {/* Add Note */}
        <div className="detail-section">
          <h4 className="detail-section-title">
            Notes & Activities
            <button
              className="btn btn-sm btn-secondary"
              style={{ marginLeft: '1rem' }}
              onClick={() => setShowAddNote(!showAddNote)}
            >
              {showAddNote ? 'Cancel' : '+ Add Note'}
            </button>
          </h4>

          {showAddNote && (
            <div style={{ marginBottom: '1rem' }}>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note about this lead..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  marginBottom: '0.5rem'
                }}
              />
              <button className="btn btn-primary btn-sm" onClick={handleAddNote}>
                Save Note
              </button>
            </div>
          )}

          <LeadTimeline activities={lead.activities || []} />
        </div>

        {/* Delete */}
        <div className="detail-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>
            Delete Lead
          </button>
        </div>
      </div>

      {/* Convert to Quote Modal */}
      {showConvertModal && (
        <ConvertToQuoteModal
          lead={lead}
          onSuccess={handleConvertSuccess}
          onClose={() => setShowConvertModal(false)}
        />
      )}
    </div>
  );
}

export default LeadDetail;
