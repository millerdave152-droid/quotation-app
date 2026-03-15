import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || '';

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function VariantManager() {
  const [tab, setTab] = useState('attributes');
  const [attributes, setAttributes] = useState([]);
  const [selectedAttr, setSelectedAttr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Attribute form
  const [attrForm, setAttrForm] = useState({ name: '', slug: '' });
  const [valueForm, setValueForm] = useState({ value: '', slug: '' });

  // Variant builder
  const [parentProductId, setParentProductId] = useState('');
  const [variantMatrix, setVariantMatrix] = useState(null);
  const [combos, setCombos] = useState([{ attributes: {}, sku: '', price: '', cost: '' }]);

  // Category mapping
  const [categoryId, setCategoryId] = useState('');
  const [categoryAttrs, setCategoryAttrs] = useState([]);
  const [selectedAttrIds, setSelectedAttrIds] = useState([]);

  // Merge tool
  const [mergeParentId, setMergeParentId] = useState('');
  const [mergeChildIds, setMergeChildIds] = useState('');

  const styles = {
    container: { padding: 24, maxWidth: 1200, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
    title: { fontSize: 24, fontWeight: 700, color: '#1e293b' },
    tabs: { display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 8, padding: 4 },
    tab: (active) => ({
      padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontSize: 13,
      background: active ? '#fff' : 'transparent', color: active ? '#1e293b' : '#64748b',
      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', border: 'none',
    }),
    card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 20, marginBottom: 16 },
    input: { padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: '100%' },
    btn: { padding: '8px 16px', borderRadius: 6, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14, background: '#667eea', color: '#fff' },
    btnSm: { padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, background: '#e2e8f0', color: '#475569' },
    btnDanger: { padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, background: '#fee2e2', color: '#dc2626' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' },
    td: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 14 },
    badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: '#e0e7ff', color: '#4338ca', marginRight: 4, marginBottom: 4 },
    alert: (type) => ({
      padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14,
      background: type === 'error' ? '#fef2f2' : '#f0fdf4',
      color: type === 'error' ? '#dc2626' : '#16a34a',
      border: `1px solid ${type === 'error' ? '#fecaca' : '#bbf7d0'}`,
    }),
  };

  // ============================================================================
  // API CALLS
  // ============================================================================
  const fetchAttributes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/product-variants/attributes`);
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      if (data.success !== false) setAttributes(data.data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  const fetchAttributeDetail = async (id) => {
    try {
      const res = await authFetch(`${API_URL}/api/product-variants/attributes/${id}`);
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      if (data.success !== false) setSelectedAttr(data.data);
    } catch (err) { setError(err.message); }
  };

  const createAttribute = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      const res = await authFetch(`${API_URL}/api/product-variants/attributes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attrForm),
      });
      if (res.ok) { setSuccess('Attribute created'); setAttrForm({ name: '', slug: '' }); fetchAttributes(); }
      else { const d = await res.json(); setError(d.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  const addValue = async (e) => {
    e.preventDefault();
    if (!selectedAttr) return;
    setError(''); setSuccess('');
    try {
      const res = await authFetch(`${API_URL}/api/product-variants/attributes/${selectedAttr.id}/values`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(valueForm),
      });
      if (res.ok) { setSuccess('Value added'); setValueForm({ value: '', slug: '' }); fetchAttributeDetail(selectedAttr.id); }
      else { const d = await res.json(); setError(d.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  const loadVariantMatrix = async () => {
    if (!parentProductId) return;
    setError(''); setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/product-variants/products/${parentProductId}/variants`);
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      if (data.success !== false) setVariantMatrix(data.data);
      else setError(data.message || 'Failed to load');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const convertToParent = async () => {
    if (!parentProductId) return;
    setError(''); setSuccess('');
    try {
      const res = await authFetch(`${API_URL}/api/product-variants/products/${parentProductId}/convert-to-parent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (res.ok) { setSuccess('Product converted to parent'); loadVariantMatrix(); }
      else { const d = await res.json(); setError(d.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  const generateVariants = async () => {
    if (!parentProductId) return;
    setError(''); setSuccess(''); setLoading(true);
    const combinations = combos.filter(c => Object.keys(c.attributes).length > 0).map(c => ({
      attributes: c.attributes,
      sku: c.sku || undefined,
      price: c.price ? parseFloat(c.price) : undefined,
      cost: c.cost ? parseFloat(c.cost) : undefined,
    }));
    if (!combinations.length) { setError('Add at least one combination'); return; }
    try {
      const res = await authFetch(`${API_URL}/api/product-variants/products/${parentProductId}/variants`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ combinations }),
      });
      if (res.ok) { setSuccess(`${combinations.length} variant(s) generated`); loadVariantMatrix(); setCombos([{ attributes: {}, sku: '', price: '', cost: '' }]); }
      else { const d = await res.json(); setError(d.message || 'Failed'); }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const mergeVariants = async () => {
    if (!mergeParentId || !mergeChildIds) return;
    setError(''); setSuccess('');
    const childIds = mergeChildIds.split(',').map(s => parseInt(s.trim())).filter(Boolean);
    if (!childIds.length) { setError('Enter child product IDs'); return; }
    try {
      const res = await authFetch(`${API_URL}/api/product-variants/products/${mergeParentId}/merge-variants`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childProductIds: childIds, attributeValues: childIds.map(() => ({})) }),
      });
      if (res.ok) { setSuccess('Products merged as variants'); setMergeParentId(''); setMergeChildIds(''); }
      else { const d = await res.json(); setError(d.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  // Category mapping
  const loadCategoryAttributes = async () => {
    if (!categoryId) return;
    setError(''); setLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/product-variants/categories/${categoryId}/attributes`);
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      if (data.success !== false) {
        setCategoryAttrs(data.data || []);
        setSelectedAttrIds((data.data || []).map(a => a.id));
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const saveCategoryAttributes = async () => {
    if (!categoryId) return;
    setError(''); setSuccess('');
    try {
      const res = await authFetch(`${API_URL}/api/product-variants/categories/${categoryId}/attributes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributeIds: selectedAttrIds }),
      });
      if (res.ok) { setSuccess('Category attributes saved'); loadCategoryAttributes(); }
      else { const d = await res.json(); setError(d.message || 'Failed'); }
    } catch (err) { setError(err.message); }
  };

  useEffect(() => {
    if (tab === 'attributes') fetchAttributes();
    if (tab === 'categories') fetchAttributes();
  }, [tab, fetchAttributes]);

  return (
    <div style={styles.container}>
      <div style={{ marginBottom: 24, padding: '24px 28px', borderRadius: 16, background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', color: '#fff', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Product Variants</h1>
          <p style={{ fontSize: 14, margin: '4px 0 0', opacity: 0.85 }}>Manage product attributes, variants, and combinations</p>
        </div>
      </div>

      <div style={styles.header}>
        <div />
        <div style={styles.tabs}>
          {['attributes', 'categories', 'builder', 'merge'].map(t => (
            <button key={t} style={styles.tab(tab === t)} onClick={() => setTab(t)}>
              {t === 'builder' ? 'Variant Builder' : t === 'merge' ? 'Merge Tool' : t === 'categories' ? 'Category Mapping' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={styles.alert('error')}>{error}</div>}
      {success && <div style={styles.alert('success')}>{success}</div>}

      {/* ATTRIBUTES TAB */}
      {tab === 'attributes' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={styles.card}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Attributes</h3>
              <form onSubmit={createAttribute} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input style={{ ...styles.input, flex: 1 }} placeholder="Name (e.g. Color)" value={attrForm.name}
                  onChange={e => setAttrForm({ ...attrForm, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} required />
                <input style={{ ...styles.input, flex: 1 }} placeholder="Slug" value={attrForm.slug}
                  onChange={e => setAttrForm({ ...attrForm, slug: e.target.value })} required />
                <button type="submit" style={styles.btn}>Add</button>
              </form>
              {loading ? <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Loading...</div> : (
                <table style={styles.table}>
                  <thead>
                    <tr><th style={styles.th}>Name</th><th style={styles.th}>Slug</th><th style={styles.th}>Values</th><th style={styles.th}></th></tr>
                  </thead>
                  <tbody>
                    {attributes.map(a => (
                      <tr key={a.id} style={{ background: selectedAttr?.id === a.id ? '#f0f9ff' : 'transparent' }}>
                        <td style={styles.td}>{a.name}</td>
                        <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: 12 }}>{a.slug}</td>
                        <td style={styles.td}>{a.value_count}</td>
                        <td style={styles.td}><button style={styles.btnSm} onClick={() => fetchAttributeDetail(a.id)}>Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div>
            {selectedAttr && (
              <div style={styles.card}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{selectedAttr.name} Values</h3>
                <form onSubmit={addValue} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input style={{ ...styles.input, flex: 1 }} placeholder="Value (e.g. White)" value={valueForm.value}
                    onChange={e => setValueForm({ ...valueForm, value: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} required />
                  <input style={{ ...styles.input, flex: 1 }} placeholder="Slug" value={valueForm.slug}
                    onChange={e => setValueForm({ ...valueForm, slug: e.target.value })} required />
                  <button type="submit" style={styles.btn}>Add</button>
                </form>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(selectedAttr.values || []).map(v => (
                    <span key={v.id} style={styles.badge}>
                      {v.value}
                      {v.metadata?.hex && <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: v.metadata.hex, marginLeft: 4, verticalAlign: 'middle', border: '1px solid #ccc' }} />}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CATEGORY MAPPING TAB */}
      {tab === 'categories' && (
        <div style={styles.card}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Category Attribute Mapping</h3>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            Assign which attributes apply to each product category.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input style={{ ...styles.input, width: 200 }} type="number" placeholder="Category ID"
              value={categoryId} onChange={e => setCategoryId(e.target.value)} />
            <button style={styles.btn} onClick={loadCategoryAttributes}>Load</button>
          </div>
          {categoryId && (
            <>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Select Attributes for this Category</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {attributes.map(a => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedAttrIds.includes(a.id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedAttrIds([...selectedAttrIds, a.id]);
                        else setSelectedAttrIds(selectedAttrIds.filter(id => id !== a.id));
                      }} />
                    <strong>{a.name}</strong> <span style={{ color: '#94a3b8', fontSize: 12 }}>({a.slug}, {a.value_count} values)</span>
                  </label>
                ))}
                {!attributes.length && <div style={{ color: '#94a3b8' }}>No attributes defined yet. Create them in the Attributes tab.</div>}
              </div>
              <button style={styles.btn} onClick={saveCategoryAttributes}>Save Category Attributes</button>
              {categoryAttrs.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Current Attributes</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {categoryAttrs.map(a => (
                      <span key={a.id} style={styles.badge}>{a.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* VARIANT BUILDER TAB */}
      {tab === 'builder' && (
        <>
          <div style={styles.card}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Variant Builder</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input style={{ ...styles.input, width: 200 }} type="number" placeholder="Parent Product ID"
                value={parentProductId} onChange={e => setParentProductId(e.target.value)} />
              <button style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }} onClick={loadVariantMatrix} disabled={loading}>{loading ? 'Loading...' : 'Load'}</button>
              <button style={{ ...styles.btnSm, background: '#d1fae5', color: '#059669', opacity: loading ? 0.6 : 1 }} onClick={convertToParent} disabled={loading}>Convert to Parent</button>
            </div>

            {variantMatrix && (
              <>
                <div style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
                  <strong>{variantMatrix.parent?.name}</strong> ({variantMatrix.parent?.sku})
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{variantMatrix.variantCount} variant(s)</div>
                  {Object.entries(variantMatrix.dimensions || {}).map(([key, vals]) => (
                    <div key={key} style={{ fontSize: 12, marginTop: 4 }}>
                      <strong>{key}:</strong> {vals.join(', ')}
                    </div>
                  ))}
                </div>

                {variantMatrix.variants.length > 0 && (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Name</th>
                        <th style={styles.th}>SKU</th>
                        <th style={styles.th}>Attributes</th>
                        <th style={styles.th}>Price</th>
                        <th style={styles.th}>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variantMatrix.variants.map(v => (
                        <tr key={v.id}>
                          <td style={styles.td}>{v.name}</td>
                          <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: 12 }}>{v.sku}</td>
                          <td style={styles.td}>
                            {v.variant_attributes && Object.entries(v.variant_attributes).map(([k, val]) => (
                              <span key={k} style={styles.badge}>{k}: {val}</span>
                            ))}
                          </td>
                          <td style={styles.td}>${((v.price || 0) / 100).toFixed(2)}</td>
                          <td style={styles.td}>{v.qty_on_hand || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>

          <div style={styles.card}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Generate New Variants</h4>
            {combos.map((combo, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input style={{ ...styles.input, flex: 2 }} placeholder='Attributes JSON: {"color":"White","size":"30"}'
                  value={typeof combo.attributes === 'string' ? combo.attributes : JSON.stringify(combo.attributes)}
                  onChange={e => {
                    const newCombos = [...combos];
                    try { newCombos[i].attributes = JSON.parse(e.target.value); } catch { newCombos[i].attributes = e.target.value; }
                    setCombos(newCombos);
                  }} />
                <input style={{ ...styles.input, width: 120 }} placeholder="SKU (optional)" value={combo.sku}
                  onChange={e => { const c = [...combos]; c[i].sku = e.target.value; setCombos(c); }} />
                <input style={{ ...styles.input, width: 100 }} placeholder="Price" type="number" value={combo.price}
                  onChange={e => { const c = [...combos]; c[i].price = e.target.value; setCombos(c); }} />
                <button style={styles.btnDanger} onClick={() => setCombos(combos.length > 1 ? combos.filter((_, idx) => idx !== i) : combos)}>X</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={styles.btnSm} onClick={() => setCombos([...combos, { attributes: {}, sku: '', price: '', cost: '' }])}>+ Add Row</button>
              <button style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }} onClick={generateVariants} disabled={loading}>{loading ? 'Generating...' : 'Generate Variants'}</button>
            </div>
          </div>
        </>
      )}

      {/* MERGE TOOL TAB */}
      {tab === 'merge' && (
        <div style={styles.card}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Merge Existing Products as Variants</h3>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            Select an existing product to be the parent, then provide IDs of products to merge as its variants.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 500 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Parent Product ID</label>
              <input style={styles.input} type="number" value={mergeParentId} onChange={e => setMergeParentId(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Child Product IDs (comma-separated)</label>
              <input style={styles.input} placeholder="e.g. 42, 43, 44" value={mergeChildIds} onChange={e => setMergeChildIds(e.target.value)} />
            </div>
            <button style={{ ...styles.btn, alignSelf: 'flex-start' }} onClick={mergeVariants}>Merge as Variants</button>
          </div>
        </div>
      )}
    </div>
  );
}
