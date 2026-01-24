/**
 * LeadQuickCapture - Quick entry modal for capturing leads
 * Simplified form for fast data entry
 */

import React, { useState } from 'react';
import { createLead } from './hooks/useLeads';
import { useToast } from '../ui/Toast';

const sourceQuickOptions = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone', label: 'Phone' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' }
];

const priorityQuickOptions = [
  { value: 'hot', label: 'Hot', color: '#dc2626' },
  { value: 'warm', label: 'Warm', color: '#d97706' },
  { value: 'cold', label: 'Cold', color: '#6b7280' }
];

function LeadQuickCapture({ onSave, onClose }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    lead_source: 'walk_in',
    priority: 'warm',
    requirements_notes: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.contact_name.trim()) {
      toast.error('Please enter a contact name');
      return;
    }

    setSaving(true);
    try {
      await createLead(formData);
      onSave();
    } catch (error) {
      toast.error(error.message);
      setSaving(false);
    }
  };

  return (
    <div className="quick-capture-modal" onClick={onClose}>
      <div className="quick-capture-content" onClick={e => e.stopPropagation()}>
        <div className="quick-capture-header">
          <h3>Quick Lead Capture</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="quick-capture-body">
            {/* Name */}
            <div className="form-group">
              <label htmlFor="qc_name">Name *</label>
              <input
                type="text"
                id="qc_name"
                name="contact_name"
                value={formData.contact_name}
                onChange={handleChange}
                placeholder="Customer name"
                autoFocus
                required
              />
            </div>

            {/* Phone & Email */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="qc_phone">Phone</label>
                <input
                  type="tel"
                  id="qc_phone"
                  name="contact_phone"
                  value={formData.contact_phone}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="form-group">
                <label htmlFor="qc_email">Email</label>
                <input
                  type="email"
                  id="qc_email"
                  name="contact_email"
                  value={formData.contact_email}
                  onChange={handleChange}
                  placeholder="email@example.com"
                />
              </div>
            </div>

            {/* Source Quick Buttons */}
            <div className="form-group">
              <label>Source</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {sourceQuickOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, lead_source: opt.value }))}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      background: formData.lead_source === opt.value ? '#dbeafe' : 'white',
                      color: formData.lead_source === opt.value ? '#1d4ed8' : 'inherit',
                      cursor: 'pointer'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority Quick Buttons */}
            <div className="form-group">
              <label>Priority</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {priorityQuickOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, priority: opt.value }))}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: `2px solid ${formData.priority === opt.value ? opt.color : 'var(--border-color)'}`,
                      background: formData.priority === opt.value ? `${opt.color}15` : 'white',
                      color: formData.priority === opt.value ? opt.color : 'inherit',
                      fontWeight: formData.priority === opt.value ? 600 : 400,
                      cursor: 'pointer',
                      flex: 1
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Notes */}
            <div className="form-group">
              <label htmlFor="qc_notes">Quick Notes</label>
              <textarea
                id="qc_notes"
                name="requirements_notes"
                value={formData.requirements_notes}
                onChange={handleChange}
                placeholder="What are they looking for? Any special requirements?"
                rows={3}
              />
            </div>
          </div>

          <div className="quick-capture-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LeadQuickCapture;
