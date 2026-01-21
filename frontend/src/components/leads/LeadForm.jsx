/**
 * LeadForm - Create/Edit lead form
 */

import React, { useState, useEffect } from 'react';
import RequirementSection from './RequirementSection';
import { createLead, updateLead } from './hooks/useLeads';
import { useToast } from '../ui/Toast';

const leadSourceOptions = [
  { value: '', label: 'Select source...' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone', label: 'Phone Call' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'realtor', label: 'Realtor' },
  { value: 'builder', label: 'Builder/Contractor' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'other', label: 'Other' }
];

const inquiryReasonOptions = [
  { value: '', label: 'Select reason...' },
  { value: 'browsing', label: 'Browsing / Exploring' },
  { value: 'researching', label: 'Researching' },
  { value: 'moving', label: 'Moving to New Home' },
  { value: 'renovation', label: 'Renovation' },
  { value: 'replacement', label: 'Replacing Existing' },
  { value: 'upgrade', label: 'Upgrading' },
  { value: 'builder_project', label: 'Builder Project' },
  { value: 'other', label: 'Other' }
];

const timelineOptions = [
  { value: '', label: 'Select timeline...' },
  { value: 'asap', label: 'ASAP' },
  { value: '1_2_weeks', label: '1-2 Weeks' },
  { value: '1_3_months', label: '1-3 Months' },
  { value: '3_6_months', label: '3-6 Months' },
  { value: 'just_researching', label: 'Just Researching' }
];

const contactMethodOptions = [
  { value: '', label: 'Select method...' },
  { value: 'phone', label: 'Phone' },
  { value: 'text', label: 'Text Message' },
  { value: 'email', label: 'Email' }
];

const priorityOptions = [
  { value: 'hot', label: 'Hot - Ready to buy' },
  { value: 'warm', label: 'Warm - Interested' },
  { value: 'cold', label: 'Cold - Just looking' }
];

function LeadForm({ lead, onSave, onCancel }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    preferred_contact_method: '',
    best_time_to_contact: '',
    lead_source: '',
    source_details: '',
    inquiry_reason: '',
    timeline: '',
    move_in_date: '',
    requirements_notes: '',
    priority: 'warm',
    follow_up_date: '',
    requirements: []
  });

  useEffect(() => {
    if (lead) {
      setFormData({
        contact_name: lead.contact_name || '',
        contact_email: lead.contact_email || '',
        contact_phone: lead.contact_phone || '',
        preferred_contact_method: lead.preferred_contact_method || '',
        best_time_to_contact: lead.best_time_to_contact || '',
        lead_source: lead.lead_source || '',
        source_details: lead.source_details || '',
        inquiry_reason: lead.inquiry_reason || '',
        timeline: lead.timeline || '',
        move_in_date: lead.move_in_date ? lead.move_in_date.split('T')[0] : '',
        requirements_notes: lead.requirements_notes || '',
        priority: lead.priority || 'warm',
        follow_up_date: lead.follow_up_date ? lead.follow_up_date.split('T')[0] : '',
        requirements: lead.requirements || []
      });
    }
  }, [lead]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRequirementsChange = (requirements) => {
    setFormData(prev => ({ ...prev, requirements }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.contact_name.trim()) {
      toast.error('Contact name is required');
      return;
    }

    setSaving(true);

    try {
      if (lead?.id) {
        await updateLead(lead.id, formData);
      } else {
        await createLead(formData);
      }
      onSave();
    } catch (error) {
      toast.error(error.message || 'Failed to save lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lead-form">
      <div className="lead-form-header">
        <h2>{lead ? 'Edit Lead' : 'New Lead'}</h2>
        <button className="btn-icon" onClick={onCancel} title="Close">
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="lead-form-body">
          {/* Contact Information */}
          <div className="form-section">
            <h3 className="form-section-title">Contact Information</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="contact_name">Name *</label>
                <input
                  type="text"
                  id="contact_name"
                  name="contact_name"
                  value={formData.contact_name}
                  onChange={handleChange}
                  placeholder="Customer name"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="contact_email">Email</label>
                <input
                  type="email"
                  id="contact_email"
                  name="contact_email"
                  value={formData.contact_email}
                  onChange={handleChange}
                  placeholder="customer@email.com"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="contact_phone">Phone</label>
                <input
                  type="tel"
                  id="contact_phone"
                  name="contact_phone"
                  value={formData.contact_phone}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="form-group">
                <label htmlFor="preferred_contact_method">Preferred Contact Method</label>
                <select
                  id="preferred_contact_method"
                  name="preferred_contact_method"
                  value={formData.preferred_contact_method}
                  onChange={handleChange}
                >
                  {contactMethodOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="best_time_to_contact">Best Time to Contact</label>
                <input
                  type="text"
                  id="best_time_to_contact"
                  name="best_time_to_contact"
                  value={formData.best_time_to_contact}
                  onChange={handleChange}
                  placeholder="e.g., Afternoons, After 5pm"
                />
              </div>
            </div>
          </div>

          {/* Lead Source */}
          <div className="form-section">
            <h3 className="form-section-title">Lead Source</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="lead_source">How did they find us?</label>
                <select
                  id="lead_source"
                  name="lead_source"
                  value={formData.lead_source}
                  onChange={handleChange}
                >
                  {leadSourceOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="source_details">Source Details</label>
                <input
                  type="text"
                  id="source_details"
                  name="source_details"
                  value={formData.source_details}
                  onChange={handleChange}
                  placeholder="e.g., Referred by John Smith"
                />
              </div>
            </div>
          </div>

          {/* Context & Timing */}
          <div className="form-section">
            <h3 className="form-section-title">Context & Timing</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="inquiry_reason">Reason for Inquiry</label>
                <select
                  id="inquiry_reason"
                  name="inquiry_reason"
                  value={formData.inquiry_reason}
                  onChange={handleChange}
                >
                  {inquiryReasonOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="timeline">Purchase Timeline</label>
                <select
                  id="timeline"
                  name="timeline"
                  value={formData.timeline}
                  onChange={handleChange}
                >
                  {timelineOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="move_in_date">Move-in Date (if applicable)</label>
                <input
                  type="date"
                  id="move_in_date"
                  name="move_in_date"
                  value={formData.move_in_date}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div className="form-section">
            <h3 className="form-section-title">Product Requirements</h3>
            <RequirementSection
              requirements={formData.requirements}
              onChange={handleRequirementsChange}
            />
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label htmlFor="requirements_notes">Additional Notes</label>
              <textarea
                id="requirements_notes"
                name="requirements_notes"
                value={formData.requirements_notes}
                onChange={handleChange}
                placeholder="Any additional details about what the customer is looking for..."
                rows={4}
              />
            </div>
          </div>

          {/* Internal */}
          <div className="form-section">
            <h3 className="form-section-title">Internal</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="priority">Priority</label>
                <select
                  id="priority"
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                >
                  {priorityOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="follow_up_date">Follow-up Date</label>
                <input
                  type="date"
                  id="follow_up_date"
                  name="follow_up_date"
                  value={formData.follow_up_date}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="lead-form-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (lead ? 'Update Lead' : 'Create Lead')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LeadForm;
