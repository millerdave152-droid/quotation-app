/**
 * PreOrderManagerNew.jsx — Screen 51
 * TeleTime Design System · Pre-Order Manager
 * Design frame: Gv57E
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Bell, Package, RotateCcw, X, Loader2 } from 'lucide-react';
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
    pending:          '#F59E0B',
    awaiting_stock:   '#F59E0B',
    ready_to_fulfill: '#22C55E',
    ready:            '#22C55E',
    fulfilled:        '#22C55E',
    completed:        '#22C55E',
    cancelled:        '#EF4444',
  };
  return map[s] || '#64748B';
}

function displayStatus(status) {
  if (!status) return '—';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionType(status) {
  const s = (status || '').toLowerCase();
  if (s === 'ready_to_fulfill' || s === 'ready') return 'fulfill';
  if (s === 'cancelled') return 'refund';
  return 'notify';
}

const TABS = [
  { label: 'All Pre-Orders',      value: '' },
  { label: 'Awaiting Stock',      value: 'awaiting_stock' },
  { label: 'Ready to Fulfill',    value: 'ready_to_fulfill' },
  { label: 'Completed',           value: 'completed' },
];

const cols = [
  { label: 'Pre-Order #',       w: 'w-[110px]', mono: true },
  { label: 'Customer',          w: 'flex-1' },
  { label: 'Product',           w: 'flex-1' },
  { label: 'Deposit',           w: 'w-[80px]' },
  { label: 'Status',            w: 'w-[110px]' },
  { label: 'Est. Availability', w: 'w-[100px]' },
  { label: 'Actions',           w: 'w-[100px]' },
];

/* ------------------------------------------------------------------ */
/*  Action button renderer                                             */
/* ------------------------------------------------------------------ */

