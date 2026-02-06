/**
 * TeleTime POS - Customer Warranties Component
 * Displays all warranties for a customer with status and coverage details
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheckIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  PhoneIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';
import { ShieldCheckIcon as ShieldCheckSolid } from '@heroicons/react/24/solid';
import { formatCurrency } from '../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Warranty status badge
 */
function WarrantyStatusBadge({ status, daysRemaining }) {
  const getConfig = () => {
    if (status === 'active' && daysRemaining <= 30) {
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        icon: ExclamationTriangleIcon,
        label: `Expiring in ${daysRemaining} days`,
      };
    }

    const configs = {
      active: {
        bg: 'bg-green-100',
        text: 'text-green-700',
        icon: CheckCircleIcon,
        label: 'Active',
      },
      expired: {
        bg: 'bg-gray-100',
        text: 'text-gray-600',
        icon: ClockIcon,
        label: 'Expired',
      },
      pending: {
        bg: 'bg-yellow-100',
        text: 'text-yellow-700',
        icon: ClockIcon,
        label: 'Pending',
      },
      claimed: {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        icon: ShieldCheckSolid,
        label: 'Claimed',
      },
      cancelled: {
        bg: 'bg-red-100',
        text: 'text-red-700',
        icon: XMarkIcon,
        label: 'Cancelled',
      },
    };

    return configs[status] || configs.active;
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

/**
 * Individual warranty card
 */
function WarrantyCard({ warranty, onViewDetails }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <ShieldCheckIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{warranty.warrantyName}</h3>
              <p className="text-sm text-gray-500 capitalize">{warranty.warrantyType} warranty</p>
            </div>
          </div>
          <WarrantyStatusBadge
            status={warranty.status}
            daysRemaining={warranty.daysRemaining}
          />
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Covered Product */}
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1">Covered Product</p>
          <p className="font-medium text-gray-900">{warranty.coveredProduct.name}</p>
          {warranty.coveredProduct.serialNumber && (
            <p className="text-sm text-gray-500">
              S/N: <span className="font-mono">{warranty.coveredProduct.serialNumber}</span>
            </p>
          )}
        </div>

        {/* Coverage Period */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Coverage Period</p>
          <p className="font-medium text-green-700">
            {formatDate(warranty.coverageStartDate)} — {formatDate(warranty.coverageEndDate)}
          </p>
          {warranty.daysRemaining > 0 && warranty.status === 'active' && (
            <p className="text-xs text-gray-500 mt-1">
              {warranty.daysRemaining} days remaining
            </p>
          )}
        </div>

        {/* Registration Code */}
        {warranty.registrationCode && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-1">Registration Code</p>
            <p className="font-mono text-sm font-semibold text-gray-900 bg-gray-100 px-3 py-2 rounded">
              {warranty.registrationCode}
            </p>
          </div>
        )}

        {/* Terms and Provider */}
        <div className="flex items-center justify-between text-sm">
          {warranty.terms?.url ? (
            <a
              href={warranty.terms.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
            >
              View Terms
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            </a>
          ) : (
            <span />
          )}
          {warranty.terms?.deductible > 0 && (
            <span className="text-amber-600">
              {formatCurrency(warranty.terms.deductible)} deductible
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Purchased: {formatDate(warranty.purchase?.date)}
          </span>
          <span>
            {formatCurrency(warranty.price)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Summary stats card
 */
function SummaryStats({ summary }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
        <p className="text-sm text-gray-500">Total Warranties</p>
      </div>
      <div className="bg-white rounded-lg border border-green-200 p-4">
        <p className="text-2xl font-bold text-green-600">{summary.active}</p>
        <p className="text-sm text-gray-500">Active</p>
      </div>
      <div className="bg-white rounded-lg border border-amber-200 p-4">
        <p className="text-2xl font-bold text-amber-600">{summary.expiringSoon}</p>
        <p className="text-sm text-gray-500">Expiring Soon</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-2xl font-bold text-gray-600">{formatCurrency(summary.totalValue)}</p>
        <p className="text-sm text-gray-500">Total Value</p>
      </div>
    </div>
  );
}

/**
 * Customer Warranties Component
 */
export function CustomerWarranties({
  customerId,
  customerName,
  isOpen,
  onClose,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all'); // all, active, expired

  // Fetch warranties
  const fetchWarranties = useCallback(async () => {
    if (!customerId) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filter === 'expired') {
        params.append('includeExpired', 'true');
      }
      if (filter !== 'all' && filter !== 'expired') {
        params.append('status', filter);
      }

      const response = await fetch(
        `${API_BASE}/warranty/customer/${customerId}?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load warranties');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to load warranties');
      }

      setData(result);
    } catch (err) {
      console.error('[CustomerWarranties] Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customerId, filter]);

  useEffect(() => {
    if (isOpen && customerId) {
      fetchWarranties();
    }
  }, [isOpen, customerId, fetchWarranties]);

  // Filter warranties for display
  const filteredWarranties = data?.warranties?.filter((w) => {
    if (filter === 'all') return true;
    if (filter === 'active') return w.status === 'active';
    if (filter === 'expired') return w.status === 'expired';
    if (filter === 'expiring') return w.status === 'active' && w.daysRemaining <= 30;
    return true;
  }) || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl mx-4 max-h-[90vh] bg-gray-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ShieldCheckSolid className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Customer Warranties</h2>
              {customerName && (
                <p className="text-sm text-gray-500">{customerName}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="px-4 pt-4 bg-white border-b border-gray-200">
          <div className="flex gap-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'expiring', label: 'Expiring Soon' },
              { id: 'expired', label: 'Expired' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`
                  px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
                  ${filter === tab.id
                    ? 'bg-gray-100 text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <ExclamationTriangleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-gray-600">{error}</p>
              <button
                type="button"
                onClick={fetchWarranties}
                className="mt-4 text-blue-600 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : data ? (
            <>
              {/* Summary */}
              <SummaryStats summary={data.summary} />

              {/* Warranties grid */}
              {filteredWarranties.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {filteredWarranties.map((warranty) => (
                    <WarrantyCard key={warranty.id} warranty={warranty} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <ShieldCheckIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">
                    {filter === 'all'
                      ? 'No warranties found for this customer'
                      : `No ${filter} warranties`}
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            For warranty claims, contact support with the registration code.
          </p>
        </div>
      </div>
    </div>
  );
}

export default CustomerWarranties;
