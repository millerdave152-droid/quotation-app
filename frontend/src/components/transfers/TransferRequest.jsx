/**
 * TransferRequest — Request stock from another location
 * Product search → stock levels → from/to selection → submit
 */

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';

const API_URL = process.env.REACT_APP_API_URL || '';

function TransferRequest({ onCreated, onCancel }) {
  const { user } = useAuth();
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [locations, setLocations] = useState([]);
  const [stockByLocation, setStockByLocation] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [qty, setQty] = useState(1);
  const [serialNumber, setSerialNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  // Fetch locations on mount
  useEffect(() => {
    authFetch(`${API_URL}/api/locations`)
      .then(res => res.json())
      .then(data => {
        const locs = data.data || data || [];
        setLocations(Array.isArray(locs) ? locs : []);
      })
      .catch(() => {});
  }, []);

  // Product search (debounced)
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await authFetch(`${API_URL}/api/products/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : data.data || []);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // When product selected, fetch stock at all locations
  const fetchStock = useCallback(async (productId) => {
    if (!productId || locations.length === 0) return;
    setLoadingStock(true);
    const results = [];
    for (const loc of locations) {
      try {
        const res = await authFetch(`${API_URL}/api/inventory/by-location/${loc.id}`);
        const data = await res.json();
        const items = data.data || [];
        const match = items.find(i => i.product_id === productId);
        if (match) {
          results.push({
            location_id: loc.id,
            location_name: loc.name,
            qty_on_hand: match.qty_on_hand,
            qty_reserved: match.qty_reserved,
            available: match.qty_on_hand - match.qty_reserved
          });
        } else {
          results.push({ location_id: loc.id, location_name: loc.name, qty_on_hand: 0, qty_reserved: 0, available: 0 });
        }
      } catch {
        results.push({ location_id: loc.id, location_name: loc.name, qty_on_hand: 0, qty_reserved: 0, available: 0 });
      }
    }
    setStockByLocation(results);
    setLoadingStock(false);

    // Auto-select from_location (first with stock) and to_location (user's location)
    const withStock = results.find(r => r.available > 0);
    if (withStock) setFromLocationId(String(withStock.location_id));
    if (user?.location_id) setToLocationId(String(user.location_id));
  }, [locations, user]);

  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setSearchQuery(product.name || product.model || '');
    setSearchResults([]);
    setStockByLocation([]);
    setQty(1);
    setSerialNumber('');
    setConfirmation(null);
    fetchStock(product.id);
  };

  const getAvailableAtFrom = () => {
    const loc = stockByLocation.find(s => s.location_id === parseInt(fromLocationId));
    return loc ? loc.available : 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProduct || !fromLocationId || !toLocationId) return;

    setSubmitting(true);
    try {
      const body = {
        product_id: selectedProduct.id,
        from_location_id: parseInt(fromLocationId),
        to_location_id: parseInt(toLocationId),
        qty,
        ...(selectedProduct.is_serialized && serialNumber ? { serial_id: parseInt(serialNumber) } : {})
      };

      const res = await authFetch(`${API_URL}/api/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.error?.message || err.error || err.message || 'Failed to create transfer';
        if (msg.includes('Insufficient stock')) {
          const locName = stockByLocation.find(s => s.location_id === parseInt(fromLocationId))?.location_name || 'source';
          throw new Error(`Insufficient stock at ${locName}`);
        }
        throw new Error(msg);
      }

      const data = await res.json();
      const transfer = data.data || data;
      setConfirmation(transfer);
      toast.success(`Transfer #${transfer.id} created`);
      onCreated?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{
          maxWidth: '500px', margin: '0 auto', padding: '32px',
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>{'\u2705'}</div>
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: '#065F46' }}>Transfer Requested</h3>
          <p style={{ margin: '0 0 16px', color: '#374151' }}>
            Transfer <strong>#{confirmation.id}</strong> — Status: <strong>{confirmation.status}</strong>
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              onClick={() => { setConfirmation(null); setSelectedProduct(null); setSearchQuery(''); }}
              style={{ padding: '8px 20px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
            >
              New Transfer
            </button>
            {onCancel && (
              <button onClick={onCancel} style={{ padding: '8px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer' }}>
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '700px' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: '700', color: '#111827' }}>
        Request Stock Transfer
      </h2>

      <form onSubmit={handleSubmit}>
        {/* Product Search */}
        <div style={{ marginBottom: '16px', position: 'relative' }}>
          <label style={labelStyle}>Product *</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedProduct(null); }}
            placeholder="Search by name or SKU..."
            style={inputStyle}
          />
          {searching && <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>Searching...</div>}
          {searchResults.length > 0 && !selectedProduct && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '250px', overflowY: 'auto'
            }}>
              {searchResults.map(p => (
                <div
                  key={p.id}
                  onClick={() => handleSelectProduct(p)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                    fontSize: '14px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                >
                  <div style={{ fontWeight: '500' }}>{p.name || p.model}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {p.manufacturer} &middot; SKU: {p.sku} &middot; Stock: {p.qty_on_hand ?? p.stock_quantity ?? '?'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stock at All Locations */}
        {selectedProduct && (
          <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
              Stock Levels — {selectedProduct.name || selectedProduct.model}
              {selectedProduct.is_serialized && <span style={{ marginLeft: '8px', padding: '2px 8px', background: '#DBEAFE', color: '#1D4ED8', borderRadius: '9999px', fontSize: '11px' }}>Serialized</span>}
            </div>
            {loadingStock ? (
              <div style={{ fontSize: '13px', color: '#9ca3af' }}>Loading stock levels...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
                {stockByLocation.map(s => (
                  <div key={s.location_id} style={{
                    padding: '8px 12px', background: '#fff', borderRadius: '6px', border: '1px solid #e5e7eb',
                    fontSize: '13px'
                  }}>
                    <div style={{ fontWeight: '500', color: '#111827', marginBottom: '2px' }}>{s.location_name}</div>
                    <div style={{ color: s.available > 0 ? '#059669' : '#9ca3af' }}>
                      {s.available} available
                      {s.qty_reserved > 0 && <span style={{ color: '#f59e0b' }}> ({s.qty_reserved} reserved)</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* From / To / Qty */}
        {selectedProduct && !loadingStock && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>From Location *</label>
                <select value={fromLocationId} onChange={(e) => setFromLocationId(e.target.value)} style={inputStyle} required>
                  <option value="">Select source...</option>
                  {stockByLocation.filter(s => s.available > 0).map(s => (
                    <option key={s.location_id} value={s.location_id}>
                      {s.location_name} ({s.available} available)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>To Location *</label>
                <select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)} style={inputStyle} required>
                  <option value="">Select destination...</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: selectedProduct.is_serialized ? '1fr 1fr' : '1fr', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={labelStyle}>Quantity *</label>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  style={inputStyle}
                  required
                />
                {fromLocationId && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                    Max: {getAvailableAtFrom()}
                  </div>
                )}
              </div>
              {selectedProduct.is_serialized && (
                <div>
                  <label style={labelStyle}>Serial Number *</label>
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="Enter serial number"
                    style={inputStyle}
                    required
                  />
                </div>
              )}
            </div>

            {/* Submit */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="submit"
                disabled={submitting || !fromLocationId || !toLocationId || fromLocationId === toLocationId}
                style={{
                  padding: '10px 24px', background: '#1e40af', color: '#fff', border: 'none',
                  borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.7 : 1
                }}
              >
                {submitting ? 'Submitting...' : 'Request Transfer'}
              </button>
              {onCancel && (
                <button type="button" onClick={onCancel} style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer' }}>
                  Cancel
                </button>
              )}
            </div>
            {fromLocationId && toLocationId && fromLocationId === toLocationId && (
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#EF4444' }}>From and to locations must be different.</div>
            )}
          </>
        )}
      </form>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' };
const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' };

export default TransferRequest;
