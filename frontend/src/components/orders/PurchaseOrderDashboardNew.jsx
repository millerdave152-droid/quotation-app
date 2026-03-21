/**
 * PurchaseOrderDashboardNew.jsx — Screen 28
 * TeleTime Design System · Purchase Order Dashboard
 * Design frame: 6wxXr
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Eye,
  Loader2,
} from 'lucide-react';
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

function statusBadge(status) {
  const s = (status || '').toLowerCase();
  const map = {
    draft:              { bg: 'rgba(100,116,139,0.08)', color: '#64748B' },
    pending:            { bg: 'rgba(245,158,11,0.08)',  color: '#F59E0B' },
    submitted:          { bg: 'rgba(59,130,246,0.08)',  color: '#3B82F6' },
    approved:           { bg: 'rgba(34,197,94,0.08)',   color: '#22C55E' },
    confirmed:          { bg: 'rgba(34,197,94,0.08)',   color: '#22C55E' },
    partially_received: { bg: 'rgba(59,130,246,0.08)',  color: '#3B82F6' },
    received:           { bg: 'rgba(34,197,94,0.08)',   color: '#22C55E' },
    cancelled:          { bg: 'rgba(239,68,68,0.08)',   color: '#EF4444' },
    overdue:            { bg: 'rgba(239,68,68,0.08)',   color: '#EF4444' },
  };
  return map[s] || { bg: 'rgba(100,116,139,0.08)', color: '#64748B' };
}

function displayStatus(status) {
  if (!status) return '—';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const TABS = [
  { label: 'All Orders',  value: '' },
  { label: 'Pending',     value: 'pending' },
  { label: 'Approved',    value: 'approved' },
  { label: 'Received',    value: 'received' },
  { label: 'Cancelled',   value: 'cancelled' },
];

const tableColumns = [
  { label: 'PO #',     w: 'w-[110px]' },
  { label: 'Vendor',   w: 'flex-1' },
  { label: 'Items',    w: 'w-[60px]' },
  { label: 'Total',    w: 'w-[90px]' },
  { label: 'Status',   w: 'w-[90px]' },
  { label: 'Expected', w: 'w-[90px]' },
  { label: 'Received', w: 'w-[80px]' },
  { label: 'Actions',  w: 'w-[80px]' },
];

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function usePOStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/api/purchase-orders/stats');
        setStats(res.data?.data || res.data);
      } catch { /* ignore */ }
    })();
  }, []);

  return stats;
}

function usePurchaseOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ search: '', status: '' });

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: ((pagination.page - 1) * pagination.limit).toString(),
      });
      if (filters.status) params.set('status', filters.status);

      const res = await apiClient.get(`/api/purchase-orders?${params}`);
      const payload = res.data?.data || res.data;
      const list = Array.isArray(payload) ? payload : (payload.purchaseOrders || payload.orders || payload.data || []);
      setOrders(list);

      // Compute pagination from response
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

