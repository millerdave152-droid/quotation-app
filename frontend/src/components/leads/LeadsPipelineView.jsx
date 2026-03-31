/**
 * LeadsPipelineView — Pipeline list for Quote-to-Lead system
 * Tabular view with filtering, pagination, and status badges
 */

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui/Toast';

const API_URL = process.env.REACT_APP_API_URL || '';

const STATUS_COLORS = {
  new: { bg: '#2B8FAD', text: '#fff', label: 'New' },
  quoted: { bg: '#6366F1', text: '#fff', label: 'Quoted' },
  follow_up_scheduled: { bg: '#F59E0B', text: '#000', label: 'Follow-Up' },
  negotiating: { bg: '#C8614A', text: '#fff', label: 'Negotiating' },
  won: { bg: '#22C55E', text: '#fff', label: 'Won' },
  lost: { bg: '#6B7280', text: '#fff', label: 'Lost' },
  expired: { bg: '#EF4444', text: '#fff', label: 'Expired' },
  contacted: { bg: '#8b5cf6', text: '#fff', label: 'Contacted' },
  qualified: { bg: '#0ea5e9', text: '#fff', label: 'Qualified' },
  quote_created: { bg: '#6366F1', text: '#fff', label: 'Quote Created' },
  converted: { bg: '#059669', text: '#fff', label: 'Converted' }
};

const StatusBadge = ({ status }) => {
  const config = STATUS_COLORS[status] || { bg: '#6B7280', text: '#fff', label: status };
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '9999px',
      fontSize: '12px',
      fontWeight: '600',
      background: config.bg,
      color: config.text,
      whiteSpace: 'nowrap'
    }}>
      {config.label}
    </span>
  );
};

const formatDate = (dateStr) => {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
};

const formatCents = (cents) => {
  if (!cents && cents !== 0) return '-';
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
};