function ActionButton({ type, onClick }) {
  if (type === 'fulfill') {
    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary text-primary-foreground font-primary text-[11px] font-medium"
      >
        <Package size={12} />
        Fulfill
      </motion.button>
    );
  }
  if (type === 'refund') {
    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        className="flex items-center gap-1 px-3 py-1 rounded-full bg-destructive text-foreground font-primary text-[11px] font-medium"
      >
        <RotateCcw size={12} />
        Refund
      </motion.button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-1 rounded-full font-primary text-[11px] font-medium text-foreground hover:bg-secondary transition-colors"
    >
      <Bell size={12} />
      Notify
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

function usePreOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ search: '', status: '' });

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: ((pagination.page - 1) * pagination.limit).toString(),
      });
      if (filters.status) params.set('status', filters.status);

      const res = await apiClient.get(`/api/pre-orders?${params}`);
      const payload = res.data?.data || res.data;
      const list = Array.isArray(payload) ? payload : (payload.preOrders || payload.orders || payload.data || []);
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

  return { orders, loading, pagination, filters, updateFilters, setPage, refresh: fetch };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PreOrderManagerNew() {
  const toast = useToast();
  const debounceRef = useRef(null);
  const [activeTab, setActiveTab] = useState('');
  const [search, setSearch] = useState('');
  const { orders, loading, pagination, updateFilters, setPage, refresh } = usePreOrders();

  const handleSearch = (value) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilters({ search: value });
    }, 300);
  };

  const handleTabChange = (value) => {
    setActiveTab(value);
    updateFilters({ status: value });
  };

  const handleAction = async (row, type) => {
    if (type === 'fulfill') {
      try {
        await apiClient.post(`/api/pre-orders/${row.id}/status`, { status: 'fulfilled' });
        toast.success('Pre-order fulfilled');
        refresh();
      } catch { toast.error('Failed to fulfill pre-order'); }
    } else if (type === 'refund') {
      toast.info('Refund flow coming soon');
    } else {
      toast.info(`Notification sent for ${row.order_number || row.orderNumber || row.id}`);
    }
  };

  /* Compute KPIs from loaded data */
  const activeCount = orders.filter((o) => !['completed', 'cancelled', 'fulfilled'].includes((o.status || '').toLowerCase())).length;
  const depositTotal = orders.reduce((sum, o) => sum + (o.deposit_cents || o.depositCents || 0), 0);

  const kpis = [
    { label: 'Active Pre-Orders',   value: activeCount || pagination.total || '—' },
    { label: 'Deposits Collected',   value: depositTotal ? formatCents(depositTotal) : '—', color: '#22C55E' },
    { label: 'Conversion Rate',      value: '—' },
    { label: 'Avg Wait Time',        value: '—' },
  ];

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BreadcrumbTopBar
        title={['Orders', 'Pre-Order Manager']}
        rightContent={
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => toast.info('Create pre-order coming soon')}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
          >
            <Plus size={14} />
            Create Pre-Order
          </motion.button>
        }
      />

      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center">
          <h1 className="text-foreground font-secondary text-[20px] font-bold">
            Pre-Order Manager
          </h1>
          <div className="flex-1" />
          <div className="flex items-center gap-2 w-[240px] px-2 py-1.5 rounded-sm border border-border">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
            />
            {search && <X size={14} className="text-foreground cursor-pointer shrink-0" onClick={() => handleSearch('')} />}
          </div>
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

        {/* Table card with tabs inside */}
        <div className="flex flex-col bg-card rounded-xl border border-border overflow-hidden">
          {/* Tabs inside card */}
          <div className="flex gap-1 px-4" style={{ borderBottom: '1px solid var(--border)' }}>
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => handleTabChange(t.value)}
                className={`px-3 py-1.5 my-1 rounded-full font-secondary text-sm font-medium transition-all ${
                  activeTab === t.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Column headers */}
          <div className="flex items-center px-4 py-2.5 bg-secondary">
            {cols.map((col) => (
              <span
                key={col.label}
                className={`${col.w} shrink-0 text-muted-foreground ${col.mono ? 'font-primary' : 'font-secondary'} text-[10px] font-semibold`}
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
              <span className="text-muted-foreground font-secondary text-sm">No pre-orders found</span>
            </div>
          )}

          {/* Rows */}
          {!loading && orders.map((row, i) => {
            const sc = statusColor(row.status);
            const act = actionType(row.status);
            const isReady = ['ready_to_fulfill', 'ready'].includes((row.status || '').toLowerCase());
            const etaDate = row.estimated_availability || row.estimatedAvailability || row.eta;

            return (
              <div
                key={row.id}
                className="flex items-center px-4 py-2.5"
                style={i < orders.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
              >
                <span className="w-[110px] shrink-0 text-foreground font-primary text-[11px] font-semibold">
                  {row.order_number || row.orderNumber || `PRE-${row.id}`}
                </span>
                <span className="flex-1 shrink-0 text-foreground font-secondary text-xs">
                  {row.customer_name || row.customerName || '—'}
                </span>
                <span className="flex-1 shrink-0 text-foreground font-secondary text-xs">
                  {row.product_name || row.productName || '—'}
                </span>
                <span className="w-[80px] shrink-0 text-[#22C55E] font-primary text-[11px] font-semibold">
                  {formatCents(row.deposit_cents || row.depositCents)}
                </span>
                <div className="w-[110px] shrink-0">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full font-primary text-[9px] font-medium"
                    style={{ backgroundColor: `${sc}15`, color: sc }}
                  >
                    {displayStatus(row.status)}
                  </span>
                </div>
                <span
                  className="w-[100px] shrink-0 font-secondary text-[11px]"
                  style={{
                    color: isReady ? '#22C55E' : 'var(--foreground)',
                    fontWeight: isReady ? 600 : 'normal',
                  }}
                >
                  {isReady ? 'In Stock' : formatDate(etaDate)}
                </span>
                <div className="w-[100px] shrink-0">
                  <ActionButton type={act} onClick={() => handleAction(row, act)} />
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
              label="pre-orders"
              onPageChange={setPage}
            />
          )}
        </div>
      </div>
    </div>
  );
}
