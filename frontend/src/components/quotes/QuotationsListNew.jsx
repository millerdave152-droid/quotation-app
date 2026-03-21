/**
 * QuotationsListNew.jsx
 * Screen 8 — Quotations Dashboard / List (Pencil frame CZwuw)
 * Full-width layout: stats, filters, data table
 * Toggle between List view and Pipeline (Kanban) view
 * Fully wired to live API endpoints
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  ChevronDown,
  ArrowDown,
  Kanban,
  List as ListIcon,
  Eye,
  Pencil,
  Trash2,
  FileText,
  X,
  RefreshCw,
} from 'lucide-react';
import { authFetch } from '../../services/authFetch';
import PaginationBar from '../shared/PaginationBar';
import { useToast } from '../ui/Toast';

// ─── Constants ──────────────────────────────────────────────────

const STATUS_STYLES = {
  DRAFT: 'text-amber-600 bg-amber-500/10',
  SENT: 'text-blue-600 bg-blue-500/10',
  WON: 'text-emerald-600 bg-emerald-500/10',
  LOST: 'text-red-600 bg-red-500/10',
  EXPIRED: 'text-red-500 bg-red-500/10',
  PENDING_APPROVAL: 'text-purple-600 bg-purple-500/10',
};

// Map filter tab labels → API status param
const TAB_STATUS = {
  All: '',
  Draft: 'draft',
  Sent: 'sent',
  Won: 'won',
  Lost: 'lost',
  Pending: 'pending_approval',
  'Expiring Soon': 'expiring_soon',
  'High Value': 'high_value',
  Recent: 'recent',
  'No Customer': 'no_customer',
};

// Map filter tab labels → key in filterCounts response
const TAB_COUNT_KEY = {
  All: 'all',
  Draft: 'draft',
  Sent: 'sent',
  Won: 'won',
  Lost: 'lost',
  Pending: 'pending_approval',
  'Expiring Soon': 'expiring_soon',
  'High Value': 'high_value',
  Recent: 'recent',
  'No Customer': 'no_customer',
};

const TAB_LABELS = ['All', 'Draft', 'Sent', 'Won', 'Lost', 'Pending', 'Expiring Soon', 'High Value', 'Recent', 'No Customer'];

const PIPELINE_STATUSES = [
  { key: 'draft', title: 'Draft', color: '#6B7280' },
  { key: 'sent', title: 'Sent', color: '#3B82F6' },
  { key: 'won', title: 'Won', color: '#22C55E' },
  { key: 'lost', title: 'Lost', color: '#EF4444' },
];

// ─── Helpers ────────────────────────────────────────────────────

function getQuoteNumber(q) {
  return q.quotation_number || q.quotationNumber || q.quote_number || `Q-${q.id}`;
}

function getCustomerName(q) {
  return q.customer_name || q.customer?.name || q.customerName || '—';
}

function getCustomerCompany(q) {
  return q.customer_company || q.customer?.company || q.customerCompany || null;
}

function getTotal(q) {
  const cents = q.total_amount_cents ?? q.total_cents ?? q.totalCents ?? q.totalAmountCents;
  if (cents != null) return cents / 100;
  const dollars = q.total_amount ?? q.total ?? q.totalAmount;
  if (dollars != null) return parseFloat(dollars);
  return 0;
}

function getStatus(q) {
  return (q.status || 'DRAFT').toUpperCase();
}

function isExpired(q) {
  if (!q.valid_until && !q.validUntil && !q.expiry_date && !q.expiryDate) return false;
  const d = new Date(q.valid_until || q.validUntil || q.expiry_date || q.expiryDate);
  return d < new Date();
}

function formatCurrency(val) {
  const num = typeof val === 'number' && !isNaN(val) ? val : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ──────────────────────────────────────────────────

export default function QuotationsListNew() {
  const navigate = useNavigate();
  const { addToast } = useToast?.() || {};

  // Data state
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [filterCounts, setFilterCounts] = useState({});

  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [viewMode, setViewMode] = useState('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  const searchTimer = useRef(null);
  const abortRef = useRef(null);

  // ── Fetch quotations list ──
  const fetchQuotations = useCallback(async (page = 1, search = '', status = '') => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(perPage),
        sortBy: 'created_at',
        sortOrder: 'DESC',
      });
      if (search) params.set('search', search);
      if (status) params.set('status', status);

      const res = await authFetch(`/api/quotations?${params}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const list = json.quotations || json.data || [];
      const pagination = json.pagination || json.meta?.pagination || {};

      setQuotations(list);
      setTotalCount(pagination.total ?? pagination.totalItems ?? list.length);
      setCurrentPage(pagination.page ?? pagination.currentPage ?? page);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('fetchQuotations error:', err);
        addToast?.('Failed to load quotations', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [perPage, addToast]);

  // ── Fetch stats summary ──
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await authFetch('/api/quotations/stats/summary');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setStats(json.data || json);
    } catch (err) {
      console.error('fetchStats error:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ── Fetch filter counts ──
  const fetchFilterCounts = useCallback(async () => {
    try {
      const res = await authFetch('/api/quotations/stats/filter-counts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setFilterCounts(json.data?.filterCounts || json.filterCounts || json.data || json);
    } catch (err) {
      console.error('fetchFilterCounts error:', err);
    }
  }, []);

  // ── Initial load ──
  useEffect(() => {
    fetchQuotations(1, '', '');
    fetchStats();
    fetchFilterCounts();
    return () => { if (abortRef.current) abortRef.current.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced search ──
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setCurrentPage(1);
      fetchQuotations(1, val, TAB_STATUS[activeTab] || '');
    }, 300);
  };

  const clearSearch = () => {
    setSearchTerm('');
    setCurrentPage(1);
    fetchQuotations(1, '', TAB_STATUS[activeTab] || '');
  };

  // ── Tab click → filter by status ──
  const handleTabClick = (label) => {
    setActiveTab(label);
    setCurrentPage(1);
    fetchQuotations(1, searchTerm, TAB_STATUS[label] || '');
  };

  // ── Pagination ──
  const handlePageChange = (page) => {
    setCurrentPage(page);
    fetchQuotations(page, searchTerm, TAB_STATUS[activeTab] || '');
  };

  // ── Actions ──
  const handleView = (q) => navigate(`/quotes/${q.id}`);
  const handleEdit = (q) => navigate(`/quotes/${q.id}?edit=true`);

  const handleDelete = async (q) => {
    const label = getQuoteNumber(q);
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    try {
      const res = await authFetch(`/api/quotations/${q.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addToast?.(`${label} deleted`, 'success');
      fetchQuotations(currentPage, searchTerm, TAB_STATUS[activeTab] || '');
      fetchStats();
      fetchFilterCounts();
    } catch (err) {
      console.error('delete error:', err);
      addToast?.('Failed to delete quotation', 'error');
    }
  };

  const handleRefresh = () => {
    fetchQuotations(currentPage, searchTerm, TAB_STATUS[activeTab] || '');
    fetchStats();
    fetchFilterCounts();
  };

  // ── Stat card data from API ──
  const statCards = stats
    ? [
        {
          label: 'Total Quotes',
          value: String(stats.total_quotes ?? stats.totalQuotes ?? 0),
          accent: 'border-t-blue-500',
        },
        {
          label: 'Total Value',
          value: formatCurrency(parseFloat(stats.total_value ?? stats.totalValue ?? 0)),
          accent: 'border-t-emerald-500',
        },
        {
          label: 'Won Value',
          value: formatCurrency(parseFloat(stats.won_value ?? stats.wonValue ?? 0)),
          accent: 'border-t-amber-500',
        },
        {
          label: 'Expiring Soon',
          value: String(filterCounts.expiring_soon ?? filterCounts.expringSoon ?? 0),
          accent: 'border-t-orange-500',
          subtitle: 'Within 7 days',
        },
      ]
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col overflow-auto p-6 gap-5"
    >
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-primary text-2xl font-semibold tracking-tight text-foreground">
            Quotations
          </h1>
          <p className="font-secondary text-sm text-muted-foreground mt-0.5">
            Manage and track all your quotations
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleRefresh}
            className="h-9 px-3.5 rounded-lg border border-border bg-card font-secondary text-sm font-medium text-foreground shadow-sm hover:shadow transition flex items-center gap-1.5"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="h-9 px-3.5 rounded-lg border border-border bg-card font-secondary text-sm font-medium text-foreground shadow-sm hover:shadow transition">
            Dashboard
          </button>
          <button className="h-9 px-3.5 rounded-lg border border-border bg-card font-secondary text-sm font-medium text-foreground shadow-sm hover:shadow transition">
            Analytics
          </button>
          <button className="h-9 px-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 font-secondary text-sm font-medium text-emerald-600 hover:bg-emerald-500/10 transition">
            Approvals
          </button>
          <button className="h-9 px-3.5 rounded-lg border border-orange-500/30 bg-orange-500/5 font-secondary text-sm font-medium text-orange-600 hover:bg-orange-500/10 transition">
            Follow-Ups
          </button>
          <button className="h-9 px-3.5 rounded-lg bg-destructive font-secondary text-sm font-medium text-white shadow-sm hover:shadow transition">
            Export
          </button>
          {/* View Toggle */}
          <div className="flex h-9 rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 font-secondary text-sm transition-colors ${
                viewMode === 'list'
                  ? 'bg-card text-foreground font-medium shadow-sm'
                  : 'bg-muted/30 text-muted-foreground'
              }`}
            >
              <ListIcon size={14} /> List
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              className={`flex items-center gap-1.5 px-3 font-secondary text-sm transition-colors ${
                viewMode === 'pipeline'
                  ? 'bg-card text-foreground font-medium shadow-sm'
                  : 'bg-muted/30 text-muted-foreground'
              }`}
            >
              <Kanban size={14} /> Pipeline
            </button>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/quotes/new')}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground font-secondary text-sm font-semibold shadow-sm hover:shadow transition"
          >
            + New Quote
          </motion.button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        {statsLoading || !statCards ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-5 animate-pulse"
            >
              <div className="h-3 w-20 bg-muted rounded mb-3" />
              <div className="h-8 w-28 bg-muted rounded" />
            </div>
          ))
        ) : (
          statCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className={`bg-gradient-to-br from-card to-card/50 rounded-xl border border-border ${card.accent} border-t-2 p-5 flex flex-col gap-1.5 shadow-sm hover:shadow-md transition-shadow`}
            >
              <span className="font-secondary text-xs font-medium text-muted-foreground">
                {card.label}
              </span>
              <div className="flex items-end justify-between">
                <span className="font-primary text-3xl font-bold tracking-tight text-foreground">
                  {card.value}
                </span>
              </div>
              {card.subtitle && (
                <span className="font-secondary text-xs font-medium text-orange-500">
                  {card.subtitle}
                </span>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {TAB_LABELS.map((label) => {
          const countKey = TAB_COUNT_KEY[label];
          const count = filterCounts[countKey] ?? '—';
          return (
            <button
              key={label}
              onClick={() => handleTabClick(label)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-full font-secondary text-xs font-medium transition-all ${
                activeTab === label
                  ? 'bg-foreground text-background shadow-sm'
                  : 'border border-border text-muted-foreground hover:border-primary hover:text-foreground'
              }`}
            >
              {label}
              <span
                className={
                  activeTab === label
                    ? 'flex items-center justify-center min-w-[20px] h-[18px] rounded-full bg-primary text-[11px] font-semibold text-primary-foreground px-1'
                    : 'text-[11px] text-muted-foreground/60'
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + Filter Bar */}
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3">
        <div className="relative flex-1 max-w-[340px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Search by quote #, customer, phone, SKU, mod"
            className="w-full h-9 pl-9 pr-8 bg-background border border-border rounded-lg font-secondary text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition"
          />
          {searchTerm && (
            <button
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <FilterDropdown label="All Status" />
        <FilterDropdown label="All Time" />
        <FilterDropdown label="All Values" />
        <div className="flex items-center h-9 px-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
          <span className="font-secondary text-xs font-medium text-orange-600">Expiring Soon</span>
        </div>
      </div>

      {/* Sort Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-secondary text-sm text-muted-foreground">Sort by:</span>
          <SortDropdown label="Date" />
          <SortDropdown label="Descending" hasArrow />
        </div>
        <div className="flex items-center gap-3">
          {(searchTerm || activeTab !== 'All') && (
            <button
              onClick={() => { setSearchTerm(''); setActiveTab('All'); setCurrentPage(1); fetchQuotations(1, '', ''); }}
              className="h-8 px-3 rounded-lg bg-foreground font-secondary text-xs font-medium text-background"
            >
              Clear Filters
            </button>
          )}
          <span className="font-secondary text-xs text-muted-foreground">
            {loading ? 'Loading…' : `Showing ${quotations.length} of ${totalCount}`}
          </span>
        </div>
      </div>

      {/* View: List Table OR Pipeline Kanban */}
      {viewMode === 'list' ? (
        <ListView
          quotations={quotations}
          loading={loading}
          onView={handleView}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      ) : (
        <PipelineView
          quotations={quotations}
          loading={loading}
          filterCounts={filterCounts}
          onView={handleView}
        />
      )}

      {/* Pagination */}
      {!loading && totalCount > perPage && (
        <PaginationBar
          current={currentPage}
          total={totalCount}
          perPage={perPage}
          label="quotations"
          onPageChange={handlePageChange}
        />
      )}
    </motion.div>
  );
}

