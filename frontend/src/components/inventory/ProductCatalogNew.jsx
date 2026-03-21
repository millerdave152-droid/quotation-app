/**
 * ProductCatalogNew.jsx — Screen 27
 * TeleTime Design System · Product Catalog
 * Design frame: FVXlk
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Upload,
  Plus,
  Search,
  Download,
  LayoutGrid,
  List,
  X,
  Eye,
  Pencil,
  Trash2,
  Package,
} from 'lucide-react';
// import LunarisSidebar from '../shared/LunarisSidebar'; // removed — MainLayout provides sidebar
import PaginationBar from '../shared/PaginationBar';
import { useToast } from '../ui/Toast';
import apiClient from '../../services/apiClient';
import ProductDetailNew from './ProductDetailNew';

/* ------------------------------------------------------------------ */
/*  Inline hook                                                        */
/* ------------------------------------------------------------------ */

function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1, limit: 50, total: 0, totalPages: 0,
  });
  const [filters, setFilters] = useState({
    search: '', manufacturer: '', category: '',
    minPrice: '', maxPrice: '', sortBy: 'name', sortOrder: 'ASC',
    specFilters: {},
  });
  const [manufacturers, setManufacturers] = useState([]);
  const [categories, setCategories] = useState([]);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      Object.entries(filters).forEach(([k, v]) => {
        if (k === 'specFilters') {
          if (v && Object.keys(v).length > 0) params.set('specFilters', JSON.stringify(v));
        } else if (v) {
          params.set(k, v);
        }
      });
      const res = await apiClient.get(`/api/products?${params}`);
      setProducts(res.data.products || res.data || []);
      if (res.data.pagination) {
        setPagination((p) => ({ ...p, ...res.data.pagination }));
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => { fetch(); }, [fetch]);

  // Load manufacturers + categories once
  useEffect(() => {
    apiClient.get('/api/products/manufacturers')
      .then((r) => setManufacturers(r.data || []))
      .catch(() => {});
    apiClient.get('/api/categories/main')
      .then((r) => setCategories(r.data?.categories || r.data || []))
      .catch(() => {});
  }, []);

  const updateFilters = (f) => {
    setFilters((p) => ({ ...p, ...f }));
    setPagination((p) => ({ ...p, page: 1 }));
  };
  const setPage = (page) => setPagination((p) => ({ ...p, page }));

  return {
    products, loading, pagination, filters,
    manufacturers, categories, updateFilters, setPage, refresh: fetch,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCents(cents) {
  if (!cents && cents !== 0) return '—';
  return `$${(Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function calcMargin(msrp, cost) {
  if (!msrp || msrp === 0) return 0;
  return ((msrp - cost) / msrp * 100);
}

function marginBadge(margin) {
  if (margin >= 40) return { className: 'bg-emerald-500/10 text-emerald-600' };
  if (margin >= 20) return { className: 'bg-amber-500/10 text-amber-600' };
  return { className: 'bg-red-500/10 text-red-600' };
}

function stockBadge(status) {
  const map = {
    in_stock:     { className: 'text-emerald-600 bg-emerald-500/10', label: 'In Stock' },
    low_stock:    { className: 'text-amber-600 bg-amber-500/10', label: 'Low Stock' },
    out_of_stock: { className: 'text-red-600 bg-red-500/10', label: 'Out of Stock' },
  };
  return map[status] || { className: 'text-muted-foreground bg-muted', label: status || '—' };
}

const QUICK_PILLS = [
  { label: 'All', key: 'all', min: '', max: '' },
  { label: 'Under $500', key: 'u500', min: '', max: '500' },
  { label: '$500-$1K', key: '500-1k', min: '500', max: '1000' },
  { label: '$1K-$2K', key: '1k-2k', min: '1000', max: '2000' },
  { label: '$2K-$5K', key: '2k-5k', min: '2000', max: '5000' },
  { label: '$5K+', key: '5k+', min: '5000', max: '' },
];

const SORT_OPTIONS = [
  { label: 'Name A-Z', sortBy: 'name', sortOrder: 'ASC' },
  { label: 'Name Z-A', sortBy: 'name', sortOrder: 'DESC' },
  { label: 'Price Low-High', sortBy: 'msrp_cents', sortOrder: 'ASC' },
  { label: 'Price High-Low', sortBy: 'msrp_cents', sortOrder: 'DESC' },
  { label: 'Manufacturer', sortBy: 'manufacturer', sortOrder: 'ASC' },
];

const TABLE_COLS = [
  { label: 'Model',    w: 'w-[120px]' },
  { label: 'Name',     w: 'w-[200px]' },
  { label: 'Brand',    w: 'w-[120px]' },
  { label: 'Category', w: 'w-[110px]' },
  { label: 'Cost',     w: 'w-[80px]' },
  { label: 'MSRP',     w: 'w-[80px]' },
  { label: 'Margin',   w: 'w-[70px]' },
  { label: 'Stock',    w: 'w-[70px]' },
  { label: 'Actions',  w: 'w-[90px]' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProductCatalogNew() {
  const toast = useToast();
  const debounceRef = useRef(null);

  const {
    products, loading, pagination, filters,
    manufacturers, categories, updateFilters, setPage, refresh,
  } = useProducts();

  const [viewMode, setViewMode] = useState('list');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [searchValue, setSearchValue] = useState('');
  const [activePill, setActivePill] = useState('all');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [specOptions, setSpecOptions] = useState([]);

  /* ── Search debounce ── */
  const handleSearch = (value) => {
    setSearchValue(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilters({ search: value });
    }, 300);
  };

  /* ── Fetch spec options when category changes ── */
  useEffect(() => {
    if (filters.category) {
      apiClient.get(`/api/categories/${filters.category}/specs`)
        .then((r) => {
          const specs = r.data?.specs || [];
          setSpecOptions(specs);
        })
        .catch(() => setSpecOptions([]));
    } else {
      setSpecOptions([]);
    }
  }, [filters.category]);

  /* ── Spec filter toggle ── */
  const toggleSpecFilter = (specKey, value) => {
    const current = filters.specFilters || {};
    const newFilters = { ...current };
    if (newFilters[specKey] === value) {
      delete newFilters[specKey];
    } else {
      newFilters[specKey] = value;
    }
    updateFilters({ specFilters: newFilters });
  };

  /* ── Quick pills ── */
  const handlePill = (pill) => {
    setActivePill(pill.key);
    setMinPriceInput(pill.min);
    setMaxPriceInput(pill.max);
    updateFilters({ minPrice: pill.min, maxPrice: pill.max });
  };

  /* ── Sort ── */
  const handleSort = (e) => {
    const opt = SORT_OPTIONS.find((o) => `${o.sortBy}:${o.sortOrder}` === e.target.value);
    if (opt) updateFilters({ sortBy: opt.sortBy, sortOrder: opt.sortOrder });
  };

  /* ── Price blur ── */
  const handleMinPriceBlur = () => updateFilters({ minPrice: minPriceInput });
  const handleMaxPriceBlur = () => updateFilters({ maxPrice: maxPriceInput });

  /* ── Clear ── */
  const handleClear = () => {
    setSearchValue('');
    setActivePill('all');
    setMinPriceInput('');
    setMaxPriceInput('');
    setSpecOptions([]);
    setActiveUseCase(null);
    updateFilters({
      search: '', manufacturer: '', category: '',
      minPrice: '', maxPrice: '', sortBy: 'name', sortOrder: 'ASC',
      specFilters: {},
    });
  };

  /* ── Shop by Room (use-case) ── */
  const [activeUseCase, setActiveUseCase] = useState(null);

  const USE_CASES = [
    { key: 'kitchen', icon: '\uD83C\uDF73', label: 'Kitchen' },
    { key: 'laundry', icon: '\uD83D\uDEC1', label: 'Laundry' },
    { key: 'living-room', icon: '\uD83C\uDFAC', label: 'Living Room' },
    { key: 'bedroom', icon: '\uD83D\uDECF\uFE0F', label: 'Bedroom' },
    { key: 'outdoor', icon: '\uD83C\uDF3F', label: 'Outdoor' },
    { key: 'air-quality', icon: '\uD83D\uDCA8', label: 'Air Quality' },
  ];

  const handleUseCase = async (useCase) => {
    if (activeUseCase === useCase) {
      // Toggle off
      setActiveUseCase(null);
      updateFilters({ category: '' });
      return;
    }
    setActiveUseCase(useCase);
    try {
      const res = await apiClient.get(`/api/categories/by-use-case/${useCase}`);
      const depts = res.data?.departments || [];
      // Find the first category slug from results and set it as filter
      const firstCat = depts[0]?.categories?.[0];
      if (firstCat?.slug) {
        updateFilters({ category: firstCat.slug });
      }
    } catch {
      toast.error('Failed to load use-case categories');
    }
  };

  /* ── Checkboxes ── */
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  };

  /* ── Showing X of Y ── */
  const showingStart = (pagination.page - 1) * pagination.limit + 1;
  const showingEnd = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex-1 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-6 shrink-0">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-primary text-2xl font-semibold tracking-tight text-foreground">Product Catalog</h1>
            <p className="font-secondary text-sm text-muted-foreground">
              Manage your product inventory, pricing, and catalog data
            </p>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={refresh}
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground shadow-sm hover:shadow transition"
            >
              <RefreshCw size={16} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toast.info('Import coming soon')}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-background border border-border text-foreground font-secondary text-sm font-medium shadow-sm hover:shadow transition"
            >
              <Upload size={16} />
              Import
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toast.info('Add product coming soon')}
              className="flex items-center gap-1.5 h-10 px-5 rounded-lg bg-primary text-primary-foreground font-secondary text-sm font-semibold shadow-sm hover:shadow transition"
            >
              <Plus size={18} />
              Add Product
            </motion.button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col gap-5 px-7 pb-6 overflow-auto">
          {/* Shop by Room */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-secondary text-xs font-medium mr-1">Shop by Room:</span>
            {USE_CASES.map((uc) => (
              <button
                key={uc.key}
                onClick={() => handleUseCase(uc.key)}
                className={`flex items-center gap-1.5 h-9 px-3.5 rounded-lg font-secondary text-xs font-medium transition-all ${
                  activeUseCase === uc.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-foreground hover:border-primary hover:shadow-sm'
                }`}
              >
                <span>{uc.icon}</span>
                {uc.label}
              </button>
            ))}
          </div>

          {/* Filter Card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col bg-card border border-border rounded-xl overflow-hidden"
          >
            <div className="flex flex-col gap-3 px-4 py-3.5">
              {/* Row 1 — Search + Actions */}
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchValue}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 bg-background border border-border rounded-lg text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground focus:border-primary transition"
                  />
                </div>
                <button
                  onClick={() => toast.info('Export coming soon')}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-border text-foreground font-secondary text-xs font-medium hover:border-primary transition"
                >
                  <Download size={14} />
                  Export
                </button>
                <div className="flex items-center rounded-lg overflow-hidden border border-border">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`flex items-center justify-center w-8 h-8 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
                  >
                    <List size={14} />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`flex items-center justify-center w-8 h-8 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}
                  >
                    <LayoutGrid size={14} />
                  </button>
                </div>
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-border text-muted-foreground font-secondary text-xs font-medium hover:border-primary transition"
                >
                  <X size={12} />
                  Clear
                </button>
              </div>

              {/* Row 2 — Dropdowns */}
              <div className="flex items-end gap-2">
                <div className="flex-1 flex flex-col gap-1.5">
                  <span className="text-foreground font-secondary text-sm font-medium">Manufacturer</span>
                  <select
                    value={filters.manufacturer}
                    onChange={(e) => updateFilters({ manufacturer: e.target.value })}
                    className="w-full h-10 rounded-lg bg-background border border-border px-3 text-foreground font-secondary text-sm outline-none focus:border-primary transition"
                  >
                    <option value="">All Manufacturers</option>
                    {manufacturers.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <span className="text-foreground font-secondary text-sm font-medium">Category</span>
                  <select
                    value={filters.category}
                    onChange={(e) => updateFilters({ category: e.target.value })}
                    className="w-full h-10 rounded-lg bg-background border border-border px-3 text-foreground font-secondary text-sm outline-none focus:border-primary transition"
                  >
                    <option value="">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id || c.slug || c.name} value={c.slug || c.name}>
                        {c.display_name || c.name} {c.product_count != null ? `(${c.product_count})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5 w-[120px]">
                  <span className="text-foreground font-secondary text-sm font-medium">Min Price</span>
                  <input
                    type="text"
                    placeholder="$0"
                    value={minPriceInput}
                    onChange={(e) => setMinPriceInput(e.target.value)}
                    onBlur={handleMinPriceBlur}
                    className="w-full h-10 rounded-lg bg-background border border-border px-3 text-foreground font-secondary text-sm outline-none focus:border-primary transition"
                  />
                </div>
                <div className="flex flex-col gap-1.5 w-[120px]">
                  <span className="text-foreground font-secondary text-sm font-medium">Max Price</span>
                  <input
                    type="text"
                    placeholder="$99,999"
                    value={maxPriceInput}
                    onChange={(e) => setMaxPriceInput(e.target.value)}
                    onBlur={handleMaxPriceBlur}
                    className="w-full h-10 rounded-lg bg-background border border-border px-3 text-foreground font-secondary text-sm outline-none focus:border-primary transition"
                  />
                </div>
                <div className="flex flex-col gap-1.5 w-[200px]">
                  <span className="text-foreground font-secondary text-sm font-medium">Sort By</span>
                  <select
                    value={`${filters.sortBy}:${filters.sortOrder}`}
                    onChange={handleSort}
                    className="w-full h-10 rounded-lg bg-background border border-border px-3 text-foreground font-secondary text-sm outline-none focus:border-primary transition"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={`${opt.sortBy}:${opt.sortOrder}`} value={`${opt.sortBy}:${opt.sortOrder}`}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 3 — Quick Pills */}
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground font-secondary text-[11px] font-medium mr-1">Quick:</span>
                {QUICK_PILLS.map((pill) => (
                  <button
                    key={pill.key}
                    onClick={() => handlePill(pill)}
                    className={`px-2.5 py-1 rounded-full font-secondary text-[11px] transition-all ${
                      activePill === pill.key
                        ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                        : 'border border-border text-muted-foreground hover:border-primary hover:text-foreground'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Row 4 — Spec Quick Filters (conditional) */}
              {specOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  {specOptions.map((spec) => (
                    <div key={spec.spec_key} className="flex items-center gap-1.5">
                      <span className="text-muted-foreground font-secondary text-[11px] font-medium">{spec.spec_label}:</span>
                      {spec.spec_values.map((val) => (
                        <button
                          key={val}
                          onClick={() => toggleSpecFilter(spec.spec_key, val)}
                          className={`px-2.5 py-1 rounded-full font-secondary text-[11px] transition-all ${
                            (filters.specFilters || {})[spec.spec_key] === val
                              ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                              : 'border border-border text-muted-foreground hover:border-primary hover:text-foreground'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Row 5 — Count */}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-secondary text-xs">
                  {pagination.total > 0
                    ? `Showing ${showingStart}-${showingEnd} of ${pagination.total.toLocaleString()} products`
                    : loading ? 'Loading...' : 'No products found'}
                </span>
              </div>
            </div>

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border-t border-border/50">
                <span className="text-foreground font-secondary text-xs font-semibold">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="flex items-center gap-1 h-7 px-4 rounded-full border border-border text-foreground font-secondary text-xs font-medium hover:border-primary transition"
                >
                  Clear
                </button>
                <button
                  onClick={() => toast.info('Export selected coming soon')}
                  className="flex items-center gap-1 h-7 px-4 rounded-full bg-background border border-border text-foreground font-secondary text-xs font-medium hover:border-primary transition"
                >
                  Export
                </button>
                <button
                  onClick={() => toast.info('Use Advanced Pricing Manager for bulk price changes')}
                  className="flex items-center gap-1 h-7 px-4 rounded-full bg-background border border-border text-foreground font-secondary text-xs font-medium hover:border-primary transition"
                >
                  Bulk Price
                </button>
                <button
                  onClick={() => toast.info('Bulk delete coming soon')}
                  className="flex items-center justify-center h-7 w-7 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}

            {/* ── LIST VIEW ── */}
            {viewMode === 'list' && (
              <>
                {/* Table Header */}
                <div className="flex items-center px-4 py-2.5 bg-muted/50 border-b border-border/50">
                  <div className="w-[18px] shrink-0 mr-3">
                    <input
                      type="checkbox"
                      checked={products.length > 0 && selectedIds.size === products.length}
                      onChange={toggleSelectAll}
                      className="w-[16px] h-[16px] cursor-pointer rounded"
                    />
                  </div>
                  {TABLE_COLS.map((col) => (
                    <span key={col.label} className={`${col.w} shrink-0 font-secondary text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
                      {col.label}
                    </span>
                  ))}
                </div>

                {/* Loading */}
                {loading && (
                  <div className="px-4 py-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="flex items-center h-11 gap-3 border-b border-border/50">
                        <div className="w-[18px] h-4 bg-muted rounded animate-pulse mr-3" />
                        <div className="w-[120px] h-4 bg-muted rounded animate-pulse" />
                        <div className="w-[200px] h-4 bg-muted rounded animate-pulse" />
                        <div className="w-[120px] h-4 bg-muted rounded animate-pulse" />
                        <div className="w-[80px] h-4 bg-muted rounded animate-pulse" />
                        <div className="w-[80px] h-4 bg-muted rounded animate-pulse" />
                        <div className="w-[70px] h-4 bg-muted rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty */}
                {!loading && products.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Package size={48} className="text-muted-foreground/30" />
                    <h3 className="font-secondary text-lg font-semibold text-foreground">No products found</h3>
                    <p className="font-secondary text-sm text-muted-foreground">Try adjusting your search or filters</p>
                  </div>
                )}

                {/* Rows */}
                {!loading && products.map((row, i) => {
                  const margin = calcMargin(row.msrp_cents, row.cost_cents);
                  const mb = marginBadge(margin);
                  const sb = stockBadge(row.stock_status);
                  const isSelected = selectedIds.has(row.id);
                  return (
                    <motion.div
                      key={row.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02, duration: 0.2 }}
                      className={`group flex items-center px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${
                        isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                      }`}
                      onClick={() => setSelectedProductId(row.id)}
                    >
                      <div className="w-[18px] shrink-0 mr-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(row.id)}
                          className="w-[16px] h-[16px] cursor-pointer rounded"
                        />
                      </div>
                      <span className="w-[120px] shrink-0 text-primary font-secondary text-[11px] font-medium">{row.model}</span>
                      <span className="w-[200px] shrink-0 text-foreground font-secondary text-[12px] font-semibold truncate pr-2">
                        {row.name || row.model}
                      </span>
                      <span className="w-[120px] shrink-0 text-foreground font-secondary text-[12px] truncate pr-2">
                        {row.manufacturer || '—'}
                      </span>
                      <span className="w-[110px] shrink-0 text-muted-foreground font-secondary text-[12px] truncate pr-2">
                        {row.category_info?.display_name || row.category || row.master_category || '—'}
                      </span>
                      <span className="w-[80px] shrink-0 text-muted-foreground font-secondary text-sm">
                        {formatCents(row.cost_cents)}
                      </span>
                      <span className="w-[80px] shrink-0 text-foreground font-secondary text-sm font-medium">
                        {formatCents(row.msrp_cents)}
                      </span>
                      <div className="w-[70px] shrink-0">
                        <span className={`inline-flex items-center justify-center w-full px-2 py-0.5 rounded-full font-primary text-[11px] font-semibold ${mb.className}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-[70px] shrink-0">
                        <span className={`font-primary text-[11px] ${sb.className.split(' ')[0]}`}>
                          {row.qty_on_hand ?? row.qty_available ?? '—'}
                        </span>
                      </div>
                      <div className="w-[90px] shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedProductId(row.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          title="View"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          onClick={() => toast.info('Product edit coming soon')}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => toast.info('Product delete coming soon')}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </>
            )}

            {/* ── GRID VIEW ── */}
            {viewMode === 'grid' && (
              <div className="p-4">
                {loading && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="rounded-xl border bg-card p-4 animate-pulse">
                        <div className="aspect-square rounded-lg bg-muted/50 mb-3" />
                        <div className="h-3 w-20 bg-muted rounded mb-2" />
                        <div className="h-4 w-full bg-muted rounded mb-2" />
                        <div className="h-5 w-16 bg-muted rounded mt-2" />
                      </div>
                    ))}
                  </div>
                )}
                {!loading && products.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Package size={48} className="text-muted-foreground/30" />
                    <h3 className="font-secondary text-lg font-semibold text-foreground">No products found</h3>
                    <p className="font-secondary text-sm text-muted-foreground">Try adjusting your search or filters</p>
                  </div>
                )}
                {!loading && products.length > 0 && (
                  <motion.div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {products.map((row, i) => {
                      const sb = stockBadge(row.stock_status);
                      return (
                        <motion.div
                          key={row.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.02 }}
                          className="rounded-xl border bg-card p-4 hover:shadow-md transition-all cursor-pointer group relative"
                          onClick={() => setSelectedProductId(row.id)}
                        >
                          <div className="aspect-square rounded-lg bg-muted/50 mb-3 flex items-center justify-center">
                            <Package className="w-8 h-8 text-muted-foreground/30" />
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{row.manufacturer || '—'}</p>
                          <p className="text-sm font-medium leading-tight mt-0.5 line-clamp-2 text-foreground">
                            {row.name || row.model}
                          </p>
                          <p className="text-base font-bold text-primary mt-2">
                            {formatCents(row.msrp_cents)}
                          </p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-secondary text-[10px] font-semibold mt-2 ${sb.className}`}>
                            {sb.label}
                          </span>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </div>
            )}

            {/* Pagination */}
            {!loading && pagination.total > 0 && (
              <PaginationBar
                current={pagination.page}
                total={pagination.total}
                perPage={pagination.limit}
                label="products"
                onPageChange={setPage}
              />
            )}
          </motion.div>
        </div>
      </motion.div>

      {/* Product Detail Overlay */}
      {selectedProductId && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedProductId(null); }}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative">
            <ProductDetailNew
              productId={selectedProductId}
              onClose={() => setSelectedProductId(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}
