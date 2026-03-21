/**
 * WorkOrderDashboardNew.jsx — Screen 52
 * TeleTime Design System · Work Order Dashboard
 * Design frame: U1SOG
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, X, Loader2 } from 'lucide-react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';
import PaginationBar from '../shared/PaginationBar';
import { useToast } from '../ui/Toast';
import apiClient from '../../services/apiClient';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function priorityColor(priority) {
  const p = (priority || '').toLowerCase();
  const map = { high: '#EF4444', urgent: '#EF4444', medium: '#F59E0B', low: '#22C55E' };
  return map[p] || '#64748B';
}

function statusColor(status) {
  const s = (status || '').toLowerCase();
  const map = {
    in_progress: '#3B82F6',
    scheduled:   '#8B5CF6',
    completed:   '#22C55E',
    overdue:     '#EF4444',
    cancelled:   '#EF4444',
    pending:     '#F59E0B',
    open:        '#F59E0B',
  };
  return map[s] || '#64748B';
}

function displayStatus(status) {
  if (!status) return '—';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const TABS = [
  { label: 'All Work Orders', value: '' },
  { label: 'In Progress',     value: 'in_progress' },
  { label: 'Scheduled',       value: 'scheduled' },
  { label: 'Completed',       value: 'completed' },
];

const cols = [
  { label: 'WO #',        w: 'w-[110px]', mono: true },
  { label: 'Description', w: 'flex-1' },
  { label: 'Assigned To', w: 'w-[120px]' },
  { label: 'Priority',    w: 'w-[80px]' },
  { label: 'Status',      w: 'w-[90px]' },
  { label: 'Due Date',    w: 'w-[90px]' },
  { label: 'Actions',     w: 'w-[80px]' },
];

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useWOStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/api/work-orders/stats');
        setStats(res.data?.data || res.data);
      } catch { /* ignore */ }
    })();
  }, []);

  return stats;
}

function useWorkOrders() {
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

      const res = await apiClient.get(`/api/work-orders?${params}`);
      const payload = res.data?.data || res.data;
      const list = Array.isArray(payload) ? payload : (payload.workOrders || payload.orders || payload.data || []);
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

export default function WorkOrderDashboardNew() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('');
  const [search, setSearch] = useState('');
  const stats = useWOStats();
  const { orders, loading, pagination, updateFilters, setPage } = useWorkOrders();

  const handleTabChange = (value) => {
    setActiveTab(value);
    updateFilters({ status: value });
  };

  const kpis = stats
    ? [
        { label: 'Active WOs',      value: stats.activeCount ?? stats.active_count ?? '—' },
        { label: 'Completion Rate',  value: stats.completionRate ?? stats.completion_rate ?? '—', color: '#22C55E' },
        { label: 'Avg Duration',     value: stats.avgDuration ?? stats.avg_duration ?? '—' },
        { label: 'Overdue',          value: stats.overdueCount ?? stats.overdue_count ?? '—', color: '#EF4444' },
      ]
    : [
        { label: 'Active WOs', value: '—' },
        { label: 'Completion Rate', value: '—', color: '#22C55E' },
        { label: 'Avg Duration', value: '—' },
        { label: 'Overdue', value: '—', color: '#EF4444' },
      ];

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BreadcrumbTopBar
        title={['Orders', 'Work Orders']}
        rightContent={
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => toast.info('Create work order coming soon')}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
          >
            <Plus size={14} />
            Create Work Order
          </motion.button>
        }
      />

      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center">
          <h1 className="text-foreground font-secondary text-[20px] font-bold">
            Work Order Dashboard
          </h1>
          <div className="flex-1" />
          <div className="flex items-center gap-2 w-[240px] px-2 py-1.5 rounded-sm border border-border">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
            />
            {search && <X size={14} className="text-foreground cursor-pointer shrink-0" onClick={() => setSearch('')} />}
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
              <span className="text-muted-foreground font-secondary text-sm">No work orders found</span>
            </div>
          )}

          {/* Rows */}
          {!loading && orders.map((row, i) => {
            const sc = statusColor(row.status);
            const pc = priorityColor(row.priority);
            const isOverdue = row.due_date && new Date(row.due_date) < new Date() && (row.status || '').toLowerCase() !== 'completed';
            return (
              <div
                key={row.id}
                className="flex items-center px-4 py-2.5"
                style={i < orders.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
              >
                <span className="w-[110px] shrink-0 text-foreground font-primary text-[11px] font-semibold">
                  {row.wo_number || row.woNumber || `WO-${row.id}`}
                </span>
                <span className="flex-1 shrink-0 text-foreground font-secondary text-xs">
                  {row.description || row.title || '—'}
                </span>
                <span className="w-[120px] shrink-0 text-foreground font-secondary text-[11px]">
                  {row.assigned_to_name || row.assignedToName || '—'}
                </span>
                <div className="w-[80px] shrink-0">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full font-primary text-[9px] font-medium"
                    style={{ backgroundColor: `${pc}15`, color: pc }}
                  >
                    {row.priority ? row.priority.charAt(0).toUpperCase() + row.priority.slice(1).toLowerCase() : '—'}
                  </span>
                </div>
                <div className="w-[90px] shrink-0">
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
                    color: isOverdue ? '#EF4444' : 'var(--foreground)',
                    fontWeight: isOverdue ? 600 : 'normal',
                  }}
                >
                  {formatDate(row.due_date || row.dueDate || row.scheduled_date || row.scheduledDate)}
                </span>
                <div className="w-[80px] shrink-0">
                  <button
                    onClick={() => toast.info(`View work order ${row.wo_number || row.woNumber || row.id}`)}
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
              label="work orders"
              onPageChange={setPage}
            />
          )}
        </div>
      </div>
    </div>
  );
}
