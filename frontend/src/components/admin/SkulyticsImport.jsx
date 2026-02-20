import React, { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../../services/authFetch';
import { useToast } from '../ui';
import { SkeletonStats, SkeletonTable } from '../ui';
import { useDebounce } from '../../utils/useDebounce';
import {
  Database, Download, RefreshCw, Search, Filter, ChevronRight,
  X, Check, AlertTriangle, Package, Eye, ChevronLeft
} from 'lucide-react';

const API = '/api/admin/skulytics';

const formatCAD = (val) => {
  if (val == null || val === '') return '--';
  const num = parseFloat(val);
  if (isNaN(num)) return '--';
  return `$${num.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD`;
};

const formatDate = (d) => {
  if (!d) return '--';
  try {
    return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return '--'; }
};

const statusColors = {
  not_imported: { bg: '#f3f4f6', color: '#374151', label: 'Not Imported' },
  pending: { bg: '#fef3c7', color: '#92400e', label: 'Pending Review' },
  confirmed: { bg: '#d1fae5', color: '#065f46', label: 'Confirmed' },
  rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
  imported: { bg: '#dbeafe', color: '#1e40af', label: 'Imported' },
};

const getProductStatus = (row) => {
  if (row.product_skulytics_id) return 'imported';
  if (row.match_status === 'pending') return 'pending';
  if (row.match_status === 'confirmed') return 'confirmed';
  if (row.match_status === 'rejected') return 'rejected';
  return 'not_imported';
};

const StatusBadge = ({ status }) => {
  const s = statusColors[status] || statusColors.not_imported;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '12px',
      fontSize: '12px', fontWeight: 600, background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
};

const StockBadge = ({ inStock, discontinued }) => {
  if (discontinued) return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: '#fce7f3', color: '#9d174d' }}>Discontinued</span>
  );
  return inStock ? (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: '#d1fae5', color: '#065f46' }}>In Stock</span>
  ) : (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: '#fee2e2', color: '#991b1b' }}>Out of Stock</span>
  );
};

