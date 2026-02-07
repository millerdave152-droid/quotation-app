import React, { useState, useEffect, useCallback } from 'react';
import { handleApiError } from '../utils/errorHandler';

import { authFetch } from '../services/authFetch';
const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

/**
 * BulkOperationsCenter - Advanced power user features
 * - Bulk enable/disable products on marketplace
 * - Bulk category assignment
 * - Bulk price adjustment
 * - Import/Export product mappings
 * - Health Score Dashboard
 * - Sync Error Management
 * - Audit Log
 */
function BulkOperationsCenter() {
  const [activeTab, setActiveTab] = useState('bulk');
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [enabledFilter, setEnabledFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Health Score
  const [healthScore, setHealthScore] = useState(null);

  // Sync Errors
  const [syncErrors, setSyncErrors] = useState([]);
  const [errorFilter, setErrorFilter] = useState('all');

  // Audit Log
  const [auditLogs, setAuditLogs] = useState([]);

  // Bulk Operations History
  const [bulkHistory, setBulkHistory] = useState([]);

  // Fetch categories
  useEffect(() => {
    authFetch(`${API_BASE}/marketplace/categories`)
      .then(res => res.json())
      .then(data => setCategories(data.categories || []))
      .catch(err => handleApiError(err, { context: 'Loading categories' }));
  }, []);

  // Fetch products based on filters
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 50,
        ...(search && { search }),
        ...(categoryFilter && { category: categoryFilter }),
        ...(enabledFilter && { enabled: enabledFilter })
      });

      const res = await authFetch(`${API_BASE}/marketplace/bulk/products?${params}`);
      const data = await res.json();
      setProducts(data.products || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      handleApiError(err, { context: 'Loading products' });
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, enabledFilter]);

  useEffect(() => {
    if (activeTab === 'bulk') {
      fetchProducts();
    }
  }, [activeTab, fetchProducts]);

  // Fetch health score
  const fetchHealthScore = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/marketplace/health-score`);
      const data = await res.json();
      setHealthScore(data);
    } catch (err) {
      handleApiError(err, { context: 'Loading health score' });
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'health') {
      fetchHealthScore();
    }
  }, [activeTab, fetchHealthScore]);

  // Fetch sync errors
  const fetchSyncErrors = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        status: errorFilter,
        limit: 50
      });
      const res = await authFetch(`${API_BASE}/marketplace/errors?${params}`);
      const data = await res.json();
      setSyncErrors(data.errors || []);
    } catch (err) {
      handleApiError(err, { context: 'Loading sync errors' });
    }
  }, [errorFilter]);

  useEffect(() => {
    if (activeTab === 'errors') {
      fetchSyncErrors();
    }
  }, [activeTab, fetchSyncErrors]);

  // Fetch audit log
  const fetchAuditLog = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/marketplace/audit-log?limit=50`);
      const data = await res.json();
      setAuditLogs(data.entries || []);
    } catch (err) {
      handleApiError(err, { context: 'Loading audit log' });
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLog();
    }
  }, [activeTab, fetchAuditLog]);

  // Fetch bulk history
  const fetchBulkHistory = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/marketplace/bulk/history`);
      const data = await res.json();
      setBulkHistory(data || []);
    } catch (err) {
      handleApiError(err, { context: 'Loading operations history' });
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchBulkHistory();
    }
  }, [activeTab, fetchBulkHistory]);

  // Handle select all
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedProducts(products.map(p => p.id));
    } else {
      setSelectedProducts([]);
    }
  };

  // Handle individual selection
  const handleSelect = (productId) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // Show message helper
  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // Bulk toggle enabled
  const handleBulkToggleEnabled = async (enabled) => {
    if (selectedProducts.length === 0) {
      showMessage('Please select products first', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await authFetch(`${API_BASE}/marketplace/bulk/toggle-enabled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: selectedProducts, enabled })
      });
      const data = await res.json();

      if (data.success) {
        showMessage(`${data.successful} products ${enabled ? 'enabled' : 'disabled'} successfully`);
        setSelectedProducts([]);
        fetchProducts();
      } else {
        showMessage(data.error || 'Operation failed', 'error');
      }
    } catch (err) {
      showMessage('Operation failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Bulk category assignment
  const [bulkCategory, setBulkCategory] = useState('');
  const handleBulkAssignCategory = async () => {
    if (selectedProducts.length === 0 || !bulkCategory) {
      showMessage('Please select products and a category', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await authFetch(`${API_BASE}/marketplace/bulk/assign-category`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: selectedProducts, category_code: bulkCategory })
      });
      const data = await res.json();

      if (data.success) {
        showMessage(`Category assigned to ${data.successful} products`);
        setSelectedProducts([]);
        setBulkCategory('');
        fetchProducts();
      } else {
        showMessage(data.error || 'Operation failed', 'error');
      }
    } catch (err) {
      showMessage('Operation failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Bulk price adjustment
  const [priceAdjustType, setPriceAdjustType] = useState('percentage');
  const [priceAdjustValue, setPriceAdjustValue] = useState('');
  const handleBulkPriceAdjust = async () => {
    if (selectedProducts.length === 0 || priceAdjustValue === '') {
      showMessage('Please select products and enter an adjustment value', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await authFetch(`${API_BASE}/marketplace/bulk/adjust-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_ids: selectedProducts,
          adjustment_type: priceAdjustType,
          adjustment_value: parseFloat(priceAdjustValue)
        })
      });
      const data = await res.json();

      if (data.success) {
        showMessage(`Prices adjusted for ${data.successful} products`);
        setSelectedProducts([]);
        setPriceAdjustValue('');
        fetchProducts();
      } else {
        showMessage(data.error || 'Operation failed', 'error');
      }
    } catch (err) {
      showMessage('Operation failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Export mappings
  const handleExportMappings = () => {
    window.open(`${API_BASE}/marketplace/bulk/export-mappings`, '_blank');
  };

  // Ignore sync error
  const handleIgnoreError = async (errorId) => {
    try {
      await authFetch(`${API_BASE}/marketplace/errors/${errorId}/ignore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      fetchSyncErrors();
      showMessage('Error ignored');
    } catch (err) {
      showMessage('Failed to ignore error', 'error');
    }
  };

  // Retry sync error
  const handleRetryError = async (errorId) => {
    try {
      await authFetch(`${API_BASE}/marketplace/errors/${errorId}/retry`, {
        method: 'POST'
      });
      fetchSyncErrors();
      showMessage('Retry initiated');
    } catch (err) {
      showMessage('Failed to retry', 'error');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-CA');
  };

  const formatCurrency = (value) => {
    if (!value) return '$0.00';
    return `$${parseFloat(value).toFixed(2)}`;
  };

  const getHealthColor = (score) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const tabStyle = (isActive) => ({
    padding: '12px 24px',
    background: isActive ? '#667eea' : 'white',
    color: isActive ? 'white' : '#6b7280',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  });

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '700', color: '#111827' }}>
        Power User Tools
      </h1>
      <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
        Advanced bulk operations, health monitoring, and audit logs
      </p>

      {/* Message */}
      {message && (
        <div style={{
          padding: '12px 16px',
          marginBottom: '16px',
          borderRadius: '8px',
          background: message.type === 'error' ? '#fef2f2' : '#f0fdf4',
          color: message.type === 'error' ? '#dc2626' : '#16a34a',
          border: `1px solid ${message.type === 'error' ? '#fecaca' : '#bbf7d0'}`
        }}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button style={tabStyle(activeTab === 'bulk')} onClick={() => setActiveTab('bulk')}>
          Bulk Operations
        </button>
        <button style={tabStyle(activeTab === 'health')} onClick={() => setActiveTab('health')}>
          Health Score
        </button>
        <button style={tabStyle(activeTab === 'errors')} onClick={() => setActiveTab('errors')}>
          Sync Errors
        </button>
        <button style={tabStyle(activeTab === 'audit')} onClick={() => setActiveTab('audit')}>
          Audit Log
        </button>
        <button style={tabStyle(activeTab === 'history')} onClick={() => setActiveTab('history')}>
          Operations History
        </button>
      </div>

      {/* Bulk Operations Tab */}
      {activeTab === 'bulk' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', width: '200px' }}
            />
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px' }}
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat.code} value={cat.code}>{cat.name}</option>
              ))}
            </select>
            <select
              value={enabledFilter}
              onChange={(e) => { setEnabledFilter(e.target.value); setPage(1); }}
              style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px' }}
            >
              <option value="">All Status</option>
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
            <button
              onClick={handleExportMappings}
              style={{ padding: '10px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              Export CSV
            </button>
          </div>

          {/* Bulk Actions */}
          {selectedProducts.length > 0 && (
            <div style={{
              padding: '16px',
              marginBottom: '16px',
              background: '#f3f4f6',
              borderRadius: '8px',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}>
              <span style={{ fontWeight: '600', color: '#374151' }}>
                {selectedProducts.length} selected
              </span>
              <button
                onClick={() => handleBulkToggleEnabled(true)}
                style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Enable
              </button>
              <button
                onClick={() => handleBulkToggleEnabled(false)}
                style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Disable
              </button>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                >
                  <option value="">Select Category</option>
                  {categories.map(cat => (
                    <option key={cat.code} value={cat.code}>{cat.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleBulkAssignCategory}
                  style={{ padding: '8px 16px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Assign Category
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  value={priceAdjustType}
                  onChange={(e) => setPriceAdjustType(e.target.value)}
                  style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                >
                  <option value="percentage">% Change</option>
                  <option value="fixed">+/- Amount</option>
                  <option value="set">Set Price</option>
                </select>
                <input
                  type="number"
                  value={priceAdjustValue}
                  onChange={(e) => setPriceAdjustValue(e.target.value)}
                  placeholder={priceAdjustType === 'percentage' ? '10' : '100'}
                  style={{ padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', width: '80px' }}
                />
                <button
                  onClick={handleBulkPriceAdjust}
                  style={{ padding: '8px 16px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Adjust Prices
                </button>
              </div>
            </div>
          )}

          {/* Products Table */}
          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f9fafb' }}>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={selectedProducts.length === products.length && products.length > 0}
                    />
                  </th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>SKU</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Product</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Category</th>
                  <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e5e7eb', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Price</th>
                  <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Last Synced</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading...</td></tr>
                ) : products.length === 0 ? (
                  <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>No products found</td></tr>
                ) : products.map(product => (
                  <tr key={product.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(product.id)}
                        onChange={() => handleSelect(product.id)}
                      />
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px', color: '#6b7280' }}>{product.sku}</td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: '500', color: '#111827' }}>{product.name}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>{product.manufacturer}</div>
                    </td>
                    <td style={{ padding: '12px', fontSize: '13px', color: '#6b7280' }}>{product.category_name}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#111827' }}>{formatCurrency(product.price)}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        background: product.marketplace_enabled ? '#dcfce7' : '#fee2e2',
                        color: product.marketplace_enabled ? '#166534' : '#991b1b'
                      }}>
                        {product.marketplace_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>
                      {product.marketplace_last_synced ? formatDate(product.marketplace_last_synced) : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}
              >
                Previous
              </button>
              <span style={{ padding: '8px 16px', color: '#6b7280' }}>Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Health Score Tab */}
      {activeTab === 'health' && healthScore && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {/* Overall Score */}
            <div style={{
              padding: '24px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '16px',
              color: 'white',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '64px', fontWeight: '700', marginBottom: '8px' }}>{healthScore.overall_score}</div>
              <div style={{ fontSize: '18px', opacity: 0.9 }}>Overall Health Score</div>
              <div style={{
                marginTop: '12px',
                padding: '6px 16px',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '20px',
                display: 'inline-block',
                fontSize: '14px',
                fontWeight: '600'
              }}>
                {healthScore.status.toUpperCase()}
              </div>
            </div>

            {/* Sync Success Rate */}
            <div style={{ padding: '24px', background: 'white', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Sync Success Rate</div>
              <div style={{ fontSize: '36px', fontWeight: '700', color: getHealthColor(healthScore.metrics.sync_success_rate) }}>
                {healthScore.metrics.sync_success_rate}%
              </div>
              <div style={{ marginTop: '12px', background: '#f3f4f6', borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
                <div style={{ width: `${healthScore.metrics.sync_success_rate}%`, height: '100%', background: getHealthColor(healthScore.metrics.sync_success_rate), borderRadius: '8px' }} />
              </div>
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#6b7280' }}>
                {healthScore.details.sync.successful} / {healthScore.details.sync.total} syncs successful
              </div>
            </div>

            {/* Order Fulfillment Rate */}
            <div style={{ padding: '24px', background: 'white', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Order Fulfillment Rate</div>
              <div style={{ fontSize: '36px', fontWeight: '700', color: getHealthColor(healthScore.metrics.order_fulfillment_rate) }}>
                {healthScore.metrics.order_fulfillment_rate}%
              </div>
              <div style={{ marginTop: '12px', background: '#f3f4f6', borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
                <div style={{ width: `${healthScore.metrics.order_fulfillment_rate}%`, height: '100%', background: getHealthColor(healthScore.metrics.order_fulfillment_rate), borderRadius: '8px' }} />
              </div>
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#6b7280' }}>
                {healthScore.details.orders.fulfilled} / {healthScore.details.orders.total} orders fulfilled
              </div>
            </div>

            {/* Inventory Accuracy */}
            <div style={{ padding: '24px', background: 'white', borderRadius: '16px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Inventory Accuracy</div>
              <div style={{ fontSize: '36px', fontWeight: '700', color: getHealthColor(healthScore.metrics.inventory_accuracy) }}>
                {healthScore.metrics.inventory_accuracy}%
              </div>
              <div style={{ marginTop: '12px', background: '#f3f4f6', borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
                <div style={{ width: `${healthScore.metrics.inventory_accuracy}%`, height: '100%', background: getHealthColor(healthScore.metrics.inventory_accuracy), borderRadius: '8px' }} />
              </div>
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#6b7280' }}>
                {healthScore.details.inventory.in_sync} / {healthScore.details.inventory.total} products in sync
              </div>
            </div>
          </div>

          {/* Recommendations */}
          {healthScore.recommendations.length > 0 && (
            <div style={{ padding: '20px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px' }}>
              <h3 style={{ margin: '0 0 16px 0', color: '#92400e', fontSize: '16px', fontWeight: '600' }}>Recommendations</h3>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {healthScore.recommendations.map((rec, idx) => (
                  <li key={idx} style={{ marginBottom: '8px', color: '#78350f' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600',
                      marginRight: '8px',
                      background: rec.priority === 'high' ? '#fee2e2' : '#fef3c7',
                      color: rec.priority === 'high' ? '#991b1b' : '#92400e'
                    }}>
                      {rec.priority.toUpperCase()}
                    </span>
                    {rec.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Sync Errors Tab */}
      {activeTab === 'errors' && (
        <div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
            <select
              value={errorFilter}
              onChange={(e) => setErrorFilter(e.target.value)}
              style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px' }}
            >
              <option value="all">All Errors</option>
              <option value="pending">Pending</option>
              <option value="retrying">Retrying</option>
              <option value="ignored">Ignored</option>
            </select>
            <button
              onClick={fetchSyncErrors}
              style={{ padding: '10px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              Refresh
            </button>
          </div>

          {syncErrors.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '12px' }}>
              No sync errors found
            </div>
          ) : (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
              {syncErrors.map(error => (
                <div key={error.id} style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', background: 'white' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                        {error.product_name || error.product_sku || 'Unknown Product'}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: '#fef3c7',
                          color: '#92400e',
                          marginRight: '8px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          {error.error_type}
                        </span>
                        {formatDate(error.created_at)}
                      </div>
                      <div style={{ fontSize: '14px', color: '#dc2626' }}>{error.error_message}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {error.status !== 'ignored' && (
                        <>
                          <button
                            onClick={() => handleRetryError(error.id)}
                            style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                          >
                            Retry ({error.retry_count}/{error.max_retries})
                          </button>
                          <button
                            onClick={() => handleIgnoreError(error.id)}
                            style={{ padding: '6px 12px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                          >
                            Ignore
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <div>
          <button
            onClick={fetchAuditLog}
            style={{ padding: '10px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '16px' }}
          >
            Refresh
          </button>

          {auditLogs.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '12px' }}>
              No audit log entries found
            </div>
          ) : (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
              {auditLogs.map(log => (
                <div key={log.id} style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', background: 'white' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: '#ede9fe',
                          color: '#5b21b6',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          {log.action_type}
                        </span>
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>{log.entity_type}</span>
                      </div>
                      <div style={{ fontSize: '14px', color: '#111827' }}>{log.description}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{log.user_name}</div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>{formatDate(log.created_at)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Operations History Tab */}
      {activeTab === 'history' && (
        <div>
          <button
            onClick={fetchBulkHistory}
            style={{ padding: '10px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '16px' }}
          >
            Refresh
          </button>

          {bulkHistory.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '12px' }}>
              No bulk operations history found
            </div>
          ) : (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Operation</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Status</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Total</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Success</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Failed</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>User</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkHistory.map(op => (
                    <tr key={op.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px', fontWeight: '500', color: '#111827' }}>{op.operation_type}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600',
                          background: op.status === 'completed' ? '#dcfce7' : op.status === 'failed' ? '#fee2e2' : '#fef3c7',
                          color: op.status === 'completed' ? '#166534' : op.status === 'failed' ? '#991b1b' : '#92400e'
                        }}>
                          {op.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#6b7280' }}>{op.total_items}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#10b981', fontWeight: '600' }}>{op.successful_items}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: op.failed_items > 0 ? '#ef4444' : '#6b7280', fontWeight: '600' }}>{op.failed_items}</td>
                      <td style={{ padding: '12px', fontSize: '13px', color: '#6b7280' }}>{op.user_name}</td>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>{formatDate(op.started_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BulkOperationsCenter;
