import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', bg: '#fef3c7', color: '#92400e' },
  { value: 'processing', label: 'Processing', bg: '#dbeafe', color: '#1d4ed8' },
  { value: 'ready_for_pickup', label: 'Ready for Pickup', bg: '#d1fae5', color: '#065f46' },
  { value: 'out_for_delivery', label: 'Out for Delivery', bg: '#e0e7ff', color: '#3730a3' },
  { value: 'in_transit', label: 'In Transit', bg: '#fae8ff', color: '#86198f' },
  { value: 'delivered', label: 'Delivered', bg: '#dcfce7', color: '#166534' },
  { value: 'failed_delivery', label: 'Failed', bg: '#fee2e2', color: '#991b1b' },
  { value: 'cancelled', label: 'Cancelled', bg: '#f3f4f6', color: '#6b7280' }
];

function DeliveryDashboard() {
  const [activeTab, setActiveTab] = useState('pending');
  const [fulfillments, setFulfillments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [updating, setUpdating] = useState(null);

  const authHeaders = useCallback(() => {
    const token = localStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url;
      const params = new URLSearchParams();

      if (activeTab === 'pending') {
        url = `${API_URL}/api/delivery/pending`;
        if (filterStatus) params.set('status', filterStatus);
        if (filterDate) params.set('date', filterDate);
      } else if (activeTab === 'today') {
        url = `${API_URL}/api/delivery/pending`;
        params.set('date', new Date().toISOString().split('T')[0]);
      } else if (activeTab === 'pickup') {
        url = `${API_URL}/api/delivery/ready-for-pickup`;
      }

      const queryStr = params.toString();
      const response = await fetch(`${url}${queryStr ? `?${queryStr}` : ''}`, {
        headers: authHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setFulfillments(result.data || result.fulfillments || []);
      }
    } catch (err) {
      console.error('Failed to fetch fulfillments:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterDate, filterStatus, authHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateStatus = async (fulfillmentId, newStatus) => {
    setUpdating(fulfillmentId);
    try {
      const response = await fetch(`${API_URL}/api/delivery/fulfillment/${fulfillmentId}/status`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      const result = await response.json();
      if (result.success) {
        fetchData();
      } else {
        alert(result.error || 'Failed to update status');
      }
    } catch (err) {
      alert('Failed to update: ' + err.message);
    } finally {
      setUpdating(null);
    }
  };

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format((cents || 0) / 100);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    const opt = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
    return (
      <span style={{
        padding: '3px 10px',
        borderRadius: '16px',
        fontSize: '12px',
        fontWeight: 600,
        background: opt.bg,
        color: opt.color
      }}>
        {opt.label}
      </span>
    );
  };

  const getNextStatuses = (current, type) => {
    const transitions = {
      pending: ['processing', 'cancelled'],
      processing: type === 'pickup' ? ['ready_for_pickup', 'cancelled'] : ['out_for_delivery', 'cancelled'],
      ready_for_pickup: ['delivered', 'cancelled'],
      out_for_delivery: ['in_transit', 'delivered', 'failed_delivery'],
      in_transit: ['delivered', 'failed_delivery'],
      failed_delivery: ['out_for_delivery', 'cancelled'],
    };
    return transitions[current] || [];
  };

  const tabs = [
    { key: 'pending', label: 'All Pending' },
    { key: 'today', label: "Today's Deliveries" },
    { key: 'pickup', label: 'Ready for Pickup' }
  ];

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.pageTitle}>Delivery Management</h1>
          <p style={styles.pageSubtitle}>Track and manage deliveries and pickups</p>
        </div>
        <button onClick={fetchData} style={styles.refreshBtn}>Refresh</button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={activeTab === tab.key ? styles.tabActive : styles.tab}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters (pending tab only) */}
      {activeTab === 'pending' && (
        <div style={styles.filters}>
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            style={styles.filterInput}
          />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.filter(s => !['delivered', 'cancelled'].includes(s.value)).map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {(filterDate || filterStatus) && (
            <button
              onClick={() => { setFilterDate(''); setFilterStatus(''); }}
              style={styles.clearBtn}
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : fulfillments.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.emptyText}>No fulfillments found</p>
        </div>
      ) : (
        <div style={styles.list}>
          {fulfillments.map(item => (
            <div key={item.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <div style={styles.orderNumber}>
                    {item.transaction_number || item.order_number || `#${item.transaction_id || item.id}`}
                  </div>
                  <div style={styles.customerName}>
                    {item.customer_name || 'Unknown Customer'}
                  </div>
                </div>
                <div style={styles.cardHeaderRight}>
                  {getStatusBadge(item.status)}
                  <span style={styles.fulfillmentType}>
                    {(item.fulfillment_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                </div>
              </div>

              <div style={styles.cardBody}>
                {item.scheduled_date && (
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Scheduled</span>
                    <span style={styles.infoValue}>{formatDate(item.scheduled_date)}</span>
                  </div>
                )}
                {item.delivery_address && (
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Address</span>
                    <span style={styles.infoValue}>{item.delivery_address}</span>
                  </div>
                )}
                {item.tracking_number && (
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Tracking</span>
                    <span style={styles.infoValue}>{item.tracking_number}</span>
                  </div>
                )}
                {item.total_cents && (
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Order Total</span>
                    <span style={styles.infoValue}>{formatCurrency(item.total_cents)}</span>
                  </div>
                )}
                {item.customer_notes && (
                  <div style={styles.infoItem}>
                    <span style={styles.infoLabel}>Notes</span>
                    <span style={styles.infoValue}>{item.customer_notes}</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {getNextStatuses(item.status, item.fulfillment_type).length > 0 && (
                <div style={styles.cardActions}>
                  {getNextStatuses(item.status, item.fulfillment_type).map(nextStatus => {
                    const opt = STATUS_OPTIONS.find(s => s.value === nextStatus);
                    const isCancelAction = nextStatus === 'cancelled' || nextStatus === 'failed_delivery';
                    return (
                      <button
                        key={nextStatus}
                        onClick={() => updateStatus(item.id, nextStatus)}
                        disabled={updating === item.id}
                        style={isCancelAction ? styles.actionBtnDanger : styles.actionBtn}
                      >
                        {updating === item.id ? '...' : `Mark ${opt?.label || nextStatus}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    padding: '30px',
    maxWidth: '1200px',
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px'
  },
  pageTitle: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 700,
    color: '#111827'
  },
  pageSubtitle: {
    margin: '4px 0 0',
    color: '#6b7280',
    fontSize: '14px'
  },
  refreshBtn: {
    padding: '10px 20px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px'
  },
  tab: {
    padding: '10px 20px',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 500
  },
  tabActive: {
    padding: '10px 20px',
    background: '#667eea',
    color: 'white',
    border: '1px solid #667eea',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 600
  },
  filters: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
    alignItems: 'center'
  },
  filterInput: {
    padding: '8px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px'
  },
  filterSelect: {
    padding: '8px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px'
  },
  clearBtn: {
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    color: '#667eea',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  loading: {
    textAlign: 'center',
    padding: '60px',
    color: '#6b7280',
    fontSize: '16px'
  },
  empty: {
    textAlign: 'center',
    padding: '60px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  emptyText: {
    color: '#6b7280',
    fontSize: '16px'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px'
  },
  cardHeaderRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '4px'
  },
  orderNumber: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#111827'
  },
  customerName: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '2px'
  },
  fulfillmentType: {
    fontSize: '11px',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  cardBody: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '8px',
    padding: '12px 0',
    borderTop: '1px solid #f3f4f6',
    borderBottom: '1px solid #f3f4f6'
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  infoLabel: {
    fontSize: '11px',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.3px'
  },
  infoValue: {
    fontSize: '13px',
    color: '#111827',
    fontWeight: 600
  },
  cardActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
    flexWrap: 'wrap'
  },
  actionBtn: {
    padding: '8px 16px',
    background: '#f0fdf4',
    color: '#166534',
    border: '1px solid #bbf7d0',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  actionBtnDanger: {
    padding: '8px 16px',
    background: '#fef2f2',
    color: '#991b1b',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer'
  }
};

export default DeliveryDashboard;
