import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authFetch } from '../../services/authFetch';
import BarcodeDisplay from './BarcodeDisplay';
import OnlineStoresPanel from './OnlineStoresPanel';

const ProductDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    authFetch(`/api/products/${id}`)
      .then(res => res.json())
      .then(data => {
        // Handle both { success: true, data: {...} } and direct object
        const p = data.data || data;
        setProduct(p);
      })
      .catch(err => setError(err.message || 'Failed to load product'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{ color: '#9ca3af', fontSize: '14px' }}>Loading product...</div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', color: '#ef4444', marginBottom: '12px' }}>
          {error || 'Product not found'}
        </div>
        <button onClick={() => navigate('/products')} style={backBtnStyle}>
          Back to Products
        </button>
      </div>
    );
  }

  // Parse JSONB fields that may be strings
  const ceSpecs = typeof product.ce_specs === 'string' ? JSON.parse(product.ce_specs) : product.ce_specs;
  const barcodeAttrs = typeof product.barcode_attributes === 'string'
    ? JSON.parse(product.barcode_attributes)
    : product.barcode_attributes;

  const dataSourceLabel = {
    barcode_lookup: 'Barcode Lookup',
    icecat: 'Icecat',
    manual: 'Manual',
  }[product.data_source] || product.data_source || 'Unknown';

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
      {/* Back button */}
      <button onClick={() => navigate('/products')} style={backBtnStyle}>
        &larr; Back to Products
      </button>

      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: product.image_url ? '200px 1fr' : '1fr',
        gap: '24px',
        marginTop: '16px',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '24px',
      }}>
        {product.image_url && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f9fafb',
            borderRadius: '8px',
            padding: '12px',
          }}>
            <img
              src={product.image_url}
              alt={product.name}
              style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain' }}
            />
          </div>
        )}
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
            {product.name || product.product_name || 'Unnamed Product'}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {product.manufacturer && (
              <span style={tagStyle('#dbeafe', '#1d4ed8')}>{product.manufacturer}</span>
            )}
            {product.model && (
              <span style={tagStyle('#fef3c7', '#92400e')}>Model: {product.model}</span>
            )}
            {product.upc && (
              <span style={tagStyle('#f3f4f6', '#374151')}>UPC: {product.upc}</span>
            )}
            {product.sku && product.sku !== product.model && (
              <span style={tagStyle('#f3f4f6', '#374151')}>SKU: {product.sku}</span>
            )}
            <span style={tagStyle('#ede9fe', '#6d28d9')}>{dataSourceLabel}</span>
          </div>
          {product.category && (
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '6px' }}>
              Category: {product.category}
            </div>
          )}
          {product.description && (
            <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.5', margin: '8px 0 0' }}>
              {product.description}
            </p>
          )}
          {product.msrp_cents > 0 && (
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#059669', marginTop: '12px' }}>
              ${(product.msrp_cents / 100).toFixed(2)}
              <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 400, marginLeft: '4px' }}>MSRP</span>
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout for barcode + attributes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        marginTop: '20px',
      }}>
        {/* Barcode Panel */}
        {product.upc && (
          <BarcodeDisplay
            upc={product.upc}
            barcodeFormats={product.barcode_formats}
            productId={product.id}
          />
        )}

        {/* Attributes Panel */}
        {barcodeAttrs && Object.keys(barcodeAttrs).length > 0 && (
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>Product Attributes</div>
            <div style={{ padding: '14px 18px' }}>
              {Object.entries(barcodeAttrs).map(([key, value]) => {
                if (value == null || value === '') return null;
                const displayVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
                return (
                  <div key={key} style={kvRowStyle}>
                    <span style={kvKeyStyle}>{formatKey(key)}</span>
                    <span style={kvValueStyle}>{displayVal}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Specifications Panel */}
      {ceSpecs && Object.keys(ceSpecs).length > 0 && (
        <div style={{ ...panelStyle, marginTop: '20px' }}>
          <div style={panelHeaderStyle}>Specifications</div>
          <div style={{ padding: '14px 18px', columns: '2', columnGap: '24px' }}>
            {Object.entries(ceSpecs).map(([key, value]) => {
              if (value == null || value === '' || key === 'Additional Images') return null;
              return (
                <div key={key} style={{ ...kvRowStyle, breakInside: 'avoid' }}>
                  <span style={kvKeyStyle}>{key}</span>
                  <span style={kvValueStyle}>{String(value)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Online Stores Panel */}
      <div style={{ marginTop: '20px' }}>
        <OnlineStoresPanel productId={product.id} />
      </div>
    </div>
  );
};

// Helpers
function formatKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function tagStyle(bg, color) {
  return {
    display: 'inline-block',
    padding: '3px 10px',
    background: bg,
    color: color,
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
  };
}

const backBtnStyle = {
  padding: '8px 16px',
  background: '#f3f4f6',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '13px',
  color: '#374151',
  cursor: 'pointer',
  fontWeight: 500,
};

const panelStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  overflow: 'hidden',
};

const panelHeaderStyle = {
  padding: '14px 18px',
  borderBottom: '1px solid #e5e7eb',
  fontSize: '13px',
  fontWeight: 600,
  color: '#374151',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const kvRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '6px 0',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '13px',
};

const kvKeyStyle = {
  color: '#6b7280',
  fontWeight: 500,
  marginRight: '12px',
  flexShrink: 0,
};

const kvValueStyle = {
  color: '#111827',
  textAlign: 'right',
  wordBreak: 'break-word',
};

export default ProductDetailPage;