const ProductThumb = ({ src, size = 40, iconSize = 16, rounded = 6 }) => {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) {
    return (
      <div style={{
        width: `${size}px`, height: `${size}px`, background: '#f3f4f6', borderRadius: `${rounded}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Package size={iconSize} style={{ color: '#d1d5db' }} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain', borderRadius: `${rounded}px`, background: '#f9fafb', flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  );
};

// ── Main Component ──────────────────────────────────────────

const SkulyticsImport = () => {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [drawerProduct, setDrawerProduct] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [filters, setFilters] = useState({ search: '', status: '', brand: '', inStock: '' });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const debouncedSearch = useDebounce(filters.search, 300);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // ── Fetch catalogue ─────────────────────────────────────

  const fetchCatalogue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, pageSize: 25 });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filters.status) params.set('status', filters.status);
      if (filters.brand) params.set('brand', filters.brand);
      if (filters.inStock) params.set('inStock', filters.inStock);

      const res = await authFetch(`${API}/catalogue?${params}`);
      const json = await res.json();
      if (!isMounted.current) return;

      if (json.success) {
        setProducts(json.data || []);
        const pag = json.meta?.pagination;
        if (pag) {
          setTotalPages(pag.totalPages || 1);
          setTotalCount(pag.total || 0);
        }
      } else {
        toast.error(json.error?.message || 'Failed to load catalogue');
      }
    } catch (err) {
      if (isMounted.current) toast.error('Failed to load catalogue');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [page, debouncedSearch, filters.status, filters.brand, filters.inStock, toast]);

  // ── Fetch stats ─────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await authFetch(`${API}/catalogue/stats`);
      const json = await res.json();
      if (!isMounted.current) return;
      if (json.success) setStats(json.data);
    } catch { /* silent */ } finally {
      if (isMounted.current) setStatsLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchCatalogue(); }, [fetchCatalogue]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, filters.status, filters.brand, filters.inStock]);

  // ── Drawer ──────────────────────────────────────────────

  const openDrawer = async (skulyticsId) => {
    setDrawerLoading(true);
    setDrawerProduct(null);
    try {
      const res = await authFetch(`${API}/catalogue/${skulyticsId}`);
      const json = await res.json();
      if (json.success) setDrawerProduct(json.data);
      else toast.error('Failed to load product details');
    } catch { toast.error('Failed to load product details'); }
    finally { setDrawerLoading(false); }
  };

  const closeDrawer = () => { setDrawerProduct(null); setDrawerLoading(false); };

  // ── Match actions ───────────────────────────────────────

  const handleConfirmMatch = async (matchId) => {
    try {
      const res = await authFetch(`${API}/match/confirm`, {
        method: 'POST', body: JSON.stringify({ matchId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Match confirmed');
        fetchCatalogue();
        fetchStats();
        if (drawerProduct) openDrawer(drawerProduct.skulytics_id);
      } else toast.error(json.error?.message || 'Failed to confirm match');
    } catch { toast.error('Failed to confirm match'); }
  };

  const handleRejectMatch = async (matchId) => {
    try {
      const res = await authFetch(`${API}/match/reject`, {
        method: 'POST', body: JSON.stringify({ matchId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Match rejected');
        fetchCatalogue();
        fetchStats();
        if (drawerProduct) openDrawer(drawerProduct.skulytics_id);
      } else toast.error(json.error?.message || 'Failed to reject match');
    } catch { toast.error('Failed to reject match'); }
  };

  // ── Bulk import ─────────────────────────────────────────

  const handleBulkImport = async () => {
    if (selectedIds.size === 0) return;
    setImporting(true);
    try {
      const res = await authFetch(`${API}/import`, {
        method: 'POST',
        body: JSON.stringify({ skulyticsIds: Array.from(selectedIds) }),
      });
      const json = await res.json();
      if (json.success) {
        setImportResult(json.data);
        setSelectedIds(new Set());
        fetchCatalogue();
        fetchStats();
      } else toast.error(json.error?.message || 'Import failed');
    } catch { toast.error('Import request failed'); }
    finally { setImporting(false); }
  };

  // ── Selection helpers ───────────────────────────────────

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const importable = products.filter(p => getProductStatus(p) !== 'imported').map(p => p.skulytics_id);
    if (importable.every(id => selectedIds.has(id))) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        importable.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        importable.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const clearFilters = () => {
    setFilters({ search: '', status: '', brand: '', inStock: '' });
  };

  const hasActiveFilters = filters.search || filters.status || filters.brand || filters.inStock;

  // ── Render ──────────────────────────────────────────────

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: '0 0 6px 0', fontSize: '28px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Skulytics Product Import
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
              Browse the global catalogue, review matches, and import products
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {stats?.last_sync_at && (
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                Last sync: {formatDate(stats.last_sync_at)}
              </span>
            )}
            <button
              onClick={() => toast.info('Run full sync from the CLI: node scripts/manual-sync.js --full')}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                background: '#667eea', color: 'white', border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              <RefreshCw size={16} /> Sync Now
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {statsLoading ? (
          <div style={{ marginBottom: '24px' }}><SkeletonStats count={4} /></div>
        ) : stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <StatCard label="In Catalogue" value={stats.total_in_catalogue} icon={<Database size={20} />} color="#667eea" />
            <StatCard label="Imported" value={stats.total_imported} icon={<Download size={20} />} color="#10b981" />
            <StatCard label="Pending Review" value={stats.total_pending_review} icon={<AlertTriangle size={20} />} color="#f59e0b" />
            <StatCard label="Not Imported" value={stats.total_not_imported} icon={<Package size={20} />} color="#6b7280" />
          </div>
        )}

        {/* Filter Bar */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center',
          padding: '16px 20px', background: 'white', borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '20px',
        }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              placeholder="Search SKU, brand, or model..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              style={{
                width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #e5e7eb',
                borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <select
            value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', background: 'white', cursor: 'pointer' }}
          >
            <option value="">All Statuses</option>
            <option value="not_imported">Not Imported</option>
            <option value="matched">Pending Review</option>
            <option value="confirmed">Confirmed</option>
            <option value="rejected">Rejected</option>
            <option value="imported">Imported</option>
          </select>
          <select
            value={filters.inStock}
            onChange={e => setFilters(f => ({ ...f, inStock: e.target.value }))}
            style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', background: 'white', cursor: 'pointer' }}
          >
            <option value="">All Stock</option>
            <option value="true">In Stock</option>
            <option value="false">Out of Stock</option>
          </select>
          <input
            type="text"
            placeholder="Filter by brand..."
            value={filters.brand}
            onChange={e => setFilters(f => ({ ...f, brand: e.target.value }))}
            style={{ padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', width: '160px' }}
          />
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
                background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: 500, cursor: 'pointer',
              }}
            >
              <X size={14} /> Clear
            </button>
          )}
          <span style={{ fontSize: '13px', color: '#9ca3af', marginLeft: 'auto' }}>
            {totalCount.toLocaleString()} products
          </span>
        </div>

        {/* Product Table */}
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          {loading ? (
            <SkeletonTable rows={8} columns={7} />
          ) : products.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af' }}>
              <Package size={48} style={{ marginBottom: '16px', opacity: 0.4 }} />
              <div style={{ fontSize: '16px', fontWeight: 500 }}>No products found</div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>Try adjusting your filters</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', width: '40px' }}>
                    <input
                      type="checkbox"
                      onChange={toggleSelectAll}
                      checked={products.filter(p => getProductStatus(p) !== 'imported').length > 0 &&
                        products.filter(p => getProductStatus(p) !== 'imported').every(p => selectedIds.has(p.skulytics_id))}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </th>
                  <th style={thStyle}>Image</th>
                  <th style={thStyle}>SKU</th>
                  <th style={thStyle}>Brand</th>
                  <th style={thStyle}>Product Name</th>
                  <th style={thStyle}>MSRP</th>
                  <th style={thStyle}>Stock</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {products.map(row => {
                  const rowStatus = getProductStatus(row);
                  const isSelected = selectedIds.has(row.skulytics_id);
                  const isImported = rowStatus === 'imported';

                  return (
                    <tr
                      key={row.skulytics_id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        background: isSelected ? '#eef2ff' : 'white',
                        opacity: isImported ? 0.65 : 1,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f9fafb'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? '#eef2ff' : 'white'; }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isImported}
                          onChange={() => toggleSelect(row.skulytics_id)}
                          style={{ cursor: isImported ? 'not-allowed' : 'pointer', width: '16px', height: '16px' }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <ProductThumb src={row.primary_image} size={40} />
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#374151' }}>{row.sku}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{row.brand}</span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: '260px' }}>
                        <div style={{ fontSize: '13px', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.model_name || '--'}
                        </div>
                        {row.category_slug && (
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{row.category_slug}</div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{formatCAD(row.msrp)}</span>
                      </td>
                      <td style={tdStyle}>
                        <StockBadge inStock={row.is_in_stock} discontinued={row.is_discontinued} />
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge status={rowStatus} />
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => openDrawer(row.skulytics_id)}
                          title="View details"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '32px', height: '32px', border: '1px solid #e5e7eb',
                            borderRadius: '6px', background: 'white', cursor: 'pointer',
                          }}
                        >
                          <Eye size={15} style={{ color: '#6b7280' }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '20px' }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white',
                fontSize: '13px', fontWeight: 500, cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.5 : 1,
              }}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                border: '1px solid #e5e7eb', borderRadius: '8px', background: 'white',
                fontSize: '13px', fontWeight: 500, cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.5 : 1,
              }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div style={{
            position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: '16px',
            padding: '14px 24px', background: '#1f2937', borderRadius: '12px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)', zIndex: 100, color: 'white',
          }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>
              {selectedIds.size} selected
            </span>
            <button
              onClick={handleBulkImport}
              disabled={importing}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px',
                background: '#10b981', color: 'white', border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: 600, cursor: importing ? 'not-allowed' : 'pointer',
                opacity: importing ? 0.7 : 1,
              }}
            >
              <Download size={16} />
              {importing ? 'Importing...' : 'Import Selected'}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{
                padding: '8px 16px', background: 'transparent', color: '#9ca3af',
                border: '1px solid #4b5563', borderRadius: '8px', fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Product Detail Drawer */}
        {(drawerProduct || drawerLoading) && (
          <>
            <div
              onClick={closeDrawer}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }}
            />
            <div style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: '560px', maxWidth: '100vw',
              background: 'white', boxShadow: '-4px 0 20px rgba(0,0,0,0.12)', zIndex: 201,
              display: 'flex', flexDirection: 'column', overflowY: 'auto',
            }}>
              {drawerLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <RefreshCw size={28} style={{ color: '#667eea', animation: 'spin 1s linear infinite' }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  <p style={{ color: '#9ca3af', marginTop: '12px' }}>Loading product details...</p>
                </div>
              ) : drawerProduct && (
                <DrawerContent
                  product={drawerProduct}
                  onClose={closeDrawer}
                  onConfirm={handleConfirmMatch}
                  onReject={handleRejectMatch}
                />
              )}
            </div>
          </>
        )}

        {/* Import Results Modal */}
        {importResult && (
          <>
            <div
              onClick={() => setImportResult(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300 }}
            />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              background: 'white', borderRadius: '16px', padding: '32px', width: '420px',
              maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', zIndex: 301,
            }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 700, color: '#111827' }}>
                Import Complete
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div style={{ textAlign: 'center', padding: '16px', background: '#d1fae5', borderRadius: '10px' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#065f46' }}>{importResult.imported}</div>
                  <div style={{ fontSize: '12px', color: '#065f46', marginTop: '4px' }}>Imported</div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', background: '#fef3c7', borderRadius: '10px' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#92400e' }}>{importResult.skipped}</div>
                  <div style={{ fontSize: '12px', color: '#92400e', marginTop: '4px' }}>Skipped</div>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', background: '#fee2e2', borderRadius: '10px' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#991b1b' }}>{importResult.errors?.length || 0}</div>
                  <div style={{ fontSize: '12px', color: '#991b1b', marginTop: '4px' }}>Errors</div>
                </div>
              </div>
              {importResult.errors?.length > 0 && (
                <div style={{ maxHeight: '120px', overflow: 'auto', marginBottom: '16px', padding: '10px', background: '#fef2f2', borderRadius: '8px', fontSize: '12px', color: '#991b1b' }}>
                  {importResult.errors.map((e, i) => (
                    <div key={i}>{e.skulytics_id}: {e.reason}</div>
                  ))}
                </div>
              )}
              <button
                onClick={() => setImportResult(null)}
                style={{
                  width: '100%', padding: '12px', background: '#667eea', color: 'white',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── Stat Card ───────────────────────────────────────────────

const StatCard = ({ label, value, icon, color }) => (
  <div style={{
    background: 'white', padding: '20px', borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `4px solid ${color}`,
    display: 'flex', alignItems: 'center', gap: '16px',
  }}>
    <div style={{
      width: '44px', height: '44px', borderRadius: '10px',
      background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color,
    }}>
      {icon}
    </div>
    <div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>
        {value != null ? value.toLocaleString() : '--'}
      </div>
      <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>{label}</div>
    </div>
  </div>
);

// ── Drawer Content ──────────────────────────────────────────

const DrawerContent = ({ product, onClose, onConfirm, onReject }) => {
  const p = product;
  const specs = typeof p.specs === 'string' ? JSON.parse(p.specs) : p.specs;
  const images = typeof p.images === 'string' ? JSON.parse(p.images) : p.images;
  const warranty = typeof p.warranty === 'string' ? JSON.parse(p.warranty) : p.warranty;
  const competitorPricing = typeof p.competitor_pricing === 'string' ? JSON.parse(p.competitor_pricing) : p.competitor_pricing;
  const categoryPath = Array.isArray(p.category_path) ? p.category_path : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Drawer Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ flex: 'none' }}>
          <ProductThumb src={p.primary_image} size={80} iconSize={32} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', color: '#667eea', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.brand}</div>
          <h2 style={{ margin: '4px 0 6px', fontSize: '18px', fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>{p.model_name || p.sku}</h2>
          <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px' }}>{p.sku}</span>
        </div>
        <button
          onClick={onClose}
          style={{ flex: 'none', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb', borderRadius: '6px', background: 'white', cursor: 'pointer' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Drawer Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {/* Pricing */}
        <DrawerSection title="Pricing">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <PriceBox label="MSRP" value={p.msrp} />
            <PriceBox label="MAP" value={p.map_price} />
            <PriceBox label="UMRP" value={p.umrp} />
          </div>
        </DrawerSection>

        {/* Stock & Status */}
        <DrawerSection title="Stock & Status">
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <StockBadge inStock={p.is_in_stock} discontinued={p.is_discontinued} />
            {p.is_discontinued && <span style={{ fontSize: '12px', color: '#9ca3af' }}>Discontinued {formatDate(p.discontinued_at)}</span>}
          </div>
        </DrawerSection>

        {/* Category */}
        {categoryPath.length > 0 && (
          <DrawerSection title="Category">
            <div style={{ fontSize: '13px', color: '#374151' }}>
              {categoryPath.join(' > ')}
            </div>
          </DrawerSection>
        )}

        {/* Image Gallery */}
        {images && Array.isArray(images) && images.length > 0 && (
          <DrawerSection title="Images">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '10px' }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <ProductThumb src={img.url || img} size={100} iconSize={28} rounded={8} />
                  {img.type && (
                    <span style={{
                      position: 'absolute', bottom: '4px', left: '4px', right: '4px',
                      fontSize: '10px', fontWeight: 600, textAlign: 'center',
                      background: 'rgba(0,0,0,0.55)', color: 'white', borderRadius: '4px',
                      padding: '2px 4px', textTransform: 'capitalize',
                    }}>
                      {img.type}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </DrawerSection>
        )}

        {/* Competitor Pricing */}
        {competitorPricing && Array.isArray(competitorPricing) && competitorPricing.length > 0 && (
          <DrawerSection title="Competitor Pricing">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '6px 0', color: '#6b7280', fontWeight: 600 }}>Retailer</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', color: '#6b7280', fontWeight: 600 }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {competitorPricing.map((cp, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 0', color: '#374151' }}>{cp.retailer || cp.name || 'Unknown'}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: '#111827' }}>{formatCAD(cp.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DrawerSection>
        )}

        {/* Specs */}
        {specs && typeof specs === 'object' && Object.keys(specs).length > 0 && (
          <DrawerSection title="Specifications">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {Object.entries(specs).slice(0, 20).map(([key, val]) => (
                <div key={key} style={{ fontSize: '13px', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <span style={{ color: '#6b7280' }}>{key}:</span>{' '}
                  <span style={{ color: '#111827', fontWeight: 500 }}>{String(val)}</span>
                </div>
              ))}
            </div>
          </DrawerSection>
        )}

        {/* Warranty */}
        {warranty && (
          <DrawerSection title="Warranty">
            <div style={{ fontSize: '13px', color: '#374151' }}>
              {warranty.parts && <div>Parts: {warranty.parts}</div>}
              {warranty.labor && <div>Labor: {warranty.labor}</div>}
              {warranty.description && <div style={{ marginTop: '4px', color: '#6b7280' }}>{warranty.description}</div>}
            </div>
          </DrawerSection>
        )}

        {/* Match Status */}
        {p.match_id && (
          <DrawerSection title="Match Status">
            <div style={{ fontSize: '13px', color: '#374151', marginBottom: '12px' }}>
              <div>Status: <StatusBadge status={p.match_status} /></div>
              <div style={{ marginTop: '6px' }}>Method: <span style={{ fontWeight: 500 }}>{p.match_method}</span></div>
              {p.match_confidence != null && <div style={{ marginTop: '4px' }}>Confidence: <span style={{ fontWeight: 600 }}>{p.match_confidence}%</span></div>}
              {p.matched_product_name && <div style={{ marginTop: '4px' }}>Matched to: <span style={{ fontWeight: 500 }}>{p.matched_product_name}</span></div>}
              {p.reviewed_at && <div style={{ marginTop: '4px', color: '#9ca3af' }}>Reviewed: {formatDate(p.reviewed_at)}</div>}
            </div>
            {p.match_status === 'pending' && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => onConfirm(p.match_id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '10px', background: '#10b981', color: 'white', border: 'none',
                    borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Check size={16} /> Confirm Match
                </button>
                <button
                  onClick={() => onReject(p.match_id)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '10px', background: '#ef4444', color: 'white', border: 'none',
                    borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <X size={16} /> Reject Match
                </button>
              </div>
            )}
          </DrawerSection>
        )}
      </div>
    </div>
  );
};

// ── Drawer Helpers ──────────────────────────────────────────

const DrawerSection = ({ title, children }) => (
  <div style={{ marginBottom: '20px' }}>
    <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: '#667eea', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {title}
    </h4>
    {children}
  </div>
);

const PriceBox = ({ label, value }) => (
  <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>
    <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600, marginBottom: '4px' }}>{label}</div>
    <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>{formatCAD(value)}</div>
  </div>
);

// ── Shared Styles ───────────────────────────────────────────

const thStyle = {
  padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600,
  color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em',
};

const tdStyle = {
  padding: '12px 16px', fontSize: '14px', verticalAlign: 'middle',
};

export default SkulyticsImport;
