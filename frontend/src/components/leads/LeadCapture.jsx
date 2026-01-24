/**
 * LeadCapture - Main Container Component
 * Entry point for the lead/inquiry capture system
 */

import React, { useState } from 'react';
import LeadList from './LeadList';
import LeadDetail from './LeadDetail';
import LeadForm from './LeadForm';
import LeadQuickCapture from './LeadQuickCapture';
import LeadFilters from './LeadFilters';
import LeadDashboard from './LeadDashboard';
import { useLeads, useLeadStats } from './hooks/useLeads';
import { useToast } from '../ui/Toast';
import './LeadCapture.css';

function LeadCapture() {
  const toast = useToast();
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  const {
    leads,
    loading,
    error,
    pagination,
    filters,
    updateFilters,
    setPage,
    refresh
  } = useLeads();

  const { stats, loading: statsLoading } = useLeadStats();

  const handleLeadSelect = (lead) => {
    setSelectedLeadId(lead.id);
    setShowForm(false);
    setEditingLead(null);
  };

  const handleNewLead = () => {
    setShowForm(true);
    setEditingLead(null);
    setSelectedLeadId(null);
  };

  const handleEditLead = (lead) => {
    setEditingLead(lead);
    setShowForm(true);
    setSelectedLeadId(null);
  };

  const handleFormSave = () => {
    setShowForm(false);
    setEditingLead(null);
    refresh();
    toast.success(editingLead ? 'Lead updated' : 'Lead created');
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingLead(null);
  };

  const handleQuickCaptureSave = () => {
    setShowQuickCapture(false);
    refresh();
    toast.success('Lead captured');
  };

  const handleLeadUpdate = () => {
    refresh();
  };

  const handleLeadClose = () => {
    setSelectedLeadId(null);
  };

  return (
    <div className="lead-capture">
      {/* Header */}
      <div className="lead-capture-header">
        <div className="header-title">
          <h1>Leads & Inquiries</h1>
          <p className="subtitle">Capture and track customer inquiries before formal quotes</p>
        </div>
        <div className="header-actions">
          <button
            className={`btn ${showDashboard ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowDashboard(!showDashboard)}
          >
            {showDashboard ? 'View Leads' : 'Analytics'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowQuickCapture(true)}
          >
            Quick Capture
          </button>
          <button className="btn btn-primary" onClick={handleNewLead}>
            + New Lead
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="lead-stats-bar">
        {statsLoading ? (
          <div className="stats-loading">Loading stats...</div>
        ) : stats ? (
          <>
            <div className="stat-item">
              <span className="stat-value">{stats.total || 0}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="stat-item stat-new">
              <span className="stat-value">{stats.new_count || 0}</span>
              <span className="stat-label">New</span>
            </div>
            <div className="stat-item stat-contacted">
              <span className="stat-value">{stats.contacted_count || 0}</span>
              <span className="stat-label">Contacted</span>
            </div>
            <div className="stat-item stat-qualified">
              <span className="stat-value">{stats.qualified_count || 0}</span>
              <span className="stat-label">Qualified</span>
            </div>
            <div className="stat-item stat-hot">
              <span className="stat-value">{stats.hot_count || 0}</span>
              <span className="stat-label">Hot</span>
            </div>
            <div className="stat-item stat-followup">
              <span className="stat-value">{stats.follow_up_today || 0}</span>
              <span className="stat-label">Follow-ups Today</span>
            </div>
            {stats.overdue_follow_ups > 0 && (
              <div className="stat-item stat-overdue">
                <span className="stat-value">{stats.overdue_follow_ups}</span>
                <span className="stat-label">Overdue</span>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Main Content */}
      {showDashboard ? (
        <LeadDashboard onClose={() => setShowDashboard(false)} />
      ) : (
        <div className="lead-capture-content">
          {/* Filters Sidebar */}
          <div className="lead-sidebar">
            <LeadFilters
              filters={filters}
              onFilterChange={updateFilters}
            />
          </div>

          {/* Main Panel */}
          <div className="lead-main">
            {showForm ? (
              <LeadForm
                lead={editingLead}
                onSave={handleFormSave}
                onCancel={handleFormCancel}
              />
            ) : selectedLeadId ? (
              <LeadDetail
                leadId={selectedLeadId}
                onEdit={handleEditLead}
                onUpdate={handleLeadUpdate}
                onClose={handleLeadClose}
              />
            ) : (
              <LeadList
                leads={leads}
                loading={loading}
                error={error}
                pagination={pagination}
                onPageChange={setPage}
                onLeadSelect={handleLeadSelect}
                onLeadEdit={handleEditLead}
                onRefresh={refresh}
              />
            )}
          </div>
        </div>
      )}

      {/* Quick Capture Modal */}
      {showQuickCapture && (
        <LeadQuickCapture
          onSave={handleQuickCaptureSave}
          onClose={() => setShowQuickCapture(false)}
        />
      )}
    </div>
  );
}

export default LeadCapture;
