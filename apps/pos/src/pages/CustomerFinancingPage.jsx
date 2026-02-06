/**
 * TeleTime POS - Customer Financing Page
 * View customer's active financing agreements, payment history, and payoff options
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount || 0);
}

/**
 * Format date
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Status badge component
 */
function StatusBadge({ status }) {
  const statusConfig = {
    active: { bg: 'bg-green-100', text: 'text-green-700', label: 'Active' },
    paid_off: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Paid Off' },
    defaulted: { bg: 'bg-red-100', text: 'text-red-700', label: 'Defaulted' },
    scheduled: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Scheduled' },
    paid: { bg: 'bg-green-100', text: 'text-green-700', label: 'Paid' },
    late: { bg: 'bg-red-100', text: 'text-red-700', label: 'Late' },
    partial: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Partial' },
  };

  const config = statusConfig[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };

  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

/**
 * Summary card component
 */
function SummaryCard({ icon: Icon, label, value, subValue, color = 'gray' }) {
  const colors = {
    gray: 'bg-gray-50 border-gray-200',
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
    red: 'bg-red-50 border-red-200',
  };

  return (
    <div className={`p-4 rounded-xl border ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-5 h-5 text-gray-500" />
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subValue && <p className="text-sm text-gray-500 mt-1">{subValue}</p>}
    </div>
  );
}

/**
 * Agreement card component
 */
function AgreementCard({ agreement, onPayoff }) {
  const isActive = agreement.status === 'active';
  const progress = agreement.termMonths > 0
    ? (agreement.paymentsMade / agreement.termMonths) * 100
    : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="font-semibold text-gray-900">{agreement.planName}</p>
            <p className="text-sm text-gray-500">#{agreement.agreementNumber}</p>
          </div>
          <StatusBadge status={agreement.status} />
        </div>

        {/* Progress bar */}
        {isActive && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{agreement.paymentsMade} of {agreement.termMonths} payments</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Monthly Payment</p>
            <p className="text-lg font-bold text-gray-900">
              {formatCurrency(agreement.monthlyPayment)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Remaining Balance</p>
            <p className="text-lg font-bold text-gray-900">
              {formatCurrency(agreement.balanceRemaining)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">APR</p>
            <p className={`font-medium ${agreement.apr === 0 ? 'text-green-600' : 'text-gray-900'}`}>
              {agreement.apr === 0 ? '0% (Promotional)' : `${agreement.apr}%`}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Next Payment</p>
            <p className="font-medium text-gray-900">
              {agreement.nextPaymentDate ? formatDate(agreement.nextPaymentDate) : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      {isActive && (
        <div className="p-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={() => onPayoff?.(agreement)}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Pay Off Early
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Payment history row
 */
function PaymentRow({ payment }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`
          w-10 h-10 rounded-full flex items-center justify-center
          ${payment.status === 'paid' ? 'bg-green-100' : 'bg-gray-100'}
        `}>
          {payment.status === 'paid' ? (
            <CheckCircleIcon className="w-5 h-5 text-green-600" />
          ) : (
            <ClockIcon className="w-5 h-5 text-gray-500" />
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900">
            Payment #{payment.paymentNumber}
          </p>
          <p className="text-sm text-gray-500">
            {payment.paidAt ? formatDate(payment.paidAt) : `Due: ${formatDate(payment.dueDate)}`}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-semibold text-gray-900">
          {formatCurrency(payment.amountPaid || payment.amountDue)}
        </p>
        <StatusBadge status={payment.status} />
      </div>
    </div>
  );
}

/**
 * Payoff modal component
 */
function PayoffModal({ agreement, payoffData, onConfirm, onClose, processing }) {
  if (!payoffData) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Pay Off Early</h2>

          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm text-green-600 mb-1">Payoff Amount</p>
              <p className="text-3xl font-bold text-green-700">
                {formatCurrency(payoffData.payoffAmount)}
              </p>
            </div>

            {payoffData.savings > 0 && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-sm text-blue-600 mb-1">You Save</p>
                <p className="text-xl font-bold text-blue-700">
                  {formatCurrency(payoffData.savings)}
                </p>
                <p className="text-xs text-blue-500 mt-1">
                  By paying off early, you avoid future interest charges
                </p>
              </div>
            )}

            <div className="text-sm text-gray-600 space-y-2">
              <div className="flex justify-between">
                <span>Remaining Principal</span>
                <span className="font-medium">{formatCurrency(payoffData.principalRemaining)}</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining Interest (waived)</span>
                <span className="font-medium line-through text-gray-400">
                  {formatCurrency(payoffData.interestRemaining)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Remaining Payments</span>
                <span className="font-medium">{payoffData.remainingPayments}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            disabled={processing}
            className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={processing}
            className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-5 h-5" />
                Pay {formatCurrency(payoffData.payoffAmount)}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Customer Financing Page
 */
export function CustomerFinancingPage() {
  const { customerId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Payoff modal state
  const [payoffAgreement, setPayoffAgreement] = useState(null);
  const [payoffData, setPayoffData] = useState(null);
  const [payoffProcessing, setPayoffProcessing] = useState(false);

  // Fetch customer financing data
  const fetchData = useCallback(async () => {
    if (!customerId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/financing/customer/${customerId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load financing data');
      }

      setData(result.data);
    } catch (err) {
      console.error('[CustomerFinancingPage] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle payoff click
  const handlePayoffClick = async (agreement) => {
    try {
      setPayoffAgreement(agreement);

      const response = await fetch(`${API_BASE}/financing/agreements/${agreement.agreementId}/payoff`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to calculate payoff');
      }

      setPayoffData(result.data);
    } catch (err) {
      console.error('[CustomerFinancingPage] Payoff calc error:', err);
      alert(err.message);
      setPayoffAgreement(null);
    }
  };

  // Handle payoff confirm
  const handlePayoffConfirm = async () => {
    if (!payoffAgreement) return;

    try {
      setPayoffProcessing(true);

      const response = await fetch(`${API_BASE}/financing/agreements/${payoffAgreement.agreementId}/payoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
        },
        body: JSON.stringify({ paymentMethod: 'card' }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to process payoff');
      }

      // Close modal and refresh data
      setPayoffAgreement(null);
      setPayoffData(null);
      fetchData();

      alert('Payoff successful! The agreement has been paid off.');
    } catch (err) {
      console.error('[CustomerFinancingPage] Payoff error:', err);
      alert(err.message);
    } finally {
      setPayoffProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading financing data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const { summary, agreements, paymentHistory, upcomingPayments } = data || {};
  const activeAgreements = agreements?.filter(a => a.status === 'active') || [];
  const pastAgreements = agreements?.filter(a => a.status !== 'active') || [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              to={`/customers/${customerId}`}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Financing</h1>
              <p className="text-sm text-gray-500">Manage financing agreements and payments</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            icon={DocumentTextIcon}
            label="Active Agreements"
            value={summary?.activeAgreements || 0}
            color="blue"
          />
          <SummaryCard
            icon={CurrencyDollarIcon}
            label="Total Balance"
            value={formatCurrency(summary?.totalBalance || 0)}
            color={summary?.totalBalance > 0 ? 'gray' : 'green'}
          />
          <SummaryCard
            icon={BanknotesIcon}
            label="Monthly Payments"
            value={formatCurrency(summary?.totalMonthlyPayment || 0)}
          />
          <SummaryCard
            icon={CalendarDaysIcon}
            label="Next Payment"
            value={summary?.nextPaymentDate ? formatDate(summary.nextPaymentDate) : 'None'}
            subValue={summary?.nextPaymentAmountCents ? formatCurrency(summary.nextPaymentAmountCents / 100) : undefined}
          />
        </div>

        {/* Active Agreements */}
        {activeAgreements.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Agreements</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {activeAgreements.map(agreement => (
                <AgreementCard
                  key={agreement.agreementId}
                  agreement={agreement}
                  onPayoff={handlePayoffClick}
                />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Payments */}
        {upcomingPayments?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Upcoming Payments</h2>
            </div>
            <div className="p-4">
              {upcomingPayments.slice(0, 6).map(payment => (
                <PaymentRow key={payment.paymentId} payment={payment} />
              ))}
            </div>
          </div>
        )}

        {/* Payment History */}
        {paymentHistory?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Payment History</h2>
            </div>
            <div className="p-4">
              {paymentHistory.map(payment => (
                <PaymentRow key={payment.paymentId} payment={payment} />
              ))}
            </div>
          </div>
        )}

        {/* Past Agreements */}
        {pastAgreements.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Past Agreements</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {pastAgreements.map(agreement => (
                <AgreementCard
                  key={agreement.agreementId}
                  agreement={agreement}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {(!agreements || agreements.length === 0) && (
          <div className="text-center py-12">
            <CreditCardIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Financing Agreements</h3>
            <p className="text-gray-500">This customer doesn't have any financing agreements yet.</p>
          </div>
        )}
      </div>

      {/* Payoff Modal */}
      {payoffAgreement && (
        <PayoffModal
          agreement={payoffAgreement}
          payoffData={payoffData}
          onConfirm={handlePayoffConfirm}
          onClose={() => {
            setPayoffAgreement(null);
            setPayoffData(null);
          }}
          processing={payoffProcessing}
        />
      )}
    </div>
  );
}

export default CustomerFinancingPage;
