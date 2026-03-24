/**
 * OrderDetailNew.jsx — Order Detail Panel
 * TeleTime Design System · Single Order View
 * Slide-in right panel (same pattern as LeadDetailNew)
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Package,
  User,
  MapPin,
  CreditCard,
  Truck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileText,
  Mail,
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import { useToast } from '../ui/Toast';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCents(cents) {
  if (!cents && cents !== 0) return '$0.00';
  return `$${(Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

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

function paymentColor(status) {
  const map = { unpaid: 'text-red-600', deposit_paid: 'text-amber-600', paid: 'text-emerald-600', refunded: 'text-gray-500' };
  return map[status] || 'text-gray-500';
}

const VALID_NEXT = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function OrderDetailNew({ orderId, onClose }) {
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [emailingSO, setEmailingSO] = useState(false);
  const [emailingDS, setEmailingDS] = useState(false);

  const fetchOrder = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get(`/api/orders/${orderId}`);
      setOrder(res.data);
    } catch (err) {
      setError(err.response?.status === 404 ? 'Order not found' : err.message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  /* ── Update status ── */
  const handleUpdateStatus = async (newStatus) => {
    setStatusLoading(true);
    try {
      await apiClient.patch(`/api/orders/${orderId}/status`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      fetchOrder();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    } finally {
      setStatusLoading(false);
    }
  };

  /* ── Cancel order ── */
  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this order? This cannot be undone.')) return;
    setCancelLoading(true);
    try {
      await apiClient.post(`/api/orders/${orderId}/cancel`, { reason: 'Cancelled via dashboard' });
      toast.success('Order cancelled');
      fetchOrder();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel order');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleEmailSalesOrder = async () => {
    setEmailingSO(true);
    try {
      await apiClient.post(`/api/sales-orders/${order.transaction_id || orderId}/email`);
      toast.success('Sales order emailed to customer');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to email sales order');
    } finally {
      setEmailingSO(false);
    }
  };

  const handleEmailDeliverySlip = async () => {
    setEmailingDS(true);
    try {
      await apiClient.post(`/api/delivery-slips/transaction/${order.transaction_id || orderId}/email`);
      toast.success('Delivery slip emailed to customer');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to email delivery slip');
    } finally {
      setEmailingDS(false);
    }
  };

  const badge = order ? statusBadge(order.status) : null;
  const nextStatuses = order ? (VALID_NEXT[order.status] || []).filter((s) => s !== 'cancelled') : [];

  return (
    <motion.div
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 80, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="w-[640px] h-full bg-background border-l border-border flex flex-col overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-card to-muted/30 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <Package size={20} className="text-primary" />
          {order && (
            <>
              <span className="text-foreground font-primary text-lg font-bold">{order.order_number}</span>
              <span
                className={`inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-semibold ${badge.className}`}
              >
                {badge.label}
              </span>
            </>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-secondary transition-colors">
          <X size={18} className="text-muted-foreground" />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto p-6 flex flex-col gap-5">
        {/* Loading */}
        {loading && (
          <div className="flex-1 flex flex-col gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex flex-col gap-2 bg-card border border-border rounded-xl p-4">
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                <div className="h-3 w-full rounded bg-muted animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-2 py-12">
            <AlertTriangle size={24} className="text-destructive" />
            <span className="text-destructive font-secondary text-sm">{error}</span>
          </div>
        )}

        {/* Content */}
        {!loading && order && (
          <>
            {/* Customer Card */}
            <div className="flex flex-col gap-2 bg-card border border-border border-l-4 border-l-blue-500 rounded-xl p-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50 mb-1">
                <User size={16} className="text-primary" />
                <span className="text-foreground font-primary text-sm font-semibold">Customer</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <span className="text-muted-foreground font-secondary">Name</span>
                  <p className="text-foreground font-secondary font-medium">{order.customer_name || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground font-secondary">Company</span>
                  <p className="text-foreground font-secondary font-medium">{order.company || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground font-secondary">Email</span>
                  <p className="text-foreground font-secondary font-medium">{order.email || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground font-secondary">Phone</span>
                  <p className="text-foreground font-secondary font-medium">{order.phone || '—'}</p>
                </div>
              </div>
              {order.address && (
                <div className="flex items-start gap-1.5 pt-1">
                  <MapPin size={12} className="text-muted-foreground mt-0.5" />
                  <span className="text-muted-foreground font-secondary text-[11px]">
                    {[order.address, order.city, order.province, order.postal_code].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* Order Items */}
            <div className="flex flex-col bg-card border border-border border-l-4 border-l-primary rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 pb-2 border-b border-border/50 mb-1">
                <span className="text-foreground font-primary text-sm font-semibold">Order Items</span>
                <span className="text-muted-foreground font-secondary text-[11px]">
                  {order.items?.length || 0} items
                </span>
              </div>
              <div className="flex items-center px-4 py-1.5 bg-muted/50 border-b border-border/50 text-muted-foreground font-secondary text-[10px] font-semibold uppercase tracking-wider">
                <span className="flex-1">Product</span>
                <span className="w-[50px] text-center">Qty</span>
                <span className="w-[80px] text-right">Price</span>
                <span className="w-[80px] text-right">Total</span>
              </div>
              {(order.items || []).map((item) => (
                <div key={item.id} className="flex items-center px-4 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 flex flex-col">
                    <span className="text-foreground font-secondary text-[12px] font-medium">{item.product_name || item.model}</span>
                    <span className="text-muted-foreground font-secondary text-[10px]">{item.manufacturer}</span>
                  </div>
                  <span className="w-[50px] text-center text-foreground font-primary text-[12px]">{item.quantity}</span>
                  <span className="w-[80px] text-right text-foreground font-primary text-[12px]">{formatCents(item.unit_price_cents)}</span>
                  <span className="w-[80px] text-right text-foreground font-primary text-[12px] font-semibold">{formatCents(item.total_cents)}</span>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="flex flex-col gap-2 bg-card border border-border border-l-4 border-l-emerald-500 rounded-xl p-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50 mb-1">
                <CreditCard size={16} className="text-primary" />
                <span className="text-foreground font-primary text-sm font-semibold">Summary</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-secondary text-[12px]">Subtotal</span>
                  <span className="text-foreground font-primary text-[12px]">{formatCents(order.subtotal_cents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-secondary text-[12px]">Tax</span>
                  <span className="text-foreground font-primary text-[12px]">{formatCents(order.tax_cents)}</span>
                </div>
                <div className="h-px bg-border my-1" />
                <div className="flex justify-between">
                  <span className="text-foreground font-primary text-sm font-bold">Total</span>
                  <span className="text-foreground font-primary text-[16px] font-bold">{formatCents(order.total_cents)}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground font-secondary text-[12px]">Amount Paid</span>
                  <span className={`font-primary text-[12px] font-semibold ${paymentColor(order.payment_status)}`}>
                    {formatCents(order.amount_paid_cents || order.deposit_paid_cents || 0)}
                  </span>
                </div>
                <div className={`flex justify-between ${((order.total_cents || 0) - (order.amount_paid_cents || order.deposit_paid_cents || 0)) > 0 ? 'text-red-600 font-bold bg-red-500/10 rounded-lg p-2' : ''}`}>
                  <span className="text-muted-foreground font-secondary text-[12px]">Balance Due</span>
                  <span className="font-primary text-[12px] font-semibold">
                    {formatCents((order.total_cents || 0) - (order.amount_paid_cents || order.deposit_paid_cents || 0))}
                  </span>
                </div>
              </div>
            </div>

            {/* Fulfillment */}
            <div className="flex flex-col gap-2 bg-card border border-border border-l-4 border-l-amber-500 rounded-xl p-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50 mb-1">
                <Truck size={16} className="text-primary" />
                <span className="text-foreground font-primary text-sm font-semibold">Fulfillment</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <span className="text-muted-foreground font-secondary">Delivery Date</span>
                  <p className="text-foreground font-secondary font-medium">{order.delivery_date ? formatDate(order.delivery_date) : '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground font-secondary">Notes</span>
                  <p className="text-foreground font-secondary font-medium">{order.delivery_notes || order.notes || '—'}</p>
                </div>
              </div>
            </div>

            {/* Documents / Print Actions */}
            <div className="flex flex-col gap-2 bg-card border border-border border-l-4 border-l-indigo-500 rounded-xl p-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50 mb-1">
                <FileText size={16} className="text-primary" />
                <span className="text-foreground font-primary text-sm font-semibold">Documents</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => window.open(`/api/sales-orders/${order.transaction_id || orderId}/view`, '_blank')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                >
                  <FileText size={14} />
                  Print Sales Order
                </button>
                <button
                  onClick={handleEmailSalesOrder}
                  disabled={emailingSO}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                >
                  {emailingSO ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                  {emailingSO ? 'Sending...' : 'Email Sales Order'}
                </button>
                {(order.delivery_date || order.delivery_address) && (
                  <>
                    <button
                      onClick={() => window.open(`/api/delivery-slips/transaction/${order.transaction_id || orderId}/view`, '_blank')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/20 transition-colors"
                    >
                      <Truck size={14} />
                      Print Delivery Slip
                    </button>
                    <button
                      onClick={() => window.open(`/api/delivery-slips/transaction/${order.transaction_id || orderId}/waiver`, '_blank')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors"
                    >
                      <FileText size={14} />
                      Print Delivery Waiver
                    </button>
                    <button
                      onClick={handleEmailDeliverySlip}
                      disabled={emailingDS}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-teal-500/10 text-teal-600 hover:bg-teal-500/20 transition-colors disabled:opacity-50"
                    >
                      {emailingDS ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                      {emailingDS ? 'Sending...' : 'Email Delivery Slip'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="flex flex-col gap-2 bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border/50 mb-1">
                <Clock size={16} className="text-primary" />
                <span className="text-foreground font-primary text-sm font-semibold">Timeline</span>
              </div>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Created', date: order.created_at, icon: <Package size={12} />, dotColor: 'text-blue-500' },
                  { label: 'Confirmed', date: order.confirmed_at, icon: <CheckCircle2 size={12} />, dotColor: 'text-emerald-500' },
                  { label: 'Shipped', date: order.shipped_at, icon: <Truck size={12} />, dotColor: 'text-cyan-500' },
                  { label: 'Delivered', date: order.delivered_at, icon: <CheckCircle2 size={12} />, dotColor: 'text-emerald-600' },
                  ...(order.cancelled_at ? [{ label: 'Cancelled', date: order.cancelled_at, icon: <AlertTriangle size={12} />, dotColor: 'text-red-500' }] : []),
                ].filter((e) => e.date).map((event) => (
                  <div key={event.label} className="flex items-center gap-2">
                    <span className={event.dotColor}>{event.icon}</span>
                    <span className="text-foreground font-secondary text-[12px] font-medium w-[80px]">{event.label}</span>
                    <span className="text-muted-foreground font-secondary text-[11px]">{formatDate(event.date)}</span>
                  </div>
                ))}
              </div>
              {order.cancel_reason && (
                <div className="mt-1 p-2 rounded-lg bg-destructive/10">
                  <span className="text-destructive font-secondary text-[11px]">Reason: {order.cancel_reason}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            {order.status !== 'cancelled' && order.status !== 'delivered' && (
              <div className="flex items-center gap-2 pt-1">
                {nextStatuses.map((ns) => {
                  const nBadge = statusBadge(ns);
                  return (
                    <motion.button
                      key={ns}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleUpdateStatus(ns)}
                      disabled={statusLoading}
                      className={`h-10 px-4 rounded-lg font-primary text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5 border ${nBadge.className}`}
                    >
                      {statusLoading && <Loader2 size={14} className="animate-spin" />}
                      Mark as {nBadge.label}
                    </motion.button>
                  );
                })}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="h-10 px-4 rounded-lg border border-destructive/30 text-destructive font-primary text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
                >
                  {cancelLoading && <Loader2 size={14} className="animate-spin" />}
                  Cancel Order
                </motion.button>
              </div>
            )}

            {/* Quote Link */}
            {order.quote_number && (
              <div className="text-muted-foreground font-secondary text-[11px] pt-1">
                Converted from quote: <span className="text-primary font-medium">{order.quote_number}</span>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
