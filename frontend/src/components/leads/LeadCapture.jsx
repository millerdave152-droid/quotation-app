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
          <h1>
            <svg className="header-title-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Leads & Inquiries
          </h1>
          <p className="subtitle">Capture and track customer inquiries before formal quotes</p>
        </div>
        <div className="header-actions">
          <button
            className={`btn ${showDashboard ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowDashboard(!showDashboard)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
            {showDashboard ? 'View Leads' : 'Analytics'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowQuickCapture(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
            Quick Capture
          </button>
          <button className="btn btn-primary" onClick={handleNewLead}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            New Lead
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="lead-stats-bar">
        {statsLoading ? (
          <div className="stats-skeleton">
            <div className="stats-skeleton-card" />
            <div className="stats-skeleton-card" />
            <div className="stats-skeleton-card" />
            <div className="stats-skeleton-card" />
            <div className="stats-skeleton-card" />
            <div className="stats-skeleton-card" />
          </div>
        ) : stats ? (
          <>
            <div className="stat-item">
              <div className="stat-icon stat-icon-default">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <span className="stat-value">{stats.total || 0}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="stat-item stat-new">
              <div className="stat-icon stat-icon-blue">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              </div>
              <span className="stat-value">{stats.new_count || 0}</span>
              <span className="stat-label">New</span>
            </div>
            <div className="stat-item stat-contacted">
              <div className="stat-icon stat-icon-purple">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </div>
              <span className="stat-value">{stats.contacted_count || 0}</span>
              <span className="stat-label">Contacted</span>
            </div>
            <div className="stat-item stat-qualified">
              <div className="stat-icon stat-icon-green">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <span className="stat-value">{stats.qualified_count || 0}</span>
              <span className="stat-label">Qualified</span>
            </div>
            <div className="stat-item stat-hot">
              <div className="stat-icon stat-icon-red">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
              </div>
              <span className="stat-value">{stats.hot_count || 0}</span>
              <span className="stat-label">Hot</span>
            </div>
            <div className="stat-item stat-followup">
              <div className="stat-icon stat-icon-amber">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <span className="stat-value">{stats.follow_up_today || 0}</span>
              <span className="stat-label">Follow-ups Today</span>
            </div>
            {stats.overdue_follow_ups > 0 && (
              <div className="stat-item stat-overdue">
                <div className="stat-icon stat-icon-danger">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
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
