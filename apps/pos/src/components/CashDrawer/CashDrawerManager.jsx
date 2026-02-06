/**
 * TeleTime POS - Cash Drawer Manager
 * Main interface for cash drawer operations
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BanknotesIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  ClockIcon,
  ChartBarIcon,
  LockClosedIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { CashMovementModal } from './CashMovementModal';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Movement history row
 */
function MovementRow({ movement }) {
  const isOut = movement.direction === 'out';

  const typeIcons = {
    paid_out: MinusCircleIcon,
    drop: ArrowDownTrayIcon,
    pickup: ArrowUpTrayIcon,
    add: PlusCircleIcon,
    float_adjust: PlusCircleIcon,
    refund: MinusCircleIcon,
    correction: ArrowPathIcon
  };

  const Icon = typeIcons[movement.movementType] || BanknotesIcon;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className={`
        w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
        ${isOut ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}
      `}>
        <Icon className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-gray-900 capitalize">
            {movement.movementType.replace('_', ' ')}
          </p>
          {movement.referenceNumber && (
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
              #{movement.referenceNumber}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 truncate">{movement.reason}</p>
        <p className="text-xs text-gray-400">{movement.performedBy}</p>
      </div>

      <div className="text-right">
        <p className={`font-semibold tabular-nums ${isOut ? 'text-red-600' : 'text-green-600'}`}>
          {isOut ? '-' : '+'}{formatCurrency(movement.amount)}
        </p>
        <p className="text-xs text-gray-400">
          {new Date(movement.createdAt).toLocaleTimeString('en-CA', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </p>
      </div>
    </div>
  );
}

/**
 * Cash Drawer Manager Component
 * @param {object} props
 * @param {number} props.shiftId - Current shift ID
 * @param {function} props.onClose - Close callback
 */
export function CashDrawerManager({ shiftId, onClose }) {
  const [summary, setSummary] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [selectedMovementType, setSelectedMovementType] = useState(null);

  // Load shift summary and movements
  const loadData = useCallback(async () => {
    if (!shiftId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/cash-drawer/shift/${shiftId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`
        }
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load drawer data');
      }

      setSummary(result.data);
      setMovements(result.data.movements || []);
    } catch (err) {
      console.error('[CashDrawerManager] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [shiftId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open movement modal with specific type
  const handleOpenMovement = (type = null) => {
    setSelectedMovementType(type);
    setMovementModalOpen(true);
  };

  // Handle movement success
  const handleMovementSuccess = () => {
    loadData(); // Refresh data
  };

  // Handle no sale (open drawer)
  const handleNoSale = async () => {
    try {
      await fetch(`${API_BASE}/cash-drawer/no-sale`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`
        },
        body: JSON.stringify({
          shiftId,
          reason: 'No Sale - Drawer Open'
        })
      });
      // Drawer opened - could trigger hardware here
      alert('Drawer opened');
    } catch (err) {
      console.error('[CashDrawerManager] No sale error:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-500">Loading drawer data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <BanknotesIcon className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Drawer</h3>
        <p className="text-gray-500 mb-4">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const cash = summary?.cash || {};
  const shift = summary?.shift || {};
  const transactions = summary?.transactions || {};

  return (
    <div className="flex flex-col h-full">
      {/* Header Stats */}
      <div className="p-4 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">Cash Drawer</h2>
            <p className="text-slate-400 text-sm">{shift.registerName}</p>
          </div>
          <button
            onClick={loadData}
            className="w-10 h-10 flex items-center justify-center hover:bg-slate-600 rounded-lg transition-colors"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Current Expected Cash */}
        <div className="bg-white/10 rounded-xl p-4">
          <p className="text-slate-300 text-sm mb-1">Expected Cash in Drawer</p>
          <p className="text-3xl font-bold tabular-nums">{formatCurrency(cash.expected)}</p>
        </div>

        {/* Cash Flow Summary */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white/10 rounded-lg p-3 text-center">
            <p className="text-slate-400 text-xs">Opening</p>
            <p className="font-semibold tabular-nums">{formatCurrency(cash.opening)}</p>
          </div>
          <div className="bg-green-500/20 rounded-lg p-3 text-center">
            <p className="text-green-300 text-xs">Cash Sales</p>
            <p className="font-semibold text-green-400 tabular-nums">+{formatCurrency(cash.sales)}</p>
          </div>
          <div className="bg-red-500/20 rounded-lg p-3 text-center">
            <p className="text-red-300 text-xs">Cash Out</p>
            <p className="font-semibold text-red-400 tabular-nums">
              -{formatCurrency(cash.paidOuts + cash.drops + cash.refunds)}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => handleOpenMovement('paid_out')}
            className="flex flex-col items-center gap-1 p-3 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
          >
            <MinusCircleIcon className="w-6 h-6 text-red-600" />
            <span className="text-xs font-medium text-red-700">Paid Out</span>
          </button>

          <button
            onClick={() => handleOpenMovement('drop')}
            className="flex flex-col items-center gap-1 p-3 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors"
          >
            <ArrowDownTrayIcon className="w-6 h-6 text-orange-600" />
            <span className="text-xs font-medium text-orange-700">Safe Drop</span>
          </button>

          <button
            onClick={() => handleOpenMovement('add')}
            className="flex flex-col items-center gap-1 p-3 bg-green-50 hover:bg-green-100 rounded-xl transition-colors"
          >
            <PlusCircleIcon className="w-6 h-6 text-green-600" />
            <span className="text-xs font-medium text-green-700">Add Cash</span>
          </button>

          <button
            onClick={handleNoSale}
            className="flex flex-col items-center gap-1 p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <LockClosedIcon className="w-6 h-6 text-gray-600" />
            <span className="text-xs font-medium text-gray-700">No Sale</span>
          </button>
        </div>
      </div>

      {/* Shift Stats */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <ChartBarIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Transactions</p>
              <p className="font-semibold text-gray-900">{transactions.completed}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <BanknotesIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Sales</p>
              <p className="font-semibold text-gray-900">{formatCurrency(transactions.totalSales)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <ClockIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Shift Started</p>
              <p className="font-semibold text-gray-900">
                {new Date(shift.openedAt).toLocaleTimeString('en-CA', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <ArrowDownTrayIcon className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Drops Today</p>
              <p className="font-semibold text-gray-900">{formatCurrency(cash.drops)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Movement History */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center justify-between">
            <span>Cash Movements</span>
            <button
              onClick={() => handleOpenMovement()}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add Movement
            </button>
          </h3>

          {movements.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <BanknotesIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No cash movements recorded</p>
              <p className="text-sm">Use the buttons above to record paid-outs, drops, or additions</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200">
              {movements.map((movement) => (
                <MovementRow key={movement.id} movement={movement} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cash Movement Modal */}
      <CashMovementModal
        isOpen={movementModalOpen}
        onClose={() => setMovementModalOpen(false)}
        shiftId={shiftId}
        onSuccess={handleMovementSuccess}
        defaultType={selectedMovementType}
      />
    </div>
  );
}

export default CashDrawerManager;