// ─── List View (Data Table) ─────────────────────────────────────

function ListView({ quotations, loading, onView, onEdit, onDelete }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex-1">
        <div className="flex items-center h-11 px-4 bg-muted/50 border-b border-border/50">
          <div className="h-3 w-full bg-muted rounded animate-pulse" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center h-[50px] px-4 border-b border-border/50 gap-4">
            <div className="w-10 h-4 bg-muted rounded animate-pulse" />
            <div className="w-[130px] h-4 bg-muted rounded animate-pulse" />
            <div className="flex-1 h-4 bg-muted rounded animate-pulse" />
            <div className="w-[100px] h-4 bg-muted rounded animate-pulse" />
            <div className="w-[80px] h-4 bg-muted rounded animate-pulse" />
            <div className="w-[80px] h-4 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (quotations.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm flex-1 flex flex-col items-center justify-center py-20 gap-3">
        <FileText size={48} className="text-muted-foreground/30" />
        <h3 className="font-secondary text-lg font-semibold text-foreground">No quotations found</h3>
        <p className="font-secondary text-sm text-muted-foreground">Try adjusting your search or filters</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex-1">
      {/* Table Header */}
      <div className="flex items-center h-11 px-4 bg-muted/50 border-b border-border/50">
        <div className="w-10 flex items-center justify-center">
          <div className="w-4 h-4 rounded border border-border" />
        </div>
        <div className="w-[130px] font-secondary text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quote #
        </div>
        <div className="flex-1 font-secondary text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Customer
        </div>
        <div className="w-[150px] font-secondary text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Status
        </div>
        <div className="w-[110px] font-secondary text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Total
        </div>
        <div className="w-[100px] font-secondary text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Date
        </div>
        <div className="w-[120px] font-secondary text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Actions
        </div>
      </div>

      {/* Table Rows */}
      {quotations.map((q, idx) => {
        const status = getStatus(q);
        const expired = isExpired(q);
        const company = getCustomerCompany(q);
        return (
          <motion.div
            key={q.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: idx * 0.03 }}
            className="group flex items-center h-[50px] px-4 border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => onView(q)}
          >
            <div className="w-10 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <div className="w-4 h-4 rounded border border-border" />
            </div>
            <div className="w-[130px] flex flex-col gap-px">
              <span className="font-secondary text-xs font-medium text-primary">{getQuoteNumber(q)}</span>
            </div>
            <div className="flex-1 flex flex-col gap-px">
              <span className="font-secondary text-xs font-semibold text-foreground">
                {getCustomerName(q)}
              </span>
              {company && (
                <span className="font-secondary text-[10px] text-muted-foreground">
                  {company}
                </span>
              )}
            </div>
            <div className="w-[150px] flex items-center gap-1.5">
              <span
                className={`rounded-full px-2.5 py-0.5 font-secondary text-xs font-medium ${
                  STATUS_STYLES[status] || STATUS_STYLES.DRAFT
                }`}
              >
                {status}
              </span>
              {expired && status !== 'EXPIRED' && (
                <span className="rounded-full px-2.5 py-0.5 font-secondary text-xs font-medium text-red-500 bg-red-500/10">
                  EXPIRED
                </span>
              )}
            </div>
            <div className="w-[110px]">
              <span className="font-primary text-sm font-semibold text-foreground">
                {formatCurrency(getTotal(q))}
              </span>
            </div>
            <div className="w-[100px]">
              <span className="font-secondary text-xs text-muted-foreground">
                {formatDate(q.created_at || q.createdAt)}
              </span>
            </div>
            <div
              className="w-[120px] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onView(q)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Eye size={14} />
              </button>
              <button
                onClick={() => onEdit(q)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => onDelete(q)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Pipeline / Kanban View ─────────────────────────────────────

function PipelineView({ quotations, loading, filterCounts, onView }) {
  // Group quotations by status
  const grouped = {};
  PIPELINE_STATUSES.forEach((s) => { grouped[s.key] = []; });
  quotations.forEach((q) => {
    const key = (q.status || 'draft').toLowerCase();
    if (grouped[key]) grouped[key].push(q);
  });

  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-4 flex-1 min-h-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col rounded-xl border border-border bg-card/50 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-border/50 bg-card">
              <div className="h-4 w-20 bg-muted rounded animate-pulse" />
            </div>
            <div className="flex-1 p-2 flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="bg-card rounded-xl border border-border p-3 animate-pulse">
                  <div className="h-3 w-24 bg-muted rounded mb-2" />
                  <div className="h-3 w-32 bg-muted rounded mb-2" />
                  <div className="h-4 w-20 bg-muted rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-4 flex-1 min-h-0">
      {PIPELINE_STATUSES.map((col) => {
        const cards = grouped[col.key] || [];
        const count = filterCounts[col.key] ?? cards.length;
        return (
          <div
            key={col.key}
            className="flex flex-col rounded-xl border border-border bg-card/50 overflow-hidden"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 bg-card">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: col.color }}
                />
                <span className="font-secondary text-sm font-semibold text-foreground">
                  {col.title}
                </span>
              </div>
              <span
                className="flex items-center justify-center min-w-[24px] h-[20px] rounded-full px-1.5 font-secondary text-[11px] font-semibold text-white"
                style={{ backgroundColor: col.color }}
              >
                {count}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
              {cards.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-8">
                  <span className="font-secondary text-xs text-muted-foreground">No quotes</span>
                </div>
              ) : (
                cards.map((q, idx) => (
                  <motion.div
                    key={q.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.06 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => onView(q)}
                    className="bg-card rounded-xl border border-border p-3 flex flex-col gap-2 cursor-pointer shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-secondary text-[11px] font-medium text-primary">
                        {getQuoteNumber(q)}
                      </span>
                      <span className="font-secondary text-[10px] text-muted-foreground">
                        {formatDateShort(q.created_at || q.createdAt)}
                      </span>
                    </div>
                    <span className="font-secondary text-xs font-semibold text-foreground">
                      {getCustomerName(q)}
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="font-primary text-sm font-bold text-foreground">
                        {formatCurrency(getTotal(q))}
                      </span>
                      <span
                        className="font-secondary text-[10px] font-semibold text-white px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: col.color }}
                      >
                        {col.title.toUpperCase()}
                      </span>
                    </div>
                  </motion.div>
                ))
              )}

              {/* Drop zone hint */}
              <div className="border-2 border-dashed border-border rounded-xl h-16 flex items-center justify-center mt-auto">
                <span className="font-secondary text-[11px] text-muted-foreground">
                  Drop quote here
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared Sub-components ──────────────────────────────────────

function FilterDropdown({ label }) {
  return (
    <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg h-9 px-3 cursor-pointer hover:border-primary transition">
      <span className="font-secondary text-xs font-medium text-foreground">{label}</span>
      <ChevronDown size={12} className="text-muted-foreground" />
    </div>
  );
}

function SortDropdown({ label, hasArrow }) {
  return (
    <div className="flex items-center gap-1 bg-card border border-border rounded-lg h-8 px-2.5 cursor-pointer hover:border-primary transition">
      {hasArrow && <ArrowDown size={12} className="text-foreground" />}
      <span className="font-secondary text-xs font-medium text-foreground">{label}</span>
      {!hasArrow && <ChevronDown size={12} className="text-muted-foreground" />}
    </div>
  );
}
