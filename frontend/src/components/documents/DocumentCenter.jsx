import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  Search, FileText, Receipt, Truck, ClipboardList, FileSpreadsheet,
  Mail, X, Calendar, AlertCircle, Loader2, Printer
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || '';

async function openAuthPdf(url, token) {
  try {
    const res = await fetch(`${API_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), '_blank');
  } catch (err) {
    alert('Failed to load document. Please try again.');
    console.error('[DocumentCentre] PDF error:', err);
  }
}

async function emailDocument(url, email, token) {
  try {
    const res = await fetch(`${API_URL}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email })
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || result.message || 'Email failed');
    alert('Document emailed successfully.');
  } catch (err) {
    alert(err.message || 'Failed to email document.');
  }
}

const fmt = (v) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(parseFloat(v) || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
const fmtDT = (d) => d ? new Date(d).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

function StatusBadge({ status }) {
  const c = {
    completed: 'bg-emerald-100 text-emerald-800',
    pending: 'bg-amber-100 text-amber-800',
    voided: 'bg-red-100 text-red-800',
    refunded: 'bg-purple-100 text-purple-800'
  }[status] || 'bg-gray-100 text-gray-700';
  return <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${c}`}>{(status || '').charAt(0).toUpperCase() + (status || '').slice(1)}</span>;
}

function SkeletonRows() {
  return Array.from({ length: 8 }).map((_, i) => (
    <tr key={i} className="animate-pulse">
      {[16, 28, 20, 14, 14, 24].map((w, j) => (
        <td key={j} className="px-5 py-4"><div className={`h-3.5 bg-gray-200 rounded-full`} style={{ width: `${w * 4}px` }} /></td>
      ))}
    </tr>
  ));
}

export default function DocumentCenter() {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const handleSearch = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!query.trim() && !dateFrom && !dateTo && !statusFilter) return;
    setLoading(true);
    setSearched(true);
    setSelected(null);
    setDetail(null);
    try {
      const p = new URLSearchParams();
      if (query.trim()) p.append('search', query.trim());
      if (dateFrom) p.append('startDate', dateFrom);
      if (dateTo) p.append('endDate', dateTo);
      if (statusFilter) p.append('status', statusFilter);
      p.append('limit', '50');
      const res = await axios.get(`${API_URL}/api/transactions?${p}`, { headers: { Authorization: `Bearer ${token}` } });
      setResults(res.data?.data || []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [query, dateFrom, dateTo, statusFilter, token]);

  const handleSelect = useCallback(async (txn) => {
    setSelected(txn);
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/receipts/${txn.transactionId}/data`, { headers: { Authorization: `Bearer ${token}` } });
      setDetail(res.data?.data || null);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  }, [token]);

  const promptEmail = (label, action) => {
    const email = prompt(`Email ${label} to:`);
    if (email && email.includes('@')) action(email);
  };

  const id = selected?.transactionId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* ── PAGE HEADER ── */}
      <div style={{ padding: '28px 32px 0', flexShrink: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Document Centre</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Search past transactions and reprint or email documents</p>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'stretch' }}>
          <div style={{ flex: '1 1 0%', minWidth: 0, position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, color: '#9ca3af', pointerEvents: 'none' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by customer name, order #, transaction #..."
              style={{
                width: '100%', boxSizing: 'border-box', padding: '12px 16px 12px 42px', fontSize: 14, border: '1px solid #d1d5db',
                borderRadius: 10, outline: 'none', background: '#f9fafb', transition: 'all 0.15s'
              }}
              onFocus={(e) => { e.target.style.borderColor = '#6366f1'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#d1d5db'; e.target.style.background = '#f9fafb'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 28px', fontSize: 14, fontWeight: 600, color: '#fff', background: '#4f46e5',
              border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              opacity: loading ? 0.6 : 1, transition: 'background 0.15s', flexShrink: 0, whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => { if (!loading) e.target.style.background = '#4338ca'; }}
            onMouseLeave={(e) => { e.target.style.background = '#4f46e5'; }}
          >
            {loading ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <Search style={{ width: 16, height: 16 }} />}
            Search
          </button>
        </form>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar style={{ width: 13, height: 13 }} /> Filters
          </span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            style={{ padding: '7px 12px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none', color: '#374151', background: '#f9fafb' }} />
          <span style={{ color: '#d1d5db', fontSize: 13 }}>to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: '7px 12px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none', color: '#374151', background: '#f9fafb' }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '7px 14px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none', color: '#374151', background: '#f9fafb', cursor: 'pointer' }}>
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="voided">Voided</option>
            <option value="refunded">Refunded</option>
          </select>
          {(dateFrom || dateTo || statusFilter) && (
            <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter(''); }}
              style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* ── CONTENT AREA ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, borderTop: '1px solid #e5e7eb' }}>

        {/* LEFT: Results Table */}
        <div style={{ flex: selected ? '0 0 55%' : '1 1 100%', display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: selected ? '1px solid #e5e7eb' : 'none', transition: 'flex 0.2s' }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {!searched ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', padding: 40 }}>
                <div style={{ width: 80, height: 80, background: '#f3f4f6', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  <Search style={{ width: 36, height: 36, color: '#d1d5db' }} />
                </div>
                <p style={{ fontSize: 16, fontWeight: 600, color: '#6b7280' }}>Search for a transaction</p>
                <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 6, textAlign: 'center', maxWidth: 340 }}>
                  Find by customer name, order number, or transaction number to view and reprint documents
                </p>
              </div>
            ) : loading ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Date', 'Transaction', 'Customer', 'Total', 'Status', 'Documents'].map(h => (
                    <th key={h} style={{ padding: '10px 20px', textAlign: h === 'Total' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody><SkeletonRows /></tbody>
              </table>
            ) : results.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9ca3af' }}>
                <AlertCircle style={{ width: 40, height: 40, marginBottom: 12, color: '#d1d5db' }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>No transactions found</p>
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Try a different search term or adjust filters</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 5 }}>
                  {['Date', 'Transaction', 'Customer', 'Total', 'Status', 'Documents'].map(h => (
                    <th key={h} style={{ padding: '10px 20px', textAlign: h === 'Total' ? 'right' : h === 'Documents' ? 'center' : 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {results.map((txn) => {
                    const tid = txn.transactionId;
                    const isSel = selected?.transactionId === tid;
                    return (
                      <tr key={tid} onClick={() => handleSelect(txn)}
                        style={{ cursor: 'pointer', background: isSel ? '#eef2ff' : 'transparent', borderBottom: '1px solid #f3f4f6', transition: 'background 0.1s' }}
                        onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = '#f9fafb'; }}
                        onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
                        <td style={{ padding: '12px 20px', color: '#6b7280' }}>{fmtDate(txn.createdAt)}</td>
                        <td style={{ padding: '12px 20px', fontWeight: 600, color: '#111827' }}>{txn.transactionNumber}</td>
                        <td style={{ padding: '12px 20px', color: '#374151' }}>{txn.customerName || 'Walk-in'}</td>
                        <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmt(txn.totalAmount)}</td>
                        <td style={{ padding: '12px 20px' }}><StatusBadge status={txn.status} /></td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
                            {[
                              { icon: Receipt, tip: 'Receipt', color: '#6b7280', url: `/api/receipts/${tid}/preview` },
                              { icon: FileText, tip: 'Sales Order', color: '#3b82f6', url: `/api/sales-orders/${tid}/view` },
                              { icon: Truck, tip: 'Delivery Slip', color: '#06b6d4', url: `/api/delivery-slips/transaction/${tid}/view` },
                              { icon: ClipboardList, tip: 'Waiver', color: '#f59e0b', url: `/api/delivery-slips/transaction/${tid}/waiver` }
                            ].map(({ icon: I, tip, color, url }) => (
                              <button key={tip} title={tip} type="button"
                                onClick={(e) => { e.stopPropagation(); openAuthPdf(url, token); }}
                                style={{ padding: 5, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color, display: 'flex', transition: 'background 0.1s' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                <I style={{ width: 16, height: 16 }} />
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT: Detail Panel */}
        {selected && (
          <div style={{ flex: '0 0 45%', display: 'flex', flexDirection: 'column', minHeight: 0, background: '#fafbfc' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Transaction</p>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: '2px 0 0' }}>{selected.transactionNumber}</h2>
              </div>
              <button onClick={() => { setSelected(null); setDetail(null); }}
                style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              {detailLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
                  <Loader2 style={{ width: 28, height: 28, color: '#4f46e5', animation: 'spin 1s linear infinite' }} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Info Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[
                      { label: 'Date', value: fmtDT(selected.createdAt) },
                      { label: 'Status', value: null, badge: selected.status },
                      { label: 'Customer', value: selected.customerName || 'Walk-in Customer' },
                      { label: 'Total', value: fmt(selected.totalAmount), bold: true, large: true },
                      { label: 'Cashier', value: selected.cashierName || 'N/A' },
                      { label: 'Items', value: String(selected.itemCount || detail?.items?.length || 0) }
                    ].map((f, i) => (
                      <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>{f.label}</p>
                        {f.badge ? (
                          <div style={{ marginTop: 6 }}><StatusBadge status={f.badge} /></div>
                        ) : (
                          <p style={{ fontSize: f.large ? 18 : 14, fontWeight: f.bold ? 800 : 600, color: '#111827', margin: '6px 0 0' }}>{f.value}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Items */}
                  {detail?.items?.length > 0 && (
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                        <Receipt style={{ width: 15, height: 15, color: '#10b981' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Items ({detail.items.length})</span>
                      </div>
                      <div style={{ maxHeight: 200, overflow: 'auto' }}>
                        {detail.items.map((item, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: i < detail.items.length - 1 ? '1px solid #f9fafb' : 'none' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                              <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{item.quantity} x {fmt(item.unitPrice)}</p>
                            </div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginLeft: 12, fontVariantNumeric: 'tabular-nums' }}>{fmt(item.total)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Documents */}
                  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                      <Printer style={{ width: 15, height: 15, color: '#4f46e5' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Print / Email Documents</span>
                    </div>
                    <div style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {[
                        { icon: Receipt, label: 'Receipt', bg: '#f3f4f6', color: '#374151', action: () => openAuthPdf(`/api/receipts/${id}/preview`, token) },
                        { icon: Mail, label: 'Email Receipt', bg: '#f5f3ff', color: '#7c3aed', action: () => promptEmail('Receipt', (em) => emailDocument(`/api/receipts/${id}/email`, em, token)) },
                        { icon: FileText, label: 'Sales Order', bg: '#eff6ff', color: '#2563eb', action: () => openAuthPdf(`/api/sales-orders/${id}/view`, token) },
                        { icon: Mail, label: 'Email Sales Order', bg: '#f5f3ff', color: '#7c3aed', action: () => promptEmail('Sales Order', (em) => emailDocument(`/api/sales-orders/${id}/email`, em, token)) },
                        { icon: Truck, label: 'Delivery Slip', bg: '#ecfeff', color: '#0891b2', action: () => openAuthPdf(`/api/delivery-slips/transaction/${id}/view`, token) },
                        { icon: ClipboardList, label: 'Delivery Waiver', bg: '#fffbeb', color: '#d97706', action: () => openAuthPdf(`/api/delivery-slips/transaction/${id}/waiver`, token) },
                        { icon: FileSpreadsheet, label: 'Invoice', bg: '#f0fdf4', color: '#16a34a', action: () => openAuthPdf(`/api/pos-invoices/${id}/preview`, token) }
                      ].map(({ icon: I, label, bg, color, action }) => (
                        <button key={label} type="button" onClick={action}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                            fontSize: 12, fontWeight: 650, color, background: bg, border: 'none',
                            borderRadius: 8, cursor: 'pointer', transition: 'filter 0.1s'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.95)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}>
                          <I style={{ width: 14, height: 14 }} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
