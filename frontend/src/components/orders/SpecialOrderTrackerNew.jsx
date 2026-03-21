/**
 * SpecialOrderTrackerNew.jsx — Screen 50
 * TeleTime Design System · Special Order Tracker
 * Design frame: alq6c
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Loader2 } from 'lucide-react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';
import PaginationBar from '../shared/PaginationBar';
import { useToast } from '../ui/Toast';
import apiClient from '../../services/apiClient';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCents(cents) {
  if (!cents && cents !== 0) return '$0.00';
  return `$${(Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusColor(status) {
  const s = (status || '').toLowerCase();
  const map = {
    pending:        '#F59E0B',
    in_production:  '#3B82F6',
    in_transit:     '#3B82F6',
    ready:          '#22C55E',
    completed:      '#22C55E',
    delivered:      '#22C55E',
    qa_review:      '#8B5CF6',
    cancelled:      '#EF4444',
  };
  return map[s] || '#64748B';
}

function displayStatus(status) {
  if (!status) return '—';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const TABS = [
  { label: 'All Orders',     value: '' },
  { label: 'Pending',        value: 'pending' },
  { label: 'In Production',  value: 'in_production' },
  { label: 'Ready',          value: 'ready' },
  { label: 'Completed',      value: 'completed' },
];

const cols = [
  { label: 'Order #',  w: 'w-[120px]', mono: true },
  { label: 'Customer', w: 'flex-1' },
  { label: 'Product',  w: 'flex-1' },
  { label: 'Status',   w: 'w-[100px]' },
  { label: 'ETA',      w: 'w-[90px]' },
  { label: 'Value',    w: 'w-[80px]', align: 'text-right', mono: true },
  { label: 'Actions',  w: 'w-[80px]' },
];

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useSOStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/api/special-orders/stats');
        setStats(res.data?.data || res.data);
      } catch { /* ignore */ }
    })();
  }, []);

  return stats;
}

function useSpecialOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ status: '' });

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: ((pagination.page - 1) * pagination.limit).toString(),
      });
      if (filters.status) params.set('status', filters.status);

      const res = await apiClient.get(`/api/special-orders?${params}`);
      const payload = res.data?.data || res.data;
      const list = Array.isArray(payload) ? payload : (payload.specialOrders || payload.orders || payload.data || []);
      setOrders(list);

      const total = payload.total || payload.pagination?.total || list.length;
      const totalPages = payload.totalPages || payload.pagination?.totalPages || Math.ceil(total / pagination.limit);
      setPagination((p) => ({ ...p, total, totalPages }));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => { fetch(); }, [fetch]);

  const updateFilters = (f) => {
    setFilters((prev) => ({ ...prev, ...f }));
    setPagination((p) => ({ ...p, page: 1 }));
  };
  const setPage = (page) => setPagination((p) => ({ ...p, page }));

  return { orders, loading, pagination, filters, updateFilters, setPage };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SpecialOrderTrackerNew() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('');
  const stats = useSOStats();
  const { orders, loading, pagination, updateFilters, setPage } = useSpecialOrders();

  const handleTabChange = (value) => {
    setActiveTab(value);
    updateFilters({ status: value });
  };

  const activeCount = stats?.activeCount ?? stats?.active_count ?? orders.length;

  const kpis = stats
    ? [
        { label: 'Active Orders',  value: stats.activeCount ?? stats.active_count ?? '—' },
        { label: 'Avg Lead Time',  value: stats.avgLeadTime ?? stats.avg_lead_time ?? '—' },
        { label: 'On-Time Rate',   value: stats.onTimeRate ?? stats.on_time_rate ?? '—', color: '#22C55E' },
        { label: 'Total Value',    value: stats.totalValueCents != null ? formatCents(stats.totalValueCents) : (stats.total_value_cents != null ? formatCents(stats.total_value_cents) : (stats.totalValue ?? '—')) },
      ]
    : [
        { label: 'Active Orders', value: '—' },
        { label: 'Avg Lead Time', value: '—' },
        { label: 'On-Time Rate', value: '—', color: '#22C55E' },
        { label: 'Total Value', value: '—' },
      ];

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BreadcrumbTopBar
        title={['Orders', 'Special Orders']}
        rightContent={
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => toast.info('Create special order coming soon')}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
          >
            <Plus size={14} />
            Create Special Order
          </motion.button>
        }
      />

      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center">
          <h1 className="text-foreground font-secondary text-[20px] font-bold">
            Special Order Tracker
          </h1>
          <div className="flex-1" />
          <span className="bg-primary text-white font-primary text-[11px] font-semibold px-3 py-1 rounded-full">
            {activeCount} active orders
          </span>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="flex flex-col gap-1 bg-card rounded-xl border border-border"
              style={{ padding: '16px 20px' }}
            >
              <span className="text-muted-foreground font-secondary text-[11px]">{k.label}</span>
              <span
                className="font-primary text-[24px] font-bold"
                style={{ color: k.color || 'var(--foreground)' }}
              >
                {k.value}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => handleTabChange(t.value)}
              className={`px-3 py-1.5 rounded-full font-secondary text-sm font-medium transition-all ${
                activeTab === t.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="flex flex-col bg-card rounded-xl border border-border overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center px-4 py-2.5 bg-secondary">
            {cols.map((col) => (
              <span
                key={col.label}
                className={`${col.w} shrink-0 text-muted-foreground ${col.mono ? 'font-primary' : 'font-secondary'} text-[10px] font-semibold ${col.align || ''}`}
              >
                {col.label}
              </span>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty */}
          {!loading && orders.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <span className="text-muted-foreground font-secondary text-sm">No special orders found</span>
            </div>
          )}

          {/* Rows */}
          {!loading && orders.map((row, i) => {
            const sc = statusColor(row.status);
            const etaDate = row.estimated_completion || row.estimatedCompletion || row.eta;
            const isReady = (row.status || '').toLowerCase() === 'ready';
            return (
              <div
                key={row.id}
                className="flex items-center px-4 py-2.5"
                style={i < orders.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
              >
                <span className="w-[120px] shrink-0 text-foreground font-primary text-[11px] font-semibold">
                  {row.order_number || row.orderNumber || `SPO-${row.id}`}
                </span>
                <span className="flex-1 shrink-0 text-foreground font-secondary text-xs">
                  {row.customer_name || row.customerName || '—'}
                </span>
                <span className="flex-1 shrink-0 text-foreground font-secondary text-xs">
                  {row.product_name || row.productName || row.description || '—'}
                </span>
                <div className="w-[100px] shrink-0">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full font-primary text-[9px] font-medium"
                    style={{ backgroundColor: `${sc}15`, color: sc }}
                  >
                    {displayStatus(row.status)}
                  </span>
                </div>
                <span
                  className="w-[90px] shrink-0 font-secondary text-[11px]"
                  style={{
                    color: isReady ? '#22C55E' : 'var(--foreground)',
                    fontWeight: isReady ? 600 : 'normal',
                  }}
                >
                  {isReady ? 'Ready' : formatDate(etaDate)}
                </span>
                <span className="w-[80px] shrink-0 text-foreground font-primary text-[11px] font-semibold text-right">
                  {formatCents(row.total_cents || row.totalCents || row.value_cents || row.valueCents)}
                </span>
                <div className="w-[80px] shrink-0">
                  <button
                    onClick={() => toast.info(`View special order ${row.order_number || row.orderNumber || row.id}`)}
                    className="px-3 py-1 rounded-full font-primary text-[11px] font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    View
                  </button>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {!loading && pagination.total > 0 && (
            <PaginationBar
              current={pagination.page}
              total={pagination.total}
              perPage={pagination.limit}
              label="special orders"
              onPageChange={setPage}
            />
          )}
        </div>
      </div>
    </div>
  );
}
