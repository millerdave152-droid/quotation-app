import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../services/authFetch';

const API_BASE = `${process.env.REACT_APP_API_URL || ''}/api`;

/**
 * UnmappedProductsPanel
 * Shows products without a category and allows batch AI suggestion.
 */
export default function UnmappedProductsPanel() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [progress, setProgress] = useState(null); // { current, total }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [applying, setApplying] = useState(false);

  // Fetch unmapped products
  const fetchUnmapped = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/products?category=&limit=100&status=active`);
      const data = await res.json();
      const list = data.products || data.data || [];
      // Filter to only products with no category
      const unmapped = list.filter(p => !p.category && !p.category_id);
      setProducts(unmapped.map(p => ({ ...p, suggestion: null, error: null })));
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUnmapped(); }, [fetchUnmapped]);

  // Batch suggest
  const handleSuggestAll = async () => {
    const toSuggest = products.filter(p => !p.suggestion);
    if (toSuggest.length === 0) return;

    setSuggesting(true);
    setProgress({ current: 0, total: toSuggest.length });

    // Process in batches of 50
    const batches = [];
    for (let i = 0; i < toSuggest.length; i += 50) {
      batches.push(toSuggest.slice(i, i + 50));
    }

    let processed = 0;
    for (const batch of batches) {
      try {
        const res = await authFetch('/api/categories/suggest-batch', {
          method: 'POST',
          body: JSON.stringify({
            products: batch.map(p => ({
              id: p.id,
              name: p.name || '',
              brand: p.manufacturer || '',
              model: p.model || '',
              description: p.description || '',
            })),
          }),
        });
        const data = await res.json();
        if (data.success) {
          setProducts(prev => prev.map(p => {
            const sug = data.suggestions?.find(s => s.productId === p.id);
            const err = data.errors?.find(e => e.productId === p.id);
            if (sug) return { ...p, suggestion: sug };
            if (err) return { ...p, error: err.error };
            return p;
          }));
        }
      } catch (err) {
        // Mark batch as failed
        setProducts(prev => prev.map(p => {
          if (batch.find(b => b.id === p.id) && !p.suggestion) {
            return { ...p, error: 'Request failed' };
          }
          return p;
        }));
      }
      processed += batch.length;
      setProgress({ current: processed, total: toSuggest.length });
    }

    setSuggesting(false);
    setProgress(null);
  };

  // Apply suggestion to a product (PATCH category)
  const applySuggestion = async (product) => {
    if (!product.suggestion?.category_name) return;
    try {
      await authFetch(`/api/products/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({ category: product.suggestion.category_name }),
      });
      setProducts(prev => prev.filter(p => p.id !== product.id));
    } catch {
      // ignore
    }
  };

  // Accept all high-confidence suggestions
  const handleAcceptAllHigh = async () => {
    const highConf = products.filter(p => p.suggestion?.confidence === 'high');
    if (highConf.length === 0) return;
    setApplying(true);
    for (const p of highConf) {
      await applySuggestion(p);
    }
    setApplying(false);
  };

  // Apply selected suggestions
  const handleApplySelected = async () => {
    const selected = products.filter(p => selectedIds.has(p.id) && p.suggestion);
    if (selected.length === 0) return;
    setApplying(true);
    for (const p of selected) {
      await applySuggestion(p);
    }
    setSelectedIds(new Set());
    setApplying(false);
  };

  // Toggle selection
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map(p => p.id)));
    }
  };

  const confidenceColor = (c) => {
    if (c === 'high') return '#22c55e';
    if (c === 'medium') return '#f59e0b';
    return '#ef4444';
  };

  const confidenceBg = (c) => {
    if (c === 'high') return '#ecfdf5';
    if (c === 'medium') return '#fffbeb';
    return '#fef2f2';
  };

  const suggestedCount = products.filter(p => p.suggestion).length;
  const highCount = products.filter(p => p.suggestion?.confidence === 'high').length;

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginTop: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
            Unmapped Products
            <span style={{ color: '#6b7280', fontWeight: '400', fontSize: '14px', marginLeft: '8px' }}>
              ({products.length} products)
            </span>
          </h3>
          {suggestedCount > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
              {suggestedCount} suggested — {highCount} high confidence
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={fetchUnmapped}
            disabled={loading}
            style={{
              padding: '8px 16px', background: '#f3f4f6', border: '1px solid #e5e7eb',
              borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
            }}
          >
            Refresh
          </button>
          <button
            onClick={handleSuggestAll}
            disabled={suggesting || products.length === 0}
            style={{
              padding: '8px 16px', background: suggesting ? '#9ca3af' : '#8b5cf6', color: 'white',
              border: 'none', borderRadius: '8px', cursor: suggesting ? 'not-allowed' : 'pointer',
              fontSize: '13px', fontWeight: '600',
            }}
          >
            {suggesting ? `Suggesting... (${progress?.current || 0}/${progress?.total || 0})` : '\u2728 Suggest All'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {suggesting && progress && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: '#8b5cf6', borderRadius: '2px',
              width: `${(progress.current / progress.total) * 100}%`,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading unmapped products...</div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#22c55e', fontSize: '14px' }}>
          All products are mapped to categories!
        </div>
      ) : (
        <>
          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '8px', textAlign: 'left', width: '32px' }}>
                    <input type="checkbox" checked={selectedIds.size === products.length && products.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Model</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Brand</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Suggested Category</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Confidence</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px' }}>
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} />
                    </td>
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '12px' }}>{p.model}</td>
                    <td style={{ padding: '8px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name || '—'}
                    </td>
                    <td style={{ padding: '8px' }}>{p.manufacturer || '—'}</td>
                    <td style={{ padding: '8px' }}>
                      {p.suggestion ? (
                        <span style={{ fontWeight: '600' }}>{p.suggestion.category_name}</span>
                      ) : p.error ? (
                        <span style={{ color: '#ef4444', fontSize: '12px' }}>{p.error}</span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>—</span>
                      )}
                      {p.suggestion?.reasoning && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{p.suggestion.reasoning}</div>
                      )}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {p.suggestion && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                          background: confidenceBg(p.suggestion.confidence),
                          color: confidenceColor(p.suggestion.confidence),
                        }}>
                          <span style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: confidenceColor(p.suggestion.confidence),
                          }} />
                          {p.suggestion.confidence}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {p.suggestion && (
                        <button
                          onClick={() => applySuggestion(p)}
                          style={{
                            padding: '4px 12px', background: '#10b981', color: 'white',
                            border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                          }}
                        >
                          Apply
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          {suggestedCount > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              {highCount > 0 && (
                <button
                  onClick={handleAcceptAllHigh}
                  disabled={applying}
                  style={{
                    padding: '8px 16px', background: '#10b981', color: 'white',
                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                  }}
                >
                  {applying ? 'Applying...' : `Accept All High (${highCount})`}
                </button>
              )}
              {selectedIds.size > 0 && (
                <button
                  onClick={handleApplySelected}
                  disabled={applying}
                  style={{
                    padding: '8px 16px', background: '#3b82f6', color: 'white',
                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                  }}
                >
                  Apply Selected ({selectedIds.size})
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
