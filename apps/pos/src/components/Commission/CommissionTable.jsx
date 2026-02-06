/**
 * Commission Table Component
 * Displays commission earnings in a sortable, filterable table
 */

import React, { useState, useMemo } from 'react';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

/**
 * Format date
 */
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Sort indicator icon
 */
function SortIcon({ active, direction }) {
  if (!active) {
    return (
      <div className="w-4 h-4 text-slate-300">
        <ChevronUpIcon className="w-3 h-3" />
      </div>
    );
  }
  return direction === 'asc' ? (
    <ChevronUpIcon className="w-4 h-4 text-blue-600" />
  ) : (
    <ChevronDownIcon className="w-4 h-4 text-blue-600" />
  );
}

/**
 * Table header cell with sorting
 */
function SortableHeader({ label, sortKey, currentSort, onSort, align = 'left' }) {
  const isActive = currentSort.key === sortKey;

  return (
    <th
      className={`
        px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider
        cursor-pointer hover:bg-slate-100 select-none transition-colors
        ${align === 'right' ? 'text-right' : 'text-left'}
      `}
      onClick={() => onSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        <span>{label}</span>
        <SortIcon active={isActive} direction={currentSort.direction} />
      </div>
    </th>
  );
}

/**
 * Commission earnings table
 */
export default function CommissionTable({
  earnings = [],
  loading = false,
  showRepColumn = false,
  onRowClick,
  className = '',
}) {
  const [sort, setSort] = useState({ key: 'orderDate', direction: 'desc' });
  const [search, setSearch] = useState('');
  const [filterBonus, setFilterBonus] = useState(false);

  // Sort handler
  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  // Filter and sort data
  const filteredData = useMemo(() => {
    let data = [...earnings];

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(e =>
        (e.itemName?.toLowerCase() || '').includes(searchLower) ||
        (e.orderNumber?.toLowerCase() || '').includes(searchLower) ||
        (e.categoryName?.toLowerCase() || '').includes(searchLower) ||
        (e.repName?.toLowerCase() || '').includes(searchLower)
      );
    }

    // Bonus filter
    if (filterBonus) {
      data = data.filter(e => e.isBonus);
    }

    // Sort
    data.sort((a, b) => {
      let aVal, bVal;

      switch (sort.key) {
        case 'orderDate':
          aVal = new Date(a.orderDate || 0).getTime();
          bVal = new Date(b.orderDate || 0).getTime();
          break;
        case 'baseAmount':
          aVal = a.baseAmount || 0;
          bVal = b.baseAmount || 0;
          break;
        case 'commission':
          aVal = a.commission || 0;
          bVal = b.commission || 0;
          break;
        case 'rate':
          aVal = a.rate || 0;
          bVal = b.rate || 0;
          break;
        case 'itemName':
          aVal = a.itemName || '';
          bVal = b.itemName || '';
          break;
        default:
          aVal = a[sort.key] || '';
          bVal = b[sort.key] || '';
      }

      if (typeof aVal === 'string') {
        return sort.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return data;
  }, [earnings, search, filterBonus, sort]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, e) => ({
        sales: acc.sales + (e.baseAmount || 0),
        commission: acc.commission + (e.commission || 0),
      }),
      { sales: 0, commission: 0 }
    );
  }, [filteredData]);

  if (loading) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${className}`}>
        <div className="p-8 text-center">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500">Loading commissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search orders, items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Bonus filter */}
          <button
            onClick={() => setFilterBonus(!filterBonus)}
            className={`
              flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors
              ${filterBonus
                ? 'bg-amber-100 border-amber-300 text-amber-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }
            `}
          >
            <SparklesIcon className="w-4 h-4" />
            Bonus Only
          </button>
        </div>

        <div className="text-sm text-slate-500">
          {filteredData.length} of {earnings.length} entries
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-100">
            <tr>
              <SortableHeader
                label="Date"
                sortKey="orderDate"
                currentSort={sort}
                onSort={handleSort}
              />
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Order #
              </th>
              {showRepColumn && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Rep
                </th>
              )}
              <SortableHeader
                label="Item"
                sortKey="itemName"
                currentSort={sort}
                onSort={handleSort}
              />
              <SortableHeader
                label="Sale Amount"
                sortKey="baseAmount"
                currentSort={sort}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Rate"
                sortKey="rate"
                currentSort={sort}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Commission"
                sortKey="commission"
                currentSort={sort}
                onSort={handleSort}
                align="right"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={showRepColumn ? 7 : 6} className="px-4 py-12 text-center text-slate-500">
                  No commission data found
                </td>
              </tr>
            ) : (
              filteredData.map((earning, index) => (
                <tr
                  key={earning.id || index}
                  onClick={() => onRowClick?.(earning)}
                  className={`
                    ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                    ${earning.isReduced ? 'bg-amber-50/50' : ''}
                    ${onRowClick ? 'cursor-pointer hover:bg-blue-50' : ''}
                    transition-colors
                  `}
                >
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDate(earning.orderDate)}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-700">
                    {earning.orderNumber || '-'}
                  </td>
                  {showRepColumn && (
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {earning.repName || '-'}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-900 truncate max-w-[200px]">
                        {earning.itemName}
                      </span>
                      {earning.isBonus && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                          <SparklesIcon className="w-3 h-3" />
                        </span>
                      )}
                      {earning.isReduced && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                          <ExclamationTriangleIcon className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    {earning.categoryName && (
                      <div className="text-xs text-slate-500">{earning.categoryName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-slate-700">
                    {formatCurrency(earning.baseAmount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={`
                      inline-block px-2 py-0.5 text-xs font-medium rounded
                      ${earning.isBonus ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}
                    `}>
                      {earning.ratePercent || `${(earning.rate * 100).toFixed(2)}%`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={`font-semibold ${earning.isBonus ? 'text-green-600' : 'text-slate-900'}`}>
                      {formatCurrency(earning.commission)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {/* Totals row */}
          {filteredData.length > 0 && (
            <tfoot className="bg-slate-100 border-t-2 border-slate-200">
              <tr>
                <td colSpan={showRepColumn ? 4 : 3} className="px-4 py-3 text-sm font-semibold text-slate-700">
                  Total ({filteredData.length} items)
                </td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-slate-700">
                  {formatCurrency(totals.sales)}
                </td>
                <td className="px-4 py-3"></td>
                <td className="px-4 py-3 text-sm text-right font-bold text-green-600">
                  {formatCurrency(totals.commission)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/**
 * Team Commission Table (for manager view)
 */
export function TeamCommissionTable({
  reps = [],
  loading = false,
  onRepClick,
  className = '',
}) {
  const [sort, setSort] = useState({ key: 'totalCommission', direction: 'desc' });

  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const sortedReps = useMemo(() => {
    return [...reps].sort((a, b) => {
      const aVal = a[sort.key] || 0;
      const bVal = b[sort.key] || 0;

      if (typeof aVal === 'string') {
        return sort.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [reps, sort]);

  if (loading) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 p-8 text-center ${className}`}>
        <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-500">Loading team data...</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-12">
                #
              </th>
              <SortableHeader
                label="Rep"
                sortKey="repName"
                currentSort={sort}
                onSort={handleSort}
              />
              <SortableHeader
                label="Sales"
                sortKey="orderCount"
                currentSort={sort}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Revenue"
                sortKey="totalSales"
                currentSort={sort}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Commission"
                sortKey="totalCommission"
                currentSort={sort}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Bonus"
                sortKey="bonusCommission"
                currentSort={sort}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Avg Rate"
                sortKey="avgRate"
                currentSort={sort}
                onSort={handleSort}
                align="right"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedReps.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  No team data found
                </td>
              </tr>
            ) : (
              sortedReps.map((rep, index) => {
                const rank = index + 1;
                const medals = ['🥇', '🥈', '🥉'];

                return (
                  <tr
                    key={rep.repId}
                    onClick={() => onRepClick?.(rep)}
                    className={`
                      ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                      ${onRepClick ? 'cursor-pointer hover:bg-blue-50' : ''}
                      transition-colors
                    `}
                  >
                    <td className="px-4 py-3 text-center">
                      {rank <= 3 ? (
                        <span className="text-lg">{medals[rank - 1]}</span>
                      ) : (
                        <span className="text-sm text-slate-400">{rank}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{rep.repName}</div>
                      <div className="text-xs text-slate-500">{rep.email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-700">
                      {rep.orderCount}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-700">
                      {formatCurrency(rep.totalSales)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-green-600">
                        {formatCurrency(rep.totalCommission)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-amber-600">
                      {formatCurrency(rep.bonusCommission)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span className="inline-block px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 rounded">
                        {(rep.avgRate * 100).toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