function LeadsPipelineView({ onLeadSelect, onToggleReminders, showRemindersActive }) {
  const toast = useToast();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });

  // Filters
  const [storeFilter, setStoreFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [staffFilter, setStaffFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Lookup data
  const [stores, setStores] = useState([]);
  const [staffList, setStaffList] = useState([]);

  // Fetch stores and staff on mount
  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const [storeRes, staffRes] = await Promise.all([
          authFetch(`${API_URL}/api/locations`),
          authFetch(`${API_URL}/api/users?role=sales`)
        ]);
        if (storeRes.ok) {
          const storeData = await storeRes.json();
          const locs = storeData.data || storeData || [];
          setStores(Array.isArray(locs) ? locs : []);
        }
        if (staffRes.ok) {
          const staffData = await staffRes.json();
          // API returns { data: { users: [...], total } } — extract the users array
          const users = staffData.data?.users || staffData.data || staffData || [];
          setStaffList(Array.isArray(users) ? users : []);
        }
      } catch {
        // Non-critical — filters will just be empty
      }
    };
    fetchLookups();
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(searchQuery && { search: searchQuery }),
        ...(staffFilter && { assignedTo: staffFilter })
      });

      // If store filter is set, use the store-scoped endpoint
      let url;
      if (storeFilter) {
        url = `${API_URL}/api/leads/store/${storeFilter}?${params}`;
        if (statusFilter.length === 1) {
          params.set('status', statusFilter[0]);
        }
      } else {
        url = `${API_URL}/api/leads?${params}`;
        if (statusFilter.length === 1) {
          params.set('status', statusFilter[0]);
        }
      }

      const response = await authFetch(url);
      if (!response.ok) throw new Error('Failed to fetch leads');
      const data = await response.json();

      const result = data.data || data;
      let leadsList = result.leads || result || [];

      // Client-side multi-status filter (API only supports single status)
      if (statusFilter.length > 1) {
        leadsList = leadsList.filter(l => statusFilter.includes(l.status));
      }

      setLeads(leadsList);
      const pag = result.pagination || data.pagination;
      if (pag) {
        setPagination(prev => ({ ...prev, total: pag.total || 0, totalPages: pag.totalPages || 0 }));
      }
    } catch (err) {
      toast.error('Failed to load leads pipeline');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, storeFilter, statusFilter, staffFilter, searchQuery, toast]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const toggleStatus = (status) => {
    setStatusFilter(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const getNextFollowUp = (lead) => {
    if (!lead.followups || lead.followups.length === 0) return null;
    const pending = (Array.isArray(lead.followups) ? lead.followups : [])
      .filter(f => !f.completed_at)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    return pending[0] || null;
  };

  const getQuoteExpiry = (lead) => {
    if (!lead.linked_quotes || lead.linked_quotes.length === 0) return null;
    const primary = lead.linked_quotes.find(q => q.is_primary) || lead.linked_quotes[0];
    return primary?.expires_at || null;
  };

  const getExpiryStyle = (expiresAt) => {
    if (!expiresAt) return {};
    const days = Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { color: '#EF4444', fontWeight: '600' };
    if (days < 3) return { color: '#F59E0B', fontWeight: '600' };
    return {};
  };

  const getPrimaryQuoteValue = (lead) => {
    if (!lead.linked_quotes || lead.linked_quotes.length === 0) return null;
    const primary = lead.linked_quotes.find(q => q.is_primary) || lead.linked_quotes[0];
    return primary?.total_cents;
  };

  const statuses = ['new', 'quoted', 'follow_up_scheduled', 'negotiating', 'won', 'lost', 'expired'];

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#111827' }}>
          Lead Pipeline
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>
            {pagination.total} lead{pagination.total !== 1 ? 's' : ''}
          </span>
          {onToggleReminders && (
            <button
              onClick={onToggleReminders}
              style={{
                padding: '8px 16px',
                background: showRemindersActive ? '#a8503d' : '#C8614A',
                color: '#fff', border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(200, 97, 74, 0.3)',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              {'\uD83D\uDD14'} Reminders
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center',
        padding: '12px 16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb'
      }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search customer name or phone..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
          style={{
            padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
            fontSize: '14px', minWidth: '220px', outline: 'none'
          }}
        />

        {/* Store */}
        <select
          value={storeFilter}
          onChange={(e) => { setStoreFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
        >
          <option value="">All Stores</option>
          {stores.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Assigned Staff */}
        <select
          value={staffFilter}
          onChange={(e) => { setStaffFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
        >
          <option value="">All Staff</option>
          {staffList.map(u => (
            <option key={u.id} value={u.id}>
              {u.first_name} {u.last_name}
            </option>
          ))}
        </select>
      </div>

      {/* Status pills */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {statuses.map(s => {
          const active = statusFilter.includes(s);
          const cfg = STATUS_COLORS[s];
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              style={{
                padding: '4px 12px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: '600',
                border: active ? `2px solid ${cfg.bg}` : '2px solid #e5e7eb',
                background: active ? cfg.bg : '#fff',
                color: active ? cfg.text : '#374151',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {cfg.label}
            </button>
          );
        })}
        {statusFilter.length > 0 && (
          <button
            onClick={() => setStatusFilter([])}
            style={{
              padding: '4px 12px', borderRadius: '9999px', fontSize: '12px',
              border: '1px solid #d1d5db', background: '#fff', color: '#6b7280',
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
      ) : leads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No leads found</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  {['Customer', 'Status', 'Assigned Staff', 'Store', 'Linked Quotes', 'Next Follow-Up', 'Quote Expiry', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', textAlign: 'left', fontWeight: '600',
                      color: '#374151', fontSize: '13px', whiteSpace: 'nowrap'
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => {
                  const nextFollowUp = getNextFollowUp(lead);
                  const quoteExpiry = getQuoteExpiry(lead);
                  const quoteCount = lead.linked_quote_count || lead.linked_quotes?.length || 0;
                  const primaryValue = getPrimaryQuoteValue(lead);

                  return (
                    <tr
                      key={lead.id}
                      style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                      onClick={() => onLeadSelect?.(lead)}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.background = ''}
                    >
                      {/* Customer */}
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: '500', color: '#111827' }}>
                          {lead.contact_name || lead.customer_name || '-'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                          {lead.contact_phone || lead.customer_phone || ''}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px' }}>
                        <StatusBadge status={lead.status} />
                      </td>

                      {/* Assigned Staff */}
                      <td style={{ padding: '12px', color: '#4b5563' }}>
                        {lead.assigned_to_name || '-'}
                      </td>

                      {/* Store */}
                      <td style={{ padding: '12px', color: '#4b5563' }}>
                        {lead.store_location_name || '-'}
                      </td>

                      {/* Linked Quotes */}
                      <td style={{ padding: '12px' }}>
                        {quoteCount > 0 ? (
                          <div>
                            <span style={{
                              display: 'inline-block', padding: '2px 8px',
                              background: '#EEF2FF', color: '#4338CA',
                              borderRadius: '9999px', fontSize: '12px', fontWeight: '600'
                            }}>
                              {quoteCount}
                            </span>
                            {primaryValue != null && (
                              <span style={{ marginLeft: '6px', fontSize: '13px', color: '#374151' }}>
                                {formatCents(primaryValue)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: '13px' }}>-</span>
                        )}
                      </td>

                      {/* Next Follow-Up */}
                      <td style={{ padding: '12px', fontSize: '13px' }}>
                        {nextFollowUp ? (
                          <span style={{ color: '#374151' }}>
                            {formatDate(nextFollowUp.scheduled_at)}
                          </span>
                        ) : (
                          <span style={{ color: '#d1d5db' }}>None scheduled</span>
                        )}
                      </td>

                      {/* Quote Expiry */}
                      <td style={{ padding: '12px', fontSize: '13px', ...getExpiryStyle(quoteExpiry) }}>
                        {quoteExpiry ? formatDate(quoteExpiry) : '-'}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); onLeadSelect?.(lead); }}
                          style={{
                            padding: '6px 14px', background: '#f3f4f6', border: '1px solid #d1d5db',
                            borderRadius: '6px', fontSize: '13px', fontWeight: '500',
                            cursor: 'pointer', color: '#374151'
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              gap: '8px', marginTop: '16px', padding: '12px 0'
            }}>
              <button
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
                style={{
                  padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
                  background: '#fff', cursor: pagination.page <= 1 ? 'default' : 'pointer',
                  opacity: pagination.page <= 1 ? 0.5 : 1, fontSize: '13px'
                }}
              >
                Previous
              </button>
              <span style={{ fontSize: '13px', color: '#6b7280' }}>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
                style={{
                  padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
                  background: '#fff', cursor: pagination.page >= pagination.totalPages ? 'default' : 'pointer',
                  opacity: pagination.page >= pagination.totalPages ? 0.5 : 1, fontSize: '13px'
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default LeadsPipelineView;