export default function PurchaseOrderDashboardNew() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('');
  const stats = usePOStats();
  const { orders, loading, pagination, updateFilters, setPage } = usePurchaseOrders();

  const handleTabChange = (value) => {
    setActiveTab(value);
    updateFilters({ status: value });
  };

  /* Build KPI cards from stats */
  const kpiCards = stats
    ? [
        { label: 'Open POs',    value: stats.openCount ?? stats.open_count ?? '—', color: 'text-foreground' },
        { label: 'Total Value', value: stats.totalValueCents != null ? formatCents(stats.totalValueCents) : (stats.total_value_cents != null ? formatCents(stats.total_value_cents) : (stats.totalValue || '—')), color: 'text-foreground' },
        { label: 'Overdue',     value: stats.overdueCount ?? stats.overdue_count ?? '—', color: 'text-[#EF4444]' },
        { label: 'Vendors',     value: stats.vendorCount ?? stats.vendor_count ?? stats.vendors ?? '—', color: 'text-foreground' },
      ]
    : [
        { label: 'Open POs', value: '—', color: 'text-foreground' },
        { label: 'Total Value', value: '—', color: 'text-foreground' },
        { label: 'Overdue', value: '—', color: 'text-[#EF4444]' },
        { label: 'Vendors', value: '—', color: 'text-foreground' },
      ];

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BreadcrumbTopBar
        title={['Orders', 'Purchase Orders']}
        rightContent={
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => toast.info('Create purchase order coming soon')}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
          >
            <Plus size={14} />
            New Purchase Order
          </motion.button>
        }
      />

      {/* Body */}
      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* Title */}
        <h1 className="text-foreground font-secondary text-xl font-bold">
          Purchase Order Dashboard
        </h1>

        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-4">
          {kpiCards.map((kpi, i) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="flex flex-col gap-1 bg-card border border-border rounded-xl p-5"
            >
              <span className="text-muted-foreground font-secondary text-[11px]">
                {kpi.label}
              </span>
              <span className={`font-primary text-2xl font-bold ${kpi.color}`}>
                {kpi.value}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lu-pill font-primary text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? 'bg-background text-foreground shadow-lu-sm border border-border'
                  : 'text-muted-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table Card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="flex flex-col bg-card border border-border rounded-xl overflow-hidden"
        >
          {/* Table Header */}
          <div
            className="flex items-center px-4 py-2.5 bg-secondary"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            {tableColumns.map((col) => (
              <span
                key={col.label}
                className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[12px] font-semibold`}
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
              <span className="text-muted-foreground font-secondary text-sm">No purchase orders found</span>
            </div>
          )}

          {/* Table Rows */}
          {!loading && orders.map((row, i) => {
            const badge = statusBadge(row.status);
            const isOverdue = row.expected_date && new Date(row.expected_date) < new Date() && row.status !== 'received' && row.status !== 'cancelled';
            const itemCount = row.item_count ?? row.itemCount ?? row.items?.length ?? 0;
            const receivedCount = row.received_count ?? row.receivedCount ?? 0;

            return (
              <div
                key={row.id}
                className="flex items-center px-4 py-3"
                style={i < orders.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
              >
                <span className="w-[110px] shrink-0 text-foreground font-primary text-[11px] font-semibold">
                  {row.po_number || row.poNumber || `PO-${row.id}`}
                </span>
                <span className="flex-1 shrink-0 text-foreground font-secondary text-[12px]">
                  {row.vendor_name || row.vendorName || '—'}
                </span>
                <span className="w-[60px] shrink-0 text-foreground font-primary text-[11px]">
                  {itemCount}
                </span>
                <span className="w-[90px] shrink-0 text-foreground font-primary text-[11px] font-semibold">
                  {formatCents(row.total_cents || row.totalCents)}
                </span>
                <div className="w-[90px] shrink-0">
                  <span
                    className="inline-flex items-center px-2 py-[2px] rounded-full font-primary text-[9px] font-medium"
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                  >
                    {displayStatus(row.status)}
                  </span>
                </div>
                <span
                  className={`w-[90px] shrink-0 font-primary text-[11px] ${
                    isOverdue ? 'text-[#EF4444] font-semibold' : 'text-foreground'
                  }`}
                >
                  {formatDate(row.expected_date || row.expectedDate)}
                </span>
                <span className="w-[80px] shrink-0 font-primary text-[11px] text-muted-foreground">
                  {receivedCount}/{itemCount}
                </span>
                <div className="w-[80px] shrink-0">
                  <button
                    onClick={() => toast.info(`View PO ${row.po_number || row.poNumber || row.id}`)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lu-pill border border-border text-foreground font-primary text-[11px] font-medium hover:bg-secondary transition-colors"
                  >
                    <Eye size={12} />
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
              label="purchase orders"
              onPageChange={setPage}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}
