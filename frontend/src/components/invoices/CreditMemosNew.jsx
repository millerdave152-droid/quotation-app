/**
 * CreditMemosNew.jsx — Screen 74
 * TeleTime Design System · Credit Memos
 * Design frame: Uys5G
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  X,
  Download,
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
  if (!cents && cents !== 0) return '—';
  return `-$${Math.abs(Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusStyle(status) {
  const map = {
    draft:   { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B', label: 'Draft' },
    issued:  { bg: 'rgba(59,130,246,0.08)',  color: '#3B82F6', label: 'Issued' },
    applied: { bg: 'rgba(34,197,94,0.08)',   color: '#22C55E', label: 'Applied' },
    voided:  { bg: 'rgba(100,116,139,0.08)', color: '#64748B', label: 'Voided' },
  };
  return map[status] || { bg: 'rgba(100,116,139,0.08)', color: '#64748B', label: status || '—' };
}

const TABS = [
  { label: 'All Memos', value: '' },
  { label: 'Draft',     value: 'draft' },
  { label: 'Issued',    value: 'issued' },
  { label: 'Applied',   value: 'applied' },
  { label: 'Voided',    value: 'voided' },
];

const cols = [
  { label: 'Credit Memo #', w: 'flex-1' },
  { label: 'Order #',       w: 'w-[100px]' },
  { label: 'Customer',      w: 'flex-1' },
  { label: 'Reason',        w: 'w-[130px]' },
  { label: 'Amount',        w: 'w-[100px]' },
  { label: 'Date',          w: 'w-[100px]' },
  { label: 'Status',        w: 'w-[90px]' },
  { label: '',              w: 'w-[60px]' },
];

/* ------------------------------------------------------------------ */
/*  Inline hook                                                        */
/* ------------------------------------------------------------------ */

function useCreditMemos(initialFilters = {}) {
  const [memos, setMemos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1, limit: 20, total: 0, totalPages: 0,
  });
  const [filters, setFilters] = useState({
    search: '', status: '', ...initialFilters,
  });

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (filters.search) params.set('search', filters.search);
      if (filters.status) params.set('status', filters.status);

      const res = await apiClient.get(`/api/credit-memos?${params}`);
      // Response wrapped: { success, data: { data: [...], total, page, limit, totalPages } }
      const payload = res.data?.data || res.data;
      setMemos(payload.data || []);
      setPagination((p) => ({
        ...p,
        total: payload.total || 0,
        totalPages: payload.totalPages || 0,
        page: payload.page || p.page,
      }));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => { fetch(); }, [fetch]);

  const updateFilters = (newFilters) => {
    setFilters((f) => ({ ...f, ...newFilters }));
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const setPage = (page) => setPagination((p) => ({ ...p, page }));

  return { memos, loading, pagination, filters, updateFilters, setPage, refresh: fetch };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CreditMemosNew() {
  const toast = useToast();
  const debounceRef = useRef(null);
  const [activeTab, setActiveTab] = useState('');
  const [search, setSearch] = useState('');

  const {
    memos, loading, pagination,
    updateFilters, setPage,
  } = useCreditMemos();

  /* ── Search debounce ── */
  const handleSearch = (value) => {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilters({ search: value });
    }, 300);
  };

  /* ── Tab change ── */
  const handleTabChange = (value) => {
    setActiveTab(value);
    updateFilters({ status: value });
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <BreadcrumbTopBar
        title={['Invoices', 'Credit Memos']}
        rightContent={
          <div className="flex items-center gap-2.5">
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
              onClick={() => toast.info('Create credit memo coming soon')}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium"
            >
              <Plus size={16} />
              Create Credit Memo
            </motion.button>
          </div>
        }
      />

      <div className="flex-1 flex flex-col gap-5 p-6 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-foreground font-primary text-[22px] font-bold">Credit Memos</h1>
          <div className="flex items-center gap-2 w-[260px] h-10 px-3 rounded-lg border border-input bg-background">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search credit memos..."
              className="flex-1 bg-transparent text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
            />
            {search && <X size={16} className="text-foreground cursor-pointer shrink-0" onClick={() => handleSearch('')} />}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className="px-3 py-1.5 rounded-full font-secondary text-sm transition-colors"
              style={{
                backgroundColor: activeTab === tab.value ? 'var(--background)' : 'transparent',
                color: activeTab === tab.value ? 'var(--foreground)' : 'var(--muted-foreground)',
                fontWeight: activeTab === tab.value ? 500 : 'normal',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="flex flex-col bg-card rounded-xl border border-border overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center px-4 py-2.5 bg-secondary" style={{ borderBottom: '1px solid var(--border)' }}>
            {cols.map((col, ci) => (
              <span key={col.label || `act-${ci}`} className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[10px] font-semibold uppercase`}>
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
          {!loading && memos.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <span className="text-muted-foreground font-secondary text-sm">No credit memos found</span>
            </div>
          )}

          {/* Rows */}
          {!loading && memos.map((row, i) => {
            const style = statusStyle(row.status);
            return (
              <div
                key={row.id}
                className="flex items-center px-4 py-2.5 hover:bg-secondary/50 transition-colors"
                style={i < memos.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
              >
                <span className="flex-1 shrink-0 text-primary font-primary text-[11px] font-semibold">
                  {row.creditMemoNumber || 'Draft'}
                </span>
                <span className="w-[100px] shrink-0 text-foreground font-primary text-[11px]">
                  {row.orderNumber || '—'}
                </span>
                <span className="flex-1 shrink-0 text-foreground font-secondary text-xs truncate pr-2">
                  {row.customerName || '—'}
                </span>
                <span className="w-[130px] shrink-0 text-muted-foreground font-secondary text-[11px] truncate pr-2">
                  {row.reason || row.reasonCode || '—'}
                </span>
                <span className="w-[100px] shrink-0 text-[#EF4444] font-primary text-[11px] font-medium">
                  {formatCents(row.totalCents)}
                </span>
                <span className="w-[100px] shrink-0 text-muted-foreground font-secondary text-[11px]">
                  {formatDate(row.createdAt)}
                </span>
                <div className="w-[90px] shrink-0">
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full font-secondary text-[10px] font-medium"
                    style={{ backgroundColor: style.bg, color: style.color }}
                  >
                    {style.label}
                  </span>
                </div>
                <div className="w-[60px] shrink-0 flex justify-end">
                  <button
                    onClick={() => toast.info(`View credit memo ${row.creditMemoNumber || row.id}`)}
                    className="p-1.5 rounded-md hover:bg-secondary transition-colors"
                  >
                    <Eye size={14} className="text-muted-foreground" />
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
              label="credit memos"
              onPageChange={setPage}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}
