/**
 * InvoiceManagerNew.jsx — Screen 29
 * TeleTime Design System · Invoice Manager
 * Design frame: 6CMwb
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  Plus,
  Search,
  Eye,
  Trash2,
  FileText,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import BreadcrumbTopBar from '../shared/BreadcrumbTopBar';
import PaginationBar from '../shared/PaginationBar';
import { useToast } from '../ui/Toast';
import apiClient from '../../services/apiClient';
import InvoiceDetailNew from './InvoiceDetailNew';

/* ------------------------------------------------------------------ */
/*  Inline hook                                                        */
/* ------------------------------------------------------------------ */

function useInvoices(initialFilters = {}) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

      const res = await apiClient.get(`/api/invoices?${params}`);
      setInvoices(res.data.invoices || []);
      if (res.data.pagination) {
        setPagination((p) => ({ ...p, ...res.data.pagination }));
      }
    } catch (err) {
      setError(err?.message || err?.error || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => { fetch(); }, [fetch]);

  const updateFilters = (newFilters) => {
    setFilters((f) => ({ ...f, ...newFilters }));
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const setPage = (page) => setPagination((p) => ({ ...p, page }));

  return { invoices, loading, error, pagination, filters, updateFilters, setPage, refresh: fetch };
}

function useInvoiceSummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/api/invoices/summary');
        setSummary(res.data);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { summary, loading };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusBadge(status) {
  const map = {
    draft:          { className: 'text-gray-500 bg-gray-500/10', label: 'Draft' },
    sent:           { className: 'text-blue-600 bg-blue-500/10', label: 'Sent' },
    partially_paid: { className: 'text-amber-600 bg-amber-500/10', label: 'Partial' },
    paid:           { className: 'text-emerald-600 bg-emerald-500/10', label: 'Paid' },
    overdue:        { className: 'text-red-600 bg-red-500/10', label: 'Overdue' },
    void:           { className: 'text-gray-400 bg-gray-400/10', label: 'Void' },
  };
  return map[status] || { className: 'text-gray-500 bg-gray-500/10', label: status || '—' };
}

function formatCents(cents) {
  if (!cents && cents !== 0) return '—';
  return `$${(Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const TABLE_COLS = [
  { label: 'Invoice #',  w: 'w-[120px]' },
  { label: 'Customer',   w: 'flex-1' },
  { label: 'Amount',     w: 'w-[100px]' },
  { label: 'Date',       w: 'w-[100px]' },
  { label: 'Due Date',   w: 'w-[100px]' },
  { label: 'Balance',    w: 'w-[100px]' },
  { label: 'Status',     w: 'w-[90px]' },
  { label: 'Actions',    w: 'w-[70px]' },
];

const STATUS_TABS = [
  { label: 'All Invoices', value: '' },
  { label: 'Draft',        value: 'draft' },
  { label: 'Sent',         value: 'sent' },
  { label: 'Paid',         value: 'paid' },
  { label: 'Overdue',      value: 'overdue' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InvoiceManagerNew() {
  const toast = useToast();
  const debounceRef = useRef(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [activeTab, setActiveTab] = useState('');

  const {
    invoices, loading, pagination,
    updateFilters, setPage, refresh,
  } = useInvoices();

  const { summary, loading: summaryLoading } = useInvoiceSummary();

  /* ── Search debounce ── */
  const handleSearch = (e) => {
    const value = e.target.value;
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

  /* ── Void invoice ── */
  const handleVoid = async (invoiceId) => {
    const reason = window.prompt('Reason for voiding this invoice:');
    if (!reason) return;
    try {
      await apiClient.post(`/api/invoices/${invoiceId}/void`, { reason });
      toast.success('Invoice voided');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to void invoice');
    }
  };

  /* ── KPI cards from summary ── */
  const kpiCards = [
    {
      label: 'Total Invoices',
      value: summary ? Number(summary.total_invoices).toLocaleString() : '—',
      icon: FileText,
      iconColor: 'text-primary',
      valueColor: 'text-foreground',
      accent: 'border-t-primary',
    },
    {
      label: 'Outstanding',
      value: summary ? formatCents(summary.total_outstanding_cents) : '—',
      icon: DollarSign,
      iconColor: 'text-primary',
      valueColor: 'text-primary',
      accent: 'border-t-blue-500',
    },
    {
      label: 'Overdue',
      value: summary ? String(summary.overdue_count) : '—',
      icon: AlertTriangle,
      iconColor: 'text-red-500',
      valueColor: 'text-red-600',
      accent: 'border-t-red-500',
    },
    {
      label: 'Paid',
      value: summary ? formatCents(summary.total_paid_cents) : '—',
      icon: CheckCircle2,
      iconColor: 'text-emerald-500',
      valueColor: 'text-emerald-600',
      accent: 'border-t-emerald-500',
    },
  ];

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:0.2}} className="flex-1 flex flex-col overflow-hidden">
      <BreadcrumbTopBar
        title={['Invoices', 'Invoice Manager']}
        rightContent={
          <>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toast.info('Export coming soon')}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-background border border-border text-foreground font-secondary text-sm font-medium shadow-sm hover:shadow transition"
            >
              <Download size={16} />
              Export
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toast.info('Create invoice from quote or order')}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-primary text-primary-foreground font-secondary text-sm font-medium shadow-sm hover:shadow transition"
            >
              <Plus size={16} />
              Create Invoice
            </motion.button>
          </>
        }
      />

      {/* Body */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex-1 flex flex-col gap-5 p-6 overflow-auto"
      >
        {/* Header Row */}
        <div className="flex items-center justify-between">
          <h1 className="text-foreground font-primary text-2xl font-semibold tracking-tight">Invoice Manager</h1>
          <div className="relative w-[260px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search invoices..."
              onChange={handleSearch}
              className="w-full h-10 pl-9 pr-4 rounded-lg bg-background border border-border text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground focus:border-primary transition"
            />
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-4">
          {kpiCards.map((kpi, i) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className={`flex flex-col bg-gradient-to-br from-card to-card/50 border border-border ${kpi.accent} border-t-2 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden`}
            >
              <div className="flex items-center gap-2 px-4 py-2.5">
                <kpi.icon size={18} className={kpi.iconColor} />
                <span className="text-muted-foreground font-secondary text-xs font-medium">{kpi.label}</span>
              </div>
              <div className="px-4 pb-3">
                {summaryLoading ? (
                  <div className="h-8 w-16 rounded bg-muted animate-pulse" />
                ) : (
                  <span className={`font-primary text-3xl tracking-tight font-bold ${kpi.valueColor}`}>{kpi.value}</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center h-10 rounded-xl bg-muted/50 border border-border p-1 gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={`flex-1 flex items-center justify-center h-full rounded-lg font-secondary text-sm font-medium cursor-pointer transition-all ${
                activeTab === tab.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
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
          <div className="flex items-center px-4 py-2.5 bg-muted/50 border-b border-border/50">
            {TABLE_COLS.map((col) => (
              <span key={col.label} className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[11px] font-semibold uppercase tracking-wider`}>
                {col.label}
              </span>
            ))}
          </div>

          {/* Loading */}
          {loading && (
            <div className="px-4 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center h-11 gap-4 border-b border-border/50">
                  <div className="w-[120px] h-4 bg-muted rounded animate-pulse" />
                  <div className="flex-1 h-4 bg-muted rounded animate-pulse" />
                  <div className="w-[100px] h-4 bg-muted rounded animate-pulse" />
                  <div className="w-[100px] h-4 bg-muted rounded animate-pulse" />
                  <div className="w-[100px] h-4 bg-muted rounded animate-pulse" />
                  <div className="w-[100px] h-4 bg-muted rounded animate-pulse" />
                  <div className="w-[90px] h-4 bg-muted rounded animate-pulse" />
                  <div className="w-[70px] h-4 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {/* Empty */}
          {!loading && invoices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <FileText size={48} className="text-muted-foreground/30" />
              <h3 className="font-secondary text-lg font-semibold text-foreground">No invoices found</h3>
              <p className="font-secondary text-sm text-muted-foreground">Try adjusting your search or filters</p>
            </div>
          )}

          {/* Rows */}
          {!loading && invoices.map((inv, idx) => {
            const badge = statusBadge(inv.status);
            const isOverdue = inv.is_overdue || inv.status === 'overdue';
            return (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.03 }}
                className={`group flex items-center px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${isOverdue ? 'bg-red-500/5' : ''}`}
              >
                <span className="w-[120px] shrink-0 text-primary font-primary text-[11px] font-semibold">
                  {inv.invoice_number}
                </span>
                <div className="flex-1 shrink-0 flex flex-col">
                  <span className="text-foreground font-secondary text-[12px] font-medium truncate pr-2">
                    {inv.customer_name || '—'}
                  </span>
                  {inv.company && (
                    <span className="text-muted-foreground font-secondary text-[10px] truncate pr-2">
                      {inv.company}
                    </span>
                  )}
                </div>
                <span className="w-[100px] shrink-0 text-foreground font-primary text-[11px] font-semibold">
                  {formatCents(inv.total_cents)}
                </span>
                <span className="w-[100px] shrink-0 text-muted-foreground font-secondary text-[11px]">
                  {formatDate(inv.created_at)}
                </span>
                <span className={`w-[100px] shrink-0 font-secondary text-[11px] ${isOverdue ? 'text-red-600 font-bold' : 'text-muted-foreground'}`}>
                  {formatDate(inv.due_date)}
                </span>
                <span className={`w-[100px] shrink-0 font-primary text-[11px] font-semibold ${inv.balance_due_cents > 0 ? 'text-red-600 font-medium' : 'text-emerald-600'}`}>
                  {formatCents(inv.balance_due_cents)}
                </span>
                <div className="w-[90px] shrink-0">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="w-[70px] shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setSelectedInvoiceId(inv.id)}
                    className="p-1.5 rounded-md hover:bg-primary/10 transition-colors"
                    title="View"
                  >
                    <Eye size={14} className="text-primary" />
                  </button>
                  {inv.status !== 'void' && inv.status !== 'paid' && inv.status !== 'draft' && (
                    <button
                      onClick={() => handleVoid(inv.id)}
                      className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                      title="Void"
                    >
                      <Trash2 size={14} className="text-destructive" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}

          {/* Pagination */}
          {!loading && pagination.total > 0 && (
            <PaginationBar
              current={pagination.page}
              total={pagination.total}
              perPage={pagination.limit}
              label="invoices"
              onPageChange={setPage}
            />
          )}
        </motion.div>
      </motion.div>

      {/* Invoice Detail Panel */}
      {selectedInvoiceId && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedInvoiceId(null); }}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative">
            <InvoiceDetailNew
              invoiceId={selectedInvoiceId}
              onClose={() => { setSelectedInvoiceId(null); refresh(); }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
