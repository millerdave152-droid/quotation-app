import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRegister } from '../hooks/useRegister';
import { formatCurrency, formatDateTime, formatTime } from '../utils/formatters';
import ShiftCommissionSummary from '../components/Commission/ShiftCommissionSummary';

/**
 * Shift Close / End of Day Screen
 * Cash reconciliation and shift summary
 */
function ShiftClose() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const {
    currentShift,
    shiftSummary,
    closeShift,
    getShiftDuration,
    transactions,
    loadShiftTransactions,
    loadingTransactions,
  } = useRegister();

  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [closingResult, setClosingResult] = useState(null);
  const [showCommissionSummary, setShowCommissionSummary] = useState(false);

  // Load transactions on mount
  useEffect(() => {
    loadShiftTransactions();
  }, [loadShiftTransactions]);

  // Calculate expected cash
  const expectedCash = shiftSummary?.expectedCash ||
    (currentShift?.openingCash || 0) +
    (shiftSummary?.summary?.paymentBreakdown?.cash?.total || 0);

  // Calculate variance when closing cash is entered
  const closingCashNum = parseFloat(closingCash) || 0;
  const variance = closingCashNum - expectedCash;
  const varianceStatus = variance === 0 ? 'balanced' : variance > 0 ? 'over' : 'short';

  const handleCloseShift = async (e) => {
    e.preventDefault();

    if (!closingCash) {
      setError('Please enter the closing cash amount');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await closeShift(closingCashNum, notes);

      if (result.success) {
        setClosingResult(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message || 'Failed to close shift');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    setShowCommissionSummary(true);
  };

  const handleLogoutConfirm = () => {
    setShowCommissionSummary(false);
    logout();
    navigate('/login', { replace: true });
  };

  const handleNewShift = () => {
    navigate('/open-shift', { replace: true });
  };

  // If no current shift, redirect
  if (!currentShift && !closingResult) {
    return (
      <div className="min-h-screen bg-pos-dark flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 text-center max-w-md">
          <h2 className="text-xl font-bold mb-4">No Active Shift</h2>
          <p className="text-gray-600 mb-6">
            You don't have an active shift to close.
          </p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="btn-pos-primary"
          >
            Go to POS
          </button>
        </div>
      </div>
    );
  }

  // Show closing result
  if (closingResult) {
    return (
      <div className="min-h-screen bg-pos-dark flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
              <svg
                className="w-10 h-10 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Shift Closed</h1>
            <p className="text-gray-500 mt-2">{closingResult.registerName}</p>
          </div>

          {/* Closing Summary */}
          <div className="bg-gray-50 rounded-xl p-6 mb-8">
            <h3 className="font-semibold text-gray-700 mb-4">Shift Summary</h3>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <div className="text-sm text-gray-500">Transactions</div>
                <div className="text-2xl font-bold">{closingResult.transactionCount}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Sales</div>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(closingResult.totalSales)}
                </div>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Opening Cash</span>
                <span className="font-medium">{formatCurrency(closingResult.openingCash)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Expected Cash</span>
                <span className="font-medium">{formatCurrency(closingResult.expectedCash)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Counted Cash</span>
                <span className="font-medium">{formatCurrency(closingResult.closingCash)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600">Variance</span>
                <span
                  className={`font-bold ${
                    closingResult.varianceStatus === 'balanced'
                      ? 'text-green-600'
                      : closingResult.varianceStatus === 'over'
                      ? 'text-blue-600'
                      : 'text-red-600'
                  }`}
                >
                  {closingResult.varianceStatus === 'balanced' ? (
                    'Balanced'
                  ) : (
                    <>
                      {closingResult.varianceStatus === 'over' ? '+' : ''}
                      {formatCurrency(closingResult.variance)}
                      <span className="text-xs ml-1">
                        ({closingResult.varianceStatus})
                      </span>
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleNewShift}
              className="flex-1 btn-pos-primary py-4"
            >
              Start New Shift
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 btn-pos-secondary py-4"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pos-dark">
      {/* Header */}
      <header className="bg-pos-darker text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Close Shift</h1>
          <p className="text-sm text-gray-400">
            {currentShift?.registerName} | {user?.firstName} {user?.lastName}
          </p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          Back to POS
        </button>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Shift Stats */}
          <div className="space-y-6">
            {/* Shift Info Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Shift Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Started</div>
                  <div className="font-medium">
                    {formatDateTime(currentShift?.openedAt)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Duration</div>
                  <div className="font-medium">{getShiftDuration()}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Opening Cash</div>
                  <div className="font-medium">
                    {formatCurrency(currentShift?.openingCash)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Transactions</div>
                  <div className="font-medium">
                    {shiftSummary?.summary?.transactionCount || 0}
                  </div>
                </div>
              </div>
            </div>

            {/* Sales Summary Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Sales Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Total Sales</span>
                  <span className="font-bold text-xl text-green-600">
                    {formatCurrency(shiftSummary?.summary?.totalSales || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Discounts Given</span>
                  <span className="text-red-600">
                    -{formatCurrency(shiftSummary?.summary?.totalDiscounts || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Tax Collected</span>
                  <span>{formatCurrency(shiftSummary?.summary?.totalTax || 0)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Voids</span>
                  <span>{shiftSummary?.summary?.voidCount || 0}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Refunds</span>
                  <span>{shiftSummary?.summary?.refundCount || 0}</span>
                </div>
              </div>
            </div>

            {/* Payment Breakdown Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Payment Breakdown</h2>
              <div className="space-y-3">
                {Object.entries(shiftSummary?.summary?.paymentBreakdown || {}).map(
                  ([method, data]) => (
                    <div key={method} className="flex justify-between py-2 border-b last:border-0">
                      <span className="text-gray-600 capitalize">{method}</span>
                      <div className="text-right">
                        <span className="font-medium">
                          {formatCurrency(data.total)}
                        </span>
                        <span className="text-sm text-gray-400 ml-2">
                          ({data.count})
                        </span>
                      </div>
                    </div>
                  )
                )}
                {Object.keys(shiftSummary?.summary?.paymentBreakdown || {}).length === 0 && (
                  <p className="text-gray-400 text-center py-4">No payments recorded</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Cash Count Form */}
          <div className="space-y-6">
            {/* Cash Count Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Cash Drawer Count</h2>

              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                  {error}
                </div>
              )}

              <form onSubmit={handleCloseShift} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Expected Cash in Drawer
                  </label>
                  <div className="text-3xl font-bold text-gray-400">
                    {formatCurrency(expectedCash)}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Actual Cash Counted ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-4 text-3xl font-mono border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    autoFocus
                    required
                  />
                </div>

                {/* Variance Display */}
                {closingCash && (
                  <div
                    className={`p-4 rounded-xl ${
                      varianceStatus === 'balanced'
                        ? 'bg-green-50 border border-green-200'
                        : varianceStatus === 'over'
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <div className="text-sm text-gray-600 mb-1">Variance</div>
                    <div
                      className={`text-2xl font-bold ${
                        varianceStatus === 'balanced'
                          ? 'text-green-600'
                          : varianceStatus === 'over'
                          ? 'text-blue-600'
                          : 'text-red-600'
                      }`}
                    >
                      {varianceStatus === 'balanced' ? (
                        'Balanced!'
                      ) : (
                        <>
                          {varianceStatus === 'over' ? '+' : ''}
                          {formatCurrency(variance)}
                          <span className="text-sm ml-2">
                            ({varianceStatus === 'over' ? 'Over' : 'Short'})
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any notes about the shift..."
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !closingCash}
                  className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Closing Shift...' : 'Close Shift'}
                </button>
              </form>
            </div>

            {/* Recent Transactions */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
              {loadingTransactions ? (
                <div className="text-center py-4 text-gray-400">Loading...</div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-4 text-gray-400">
                  No transactions this shift
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {transactions.slice(0, 10).map((txn) => (
                    <div
                      key={txn.transactionId}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div>
                        <div className="font-medium text-sm">
                          {txn.transactionNumber}
                        </div>
                        <div className="text-xs text-gray-400">
                          {formatTime(txn.createdAt)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-medium ${
                            txn.status === 'voided'
                              ? 'text-red-600 line-through'
                              : ''
                          }`}
                        >
                          {formatCurrency(txn.totalAmount)}
                        </div>
                        {txn.status !== 'completed' && (
                          <div className="text-xs text-red-500 capitalize">
                            {txn.status}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ShiftCommissionSummary
        isOpen={showCommissionSummary}
        onClose={handleLogoutConfirm}
      />
    </div>
  );
}

export default ShiftClose;
