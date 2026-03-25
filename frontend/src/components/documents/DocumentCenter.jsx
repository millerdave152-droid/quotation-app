import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  Search, FileText, Receipt, Truck, ClipboardList, FileSpreadsheet,
  Mail, X, Calendar, ChevronRight, AlertCircle, Loader2
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || '';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

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
    console.error('[DocumentCenter] PDF error:', err);
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
    return true;
  } catch (err) {
    alert(err.message || 'Failed to email document.');
    return false;
  }
}

const formatCurrency = (v) => {
  const num = parseFloat(v) || 0;
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(num);
};
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function StatusBadge({ status }) {
  const config = {
    completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    voided: 'bg-red-50 text-red-700 ring-red-600/20',
    refunded: 'bg-purple-50 text-purple-700 ring-purple-600/20'
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ring-inset ${config[status] || 'bg-gray-50 text-gray-600 ring-gray-500/20'}`}>
      {(status || 'unknown').charAt(0).toUpperCase() + (status || 'unknown').slice(1)}
    </span>
  );
}

function SkeletonRows({ count = 5 }) {
  return Array.from({ length: count }).map((_, i) => (
    <tr key={i} className="animate-pulse">
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-20" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-32" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-24" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-16 ml-auto" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-16" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-20 mx-auto" /></td>
    </tr>
  ));
}

function DocIconButton({ icon: Icon, tooltip, color, onClick }) {
  const colors = {
    gray: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
    blue: 'text-blue-500 hover:text-blue-700 hover:bg-blue-50',
    cyan: 'text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50',
    amber: 'text-amber-500 hover:text-amber-700 hover:bg-amber-50',
    green: 'text-green-500 hover:text-green-700 hover:bg-green-50'
  };
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={tooltip}
      className={`p-1.5 rounded-md transition-colors ${colors[color] || colors.gray}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function DocLabelButton({ icon: Icon, label, color, onClick, small }) {
  const colors = {
    gray: 'bg-gray-500/10 text-gray-600 hover:bg-gray-500/20',
    blue: 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/20',
    amber: 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20',
    green: 'bg-green-500/10 text-green-600 hover:bg-green-500/20',
    purple: 'bg-purple-500/10 text-purple-600 hover:bg-purple-500/20'
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors ${colors[color] || colors.gray} ${small ? 'text-[11px]' : 'text-[12px]'}`}
    >
      <Icon size={small ? 13 : 14} />
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

export default function DocumentCenter() {
  const { token } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const handleSearch = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() && !dateFrom && !dateTo && !statusFilter) return;

    setLoading(true);
    setSearched(true);
    setSelectedTxn(null);
    setDetailData(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (dateFrom) params.append('startDate', dateFrom);
      if (dateTo) params.append('endDate', dateTo);
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', '50');

      const res = await axios.get(`${API_URL}/api/transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setResults(res.data?.data || []);
    } catch (err) {
      console.error('[DocumentCenter] Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, dateFrom, dateTo, statusFilter, token]);

  const handleSelectTransaction = useCallback(async (txn) => {
    setSelectedTxn(txn);
    setDetailLoading(true);

    try {
      const res = await axios.get(`${API_URL}/api/receipts/${txn.transactionId}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDetailData(res.data?.data || null);
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  const promptEmail = (docLabel, emailAction) => {
    const email = prompt(`Email ${docLabel} to:`);
    if (email && email.includes('@')) emailAction(email);
  };

  const txnId = selectedTxn?.transactionId;

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <FileText className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Document Center</h1>
              <p className="text-sm text-gray-500">Search past transactions and reprint or email documents</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-97px)]">
        {/* ── LEFT: Search + Results ── */}
        <div className={`flex flex-col transition-all duration-200 ${selectedTxn ? 'w-[55%]' : 'w-full'} border-r border-gray-200`}>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="p-4 bg-white border-b border-gray-100">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by customer name, order #, transaction #..."
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm shadow-indigo-600/20"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
              </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 mt-3">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Calendar className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium uppercase tracking-wider">Filters</span>
              </div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 focus:ring-1 focus:ring-indigo-400 outline-none"
              />
              <span className="text-gray-300 text-xs">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 focus:ring-1 focus:ring-indigo-400 outline-none"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 focus:ring-1 focus:ring-indigo-400 outline-none appearance-none pr-6"
              >
                <option value="">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="voided">Voided</option>
                <option value="refunded">Refunded</option>
              </select>
              {(dateFrom || dateTo || statusFilter) && (
                <button
                  type="button"
                  onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter(''); }}
                  className="text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </form>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {!searched ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 px-8">
                <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mb-5">
                  <Search className="w-9 h-9 text-gray-300" />
                </div>
                <p className="text-base font-semibold text-gray-500">Search for a transaction</p>
                <p className="text-sm text-gray-400 mt-1 text-center">
                  Find by customer name, order number, or transaction number to view and reprint documents
                </p>
              </div>
            ) : loading ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 sticky top-0 z-10">
                  <tr className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Transaction</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-center">Documents</th>
                  </tr>
                </thead>
                <tbody><SkeletonRows count={6} /></tbody>
              </table>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <AlertCircle className="w-10 h-10 mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No transactions found</p>
                <p className="text-xs text-gray-400 mt-1">Try a different search term or adjust filters</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 sticky top-0 z-10">
                  <tr className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Transaction</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-center">Documents</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((txn) => {
                    const id = txn.transactionId;
                    const isSelected = selectedTxn?.transactionId === id;
                    return (
                      <tr
                        key={id}
                        onClick={() => handleSelectTransaction(txn)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/60' : 'hover:bg-gray-50/80'}`}
                      >
                        <td className="px-4 py-2.5 text-gray-500 text-[12px]">{formatDate(txn.createdAt)}</td>
                        <td className="px-4 py-2.5 font-semibold text-gray-900 text-[12px]">{txn.transactionNumber}</td>
                        <td className="px-4 py-2.5 text-gray-600 text-[12px]">{txn.customerName || 'Walk-in'}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900 text-[12px] tabular-nums">{formatCurrency(txn.totalAmount)}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={txn.status} /></td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-center gap-0.5">
                            <DocIconButton icon={Receipt} tooltip="Receipt" color="gray" onClick={() => openAuthPdf(`/api/receipts/${id}/preview`, token)} />
                            <DocIconButton icon={FileText} tooltip="Sales Order" color="blue" onClick={() => openAuthPdf(`/api/sales-orders/${id}/view`, token)} />
                            <DocIconButton icon={Truck} tooltip="Delivery Slip" color="cyan" onClick={() => openAuthPdf(`/api/delivery-slips/transaction/${id}/view`, token)} />
                            <DocIconButton icon={ClipboardList} tooltip="Delivery Waiver" color="amber" onClick={() => openAuthPdf(`/api/delivery-slips/transaction/${id}/waiver`, token)} />
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

        {/* ── RIGHT: Detail Panel ── */}
        {selectedTxn && (
          <div className="w-[45%] flex flex-col overflow-hidden bg-white">
            {/* Detail Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
              <div>
                <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">Transaction</p>
                <h2 className="text-lg font-bold text-gray-900 -mt-0.5">{selectedTxn.transactionNumber}</h2>
              </div>
              <button
                onClick={() => { setSelectedTxn(null); setDetailData(null); }}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {detailLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
                </div>
              ) : (
                <>
                  {/* Info Card */}
                  <div className="bg-white border border-gray-200 border-l-4 border-l-indigo-500 rounded-xl p-4">
                    <div className="grid grid-cols-2 gap-3 text-[12px]">
                      <div>
                        <span className="text-gray-400 font-medium">Date</span>
                        <p className="text-gray-900 font-semibold">{formatDateTime(selectedTxn.createdAt)}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 font-medium">Status</span>
                        <p className="mt-0.5"><StatusBadge status={selectedTxn.status} /></p>
                      </div>
                      <div>
                        <span className="text-gray-400 font-medium">Customer</span>
                        <p className="text-gray-900 font-semibold">{selectedTxn.customerName || 'Walk-in Customer'}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 font-medium">Total</span>
                        <p className="text-gray-900 font-bold text-base">{formatCurrency(selectedTxn.totalAmount)}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 font-medium">Cashier</span>
                        <p className="text-gray-900 font-medium">{selectedTxn.cashierName || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 font-medium">Items</span>
                        <p className="text-gray-900 font-medium">{selectedTxn.itemCount || detailData?.items?.length || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* Items Card */}
                  {detailData?.items && detailData.items.length > 0 && (
                    <div className="bg-white border border-gray-200 border-l-4 border-l-emerald-500 rounded-xl p-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-gray-100 mb-3">
                        <Receipt size={14} className="text-emerald-600" />
                        <span className="text-[12px] font-semibold text-gray-700">Items ({detailData.items.length})</span>
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {detailData.items.map((item, i) => (
                          <div key={i} className="flex justify-between items-center py-1.5 px-2 rounded-md hover:bg-gray-50">
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-medium text-gray-900 truncate">{item.name}</p>
                              <p className="text-[11px] text-gray-400">{item.quantity} x {formatCurrency(item.unitPrice)}</p>
                            </div>
                            <p className="text-[12px] font-semibold text-gray-900 ml-3 tabular-nums">{formatCurrency(item.total)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Documents Card */}
                  <div className="bg-white border border-gray-200 border-l-4 border-l-indigo-500 rounded-xl p-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-gray-100 mb-3">
                      <FileText size={14} className="text-indigo-600" />
                      <span className="text-[12px] font-semibold text-gray-700">Documents</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <DocLabelButton
                        icon={Receipt}
                        label="Receipt"
                        color="gray"
                        onClick={() => openAuthPdf(`/api/receipts/${txnId}/preview`, token)}
                      />
                      <DocLabelButton
                        icon={Mail}
                        label="Email Receipt"
                        color="purple"
                        onClick={() => promptEmail('Receipt', (email) =>
                          emailDocument(`/api/receipts/${txnId}/email`, email, token)
                        )}
                      />
                      <DocLabelButton
                        icon={FileText}
                        label="Sales Order"
                        color="blue"
                        onClick={() => openAuthPdf(`/api/sales-orders/${txnId}/view`, token)}
                      />
                      <DocLabelButton
                        icon={Mail}
                        label="Email Sales Order"
                        color="purple"
                        onClick={() => promptEmail('Sales Order', (email) =>
                          emailDocument(`/api/sales-orders/${txnId}/email`, email, token)
                        )}
                      />
                      <DocLabelButton
                        icon={Truck}
                        label="Delivery Slip"
                        color="cyan"
                        onClick={() => openAuthPdf(`/api/delivery-slips/transaction/${txnId}/view`, token)}
                      />
                      <DocLabelButton
                        icon={ClipboardList}
                        label="Delivery Waiver"
                        color="amber"
                        onClick={() => openAuthPdf(`/api/delivery-slips/transaction/${txnId}/waiver`, token)}
                      />
                      <DocLabelButton
                        icon={FileSpreadsheet}
                        label="Invoice"
                        color="green"
                        onClick={() => openAuthPdf(`/api/pos-invoices/${txnId}/preview`, token)}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
