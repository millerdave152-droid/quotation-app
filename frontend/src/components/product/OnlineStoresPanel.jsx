import React, { useState, useEffect } from 'react';
import { authFetch } from '../../services/authFetch';

const OnlineStoresPanel = ({ productId, compact = false }) => {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    authFetch(`/api/products/${productId}/competitor-prices`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.data)) {
          setStores(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return <div style={{ padding: '16px', color: '#9ca3af', fontSize: '13px' }}>Loading store prices...</div>;
  }

  if (stores.length === 0) {
    return (
      <div style={{
        padding: '16px',
        color: '#9ca3af',
        fontSize: '13px',
        textAlign: 'center',
        background: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      }}>
        No online store pricing available for this product.
      </div>
    );
  }

  const lowestPrice = Math.min(...stores.filter(s => s.competitor_price > 0).map(s => parseFloat(s.competitor_price)));

  if (compact) {
    const count = stores.length;
    return (
      <div style={{ fontSize: '12px', color: '#6b7280' }}>
        {count} store{count !== 1 ? 's' : ''} &middot; from ${lowestPrice.toFixed(0)}
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '10px',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid #e5e7eb',
        fontSize: '13px',
        fontWeight: 600,
        color: '#374151',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span>Online Stores</span>
        <span style={{
          padding: '2px 8px',
          background: '#dbeafe',
          color: '#1d4ed8',
          borderRadius: '10px',
          fontSize: '11px',
          fontWeight: 700,
        }}>
          {stores.length}
        </span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
            <th style={thStyle}>Store</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Currency</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Updated</th>
            <th style={{ ...thStyle, textAlign: 'center' }}>Link</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((store, i) => {
            const price = parseFloat(store.competitor_price);
            const isLowest = price === lowestPrice && price > 0;
            return (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 500 }}>{store.competitor_name || 'Unknown'}</span>
                </td>
                <td style={{
                  ...tdStyle,
                  textAlign: 'right',
                  fontWeight: 600,
                  color: isLowest ? '#059669' : '#111827',
                }}>
                  ${price.toFixed(2)}
                  {isLowest && (
                    <span style={{
                      marginLeft: '6px',
                      padding: '1px 6px',
                      background: '#d1fae5',
                      color: '#065f46',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                    }}>
                      LOWEST
                    </span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', color: '#6b7280' }}>
                  {store.currency || 'CAD'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', color: '#9ca3af', fontSize: '12px' }}>
                  {store.last_fetched_at
                    ? new Date(store.last_fetched_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
                    : '-'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {store.competitor_url ? (
                    <a
                      href={store.competitor_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        background: '#667eea',
                        color: '#fff',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      View
                    </a>
                  ) : (
                    <span style={{ color: '#d1d5db' }}>&mdash;</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const thStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle = {
  padding: '10px 14px',
  verticalAlign: 'middle',
};

export default OnlineStoresPanel;
