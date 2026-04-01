/**
 * TransferList — View and manage stock transfers
 * Tabs: Incoming | Outgoing | All (manager only)
 * Action buttons per status: Approve, Pick Up, Receive, Cancel
 */

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';

const API_URL = process.env.REACT_APP_API_URL || '';

const STATUS_COLORS = {
  requested: { bg: '#F59E0B', text: '#000', label: 'Requested' },
  approved: { bg: '#3B82F6', text: '#fff', label: 'Approved' },
  picked_up: { bg: '#F97316', text: '#fff', label: 'Picked Up' },
  received: { bg: '#22C55E', text: '#fff', label: 'Received' },
  cancelled: { bg: '#6B7280', text: '#fff', label: 'Cancelled' }
};

const StatusBadge = ({ status }) => {
  const config = STATUS_COLORS[status] || { bg: '#6B7280', text: '#fff', label: status };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '9999px',
      fontSize: '12px', fontWeight: '600', background: config.bg, color: config.text, whiteSpace: 'nowrap'
    }}>
      {config.label}
    </span>
  );
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

function TransferList() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const isManager = isAdmin || user?.role === 'manager';

  const [tab, setTab] = useState('incoming');
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [receiveNotes, setReceiveNotes] = useState({});
  const [showNotesFor, setShowNotesFor] = useState(null);

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== 'all' && user?.location_id) {
        params.set('location_id', user.location_id);
      }
      const res = await authFetch(`${API_URL}/api/transfers?${params}`);
      if (!res.ok) throw new Error('Failed to fetch transfers');
      const data = await res.json();
      let list = data.data || [];

      // Client-side tab filtering
      if (tab === 'incoming' && user?.location_id) {
        list = list.filter(t => t.to_location_id === user.location_id);
      } else if (tab === 'outgoing' && user?.location_id) {
        list = list.filter(t => t.from_location_id === user.location_id);
      }

      setTransfers(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, user, toast]);

  useEffect(() => { fetchTransfers(); }, [fetchTransfers]);

  const handleAction = async (transferId, action, body = {}) => {
    try {
      const res = await authFetch(`${API_URL}/api/transfers/${transferId}/${action}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || err.error || err.message || `Failed to ${action}`);
      }
      const actionLabels = { approve: 'approved', pickup: 'picked up', receive: 'received', cancel: 'cancelled' };
      toast.success(`Transfer #${transferId} ${actionLabels[action] || action + 'd'}`);
      setShowNotesFor(null);
      fetchTransfers();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const tabs = [
    { key: 'incoming', label: 'Incoming' },
    { key: 'outgoing', label: 'Outgoing' },
    ...(isManager ? [{ key: 'all', label: 'All' }] : [])
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 20px', background: 'none', border: 'none',
              borderBottom: tab === t.key ? '2px solid #1e40af' : '2px solid transparent',
              color: tab === t.key ? '#1e40af' : '#6b7280',
              fontWeight: tab === t.key ? '600' : '500', fontSize: '14px', cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
      ) : transfers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>No transfers found</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {['#', 'Product', 'Qty', 'From', 'To', 'Status', 'Date', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#374151', fontSize: '13px', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transfers.map(t => (
                <React.Fragment key={t.id}>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 12px', fontWeight: '500' }}>{t.id}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: '500' }}>{t.product_name}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>{t.product_sku}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{t.qty}</td>
                    <td style={{ padding: '10px 12px', fontSize: '13px' }}>{t.from_location_name}</td>
                    <td style={{ padding: '10px 12px', fontSize: '13px' }}>{t.to_location_name}</td>
                    <td style={{ padding: '10px 12px' }}><StatusBadge status={t.status} /></td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: '#6b7280' }}>{formatDate(t.created_at)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {/* Approve — manager only, requested status */}
                        {t.status === 'requested' && isManager && (
                          <ActionBtn label="Approve" color="#3B82F6" onClick={() => handleAction(t.id, 'approve')} />
                        )}
                        {/* Pick Up — approved status, manager or driver */}
                        {t.status === 'approved' && (isManager || user?.role === 'driver') && (
                          <ActionBtn label="Pick Up" color="#F97316" onClick={() => handleAction(t.id, 'pickup')} />
                        )}
                        {/* Receive — picked_up status, user at to_location */}
                        {t.status === 'picked_up' && (
                          <ActionBtn label="Receive" color="#22C55E" onClick={() => {
                            if (showNotesFor === t.id) {
                              handleAction(t.id, 'receive', { driver_notes: receiveNotes[t.id] || '' });
                            } else {
                              setShowNotesFor(t.id);
                            }
                          }} />
                        )}
                        {/* Cancel — requested or approved */}
                        {['requested', 'approved'].includes(t.status) && (
                          <ActionBtn label="Cancel" color="#6B7280" onClick={() => handleAction(t.id, 'cancel')} />
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Driver notes input for receive */}
                  {showNotesFor === t.id && t.status === 'picked_up' && (
                    <tr>
                      <td colSpan={8} style={{ padding: '8px 12px 12px', background: '#f9fafb' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', maxWidth: '500px' }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                              Driver Notes (optional)
                            </label>
                            <textarea
                              value={receiveNotes[t.id] || ''}
                              onChange={(e) => setReceiveNotes(prev => ({ ...prev, [t.id]: e.target.value }))}
                              placeholder="Any notes about the delivery..."
                              rows={2}
                              style={{ width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box' }}
                            />
                          </div>
                          <button
                            onClick={() => handleAction(t.id, 'receive', { driver_notes: receiveNotes[t.id] || '' })}
                            style={{ padding: '8px 16px', background: '#22C55E', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            Confirm Received
                          </button>
                          <button
                            onClick={() => setShowNotesFor(null)}
                            style={{ padding: '8px 12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActionBtn({ label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px', background: color, color: '#fff', border: 'none',
        borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
      }}
    >
      {label}
    </button>
  );
}

export default TransferList;
