/**
 * SerialNumberRegistryNew.jsx — Screen 37
 * TeleTime Design System · Serial Number Registry
 * Design frame: 3Xnn2
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Download, Plus, Search, X, Loader2 } from 'lucide-react';
// import LunarisSidebar from '../shared/LunarisSidebar'; // removed — MainLayout provides sidebar
import PaginationBar from '../shared/PaginationBar';
import { useToast } from '../ui/Toast';
import apiClient from '../../services/apiClient';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusStyle(status) {
  const s = (status || '').toLowerCase();
  const map = {
    active:       { bg: 'rgba(34,197,94,0.08)',   color: '#22C55E', label: 'Active' },
    in_stock:     { bg: 'rgba(34,197,94,0.08)',   color: '#22C55E', label: 'In Stock' },
    sold:         { bg: 'rgba(59,130,246,0.08)',   color: '#3B82F6', label: 'Sold' },
    warranty:     { bg: 'rgba(34,197,94,0.08)',   color: '#22C55E', label: 'Warranty' },
    expiring:     { bg: 'rgba(245,158,11,0.08)',  color: '#F59E0B', label: 'Expiring' },
    expired:      { bg: 'rgba(239,68,68,0.08)',   color: '#EF4444', label: 'Expired' },
    rma:          { bg: 'rgba(239,68,68,0.08)',   color: '#EF4444', label: 'RMA' },
    returned:     { bg: 'rgba(239,68,68,0.08)',   color: '#EF4444', label: 'Returned' },
    defective:    { bg: 'rgba(239,68,68,0.08)',   color: '#EF4444', label: 'Defective' },
  };
  return map[s] || { bg: 'rgba(100,116,139,0.08)', color: '#64748B', label: status || '—' };
}

const TABS = [
  { label: 'Search',   value: 'search' },
  { label: 'Register', value: 'register' },
  { label: 'History',  value: 'history' },
  { label: 'Stats',    value: 'stats' },
];

const tableColumns = [
  { label: 'Serial Number', w: 'w-[150px]' },
  { label: 'Product',       w: 'w-[180px]' },
  { label: 'Customer',      w: 'w-[130px]' },
  { label: 'Registered',    w: 'w-[100px]' },
  { label: 'Warranty',      w: 'w-[80px]' },
  { label: 'Status',        w: 'w-[80px]' },
];

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useSerialStats() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/api/serial-numbers/stats');
        setStats(res.data?.data || res.data);
      } catch { /* ignore */ }
    })();
  }, []);

  return stats;
}

