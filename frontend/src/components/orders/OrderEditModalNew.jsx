/**
 * OrderEditModalNew.jsx — Screen 43
 * TeleTime Design System · Order Edit Modal (Full-page)
 * Design frame: hJB3d
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Plus,
  Trash2,
  Undo2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { useToast } from '../ui/Toast';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const lineCols = [
  { label: 'Product', w: 'flex-1' },
  { label: 'SKU', w: 'w-[80px]' },
  { label: 'Qty', w: 'w-[50px]', align: 'text-center' },
  { label: 'Orig Qty', w: 'w-[50px]', align: 'text-center' },
  { label: 'Price', w: 'w-[70px]', align: 'text-right' },
  { label: 'Orig Price', w: 'w-[70px]', align: 'text-right' },
  { label: 'Total', w: 'w-[80px]', align: 'text-right' },
  { label: '', w: 'w-[30px]' },
];

const TAX_RATE = 0.13; // Ontario HST

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCents(cents) {
  if (!cents && cents !== 0) return '$0.00';
  return `$${(Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function statusBadge(status) {
  const map = {
    pending:    { bg: '#F59E0B15', color: '#F59E0B' },
    confirmed:  { bg: '#3B82F615', color: '#3B82F6' },
    processing: { bg: '#8B5CF615', color: '#8B5CF6' },
    shipped:    { bg: '#06B6D415', color: '#06B6D4' },
    delivered:  { bg: '#22C55E15', color: '#22C55E' },
    cancelled:  { bg: '#EF444415', color: '#EF4444' },
  };
  return map[status] || { bg: '#64748B15', color: '#64748B' };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function OrderEditModalNew({ orderId, onClose, onSave }) {
  const toast = useToast();

  /* ── State ── */
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);          // current editable items
  const [origItems, setOrigItems] = useState([]);   // snapshot of original
  const [deletedIds, setDeletedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [amendments, setAmendments] = useState([]);
  const debounceRef = useRef(null);

  /* ── Fetch order ── */
  const fetchOrder = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/api/orders/${orderId}`);
      const o = res.data;
      setOrder(o);
      const mapped = (o.items || []).map((it) => ({
        id: it.id,
        product_id: it.product_id,
        product: it.product_name || it.model,
        sku: it.model || '',
        qty: it.quantity,
        origQty: it.quantity,
        priceCents: it.unit_price_cents,
        origPriceCents: it.unit_price_cents,
        manufacturer: it.manufacturer,
      }));
      setItems(mapped);
      setOrigItems(JSON.parse(JSON.stringify(mapped)));
    } catch {
      toast.error('Failed to load order');
      onClose?.();
    } finally {
      setLoading(false);
    }
  }, [orderId, toast, onClose]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  /* ── Fetch amendments timeline ── */
  useEffect(() => {
    if (!orderId) return;
    apiClient.get(`/api/order-modifications/${orderId}/amendments`)
      .then((res) => setAmendments(res.data || []))
      .catch(() => {});
  }, [orderId]);

  /* ── Product search ── */
  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    clearTimeout(debounceRef.current);
    if (q.length < 2) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiClient.get(`/api/inventory/products?search=${encodeURIComponent(q)}&limit=8`);
        setSearchResults(res.data.products || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  /* ── Add item from search ── */
  const handleAddItem = (product) => {
    const exists = items.find((it) => it.product_id === product.id && !deletedIds.has(it.id));
    if (exists) {
      toast.warning('Product already in order');
      return;
    }
    setItems((prev) => [...prev, {
      id: `new-${Date.now()}`,
      product_id: product.id,
      product: product.name || product.model,
      sku: product.model || '',
      qty: 1,
      origQty: 0,
      priceCents: product.msrp_cents || product.cost_cents || 0,
      origPriceCents: 0,
      manufacturer: product.manufacturer,
      isNew: true,
    }]);
    setSearchQuery('');
    setSearchResults([]);
  };

  /* ── Remove / restore item ── */
  const toggleDelete = (itemId) => {
    setDeletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  /* ── Update qty ── */
  const updateQty = (itemId, newQty) => {
    setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, qty: Math.max(0, newQty) } : it));
  };

  /* ── Computed values ── */
  const activeItems = items.filter((it) => !deletedIds.has(it.id));
  const subtotalCents = activeItems.reduce((s, it) => s + it.priceCents * it.qty, 0);
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;
  const origTotalCents = order?.total_cents || 0;
  const deltaCents = totalCents - origTotalCents;

  /* ── Pending changes list ── */
  const changes = [];
  items.forEach((it) => {
    const orig = origItems.find((o) => o.id === it.id);
    if (deletedIds.has(it.id) && orig) {
      changes.push({ text: `Removed: ${it.product}`, color: 'text-[#EF4444]' });
    } else if (it.isNew) {
      changes.push({ text: `Added: ${it.product} x${it.qty}`, color: 'text-[#22C55E]' });
    } else if (orig && it.qty !== orig.origQty) {
      changes.push({ text: `Modified: ${it.product} qty ${orig.origQty} → ${it.qty}`, color: 'text-[#3B82F6]' });
    }
  });

  /* ── Submit amendment ── */
  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.warning('Please enter a reason for the amendment');
      return;
    }
    if (changes.length === 0) {
      toast.warning('No changes to submit');
      return;
    }
    setSubmitting(true);
    try {
      // Build amendment changes array
      const amendmentChanges = [];
      items.forEach((it) => {
        const orig = origItems.find((o) => o.id === it.id);
        if (deletedIds.has(it.id) && orig) {
          amendmentChanges.push({ type: 'item_removed', productId: it.product_id, productName: it.product });
        } else if (it.isNew) {
          amendmentChanges.push({ type: 'item_added', productId: it.product_id, productName: it.product, quantity: it.qty, priceCents: it.priceCents });
        } else if (orig && it.qty !== orig.origQty) {
          amendmentChanges.push({ type: 'quantity_changed', productId: it.product_id, productName: it.product, oldQuantity: orig.origQty, newQuantity: it.qty });
        }
      });

      await apiClient.post(`/api/order-modifications/${orderId}/amendments`, {
        changes: amendmentChanges,
        reason: reason.trim(),
      });
      toast.success('Amendment submitted');
      onSave?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit amendment');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Summary rows ── */
  const summaryRows = [
    { label: 'Subtotal', value: formatCents(subtotalCents), fw: 'font-semibold', color: 'text-foreground' },
    { label: 'Discount', value: '-$0.00', fw: 'font-normal', color: 'text-muted-foreground' },
    { label: 'Tax Rate (ON 13%)', value: '13.00%', fw: 'font-normal', color: 'text-foreground' },
    { label: 'Estimated Tax', value: formatCents(taxCents), fw: 'font-normal', color: 'text-foreground' },
  ];

  /* ── Badge helper for amendment timeline ── */
  function amdBadge(status) {
    if (status === 'applied' || status === 'approved') return { bg: '#22C55E15', color: '#22C55E', label: 'Applied' };
    if (status === 'pending') return { bg: '#F59E0B15', color: '#F59E0B', label: 'Pending' };
    if (status === 'rejected') return { bg: '#EF444415', color: '#EF4444', label: 'Rejected' };
    return { bg: '#64748B15', color: '#64748B', label: status };
  }

  const sBadge = order ? statusBadge(order.status) : null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-[1440px] h-[1000px] max-w-[95vw] max-h-[95vh] bg-background rounded-lu-md flex flex-col overflow-hidden"
      >
        {/* Topbar */}
        <div
          className="flex items-center gap-2 px-6 py-3 bg-card shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-primary font-primary text-[13px] font-bold">LUNARIS</span>
          <span className="text-muted-foreground font-secondary text-[12px]">/</span>
          <span className="text-muted-foreground font-secondary text-[12px]">Orders</span>
          <span className="text-muted-foreground font-secondary text-[12px]">/</span>
          <span className="text-foreground font-secondary text-[12px] font-medium">Edit Order</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 h-10 px-4 rounded-lu-pill text-foreground font-primary text-sm font-medium hover:bg-secondary transition-colors"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel */}
          <div
            className="flex-1 flex flex-col gap-4 p-6 overflow-auto"
            style={{ borderRight: '1px solid var(--border)' }}
          >
            {/* Order header */}
            <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
              <span className="text-foreground font-primary text-sm font-bold">{order?.order_number}</span>
              <span className="text-muted-foreground font-secondary text-[12px]">{order?.customer_name || order?.company || '—'}</span>
              {sBadge && (
                <span
                  className="inline-flex items-center px-2.5 py-[3px] rounded-full font-secondary text-[11px] font-medium"
                  style={{ backgroundColor: sBadge.bg, color: sBadge.color }}
                >
                  {order.status}
                </span>
              )}
              {order?.province && (
                <span className="inline-flex items-center px-2.5 py-[3px] rounded-full bg-secondary text-muted-foreground font-secondary text-[11px] font-medium">
                  {order.province}
                </span>
              )}
              <div className="flex-1" />
              <span
                className="inline-flex items-center px-2.5 py-[3px] rounded-full text-[#F59E0B] font-secondary text-[11px] font-medium"
                style={{ backgroundColor: '#F59E0B15' }}
              >
                Editing
              </span>
            </div>

            {/* Line Items table */}
            <div className="flex flex-col bg-card border border-border rounded-xl overflow-hidden flex-1">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-foreground font-primary text-sm font-semibold">Line Items</span>
                <span className="inline-flex items-center px-2 py-[2px] rounded-full bg-secondary text-muted-foreground font-secondary text-[10px] font-medium">
                  {activeItems.length} items
                </span>
              </div>

              {/* Column headers */}
              <div className="flex items-center px-4 py-2 bg-secondary">
                {lineCols.map((col) => (
                  <span
                    key={col.label || 'action'}
                    className={`${col.w} shrink-0 text-muted-foreground font-secondary text-[10px] font-semibold ${col.align || ''}`}
                  >
                    {col.label}
                  </span>
                ))}
              </div>

              {/* Rows */}
              {items.map((item) => {
                const isDeleted = deletedIds.has(item.id);
                const qtyChanged = !item.isNew && item.qty !== item.origQty;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center px-4 py-2 ${isDeleted ? 'bg-[#EF444408]' : ''}`}
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <span className={`flex-1 shrink-0 font-secondary text-[12px] font-medium ${isDeleted ? 'text-[#EF4444] line-through' : item.isNew ? 'text-[#22C55E]' : 'text-foreground'}`}>
                      {item.product}
                    </span>
                    <span className={`w-[80px] shrink-0 font-primary text-[11px] ${isDeleted ? 'text-[#EF444480]' : 'text-muted-foreground'}`}>
                      {item.sku}
                    </span>
                    <div className="w-[50px] shrink-0 flex justify-center">
                      {isDeleted ? (
                        <span className="text-[#EF4444] font-primary text-[12px]">—</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          value={item.qty}
                          onChange={(e) => updateQty(item.id, parseInt(e.target.value) || 0)}
                          className={`w-[40px] text-center bg-transparent font-primary text-[12px] outline-none border rounded-md ${
                            qtyChanged ? 'border-primary text-primary font-semibold' : 'border-transparent text-foreground font-semibold'
                          }`}
                        />
                      )}
                    </div>
                    <span className={`w-[50px] shrink-0 font-primary text-[12px] text-center ${isDeleted ? 'text-[#EF444480]' : 'text-muted-foreground'}`}>
                      {item.origQty}
                    </span>
                    <span className={`w-[70px] shrink-0 font-primary text-[12px] text-right ${isDeleted ? 'text-[#EF444480]' : 'text-foreground font-medium'}`}>
                      {formatCents(item.priceCents)}
                    </span>
                    <span className={`w-[70px] shrink-0 font-primary text-[11px] text-right ${isDeleted ? 'text-[#EF444480]' : 'text-muted-foreground'}`}>
                      {formatCents(item.origPriceCents)}
                    </span>
                    <span className={`w-[80px] shrink-0 font-primary text-[12px] font-semibold text-right ${isDeleted ? 'text-[#EF4444]' : 'text-foreground'}`}>
                      {isDeleted ? '$0.00' : formatCents(item.priceCents * item.qty)}
                    </span>
                    <div className="w-[30px] shrink-0 flex justify-center">
                      <button onClick={() => item.isNew && isDeleted ? null : toggleDelete(item.id)} className="hover:opacity-70">
                        {isDeleted ? (
                          <Undo2 size={14} className="text-[#EF4444]" />
                        ) : (
                          <Trash2 size={14} className="text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Search + Add Item */}
            <div className="flex items-center gap-2 relative">
              <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-sm border border-border bg-background">
                <Search size={16} className="text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search products to add..."
                  className="flex-1 bg-transparent text-foreground font-secondary text-sm outline-none placeholder:text-muted-foreground"
                />
                {searchLoading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
              </div>
              {/* Search dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-[90px] mt-1 bg-card border border-border rounded-lg shadow-lg z-10 max-h-[200px] overflow-auto">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAddItem(p)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary transition-colors text-left"
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <div className="flex flex-col">
                        <span className="text-foreground font-secondary text-[12px] font-medium">{p.name || p.model}</span>
                        <span className="text-muted-foreground font-secondary text-[10px]">{p.manufacturer} · {p.model}</span>
                      </div>
                      <span className="text-foreground font-primary text-[11px] font-semibold">{formatCents(p.msrp_cents)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Changes */}
            {changes.length > 0 && (
              <div
                className="flex flex-col gap-2 p-3 rounded-[10px]"
                style={{ backgroundColor: '#F59E0B08', border: '1px solid #F59E0B30' }}
              >
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-[#F59E0B]" />
                  <span className="text-[#F59E0B] font-primary text-[12px] font-semibold">
                    Pending Changes ({changes.length})
                  </span>
                </div>
                {changes.map((ch) => (
                  <span key={ch.text} className={`font-secondary text-[11px] ${ch.color}`}>
                    {ch.text}
                  </span>
                ))}
              </div>
            )}

            {/* Reason + Submit */}
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-foreground font-secondary text-[11px] font-medium">
                  Reason for Amendment *
                </span>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Customer requested quantity increase..."
                  className="px-3 py-2 rounded-lg bg-card border border-border text-foreground font-secondary text-[12px] outline-none placeholder:text-muted-foreground"
                />
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleSubmit}
                disabled={submitting || changes.length === 0}
                className="flex items-center gap-1.5 h-12 px-6 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-medium shrink-0 disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                <Plus size={16} />
                {submitting ? 'Submitting...' : 'Submit Amendment'}
              </motion.button>
            </div>
          </div>

          {/* Right Panel */}
          <div className="w-[380px] shrink-0 flex flex-col gap-4 p-6 overflow-auto">
            {/* Live Order Summary */}
            <div className="flex flex-col gap-3 bg-card border border-border rounded-xl p-4">
              <span className="text-foreground font-primary text-sm font-semibold">
                Live Order Summary
              </span>
              <div className="h-px bg-border" />

              {summaryRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-muted-foreground font-secondary text-[12px]">{row.label}</span>
                  <span className={`font-primary text-[13px] ${row.fw} ${row.color}`}>{row.value}</span>
                </div>
              ))}

              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-foreground font-primary text-sm font-bold">New Total</span>
                <span className="text-foreground font-primary text-[18px] font-bold">{formatCents(totalCents)}</span>
              </div>
              <div className="h-px bg-border" />

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-secondary text-[12px]">Original Total</span>
                <span className="text-muted-foreground font-primary text-[13px]">{formatCents(origTotalCents)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-secondary text-[12px]">Delta</span>
                <span className={`font-primary text-[13px] font-semibold ${deltaCents > 0 ? 'text-[#EF4444]' : deltaCents < 0 ? 'text-[#22C55E]' : 'text-foreground'}`}>
                  {deltaCents >= 0 ? '+' : ''}{formatCents(deltaCents)}
                </span>
              </div>
            </div>

            {/* Amendment Timeline */}
            <div className="flex flex-col gap-3.5 bg-card border border-border rounded-xl p-4 flex-1">
              <span className="text-foreground font-primary text-sm font-semibold">
                Amendment Timeline
              </span>

              {amendments.length === 0 && (
                <span className="text-muted-foreground font-secondary text-[11px]">No amendments yet</span>
              )}

              {amendments.map((entry, i) => {
                const badge = amdBadge(entry.status);
                return (
                  <div key={entry.id} className="flex gap-2.5">
                    <div className="flex flex-col items-center pt-1">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: badge.color }} />
                      {i < amendments.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
                    </div>
                    <div className="flex flex-col gap-1 pb-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground font-primary text-[11px] font-bold">AMD-{entry.id}</span>
                        <span
                          className="inline-flex items-center px-1.5 py-[1px] rounded-full font-secondary text-[9px] font-medium"
                          style={{ backgroundColor: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <span className="text-muted-foreground font-secondary text-[10px]">
                        {entry.created_at ? new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </span>
                      {entry.amendment_type && (
                        <span
                          className="inline-flex items-center self-start px-1.5 py-[1px] rounded-full font-primary text-[9px] font-medium"
                          style={{ backgroundColor: '#3B82F615', color: '#3B82F6' }}
                        >
                          {entry.amendment_type}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
