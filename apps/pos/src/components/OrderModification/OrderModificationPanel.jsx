/**
 * TeleTime POS - Order Modification Panel
 *
 * Main panel for modifying orders that originated from quotes
 */

import { useState, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  PlusIcon,
  MinusIcon,
  PencilIcon,
  LockClosedIcon,
  LockOpenIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  TagIcon,
  TruckIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import { useOrderModification } from '../../hooks/useOrderModification';

// ============================================================================
// PRICE LOCK TOGGLE
// ============================================================================

function PriceLockToggle({ locked, lockUntil, onToggle, disabled = false }) {
  const [isLocking, setIsLocking] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');

  const handleToggle = async () => {
    if (locked) {
      // Unlock
      setIsLocking(true);
      await onToggle(false);
      setIsLocking(false);
    } else {
      // Show date picker or lock without date
      setShowDatePicker(true);
    }
  };

  const handleLock = async (withDate = false) => {
    setIsLocking(true);
    await onToggle(true, withDate ? selectedDate : null);
    setIsLocking(false);
    setShowDatePicker(false);
  };

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        disabled={disabled || isLocking}
        className={`
          flex items-center gap-2 px-4 py-2
          text-sm font-medium
          rounded-lg
          transition-colors
          ${
            locked
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {locked ? (
          <>
            <LockClosedIcon className="w-4 h-4" />
            Quote Prices Locked
          </>
        ) : (
          <>
            <LockOpenIcon className="w-4 h-4" />
            Lock Quote Prices
          </>
        )}
      </button>

      {/* Date picker dropdown */}
      {showDatePicker && (
        <div className="absolute top-full left-0 mt-2 p-4 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          <p className="text-sm text-gray-600 mb-3">
            Lock prices until a specific date?
          </p>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full h-10 px-3 border border-gray-200 rounded-lg mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleLock(false)}
              className="flex-1 h-9 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              Lock Indefinitely
            </button>
            <button
              onClick={() => handleLock(true)}
              disabled={!selectedDate}
              className="flex-1 h-9 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 rounded-lg"
            >
              Lock Until Date
            </button>
          </div>
          <button
            onClick={() => setShowDatePicker(false)}
            className="w-full h-8 mt-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
        </div>
      )}

      {lockUntil && (
        <p className="text-xs text-gray-500 mt-1">
          Locked until {new Date(lockUntil).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// ORDER ITEM ROW
// ============================================================================

function OrderItemRow({
  item,
  isFromQuote,
  onModify,
  onRemove,
  canModify = true,
}) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [isEditing, setIsEditing] = useState(false);

  const hasPriceChange = item.hasPriceChange;
  const priceDiff = item.currentPrice - item.quotePrice;

  const handleQuantityChange = (newQty) => {
    if (newQty < 0) return;
    setQuantity(newQty);
  };

  const handleSaveQuantity = () => {
    if (quantity !== item.quantity) {
      onModify({ productId: item.productId, quantity });
    }
    setIsEditing(false);
  };

  // Fulfillment progress
  const fulfillmentPercent =
    item.quantity > 0
      ? Math.round((item.quantityFulfilled / item.quantity) * 100)
      : 0;

  return (
    <div className="p-4 border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-4">
        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 truncate">{item.productName}</h4>
          <p className="text-sm text-gray-500">{item.productSku}</p>

          {/* Price info */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-medium text-gray-900 tabular-nums">
              {formatCurrency(item.unitPrice)}
            </span>

            {hasPriceChange && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  priceDiff > 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                Quote: {formatCurrency(item.quotePrice)}
                {priceDiff > 0 ? ' (now higher)' : ' (now lower)'}
              </span>
            )}
          </div>

          {/* Fulfillment status */}
          {item.quantityFulfilled > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Fulfilled: {item.quantityFulfilled}/{item.quantity}</span>
                <span>{fulfillmentPercent}%</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${fulfillmentPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Quantity Controls */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleQuantityChange(quantity - 1)}
                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              >
                <MinusIcon className="w-4 h-4" />
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 0)}
                min="0"
                className="w-16 h-8 text-center border border-gray-200 rounded"
              />
              <button
                onClick={() => handleQuantityChange(quantity + 1)}
                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
              <button
                onClick={handleSaveQuantity}
                className="h-8 px-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setQuantity(item.quantity);
                  setIsEditing(false);
                }}
                className="h-8 px-3 text-sm font-medium text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <span className="text-lg font-medium text-gray-900 tabular-nums w-12 text-center">
                ×{item.quantity}
              </span>
              {canModify && (
                <div className="flex gap-1">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="Edit quantity"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onRemove(item.productId)}
                    className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Remove item"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Line Total */}
        <div className="text-right w-24">
          <span className="font-medium text-gray-900 tabular-nums">
            {formatCurrency(item.lineTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PENDING CHANGES SUMMARY
// ============================================================================

function PendingChangesSummary({ changes, onRemove, onSubmit, onClear }) {
  const totalChanges =
    changes.addItems.length +
    changes.removeItems.length +
    changes.modifyItems.length;

  if (totalChanges === 0) return null;

  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-amber-800">
          Pending Changes ({totalChanges})
        </h3>
        <button
          onClick={onClear}
          className="text-sm text-amber-600 hover:text-amber-800"
        >
          Clear All
        </button>
      </div>

      <div className="space-y-2 text-sm">
        {changes.addItems.map((item, i) => (
          <div key={`add-${i}`} className="flex items-center justify-between">
            <span className="text-green-700">
              + Add: {item.productId} × {item.quantity}
            </span>
            <button
              onClick={() => onRemove('addItems', i)}
              className="text-gray-400 hover:text-red-600"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ))}

        {changes.removeItems.map((item, i) => (
          <div key={`remove-${i}`} className="flex items-center justify-between">
            <span className="text-red-700">- Remove: {item.productId}</span>
            <button
              onClick={() => onRemove('removeItems', i)}
              className="text-gray-400 hover:text-red-600"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ))}

        {changes.modifyItems.map((item, i) => (
          <div key={`modify-${i}`} className="flex items-center justify-between">
            <span className="text-blue-700">
              ~ Modify: {item.productId} → qty: {item.quantity}
            </span>
            <button
              onClick={() => onRemove('modifyItems', i)}
              className="text-gray-400 hover:text-red-600"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={onSubmit}
        className="w-full mt-4 h-10 flex items-center justify-center gap-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
      >
        <CheckCircleIcon className="w-4 h-4" />
        Submit Changes for Review
      </button>
    </div>
  );
}

// ============================================================================
// AMENDMENT CARD
// ============================================================================

function AmendmentCard({ amendment, onApprove, onReject, onApply, canApprove }) {
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const statusColors = {
    draft: 'bg-gray-100 text-gray-700',
    pending_approval: 'bg-amber-100 text-amber-700',
    approved: 'bg-blue-100 text-blue-700',
    rejected: 'bg-red-100 text-red-700',
    applied: 'bg-green-100 text-green-700',
  };

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-medium text-gray-900">{amendment.amendmentNumber}</h4>
          <p className="text-xs text-gray-500">
            {new Date(amendment.createdAt).toLocaleString()}
          </p>
        </div>
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColors[amendment.status]}`}>
          {amendment.status.replace('_', ' ')}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm mb-3">
        <div>
          <span className="text-gray-500">Previous:</span>{' '}
          <span className="font-medium">{formatCurrency(amendment.previousTotal)}</span>
        </div>
        <span className="text-gray-300">→</span>
        <div>
          <span className="text-gray-500">New:</span>{' '}
          <span className="font-medium">{formatCurrency(amendment.newTotal)}</span>
        </div>
        <div
          className={`font-medium ${
            amendment.difference > 0 ? 'text-red-600' : 'text-green-600'
          }`}
        >
          {amendment.difference > 0 ? '+' : ''}
          {formatCurrency(amendment.difference)}
        </div>
      </div>

      {amendment.reason && (
        <p className="text-sm text-gray-600 mb-3">Reason: {amendment.reason}</p>
      )}

      {/* Actions */}
      {amendment.status === 'pending_approval' && canApprove && (
        <div className="flex gap-2">
          {!showReject ? (
            <>
              <button
                onClick={() => onApprove(amendment.id)}
                className="flex-1 h-9 flex items-center justify-center gap-1 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg"
              >
                <CheckCircleIcon className="w-4 h-4" />
                Approve
              </button>
              <button
                onClick={() => setShowReject(true)}
                className="flex-1 h-9 flex items-center justify-center gap-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                <XMarkIcon className="w-4 h-4" />
                Reject
              </button>
            </>
          ) : (
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason..."
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onReject(amendment.id, rejectReason);
                    setShowReject(false);
                    setRejectReason('');
                  }}
                  disabled={!rejectReason.trim()}
                  className="flex-1 h-8 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-300 rounded-lg"
                >
                  Confirm Reject
                </button>
                <button
                  onClick={() => setShowReject(false)}
                  className="h-8 px-3 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {amendment.status === 'approved' && (
        <button
          onClick={() => onApply(amendment.id)}
          className="w-full h-9 flex items-center justify-center gap-1 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          <ArrowPathIcon className="w-4 h-4" />
          Apply Changes
        </button>
      )}
    </div>
  );
}

