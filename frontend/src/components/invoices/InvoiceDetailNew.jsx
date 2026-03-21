/**
 * InvoiceDetailNew.jsx — Invoice Detail Panel
 * TeleTime Design System · Single Invoice View
 * Slide-in right panel (same pattern as OrderDetailNew)
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  FileText,
  User,
  MapPin,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Send,
  Ban,
  DollarSign,
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

function formatShortDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function statusBadge(status) {
  const map = {
    draft:          { bg: 'rgba(245,158,11,0.08)', color: '#F59E0B', label: 'Draft' },
    sent:           { bg: 'rgba(59,130,246,0.08)',  color: '#3B82F6', label: 'Sent' },
    partially_paid: { bg: 'rgba(139,92,246,0.08)',  color: '#8B5CF6', label: 'Partial' },
    paid:           { bg: 'rgba(34,197,94,0.08)',   color: '#22C55E', label: 'Paid' },
    overdue:        { bg: 'rgba(239,68,68,0.08)',   color: '#EF4444', label: 'Overdue' },
    void:           { bg: 'rgba(100,116,139,0.08)', color: '#64748B', label: 'Void' },
  };
  return map[status] || { bg: 'rgba(100,116,139,0.08)', color: '#64748B', label: status || '—' };
}

const PAYMENT_METHODS = ['cash', 'credit_card', 'debit', 'e-transfer', 'cheque', 'wire'];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InvoiceDetailNew({ invoiceId, onClose }) {
  const toast = useToast();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  /* ── Payment form ── */
  const [showPayForm, setShowPayForm] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('credit_card');
  const [payNotes, setPayNotes] = useState('');
  const [payLoading, setPayLoading] = useState(false);

  const fetchInvoice = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get(`/api/invoices/${invoiceId}`);
      setInvoice(res.data);
    } catch (err) {
      setError(err.response?.status === 404 ? 'Invoice not found' : (err?.message || err?.error || 'An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

  /* ── Send Invoice ── */
  const handleSend = async () => {
    setActionLoading(true);
    try {
      await apiClient.post(`/api/invoices/${invoiceId}/send`);
      toast.success('Invoice sent');
      fetchInvoice();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send invoice');
    } finally {
      setActionLoading(false);
    }
  };

  /* ── Void Invoice ── */
  const handleVoid = async () => {
    const reason = window.prompt('Reason for voiding this invoice:');
    if (!reason) return;
    setActionLoading(true);
    try {
      await apiClient.post(`/api/invoices/${invoiceId}/void`, { reason });
      toast.success('Invoice voided');
      fetchInvoice();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to void invoice');
    } finally {
      setActionLoading(false);
    }
  };

  /* ── Record Payment ── */
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(payAmount) * 100);
    if (!amountCents || amountCents <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setPayLoading(true);
    try {
      await apiClient.post(`/api/invoices/${invoiceId}/payments`, {
        amountCents,
        paymentMethod: payMethod,
        notes: payNotes || undefined,
      });
      toast.success('Payment recorded');
      setShowPayForm(false);
      setPayAmount('');
      setPayNotes('');
      fetchInvoice();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record payment');
    } finally {
      setPayLoading(false);
    }
  };

  const badge = invoice ? statusBadge(invoice.status) : null;
  const isTerminal = invoice && (invoice.status === 'void' || invoice.status === 'paid');

  return (
    <motion.div
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 80, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="w-[640px] h-full bg-background border-l border-border flex flex-col overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <FileText size={20} className="text-primary" />
          {invoice && (
            <>
              <span className="text-foreground font-primary text-[16px] font-bold">{invoice.invoice_number}</span>
              <span
                className="inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-semibold"
                style={{ backgroundColor: badge.bg, color: badge.color }}
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
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={28} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-2 py-12">
            <AlertTriangle size={24} className="text-destructive" />
            <span className="text-destructive font-secondary text-sm">{typeof error === 'object' ? error.message || JSON.stringify(error) : error}</span>
          </div>
        )}

        {/* Content */}
        {!loading && invoice && (
          <>
            {/* Customer Card */}
            <div className="flex flex-col gap-2 bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <User size={16} className="text-primary" />
                <span className="text-foreground font-primary text-sm font-semibold">Customer</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <span className="text-muted-foreground font-secondary">Name</span>
                  <p className="text-foreground font-secondary font-medium">{invoice.customer_name || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground font-secondary">Company</span>
                  <p className="text-foreground font-secondary font-medium">{invoice.company || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground font-secondary">Email</span>
                  <p className="text-foreground font-secondary font-medium">{invoice.email || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground font-secondary">Phone</span>
                  <p className="text-foreground font-secondary font-medium">{invoice.phone || '—'}</p>
                </div>
              </div>
              {invoice.address && (
                <div className="flex items-start gap-1.5 pt-1">
                  <MapPin size={12} className="text-muted-foreground mt-0.5" />
                  <span className="text-muted-foreground font-secondary text-[11px]">
                    {[invoice.address, invoice.city, invoice.province, invoice.postal_code].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* Line Items */}
            <div className="flex flex-col bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-foreground font-primary text-sm font-semibold">Line Items</span>
                <span className="text-muted-foreground font-secondary text-[11px]">
                  {invoice.items?.length || 0} items
                </span>
              </div>
              <div className="flex items-center px-4 py-1.5 bg-secondary text-muted-foreground font-secondary text-[10px] font-semibold" style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="flex-1">Description</span>
                <span className="w-[50px] text-center">Qty</span>
                <span className="w-[80px] text-right">Price</span>
                <span className="w-[80px] text-right">Total</span>
              </div>
              {(invoice.items || []).map((item) => (
                <div key={item.id} className="flex items-center px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="flex-1 text-foreground font-secondary text-[12px] font-medium truncate pr-2">
                    {item.description || item.product_name || `Product #${item.product_id}`}
                  </span>
                  <span className="w-[50px] text-center text-foreground font-primary text-[12px]">{item.quantity}</span>
                  <span className="w-[80px] text-right text-foreground font-primary text-[12px]">{formatCents(item.unit_price_cents)}</span>
                  <span className="w-[80px] text-right text-foreground font-primary text-[12px] font-semibold">{formatCents(item.total_cents)}</span>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="flex flex-col gap-2 bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard size={16} className="text-primary" />
                <span className="text-foreground font-primary text-sm font-semibold">Summary</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-secondary text-[12px]">Subtotal</span>
                  <span className="text-foreground font-primary text-[12px]">{formatCents(invoice.subtotal_cents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-secondary text-[12px]">Tax</span>
                  <span className="text-foreground font-primary text-[12px]">{formatCents(invoice.tax_cents)}</span>
                </div>
                <div className="h-px bg-border my-1" />
                <div className="flex justify-between">
                  <span className="text-foreground font-primary text-sm font-bold">Total</span>
                  <span className="text-foreground font-primary text-[16px] font-bold">{formatCents(invoice.total_cents)}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground font-secondary text-[12px]">Amount Paid</span>
                  <span className="text-[#22C55E] font-primary text-[12px] font-semibold">{formatCents(invoice.amount_paid_cents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-secondary text-[12px]">Balance Due</span>
                  <span className={`font-primary text-[12px] font-semibold ${invoice.balance_due_cents > 0 ? 'text-[#EF4444]' : 'text-foreground'}`}>
                    {formatCents(invoice.balance_due_cents)}
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground font-secondary text-[12px]">Due Date</span>
                  <span className="text-foreground font-secondary text-[12px] font-medium">{formatShortDate(invoice.due_date)}</span>
                </div>
                {invoice.payment_terms && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-secondary text-[12px]">Payment Terms</span>
                    <span className="text-foreground font-secondary text-[12px] font-medium">{invoice.payment_terms}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Payments */}
            {(invoice.payments?.length > 0 || !isTerminal) && (
              <div className="flex flex-col gap-2 bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <DollarSign size={16} className="text-primary" />
                    <span className="text-foreground font-primary text-sm font-semibold">Payments</span>
                  </div>
                  {!isTerminal && invoice.balance_due_cents > 0 && (
                    <button
                      onClick={() => setShowPayForm(!showPayForm)}
                      className="text-primary font-secondary text-[11px] font-semibold hover:underline"
                    >
                      {showPayForm ? 'Cancel' : '+ Record Payment'}
                    </button>
                  )}
                </div>

                {(invoice.payments || []).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="flex flex-col">
                      <span className="text-foreground font-secondary text-[12px] font-medium">
                        {formatCents(p.amount_cents)}
                      </span>
                      <span className="text-muted-foreground font-secondary text-[10px]">
                        {p.payment_method} {p.reference_number ? `· ${p.reference_number}` : ''}
                      </span>
                    </div>
                    <span className="text-muted-foreground font-secondary text-[11px]">{formatDate(p.paid_at)}</span>
                  </div>
                ))}

                {invoice.payments?.length === 0 && !showPayForm && (
                  <span className="text-muted-foreground font-secondary text-[11px]">No payments recorded</span>
                )}

                {/* Record Payment Form */}
                {showPayForm && (
                  <form onSubmit={handleRecordPayment} className="flex flex-col gap-2 pt-2 border-t border-border">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-muted-foreground font-secondary text-[10px]">Amount ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          placeholder={(invoice.balance_due_cents / 100).toFixed(2)}
                          className="h-8 px-2 rounded border border-input bg-background text-foreground font-secondary text-sm outline-none"
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-muted-foreground font-secondary text-[10px]">Method</label>
                        <select
                          value={payMethod}
                          onChange={(e) => setPayMethod(e.target.value)}
                          className="h-8 px-2 rounded border border-input bg-background text-foreground font-secondary text-sm outline-none"
                        >
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-muted-foreground font-secondary text-[10px]">Notes (optional)</label>
                      <input
                        type="text"
                        value={payNotes}
                        onChange={(e) => setPayNotes(e.target.value)}
                        className="h-8 px-2 rounded border border-input bg-background text-foreground font-secondary text-sm outline-none"
                      />
                    </div>
                    <motion.button
                      type="submit"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      disabled={payLoading}
                      className="h-9 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {payLoading && <Loader2 size={14} className="animate-spin" />}
                      Record Payment
                    </motion.button>
                  </form>
                )}
              </div>
            )}

            {/* Timeline */}
            <div className="flex flex-col gap-2 bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={16} className="text-primary" />
                <span className="text-foreground font-primary text-sm font-semibold">Timeline</span>
              </div>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Created', date: invoice.created_at, icon: <FileText size={12} /> },
                  { label: 'Sent', date: invoice.sent_at, icon: <Send size={12} /> },
                  { label: 'Paid', date: invoice.paid_at, icon: <CheckCircle2 size={12} /> },
                  ...(invoice.voided_at ? [{ label: 'Voided', date: invoice.voided_at, icon: <Ban size={12} /> }] : []),
                ].filter((e) => e.date).map((event) => (
                  <div key={event.label} className="flex items-center gap-2">
                    <span className="text-muted-foreground">{event.icon}</span>
                    <span className="text-foreground font-secondary text-[12px] font-medium w-[80px]">{event.label}</span>
                    <span className="text-muted-foreground font-secondary text-[11px]">{formatDate(event.date)}</span>
                  </div>
                ))}
              </div>
              {invoice.void_reason && (
                <div className="mt-1 p-2 rounded-lg bg-destructive/10">
                  <span className="text-destructive font-secondary text-[11px]">Reason: {invoice.void_reason}</span>
                </div>
              )}
            </div>

            {/* Related Docs */}
            {(invoice.quote_number || invoice.order_number) && (
              <div className="text-muted-foreground font-secondary text-[11px] pt-1 flex flex-col gap-0.5">
                {invoice.quote_number && (
                  <span>Quote: <span className="text-primary font-medium">{invoice.quote_number}</span></span>
                )}
                {invoice.order_number && (
                  <span>Order: <span className="text-primary font-medium">{invoice.order_number}</span></span>
                )}
              </div>
            )}

            {/* Actions */}
            {!isTerminal && (
              <div className="flex items-center gap-2 pt-1">
                {(invoice.status === 'draft' || invoice.status === 'overdue') && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSend}
                    disabled={actionLoading}
                    className="h-10 px-4 rounded-lu-pill bg-primary text-primary-foreground font-primary text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {actionLoading && <Loader2 size={14} className="animate-spin" />}
                    <Send size={14} />
                    Send Invoice
                  </motion.button>
                )}
                {invoice.status !== 'draft' && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleVoid}
                    disabled={actionLoading}
                    className="h-10 px-4 rounded-lu-pill border border-destructive/30 text-destructive font-primary text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Ban size={14} />
                    Void Invoice
                  </motion.button>
                )}
              </div>
            )}

            {/* Notes */}
            {invoice.notes && (
              <div className="bg-card border border-border rounded-xl p-4">
                <span className="text-muted-foreground font-secondary text-[11px]">Notes</span>
                <p className="text-foreground font-secondary text-[12px] font-medium mt-1">{invoice.notes}</p>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
