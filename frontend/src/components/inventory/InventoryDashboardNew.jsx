/**
 * InventoryDashboardNew.jsx — Screen 26
 * TeleTime Design System · Inventory Dashboard
 * Design frame: cpv34
 */

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  ClipboardList,
  Package,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Lock,
  Search,
} from 'lucide-react';
// import LunarisSidebar from '../shared/LunarisSidebar'; // removed — MainLayout provides sidebar
import PaginationBar from '../shared/PaginationBar';
import { useInventorySummary, useInventoryProducts } from '../../hooks/useInventory';
import { useToast } from '../ui/Toast';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function stockColor(val) {
  if (val <= 2) return 'text-red-600 font-bold';
  if (val <= 8) return 'text-amber-600 font-bold';
  return 'text-foreground';
}

function statusBadge(status) {
  switch (status) {
    case 'out_of_stock':
      return { className: 'text-red-600 bg-red-500/10', label: 'Out of Stock' };
    case 'low_stock':
      return { className: 'text-amber-600 bg-amber-500/10', label: 'Low Stock' };
    case 'in_stock':
      return { className: 'text-emerald-600 bg-emerald-500/10', label: 'In Stock' };
    default:
      return { className: 'text-muted-foreground bg-muted', label: status || '—' };
  }
}

const TABS = [
  { key: 'overview', label: 'Overview', stockStatus: '' },
  { key: 'low_stock', label: 'Low Stock', stockStatus: 'low_stock' },
  { key: 'out_of_stock', label: 'Out of Stock', stockStatus: 'out_of_stock' },
  { key: 'reserved', label: 'Reserved', stockStatus: '' },
];

