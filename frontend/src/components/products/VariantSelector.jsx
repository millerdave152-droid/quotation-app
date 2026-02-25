import React, { useState, useEffect, useMemo } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

/**
 * VariantSelector — Reusable component for selecting a product variant
 * Props:
 *   productId: parent or child product ID
 *   onSelect(variant): callback when a variant is selected
 *   compact: show compact mode (inline buttons instead of full table)
 */
export default function VariantSelector({ productId, onSelect, compact = false }) {
  const [matrix, setMatrix] = useState(null);
  const [selections, setSelections] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await authFetch(`${API_URL}/api/product-variants/products/${productId}/with-variants`);
        const data = await res.json();
        if (!cancelled && data.success !== false) {
          setMatrix(data.data);
          // Pre-select if this is a child variant
          if (data.data?.selectedVariant?.variant_attributes) {
            setSelections(data.data.selectedVariant.variant_attributes);
          }
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const matchedVariant = useMemo(() => {
    if (!matrix || !matrix.variants.length) return null;
    const selKeys = Object.keys(selections);
    if (!selKeys.length) return null;

    return matrix.variants.find(v => {
      if (!v.variant_attributes) return false;
      return selKeys.every(k => v.variant_attributes[k] === selections[k]);
    });
  }, [matrix, selections]);

  useEffect(() => {
    if (matchedVariant && onSelect) onSelect(matchedVariant);
  }, [matchedVariant, onSelect]);

  if (loading) return <div style={{ fontSize: 13, color: '#94a3b8', padding: 8 }}>Loading variants...</div>;
  if (!matrix || matrix.variantCount === 0) return null;

  const dimensions = matrix.dimensions || {};

  const styles = {
    container: { padding: compact ? 8 : 16 },
    label: { fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' },
    group: { marginBottom: compact ? 8 : 12 },
    pill: (active) => ({
      display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer', marginRight: 6, marginBottom: 4,
      background: active ? '#667eea' : '#f1f5f9', color: active ? '#fff' : '#475569',
      border: `1px solid ${active ? '#667eea' : '#d1d5db'}`, fontWeight: active ? 600 : 400,
    }),
    selected: {
      marginTop: 12, padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: 13,
    },
    notFound: {
      marginTop: 12, padding: 12, background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', fontSize: 13, color: '#dc2626',
    },
  };

  const allSelected = Object.keys(dimensions).every(k => selections[k]);

  return (
    <div style={styles.container}>
      {Object.entries(dimensions).map(([attrName, values]) => (
        <div key={attrName} style={styles.group}>
          <label style={styles.label}>{attrName}</label>
          <div>
            {values.map(val => (
              <span key={val} style={styles.pill(selections[attrName] === val)}
                onClick={() => setSelections({ ...selections, [attrName]: val })}>
                {val}
              </span>
            ))}
          </div>
        </div>
      ))}

      {allSelected && matchedVariant && (
        <div style={styles.selected}>
          <strong>{matchedVariant.name}</strong> ({matchedVariant.sku})
          <span style={{ marginLeft: 12 }}>${parseFloat(matchedVariant.price || 0).toFixed(2)}</span>
          <span style={{ marginLeft: 12, color: matchedVariant.qty_on_hand > 0 ? '#059669' : '#dc2626' }}>
            {matchedVariant.qty_on_hand > 0 ? `${matchedVariant.qty_on_hand} in stock` : 'Out of stock'}
          </span>
        </div>
      )}

      {allSelected && !matchedVariant && (
        <div style={styles.notFound}>No variant matches this combination</div>
      )}
    </div>
  );
}
