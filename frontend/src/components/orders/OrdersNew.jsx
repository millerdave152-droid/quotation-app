/**
 * OrdersNew.jsx — Orders List
 * TeleTime Design System · Order Management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  Plus,
  Eye,
  Pencil,
  Search,
  ShoppingBag,
  Clock,
  Truck,
  CheckCircle2,
} from 'lucide-react';

import PaginationBar from '../shared/PaginationBar';
import { useToast } from '../ui/Toast';
import apiClient from '../../services/apiClient';
import OrderDetailNew from './OrderDetailNew';
import OrderEditModalNew from './OrderEditModalNew';

/* ------------------------------------------------------------------ */
/*  Inline hook                                                        */
/* ------------------------------------------------------------------ */

function useOrders(initialFilters = {}) {
  const [orders, setOrders] = useState([]);
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

      const res = await apiClient.get(`/api/orders?${params}`);
      setOrders(res.data.orders || []);
      if (res.data.pagination) {
        setPagination((p) => ({ ...p, ...res.data.pagination }));
      }
    } catch (err) {
      setError(err.message);
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

  return { orders, loading, error, pagination, filters, updateFilters, setPage, refresh: fetch };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function statusBadge(status) {
  const map = {
    pending:    { className: 'text-amber-600 bg-amber-500/10', label: 'Pending' },
    confirmed:  { className: 'text-blue-600 bg-blue-500/10', label: 'Confirmed' },
    processing: { className: 'text-purple-600 bg-purple-500/10', label: 'Processing' },
    shipped:    { className: 'text-cyan-600 bg-cyan-500/10', label: 'Shipped' },
    delivered:  { className: 'text-emerald-600 bg-emerald-500/10', label: 'Delivered' },
    cancelled:  { className: 'text-red-600 bg-red-500/10', label: 'Cancelled' },
  };
  return map[status] || { className: 'text-gray-500 bg-gray-500/10', label: status || '—' };
}

function paymentBadge(status) {
  const map = {
    unpaid:       { className: 'text-red-600', label: 'Unpaid' },
    deposit_paid: { className: 'text-amber-600', label: 'Deposit' },
    paid:         { className: 'text-emerald-600', label: 'Paid' },
    refunded:     { className: 'text-gray-500', label: 'Refunded' },
  };
  return map[status] || { className: 'text-gray-500', label: status || '—' };
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
  { label: 'Order #',   w: 'w-[120px]' },
  { label: 'Customer',  w: 'flex-1' },
  { label: 'Date',      w: 'w-[100px]' },
  { label: 'Items',     w: 'w-[60px]' },
  { label: 'Total',     w: 'w-[90px]' },
  { label: 'Status',    w: 'w-[100px]' },
  { label: 'Payment',   w: 'w-[80px]' },
  { label: 'Actions',   w: 'w-[100px]' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function OrdersNew() {
  const toast = useToast();
  const debounceRef = useRef(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [editOrderId, setEditOrderId] = useState(null);

  const {
    orders, loading, pagination,
    filters, updateFilters, setPage, refresh,
  } = useOrders();

  /* ── Search debounce ── */
  const handleSearch = (e) => {
    const value = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateFilters({ search: value });
    }, 300);
  };

  /* ── KPI cards (derived from pagination + orders) ── */
  const pendingCount = orders.filter((o) => o.status === 'pending' || o.status === 'confirmed').length;
  const shippedCount = orders.filter((o) => o.status === 'shipped').length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;

  const statCards = [
    { label: 'Total Orders', value: pagination.total.toLocaleString(), icon: ShoppingBag, iconColor: 'text-primary', valueColor: 'text-foreground', accent: 'border-t-primary' },
    { label: 'Pending Fulfillment', value: String(pendingCount), icon: Clock, iconColor: 'text-amber-500', valueColor: 'text-amber-600', accent: 'border-t-amber-500' },
    { label: 'In Transit', value: String(shippedCount), icon: Truck, iconColor: 'text-blue-500', valueColor: 'text-blue-600', accent: 'border-t-blue-500' },
    { label: 'Delivered', value: String(deliveredCount), icon: CheckCircle2, iconColor: 'text-emerald-500', valueColor: 'text-emerald-600', accent: 'border-t-emerald-500' },
  ];

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
            <h1 className="text-foreground font-secondary text-2xl font-semibold tracking-tight">Orders</h1>
            <p className="text-muted-foreground font-secondary text-sm">
              Manage and track all orders
            </p>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toast.info('Export coming soon')}
              className="flex items-center gap-1.5 h-10 px-5 rounded-lg bg-background border border-border text-foreground font-secondary text-sm font-medium shadow-sm hover:shadow transition"
            >
              <Download size={16} />
              Export
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => toast.info('Create order from quote — use Quotation Editor')}
              className="flex items-center gap-1.5 h-10 px-5 rounded-lg bg-primary text-primary-foreground font-secondary text-sm font-medium shadow-sm hover:shadow transition"
            >
              <Plus size={18} />
              New Order
            </motion.button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col gap-5 px-7 pb-6 overflow-auto">
          {/* KPI Row */}
          <div className="grid grid-cols-4 gap-3.5">
            {statCards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className={`flex flex-col bg-gradient-to-br from-card to-card/50 border border-border ${card.accent} border-t-2 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden`}
              >
                <div className="flex items-center gap-2 px-3.5 py-2.5">
                  <card.icon size={18} className={card.iconColor} />
                  <span className="text-muted-foreground font-secondary text-xs font-medium">{card.label}</span>
                </div>
                <div className="px-3.5 pb-2.5">
                  <span className={`font-primary text-3xl tracking-tight font-bold ${card.valueColor}`}>{card.value}</span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Filters Row */}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search orders..."
                onChange={handleSearch}
                className="w-full h-9 pl-9 pr-4 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground focus:border-primary transition"
              />
            </div>
            <select
              value={filters.status}
              onChange={(e) => updateFilters({ status: e.target.value })}
              className="h-9 px-3 rounded-lg bg-background border border-input text-foreground font-secondary text-sm outline-none focus:border-primary transition"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Table Card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="flex flex-col bg-card border border-border rounded-xl shadow-sm overflow-hidden"
          >
            {/* Table Header */}
            <div className="flex items-center px-4 py-2 bg-muted/50 border-b border-border/50">
              {TABLE_COLS.map((col) => (
                <span key={col.label} className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[11px] font-semibold uppercase tracking-wider`}>
                  {col.label}
                </span>
              ))}
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex flex-col">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center px-4 py-3 border-b border-border/50 gap-4">
                    <div className="w-[120px] h-4 rounded bg-muted animate-pulse" />
                    <div className="flex-1 h-4 rounded bg-muted animate-pulse" />
                    <div className="w-[100px] h-4 rounded bg-muted animate-pulse" />
                    <div className="w-[60px] h-4 rounded bg-muted animate-pulse" />
                    <div className="w-[90px] h-4 rounded bg-muted animate-pulse" />
                    <div className="w-[100px] h-4 rounded bg-muted animate-pulse" />
                    <div className="w-[80px] h-4 rounded bg-muted animate-pulse" />
                    <div className="w-[100px] h-4 rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty */}
            {!loading && orders.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <ShoppingBag size={48} className="text-muted-foreground/40" />
                <span className="text-foreground font-secondary text-base font-semibold">No orders found</span>
                <span className="text-muted-foreground font-secondary text-sm">Try adjusting your search or filters</span>
              </div>
            )}

            {/* Rows */}
            {!loading && orders.map((order, idx) => {
              const sBadge = statusBadge(order.status);
              const pBadge = paymentBadge(order.payment_status);
              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  className="group flex items-center px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <span className="w-[120px] shrink-0 text-foreground font-primary text-[11px] font-semibold">
                    {order.order_number}
                  </span>
                  <div className="flex-1 shrink-0 flex flex-col">
                    <span className="text-foreground font-secondary text-[12px] font-medium truncate pr-2">
                      {order.customer_name || '—'}
                    </span>
                    {order.company && (
                      <span className="text-muted-foreground font-secondary text-[10px] truncate pr-2">
                        {order.company}
                      </span>
                    )}
                  </div>
                  <span className="w-[100px] shrink-0 text-muted-foreground font-secondary text-[11px]">
                    {formatDate(order.created_at)}
                  </span>
                  <span className="w-[60px] shrink-0 text-foreground font-primary text-[11px]">
                    {order.item_count ?? '—'}
                  </span>
                  <span className="w-[90px] shrink-0 text-foreground font-primary text-[11px] font-semibold">
                    {formatCents(order.total_cents)}
                  </span>
                  <div className="w-[100px] shrink-0">
                    <span
                      className={`inline-flex items-center px-2 py-[2px] rounded-full text-[10px] font-semibold ${sBadge.className}`}
                    >
                      {sBadge.label}
                    </span>
                  </div>
                  <div className="w-[80px] shrink-0">
                    <span className={`font-primary text-[10px] font-semibold ${pBadge.className}`}>
                      {pBadge.label}
                    </span>
                  </div>
                  <div className="w-[100px] shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setSelectedOrderId(order.id)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      title="View"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => setEditOrderId(order.id)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
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
                label="orders"
                onPageChange={setPage}
              />
            )}
          </motion.div>
        </div>
      </motion.div>

      {/* Order Detail Panel */}
      {selectedOrderId && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedOrderId(null); }}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative">
            <OrderDetailNew
              orderId={selectedOrderId}
              onClose={() => { setSelectedOrderId(null); refresh(); }}
            />
          </div>
        </div>
      )}

      {/* Order Edit Modal */}
      {editOrderId && (
        <OrderEditModalNew
          orderId={editOrderId}
          onClose={() => setEditOrderId(null)}
          onSave={() => { setEditOrderId(null); refresh(); }}
        />
      )}
    </>
  );
}