// ============================================================================
// MAIN PANEL
// ============================================================================

export function OrderModificationPanel({ orderId, onClose }) {
  const {
    order,
    amendments,
    versions,
    fulfillment,
    loading,
    error,
    pendingChanges,
    hasPendingChanges,
    isFromQuote,
    canApprove,
    priceChangeItems,
    loadAll,
    setPriceLock,
    removeItemFromPending,
    modifyItemInPending,
    clearPendingChanges,
    removePendingChange,
    submitAmendment,
    approveAmendment,
    rejectAmendment,
    applyAmendment,
  } = useOrderModification(orderId);

  const [activeTab, setActiveTab] = useState('items'); // 'items', 'amendments', 'versions', 'fulfillment'
  const [submitReason, setSubmitReason] = useState('');
  const [useQuotePrices, setUseQuotePrices] = useState(false);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSubmitChanges = async () => {
    const result = await submitAmendment(
      'item_modified',
      submitReason || null,
      useQuotePrices
    );

    if (result.success) {
      setSubmitReason('');
      setUseQuotePrices(false);
    }
  };

  const handleRemoveItem = (productId) => {
    removeItemFromPending(productId, 'Customer requested removal');
  };

  const handleModifyItem = (item) => {
    modifyItemInPending(item);
  };

  if (loading && !order) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-2" />
        <p className="text-red-700">{error}</p>
        <button onClick={loadAll} className="mt-4 text-blue-600 hover:text-blue-800">
          Try Again
        </button>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Order #{order.orderNumber}
          </h2>
          {isFromQuote && (
            <p className="text-sm text-gray-500">
              From Quote #{order.quote?.quoteNumber}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isFromQuote && (
            <PriceLockToggle
              locked={order.priceLocked}
              lockUntil={order.priceLockUntil}
              onToggle={setPriceLock}
            />
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      {/* Price Change Warning */}
      {priceChangeItems.length > 0 && (
        <div className="mx-4 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {priceChangeItems.length} item(s) have price changes since the quote
              </p>
              <p className="text-xs text-amber-600 mt-1">
                {order.priceLocked
                  ? 'Quote prices are locked and will be honored.'
                  : 'Enable price lock to honor original quote prices.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-4 border-b border-gray-200">
        {[
          { id: 'items', label: 'Items', icon: TagIcon },
          { id: 'amendments', label: 'Amendments', icon: DocumentDuplicateIcon, count: amendments.length },
          { id: 'versions', label: 'History', icon: ClockIcon, count: versions.length },
          { id: 'fulfillment', label: 'Fulfillment', icon: TruckIcon },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2
              text-sm font-medium rounded-lg
              transition-colors
              ${
                activeTab === tab.id
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }
            `}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-gray-200 rounded">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Items Tab */}
        {activeTab === 'items' && (
          <div className="space-y-4">
            {/* Pending Changes */}
            <PendingChangesSummary
              changes={pendingChanges}
              onRemove={removePendingChange}
              onSubmit={handleSubmitChanges}
              onClear={clearPendingChanges}
            />

            {/* Item List */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {order.items.map((item) => (
                <OrderItemRow
                  key={item.id}
                  item={item}
                  isFromQuote={isFromQuote}
                  onModify={handleModifyItem}
                  onRemove={handleRemoveItem}
                  canModify={order.status !== 'completed'}
                />
              ))}
            </div>

            {/* Order Totals */}
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatCurrency(order.subtotal)}</span>
              </div>
              {order.discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Discount</span>
                  <span className="font-medium text-green-600">
                    -{formatCurrency(order.discountAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax</span>
                <span className="font-medium">{formatCurrency(order.taxAmount)}</span>
              </div>
              <div className="flex justify-between text-lg pt-2 border-t border-gray-200">
                <span className="font-bold">Total</span>
                <span className="font-bold">{formatCurrency(order.totalAmount)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Amendments Tab */}
        {activeTab === 'amendments' && (
          <div className="space-y-3">
            {amendments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No amendments yet
              </div>
            ) : (
              amendments.map((amendment) => (
                <AmendmentCard
                  key={amendment.id}
                  amendment={amendment}
                  onApprove={approveAmendment}
                  onReject={rejectAmendment}
                  onApply={applyAmendment}
                  canApprove={canApprove}
                />
              ))
            )}
          </div>
        )}

        {/* Versions Tab */}
        {activeTab === 'versions' && (
          <div className="space-y-3">
            {versions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No version history yet
              </div>
            ) : (
              versions.map((version) => (
                <div
                  key={version.id}
                  className="p-4 bg-white border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">
                      Version {version.versionNumber}
                    </h4>
                    <span className="text-sm text-gray-500">
                      {new Date(version.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <p>Items: {version.itemCount}</p>
                    <p>Total: {formatCurrency(version.total)}</p>
                    {version.changeSummary && (
                      <p className="mt-1 text-gray-500">{version.changeSummary}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Fulfillment Tab */}
        {activeTab === 'fulfillment' && fulfillment && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="p-4 bg-white border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-3">Fulfillment Status</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Status:</span>{' '}
                  <span
                    className={`font-medium ${
                      fulfillment.status === 'complete'
                        ? 'text-green-600'
                        : fulfillment.status === 'partial'
                        ? 'text-amber-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {fulfillment.status.charAt(0).toUpperCase() + fulfillment.status.slice(1)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Progress:</span>{' '}
                  <span className="font-medium">{fulfillment.fulfillmentPercent}%</span>
                </div>
                <div>
                  <span className="text-gray-500">Fulfilled:</span>{' '}
                  <span className="font-medium text-green-600">
                    {fulfillment.fulfilled} / {fulfillment.totalQuantity}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Pending:</span>{' '}
                  <span className="font-medium">{fulfillment.pending}</span>
                </div>
                {fulfillment.backordered > 0 && (
                  <div>
                    <span className="text-gray-500">Backordered:</span>{' '}
                    <span className="font-medium text-amber-600">
                      {fulfillment.backordered}
                    </span>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${fulfillment.fulfillmentPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OrderModificationPanel;
