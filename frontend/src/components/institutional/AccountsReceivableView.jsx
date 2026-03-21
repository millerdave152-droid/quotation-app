/**
 * AccountsReceivableView — Manager-facing AR Dashboard
 * Route: /institutional/ar
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Select, MenuItem, FormControl, InputLabel,
  Chip, CircularProgress
} from '@mui/material';
import { useToast } from '../ui/Toast';
import StatCard from '../shared/StatCard';
import apiClient from '../../services/apiClient';
import { DollarSign, AlertTriangle, Clock, TrendingUp } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'issued', label: 'Issued' },
  { value: 'sent', label: 'Sent' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];

const PAYMENT_METHODS = [
  { value: 'cheque', label: 'Cheque' },
  { value: 'eft', label: 'EFT' },
  { value: 'wire', label: 'Wire Transfer' },
  { value: 'credit_card', label: 'Credit Card' },
];

const formatCurrency = (cents) => {
  if (!cents && cents !== 0) return '$0.00';
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

const formatDate = (d) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-CA');
};

const daysBetween = (a, b) => {
  const d1 = new Date(a);
  const d2 = b ? new Date(b) : new Date();
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
};

export default function AccountsReceivableView() {
  const navigate = useNavigate();
  const toast = useToast();

  // Data
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [overdueData, setOverdueData] = useState({ invoices: [], total: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Payment dialog
  const [paymentDialog, setPaymentDialog] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount_cents: '', payment_method: '', payment_reference: '',
    received_date: new Date().toISOString().slice(0, 10), notes: ''
  });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (dateFrom) params.append('fromDate', dateFrom);
      if (dateTo) params.append('toDate', dateTo);
      params.append('limit', pageSize);
      params.append('offset', page * pageSize);

      const { data } = await apiClient.get(`/api/institutional/invoices?${params}`);
      const result = data.data || data;
      setInvoices(result.invoices || []);
      setTotal(result.total || 0);
    } catch (err) {
      toast.error('Failed to load invoices');
    }
    setLoading(false);
  }, [statusFilter, dateFrom, dateTo, page, toast]);

  const fetchOverdue = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/institutional/invoices/overdue');
      const result = data.data || data;
      setOverdueData({ invoices: result.invoices || [], total: result.total || 0 });
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { fetchOverdue(); }, [fetchOverdue]);

  // Computed stats
  const stats = useMemo(() => {
    const all = invoices;
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalOutstanding = 0;
    let dueThisWeekCount = 0;
    let dueThisWeekValue = 0;

    all.forEach(inv => {
      if (!['paid', 'void'].includes(inv.status)) {
        totalOutstanding += (inv.total_cents - inv.paid_cents);
        const due = new Date(inv.due_date);
        if (due <= weekFromNow && due >= now) {
          dueThisWeekCount++;
          dueThisWeekValue += (inv.total_cents - inv.paid_cents);
        }
      }
    });

    const overdueCount = overdueData.total;
    const overdueValue = overdueData.invoices.reduce(
      (sum, inv) => sum + (inv.total_cents - inv.paid_cents), 0
    );

    // Collected MTD — approximate from paid invoices this month
    const collectedMTD = all
      .filter(inv => inv.status === 'paid' && inv.paid_date && new Date(inv.paid_date) >= monthStart)
      .reduce((sum, inv) => sum + inv.total_cents, 0);

    return { totalOutstanding, overdueCount, overdueValue, dueThisWeekCount, dueThisWeekValue, collectedMTD };
  }, [invoices, overdueData]);

  // Filtered by search
  const displayed = useMemo(() => {
    if (!searchTerm) return invoices;
    const s = searchTerm.toLowerCase();
    return invoices.filter(inv =>
      (inv.org_name || '').toLowerCase().includes(s) ||
      (inv.customer_name || '').toLowerCase().includes(s) ||
      (inv.invoice_number || '').toLowerCase().includes(s)
    );
  }, [invoices, searchTerm]);

  // Row background
  const getRowBg = (inv) => {
    if (inv.status === 'paid') return '#F0FDF4';
    if (inv.status === 'void') return '#F9FAFB';
    const days = daysBetween(inv.issued_date, null);
    if (inv.status === 'overdue' && days > 30) return '#FEF2F2';
    if (inv.status === 'overdue') return '#FFFBEB';
    const dueDate = new Date(inv.due_date);
    const inWeek = dueDate <= new Date(Date.now() + 7 * 86400000);
    if (['issued', 'sent', 'partially_paid'].includes(inv.status) && inWeek) return '#FFF7ED';
    return 'white';
  };

  // Days outstanding
  const getDaysOutstanding = (inv) => {
    if (inv.status === 'paid' && inv.paid_date) return daysBetween(inv.issued_date, inv.paid_date);
    return daysBetween(inv.issued_date, null);
  };

  const getDaysColor = (days) => {
    if (days < 30) return '#059669';
    if (days <= 60) return '#d97706';
    return '#dc2626';
  };

  // Payment
  const openPaymentDialog = (inv) => {
    setPaymentDialog(inv);
    setPaymentForm({
      amount_cents: '', payment_method: '', payment_reference: '',
      received_date: new Date().toISOString().slice(0, 10), notes: ''
    });
  };

  const submitPayment = async () => {
    const amountCents = Math.round(parseFloat(paymentForm.amount_cents) * 100);
    if (!amountCents || amountCents <= 0) {
      toast.warning('Enter a valid payment amount');
      return;
    }
    if (!paymentForm.payment_method) {
      toast.warning('Select a payment method');
      return;
    }
    if (!paymentForm.received_date) {
      toast.warning('Enter received date');
      return;
    }
    if (new Date(paymentForm.received_date) > new Date()) {
      toast.warning('Received date cannot be in the future');
      return;
    }

    const balance = paymentDialog.total_cents - paymentDialog.paid_cents;
    if (amountCents > balance) {
      // Warn but don't block
      if (!window.confirm(`Amount ($${(amountCents / 100).toFixed(2)}) exceeds balance owing ($${(balance / 100).toFixed(2)}). Continue?`)) return;
    }

    setPaymentSubmitting(true);
    try {
      await apiClient.post(`/api/institutional/invoices/${paymentDialog.id}/payment`, {
        amount_cents: amountCents,
        payment_method: paymentForm.payment_method,
        payment_reference: paymentForm.payment_reference || null,
        received_date: paymentForm.received_date,
        notes: paymentForm.notes || null,
      });
      toast.success('Payment recorded');
      setPaymentDialog(null);
      fetchInvoices();
      fetchOverdue();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record payment');
    }
    setPaymentSubmitting(false);
  };

  // PDF
  const handleViewPDF = async (inv) => {
    if (inv.pdf_url) {
      window.open(inv.pdf_url, '_blank');
      return;
    }
    try {
      toast.info('Generating PDF...');
      const { data } = await apiClient.post(`/api/institutional/invoices/${inv.id}/pdf`);
      const url = data.data?.pdf_url || data.pdf_url;
      if (url) window.open(url, '_blank');
      fetchInvoices();
    } catch {
      toast.error('Failed to generate PDF');
    }
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: '28px', fontWeight: 'bold', color: '#1f2937' }}>
            Accounts Receivable
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
            Institutional invoice tracking and payment management
          </p>
        </div>

        {/* Overdue alert strip */}
        {overdueData.total > 0 && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} color="#dc2626" />
            <span style={{ color: '#991B1B', fontWeight: 600, fontSize: '14px' }}>
              {overdueData.total} overdue invoice{overdueData.total > 1 ? 's' : ''} totalling {formatCurrency(overdueData.invoices.reduce((s, i) => s + (i.total_cents - i.paid_cents), 0))}
            </span>
          </div>
        )}

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          <StatCard label="Total Outstanding" value={formatCurrency(stats.totalOutstanding)} icon={DollarSign} iconColor="#3b82f6" />
          <StatCard label="Overdue" value={`${stats.overdueCount} invoices`} subtitle={formatCurrency(stats.overdueValue)} subtitleColor="#dc2626" icon={AlertTriangle} iconColor="#dc2626" />
          <StatCard label="Due This Week" value={`${stats.dueThisWeekCount} invoices`} subtitle={formatCurrency(stats.dueThisWeekValue)} subtitleColor="#d97706" icon={Clock} iconColor="#d97706" />
          <StatCard label="Collected MTD" value={formatCurrency(stats.collectedMTD)} icon={TrendingUp} iconColor="#059669" />
        </div>

        {/* Filter bar */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          {/* Status chips */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {STATUS_OPTIONS.map(opt => (
              <Chip
                key={opt.value}
                label={opt.label}
                size="small"
                variant={statusFilter === opt.value ? 'filled' : 'outlined'}
                color={statusFilter === opt.value ? 'primary' : 'default'}
                onClick={() => { setStatusFilter(opt.value); setPage(0); }}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </div>

          <div style={{ flex: 1, minWidth: '180px' }}>
            <input
              placeholder="Search account or invoice #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
            />
          </div>

          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
            placeholder="From"
          />
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }}
            placeholder="To"
          />
        </div>

        {/* Invoice table */}
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center' }}><CircularProgress /></div>
          ) : displayed.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>No invoices found</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {['Account', 'Invoice #', 'Amount', 'Issued', 'Due Date', 'Days', 'Paid', 'Balance', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#4b5563', fontSize: '12px', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map(inv => {
                  const days = getDaysOutstanding(inv);
                  const balance = inv.total_cents - inv.paid_cents;
                  return (
                    <tr key={inv.id} style={{ background: getRowBg(inv), borderBottom: '1px solid #f3f4f6', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => { if (getRowBg(inv) === 'white') e.currentTarget.style.background = '#f9fafb'; }}
                      onMouseLeave={(e) => e.currentTarget.style.background = getRowBg(inv)}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{ color: '#3b82f6', cursor: 'pointer', fontWeight: 500 }}
                          onClick={() => navigate(`/institutional/${inv.profile_id}`)}
                        >
                          {inv.org_name || inv.customer_name}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 500 }}>{inv.invoice_number}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{formatCurrency(inv.total_cents)}</td>
                      <td style={{ padding: '10px 12px', color: '#6b7280' }}>{formatDate(inv.issued_date)}</td>
                      <td style={{ padding: '10px 12px', color: '#6b7280' }}>{formatDate(inv.due_date)}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: getDaysColor(days) }}>{days}d</td>
                      <td style={{ padding: '10px 12px', color: '#059669' }}>{inv.paid_cents > 0 ? formatCurrency(inv.paid_cents) : '-'}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: balance > 0 ? '#dc2626' : '#059669' }}>
                        {formatCurrency(balance)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Chip label={inv.status.replace('_', ' ')} size="small"
                          color={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'error' : inv.status === 'partially_paid' ? 'warning' : inv.status === 'void' ? 'default' : 'info'}
                          sx={{ textTransform: 'capitalize', fontSize: '11px' }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {!['paid', 'void'].includes(inv.status) && (
                            <button onClick={() => openPaymentDialog(inv)}
                              style={{ padding: '4px 10px', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
                              Record Payment
                            </button>
                          )}
                          <button onClick={() => handleViewPDF(inv)}
                            style={{ padding: '4px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {total > pageSize && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#6b7280', fontSize: '13px' }}>
                Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                  style={{ padding: '6px 16px', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>
                  Previous
                </button>
                <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)}
                  style={{ padding: '6px 16px', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', cursor: (page + 1) * pageSize >= total ? 'not-allowed' : 'pointer', opacity: (page + 1) * pageSize >= total ? 0.5 : 1 }}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={!!paymentDialog} onClose={() => setPaymentDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Record Payment — {paymentDialog?.invoice_number}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {paymentDialog && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
              <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px', fontSize: '13px' }}>
                <div>Total: <strong>{formatCurrency(paymentDialog.total_cents)}</strong></div>
                <div>Paid: <strong>{formatCurrency(paymentDialog.paid_cents)}</strong></div>
                <div style={{ color: '#dc2626', fontWeight: 600 }}>
                  Balance: {formatCurrency(paymentDialog.total_cents - paymentDialog.paid_cents)}
                </div>
              </div>

              <TextField
                label="Amount ($)"
                type="number"
                value={paymentForm.amount_cents}
                onChange={(e) => setPaymentForm(f => ({ ...f, amount_cents: e.target.value }))}
                inputProps={{ step: '0.01', min: '0.01' }}
                fullWidth
                required
              />

              <FormControl fullWidth required>
                <InputLabel>Payment Method</InputLabel>
                <Select
                  value={paymentForm.payment_method}
                  label="Payment Method"
                  onChange={(e) => setPaymentForm(f => ({ ...f, payment_method: e.target.value }))}
                >
                  {PAYMENT_METHODS.map(m => (
                    <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Reference / Cheque #"
                value={paymentForm.payment_reference}
                onChange={(e) => setPaymentForm(f => ({ ...f, payment_reference: e.target.value }))}
                fullWidth
              />

              <TextField
                label="Received Date"
                type="date"
                value={paymentForm.received_date}
                onChange={(e) => setPaymentForm(f => ({ ...f, received_date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                fullWidth
                required
              />

              <TextField
                label="Notes"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm(f => ({ ...f, notes: e.target.value }))}
                multiline rows={2} fullWidth
              />
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialog(null)}>Cancel</Button>
          <Button onClick={submitPayment} variant="contained" color="success" disabled={paymentSubmitting}>
            {paymentSubmitting ? 'Recording...' : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