const TABLE_COLUMNS = [
  { label: 'Product', w: 'w-[220px]' },
  { label: 'Manufacturer', w: 'w-[130px]' },
  { label: 'Category', w: 'w-[120px]' },
  { label: 'On Hand', w: 'w-[70px]' },
  { label: 'Reserved', w: 'w-[70px]' },
  { label: 'Available', w: 'w-[70px]' },
  { label: 'Status', w: 'w-[80px]' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InventoryDashboardNew() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const debounceRef = useRef(null);

  /* ── Hooks ── */
  const { summary, loading: summaryLoading } = useInventorySummary();
  const {
    products, loading: productsLoading, pagination,
    updateFilters, setPage,
  } = useInventoryProducts();

  /* ── Tab change ── */
  const handleTabChange = (tab) => {
    setActiveTab(tab.key);
    updateFilters({ stockStatus: tab.stockStatus });
  };

  /* ── Search with 300 ms debounce ── */
  const handleSearch = (e) => {
    const value = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilters({ search: value });
    }, 300);
  };

  /* ── Stat cards from live summary ── */
  const statCards = [
    {
      label: 'Total Products',
      value: summary ? Number(summary.total_products).toLocaleString() : '—',
      icon: Package,
      iconColor: 'text-primary',
      valueColor: 'text-foreground',
      accent: 'border-t-primary',
    },
    {
      label: 'In Stock',
      value: summary ? Number(summary.in_stock).toLocaleString() : '—',
      icon: CheckCircle2,
      iconColor: 'text-emerald-500',
      valueColor: 'text-emerald-600',
      accent: 'border-t-emerald-500',
    },
    {
      label: 'Low Stock',
      value: summary ? Number(summary.low_stock).toLocaleString() : '—',
      icon: AlertTriangle,
      iconColor: 'text-amber-500',
      valueColor: 'text-amber-600',
      accent: 'border-t-amber-500',
    },
    {
      label: 'Out of Stock',
      value: summary ? Number(summary.out_of_stock).toLocaleString() : '—',
      icon: XCircle,
      iconColor: 'text-red-500',
      valueColor: 'text-red-600',
      accent: 'border-t-red-500',
    },
    {
      label: 'Reserved',
      value: summary ? Number(summary.total_reserved).toLocaleString() : '—',
      icon: Lock,
      iconColor: 'text-blue-500',
      valueColor: 'text-blue-600',
      accent: 'border-t-blue-500',
    },
  ];

  /* ── Display rows + card header per tab ── */
  let displayRows = products;
  let tableTitle = 'All Products';
  let tableBadgeCount = pagination.total;
  let tableIcon = <Package size={18} className="text-primary" />;

  if (activeTab === 'low_stock') {
    tableTitle = 'Low Stock Alerts';
    tableIcon = <AlertTriangle size={18} className="text-amber-500" />;
  } else if (activeTab === 'out_of_stock') {
    tableTitle = 'Out of Stock Items';
    tableIcon = <XCircle size={18} className="text-red-500" />;
  } else if (activeTab === 'reserved') {
    displayRows = products.filter((p) => p.qty_reserved > 0);
    tableTitle = 'Reserved Items';
    tableBadgeCount = displayRows.length;
    tableIcon = <Lock size={18} className="text-blue-500" />;
  }

  /* ── Action buttons ── */
  const handleExport = () => toast.info('Export started — your file will download shortly');
  const handleStartCount = () => toast.info('Inventory count initiated');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-6 shrink-0">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-primary text-2xl font-semibold tracking-tight text-foreground">
              Inventory Dashboard
            </h1>
            <p className="font-secondary text-sm text-muted-foreground">
              Track stock levels, reservations, and inventory alerts
            </p>
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleExport}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-background border border-border text-foreground font-secondary text-sm font-medium shadow-sm hover:shadow transition"
            >
              <Download size={16} />
              Export
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleStartCount}
              className="flex items-center gap-1.5 h-10 px-5 rounded-lg bg-primary text-primary-foreground font-secondary text-sm font-semibold shadow-sm hover:shadow transition"
            >
              <ClipboardList size={18} />
              Start Inventory Count
            </motion.button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col gap-5 px-7 pb-6 overflow-auto">
          {/* Stats Row (5 cards) */}
          <div className="grid grid-cols-5 gap-3.5">
            {statCards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className={`flex flex-col bg-gradient-to-br from-card to-card/50 border border-border ${card.accent} border-t-2 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden`}
              >
                <div className="flex items-center gap-2 px-4 pt-4 pb-1">
                  <card.icon size={16} className={card.iconColor} />
                  <span className="font-secondary text-xs font-medium text-muted-foreground">
                    {card.label}
                  </span>
                </div>
                <div className="px-4 pb-4">
                  {summaryLoading ? (
                    <div className="h-9 w-16 rounded bg-muted animate-pulse" />
                  ) : (
                    <span className={`font-primary text-3xl font-bold tracking-tight ${card.valueColor}`}>
                      {card.value}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex items-center h-10 rounded-xl bg-muted/50 border border-border p-1 gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab)}
                className={`flex-1 flex items-center justify-center h-full rounded-lg font-secondary text-sm font-medium cursor-pointer transition-all ${
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search products..."
                onChange={handleSearch}
                className="w-full h-9 pl-9 pr-4 rounded-lg bg-background border border-border text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground focus:border-primary transition"
              />
            </div>
          </div>

          {/* Table Card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="flex flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden"
          >
            {/* Card Header */}
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-2">
                {tableIcon}
                <span className="text-foreground font-secondary text-sm font-semibold">
                  {tableTitle}
                </span>
              </div>
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-secondary text-sm">
                {tableBadgeCount} items
              </span>
            </div>

            {/* Table Header */}
            <div className="flex items-center px-4 py-2.5 bg-muted/50 border-b border-border/50">
              {TABLE_COLUMNS.map((col) => (
                <span
                  key={col.label}
                  className={`${col.w} shrink-0 font-secondary text-xs font-semibold uppercase tracking-wider text-muted-foreground`}
                >
                  {col.label}
                </span>
              ))}
            </div>

            {/* Loading */}
            {productsLoading && (
              <div className="px-4 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center h-11 gap-4 border-b border-border/50">
                    <div className="w-[220px] h-4 bg-muted rounded animate-pulse" />
                    <div className="w-[130px] h-4 bg-muted rounded animate-pulse" />
                    <div className="w-[120px] h-4 bg-muted rounded animate-pulse" />
                    <div className="w-[70px] h-4 bg-muted rounded animate-pulse" />
                    <div className="w-[70px] h-4 bg-muted rounded animate-pulse" />
                    <div className="w-[70px] h-4 bg-muted rounded animate-pulse" />
                    <div className="w-[80px] h-4 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty */}
            {!productsLoading && displayRows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Package size={48} className="text-muted-foreground/30" />
                <h3 className="font-secondary text-lg font-semibold text-foreground">No products found</h3>
                <p className="font-secondary text-sm text-muted-foreground">Try adjusting your search or filters</p>
              </div>
            )}

            {/* Rows */}
            {!productsLoading &&
              displayRows.map((row, idx) => {
                const badge = statusBadge(row.stock_status);
                return (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className="flex items-center px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <span className="w-[220px] shrink-0 text-foreground font-secondary text-[12px] font-medium truncate pr-2">
                      {row.name || row.model}
                    </span>
                    <span className="w-[130px] shrink-0 text-muted-foreground font-secondary text-[12px] truncate pr-2">
                      {row.manufacturer || '—'}
                    </span>
                    <span className="w-[120px] shrink-0 text-muted-foreground font-secondary text-[12px] truncate pr-2">
                      {row.master_category || '—'}
                    </span>
                    <span className={`w-[70px] shrink-0 font-primary text-[12px] ${stockColor(row.qty_on_hand)}`}>
                      {row.qty_on_hand ?? 0}
                    </span>
                    <span className="w-[70px] shrink-0 text-blue-600 font-primary text-[12px]">
                      {row.qty_reserved ?? 0}
                    </span>
                    <span className={`w-[70px] shrink-0 font-primary text-[12px] ${stockColor(row.qty_available)}`}>
                      {row.qty_available ?? 0}
                    </span>
                    <div className="w-[80px] shrink-0">
                      <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full font-secondary text-[11px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                  </motion.div>
                );
              })}

            {/* Pagination */}
            {!productsLoading && activeTab !== 'reserved' && pagination.total > 0 && (
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
  );
}
