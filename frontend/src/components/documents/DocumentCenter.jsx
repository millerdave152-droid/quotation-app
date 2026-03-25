import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import {
  Search, FileText, Receipt, Truck, ClipboardList, FileSpreadsheet,
  Mail, Printer, X, ChevronRight, Calendar, Filter, AlertCircle
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || '';

/**
 * Open a PDF in a new tab with auth headers
 */
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

/**
 * Email a document via POST
 */
async function emailDocument(url, email, token) {
  try {
    const res = await fetch(`${API_URL}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ email })
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || result.message || 'Email failed');
    }
    return true;
  } catch (err) {
    alert(err.message || 'Failed to email document.');
    return false;
  }
}

function StatusBadge({ status }) {
  const config = {
    completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending' },
    voided: { bg: 'bg-red-100', text: 'text-red-700', label: 'Voided' },
    refunded: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Refunded' }
  };
  const c = config[status] || { bg: 'bg-gray-100', text: 'text-gray-600', label: status || 'Unknown' };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function DocButton({ icon: Icon, label, color, onClick, title }) {
  const colors = {
    gray: 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700',
    blue: 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700',
    cyan: 'border-cyan-200 bg-cyan-50 hover:bg-cyan-100 text-cyan-700',
    amber: 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700',
    green: 'border-green-200 bg-green-50 hover:bg-green-100 text-green-700'
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${colors[color] || colors.gray}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function EmailButton({ onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
    >
      <Mail className="w-4 h-4" />
    </button>
  );
}

/**
 * Document Center — search past transactions and reprint/email documents
 */
export default function DocumentCenter() {
  const { token } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters
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
      params.append('includeCounts', 'false');

      const res = await axios.get(`${API_URL}/api/transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setResults(res.data?.data?.transactions || res.data?.data || []);
    } catch (err) {
      console.error('[DocumentCenter] Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, dateFrom, dateTo, statusFilter, token]);

  const handleSelectTransaction = useCallback(async (txn) => {
    const txnId = txn.transaction_id;
    setSelectedTxn(txn);
    setDetailLoading(true);

    try {
      const res = await axios.get(`${API_URL}/api/receipts/${txnId}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDetailData(res.data?.data || null);
    } catch (err) {
      console.error('[DocumentCenter] Detail error:', err);
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  const promptEmail = (docLabel, emailAction) => {
    const email = prompt(`Email ${docLabel} to:`);
    if (email && email.includes('@')) {
      emailAction(email);
    }
  };

  const txnId = selectedTxn?.transaction_id;
  const formatCurrency = (v) => {
    const num = parseFloat(v) || 0;
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(num);
  };
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <h1 className="text-2xl font-bold text-gray-900">Document Center</h1>
        <p className="text-sm text-gray-500 mt-1">Search any past transaction and reprint or email documents</p>
      </div>

      <div className="flex h-[calc(100vh-89px)]">
        {/* Left: Search + Results */}
        <div className={`flex flex-col ${selectedTxn ? 'w-1/2 border-r border-gray-200' : 'w-full'} transition-all`}>
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="p-4 bg-white border-b border-gray-200">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by customer name, order number, transaction number..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-50 transition-colors"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>

            {/* Filter Row */}
            <div className="flex gap-3 mt-3 items-center">
              <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                  placeholder="From"
                />
                <span className="text-gray-400 text-xs">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-xs"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-xs"
              >
                <option value="">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="voided">Voided</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
          </form>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {!searched ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Search className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">Search for a transaction above</p>
                <p className="text-sm mt-1">Find by customer name, order number, or transaction number</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <AlertCircle className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">No transactions found</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Order #</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Docs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((txn) => {
                    const isSelected = selectedTxn?.transaction_id === txn.transaction_id;
                    return (
                      <tr
                        key={txn.transaction_id}
                        onClick={() => handleSelectTransaction(txn)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-4 py-3 text-gray-600">{formatDate(txn.created_at)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{txn.transaction_number}</td>
                        <td className="px-4 py-3 text-gray-600">{txn.customer_name || 'Walk-in'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(txn.total_amount)}</td>
                        <td className="px-4 py-3"><StatusBadge status={txn.status} /></td>
                        <td className="px-4 py-3 text-center">
                          <ChevronRight className="w-4 h-4 text-gray-400 inline" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Transaction Detail + Document Buttons */}
        {selectedTxn && (
          <div className="w-1/2 flex flex-col overflow-hidden bg-white">
            {/* Detail Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedTxn.transaction_number}</h2>
                <p className="text-sm text-gray-500">{formatDateTime(selectedTxn.created_at)}</p>
              </div>
              <button
                onClick={() => { setSelectedTxn(null); setDetailData(null); }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {detailLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* Transaction Info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Customer</p>
                      <p className="font-medium text-gray-900">{selectedTxn.customer_name || 'Walk-in Customer'}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Status</p>
                      <StatusBadge status={selectedTxn.status} />
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Total</p>
                      <p className="font-bold text-gray-900 text-lg">{formatCurrency(selectedTxn.total_amount)}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Payment</p>
                      <p className="font-medium text-gray-900">{selectedTxn.payment_method?.toUpperCase() || 'N/A'}</p>
                    </div>
                  </div>

                  {/* Items */}
                  {detailData?.items && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2 text-sm">Items ({detailData.items.length})</h3>
                      <div className="space-y-1">
                        {detailData.items.map((item, i) => (
                          <div key={i} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                              <p className="text-xs text-gray-500">{item.quantity} x {formatCurrency(item.unitPrice)}</p>
                            </div>
                            <p className="text-sm font-semibold text-gray-900 ml-2">{formatCurrency(item.total)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Document Buttons — Main Section */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3 text-sm">Print / Email Documents</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {/* Receipt */}
                      <div className="flex items-center gap-1">
                        <DocButton
                          icon={Receipt}
                          label="Receipt"
                          color="gray"
                          onClick={() => openAuthPdf(`/api/receipts/${txnId}/preview`, token)}
                        />
                        <EmailButton
                          title="Email Receipt"
                          onClick={() => promptEmail('Receipt', (email) =>
                            emailDocument(`/api/receipts/${txnId}/email`, email, token)
                          )}
                        />
                      </div>

                      {/* Sales Order */}
                      <div className="flex items-center gap-1">
                        <DocButton
                          icon={FileText}
                          label="Sales Order"
                          color="blue"
                          onClick={() => openAuthPdf(`/api/sales-orders/${txnId}/view`, token)}
                        />
                        <EmailButton
                          title="Email Sales Order"
                          onClick={() => promptEmail('Sales Order', (email) =>
                            emailDocument(`/api/sales-orders/${txnId}/email`, email, token)
                          )}
                        />
                      </div>

                      {/* Delivery Slip */}
                      <DocButton
                        icon={Truck}
                        label="Delivery Slip"
                        color="cyan"
                        onClick={() => openAuthPdf(`/api/delivery-slips/transaction/${txnId}/view`, token)}
                      />

                      {/* Delivery Waiver */}
                      <DocButton
                        icon={ClipboardList}
                        label="Delivery Waiver"
                        color="amber"
                        onClick={() => openAuthPdf(`/api/delivery-slips/transaction/${txnId}/waiver`, token)}
                      />

                      {/* Invoice */}
                      <DocButton
                        icon={FileSpreadsheet}
                        label="Invoice"
                        color="green"
                        onClick={() => openAuthPdf(`/api/pos/invoices/${txnId}/view`, token)}
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
