import { authFetch } from '../../../services/authFetch';
/**
 * AutoRelationshipsTable - View and manage auto-generated product relationships
 * Shows "Frequently Bought Together" pairs from purchase data
 */

import { useState, useEffect, useCallback } from 'react';
import {
  MagnifyingGlassIcon,
  EyeIcon,
  EyeSlashIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowsUpDownIcon,
  FunnelIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Strength indicator bar
 */
function StrengthBar({ value }) {
  const percentage = Math.round(value * 100);
  const getColor = () => {
    if (percentage >= 70) return 'bg-green-500';
    if (percentage >= 40) return 'bg-yellow-500';
    return 'bg-red-400';
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor()} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-8">{percentage}%</span>
    </div>
  );
}

/**
 * Relationship type badge
 */
function TypeBadge({ type }) {
  const styles = {
    bought_together: 'bg-blue-100 text-blue-800',
    accessory: 'bg-green-100 text-green-800',
    upgrade: 'bg-purple-100 text-purple-800',
    alternative: 'bg-orange-100 text-orange-800',
  };

  const labels = {
    bought_together: 'Bought Together',
    accessory: 'Accessory',
    upgrade: 'Upgrade',
    alternative: 'Alternative',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        styles[type] || 'bg-gray-100 text-gray-800'
      }`}
    >
      {labels[type] || type}
    </span>
  );
}

/**
 * Main auto relationships table
 */
export default function AutoRelationshipsTable({ onStatsUpdate }) {
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    type: '',
    minStrength: 0,
    showInactive: false,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Sorting
  const [sortBy, setSortBy] = useState('strength');
  const [sortOrder, setSortOrder] = useState('desc');

  // Load relationships
  const loadRelationships = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        curated: 'false', // Only auto-generated
      });

      if (filters.type) {
        params.append('type', filters.type);
      }

      if (filters.search) {
        params.append('productId', filters.search);
      }

      const response = await authFetch(
        `${API_BASE}/api/recommendations/relationships?${params}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load relationships');
      }

      const data = await response.json();

      if (data.success) {
        let filtered = data.data;

        // Apply client-side filters
        if (filters.minStrength > 0) {
          filtered = filtered.filter(
            (r) => r.strength >= filters.minStrength / 100
          );
        }

        if (!filters.showInactive) {
          filtered = filtered.filter((r) => r.isActive);
        }

        // Sort
        filtered.sort((a, b) => {
          let aVal = a[sortBy];
          let bVal = b[sortBy];

          if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
          }

          if (sortOrder === 'asc') {
            return aVal > bVal ? 1 : -1;
          }
          return aVal < bVal ? 1 : -1;
        });

        setRelationships(filtered);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters, sortBy, sortOrder]);

  useEffect(() => {
    loadRelationships();
  }, [loadRelationships]);

  // Toggle relationship visibility
  const toggleVisibility = async (id, currentActive) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(
        `${API_BASE}/api/recommendations/relationships/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isActive: !currentActive }),
        }
      );

      if (response.ok) {
        setRelationships((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, isActive: !currentActive } : r
          )
        );
        onStatsUpdate?.();
      }
    } catch (err) {
      console.error('Failed to toggle visibility:', err);
    }
  };

  // Handle sort
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({
      search: '',
      type: '',
      minStrength: 0,
      showInactive: false,
    });
    setPage(1);
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Auto-Generated Relationships
            </h2>
            <p className="text-sm text-gray-500">
              Based on purchase patterns. {total.toLocaleString()} total
              relationships.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by product ID..."
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, search: e.target.value }))
                }
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                showFilters
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <FunnelIcon className="w-4 h-4" />
              Filters
            </button>
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-4 gap-4">
              {/* Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Relationship Type
                </label>
                <select
                  value={filters.type}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, type: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">All Types</option>
                  <option value="bought_together">Bought Together</option>
                  <option value="accessory">Accessory</option>
                  <option value="upgrade">Upgrade</option>
                  <option value="alternative">Alternative</option>
                </select>
              </div>

              {/* Min Strength */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Strength: {filters.minStrength}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filters.minStrength}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      minStrength: parseInt(e.target.value),
                    }))
                  }
                  className="w-full"
                />
              </div>

              {/* Show Inactive */}
              <div className="flex items-end">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters.showInactive}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        showInactive: e.target.checked,
                      }))
                    }
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Show hidden items
                  </span>
                </label>
              </div>

              {/* Clear Filters */}
              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  <XMarkIcon className="w-4 h-4" />
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-2 text-sm text-gray-500">
              Loading relationships...
            </p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-600">{error}</p>
            <button
              onClick={loadRelationships}
              className="mt-2 text-blue-600 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : relationships.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No relationships found matching your filters.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Related Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('strength')}
                >
                  <div className="flex items-center gap-1">
                    Strength
                    <ArrowsUpDownIcon className="w-4 h-4" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {relationships.map((rel) => (
                <tr
                  key={rel.id}
                  className={`hover:bg-gray-50 ${
                    !rel.isActive ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {rel.productName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {rel.productSku}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {rel.relatedProductName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {rel.relatedProductSku} - $
                        {rel.relatedProductPrice?.toFixed(2)}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <TypeBadge type={rel.relationshipType} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StrengthBar value={rel.strength} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-xs text-gray-500">
                      {rel.source || 'purchase_analysis'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => toggleVisibility(rel.id, rel.isActive)}
                      className={`p-2 rounded-lg transition-colors ${
                        rel.isActive
                          ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                          : 'text-green-600 hover:bg-green-50'
                      }`}
                      title={rel.isActive ? 'Hide this suggestion' : 'Show this suggestion'}
                    >
                      {rel.isActive ? (
                        <EyeSlashIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && relationships.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} ({total.toLocaleString()} total)
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
