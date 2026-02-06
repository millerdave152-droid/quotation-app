/**
 * TeleTime POS - Batch Email Preview Modal
 * Preview and select receipts before sending
 */

import { useState, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  EnvelopeIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  UserIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Receipt item row in preview list
 */
function ReceiptItem({ item, isSelected, onToggle, disabled }) {
  return (
    <label
      className={`
        flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
        ${isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(item.transaction_id)}
        disabled={disabled}
        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{item.transaction_number}</span>
          <span className="text-xs text-gray-500">
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <UserIcon className="w-3.5 h-3.5" />
            {item.customer_name || 'Customer'}
          </span>
          <span className="flex items-center gap-1">
            <CurrencyDollarIcon className="w-3.5 h-3.5" />
            {formatCurrency(item.total_amount)}
          </span>
        </div>
      </div>
      <div className="text-sm text-gray-500 truncate max-w-[180px]">
        {item.customer_email}
      </div>
    </label>
  );
}

/**
 * Batch Email Preview Modal
 * @param {object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {function} props.onClose - Close callback
 * @param {Array} props.receipts - List of unsent receipts
 * @param {boolean} props.isLoading - Loading state
 * @param {function} props.onSend - Called with selected transaction IDs
 * @param {string} props.title - Modal title
 * @param {string} props.subtitle - Modal subtitle
 */
export default function BatchEmailPreviewModal({
  isOpen,
  onClose,
  receipts = [],
  isLoading = false,
  onSend,
  title = 'Email Receipts',
  subtitle,
}) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Auto-select all when receipts load
  useEffect(() => {
    if (receipts.length > 0) {
      setSelectedIds(new Set(receipts.map(r => r.transaction_id)));
    }
  }, [receipts]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setIsSending(false);
    }
  }, [isOpen]);

  // Filter receipts by search
  const filteredReceipts = searchQuery
    ? receipts.filter(r =>
        r.transaction_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.customer_email?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : receipts;

  // Toggle selection
  const handleToggle = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Select/deselect all visible
  const handleSelectAll = useCallback(() => {
    const visibleIds = filteredReceipts.map(r => r.transaction_id);
    const allSelected = visibleIds.every(id => selectedIds.has(id));

    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  }, [filteredReceipts, selectedIds]);

  // Handle send
  const handleSend = useCallback(async () => {
    if (selectedIds.size === 0 || !onSend) return;

    setIsSending(true);
    try {
      await onSend(Array.from(selectedIds));
      onClose?.();
    } catch (err) {
      console.error('[BatchEmailPreview] Send error:', err);
      setIsSending(false);
    }
  }, [selectedIds, onSend, onClose]);

  // Computed values
  const visibleIds = filteredReceipts.map(r => r.transaction_id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id)) && !allVisibleSelected;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <EnvelopeIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-500">
                {subtitle || `${receipts.length} receipts ready to send`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSending}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <ArrowPathIcon className="w-8 h-8 text-gray-400 animate-spin mb-3" />
              <p className="text-gray-500">Loading receipts...</p>
            </div>
          ) : receipts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircleIcon className="w-12 h-12 text-green-500 mb-3" />
              <p className="text-lg font-medium text-gray-900">All caught up!</p>
              <p className="text-gray-500">No unsent receipts found.</p>
            </div>
          ) : (
            <>
              {/* Search and select all */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search receipts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-9 pl-9 pr-4 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => el && (el.indeterminate = someVisibleSelected)}
                    onChange={handleSelectAll}
                    disabled={isSending}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Select All
                  </span>
                </label>
              </div>

              {/* Selected count */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">
                  {filteredReceipts.length} receipts shown
                </span>
                <span className="text-sm font-medium text-blue-600">
                  {selectedIds.size} selected
                </span>
              </div>

              {/* Receipt list */}
              <div className="flex-1 overflow-y-auto space-y-2">
                {filteredReceipts.map((item) => (
                  <ReceiptItem
                    key={item.transaction_id}
                    item={item}
                    isSelected={selectedIds.has(item.transaction_id)}
                    onToggle={handleToggle}
                    disabled={isSending}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={selectedIds.size === 0 || isSending || isLoading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSending ? (
              <>
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <PaperAirplaneIcon className="w-4 h-4" />
                Send {selectedIds.size} Email{selectedIds.size !== 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