function useSerials() {
  const [serials, setSerials] = useState([]);
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
      if (filters.search) params.set('q', filters.search);
      if (filters.status) params.set('status', filters.status);

      const res = await apiClient.get(`/api/serial-numbers?${params}`);
      const payload = res.data?.data || res.data;
      const list = Array.isArray(payload) ? payload : (payload.serials || payload.serialNumbers || payload.data || []);
      setSerials(list);

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

  return { serials, loading, pagination, filters, updateFilters, setPage };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SerialNumberRegistryNew() {
  const toast = useToast();
  const debounceRef = useRef(null);
  const [activeTab, setActiveTab] = useState('search');
  const [search, setSearch] = useState('');

  const stats = useSerialStats();
  const { serials, loading, pagination, updateFilters, setPage } = useSerials();

  const handleSearch = (value) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilters({ search: value });
    }, 300);
  };

  const statCards = stats
    ? [
        { label: 'Total Registered',  value: stats.totalRegistered ?? stats.total_registered ?? stats.total ?? '—', color: 'text-foreground' },
        { label: 'Under Warranty',    value: stats.underWarranty ?? stats.under_warranty ?? stats.active ?? '—', color: 'text-[hsl(var(--color-success-foreground))]' },
        { label: 'Warranty Expiring', value: stats.warrantyExpiring ?? stats.warranty_expiring ?? stats.expiring ?? '—', color: 'text-[hsl(var(--color-warning-foreground))]' },
        { label: 'RMA Claims',        value: stats.rmaClaims ?? stats.rma_claims ?? stats.rma ?? '—', color: 'text-[hsl(var(--color-error-foreground))]' },
      ]
    : [
        { label: 'Total Registered', value: '—', color: 'text-foreground' },
        { label: 'Under Warranty', value: '—', color: 'text-[hsl(var(--color-success-foreground))]' },
        { label: 'Warranty Expiring', value: '—', color: 'text-[hsl(var(--color-warning-foreground))]' },
        { label: 'RMA Claims', value: '—', color: 'text-[hsl(var(--color-error-foreground))]' },
      ];

  return (
    <div className="flex-1 flex flex-col gap-5 p-7 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground font-primary text-[22px] font-bold">
              Serial Number Registry
            </h1>
            <p className="text-muted-foreground font-secondary text-[13px]">
              Track, register, and manage product serial numbers and warranty
              status
            </p>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toast.info('Export coming soon')}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-background border border-border text-foreground font-primary text-sm font-medium shadow-lu-sm"
            >
              <Download size={16} />
              Export
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toast.info('Register serial coming soon')}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
            >
              <Plus size={16} />
              Register Serial
            </motion.button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-3">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className="flex flex-col gap-1 bg-card border border-border rounded-lu-md p-4"
            >
              <span className="text-muted-foreground font-secondary text-[11px] font-medium">
                {stat.label}
              </span>
              <span className={`font-primary text-2xl font-bold ${stat.color}`}>
                {stat.value}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Tabs — secondary container style */}
        <div className="flex items-center gap-2 bg-secondary rounded-lu-pill p-1 h-10 self-start">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex items-center justify-center px-3 py-1.5 rounded-lu-pill font-secondary text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? 'bg-background text-foreground shadow-lu-sm'
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
          className="flex flex-col bg-card border border-border rounded-xl shadow-lu-sm overflow-hidden"
        >
          {/* Search bar */}
          <div className="flex items-center gap-3 px-5 py-3">
            <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-sm border border-border bg-background">
              <Search size={16} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search serial numbers..."
                className="flex-1 bg-transparent text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && <X size={14} className="text-foreground cursor-pointer shrink-0" onClick={() => handleSearch('')} />}
            </div>
          </div>

          {/* Column headers */}
          <div
            className="flex items-center px-4 py-2 bg-secondary"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            {tableColumns.map((col) => (
              <span
                key={col.label}
                className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[11px] font-semibold`}
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
          {!loading && serials.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <span className="text-muted-foreground font-secondary text-sm">No serial numbers found</span>
            </div>
          )}

          {/* Rows */}
          {!loading && serials.map((row) => {
            const badge = statusStyle(row.status);
            return (
              <div
                key={row.id}
                className="flex items-center px-4 py-2.5"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="w-[150px] shrink-0 text-primary font-primary text-[12px] font-medium">
                  {row.serial_number || row.serialNumber || '—'}
                </span>
                <span className="w-[180px] shrink-0 text-foreground font-secondary text-[12px] font-medium">
                  {row.product_name || row.productName || '—'}
                </span>
                <span className="w-[130px] shrink-0 text-foreground font-secondary text-[12px]">
                  {row.customer_name || row.customerName || '—'}
                </span>
                <span className="w-[100px] shrink-0 text-muted-foreground font-secondary text-[12px]">
                  {formatDate(row.registered_at || row.registeredAt || row.created_at || row.createdAt)}
                </span>
                <span className="w-[80px] shrink-0 text-foreground font-secondary text-[12px]">
                  {row.warranty_period || row.warrantyPeriod || '—'}
                </span>
                <div className="w-[80px] shrink-0">
                  <span
                    className="inline-flex items-center justify-center w-full px-2 py-[2px] rounded-full font-secondary text-[10px] font-semibold"
                    style={{ backgroundColor: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>
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
              label="serial numbers"
              onPageChange={setPage}
            />
          )}
        </motion.div>
      </div>
  );
}
