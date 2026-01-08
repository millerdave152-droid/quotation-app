import React from 'react';

/**
 * PromotionManager - Displays and manages promotions list
 */
const PromotionManager = ({ promotions, onEdit, onDelete, onAdd }) => {
  const cardStyle = {
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    overflow: 'hidden'
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isExpired = (endDate) => {
    if (!endDate) return false;
    return new Date(endDate) < new Date();
  };

  const isUpcoming = (startDate) => {
    if (!startDate) return false;
    return new Date(startDate) > new Date();
  };

  const getStatusBadge = (promo) => {
    if (!promo.is_active) {
      return { label: 'Inactive', bg: '#f3f4f6', color: '#6b7280' };
    }
    if (isExpired(promo.end_date)) {
      return { label: 'Expired', bg: '#fee2e2', color: '#dc2626' };
    }
    if (isUpcoming(promo.start_date)) {
      return { label: 'Scheduled', bg: '#fef3c7', color: '#92400e' };
    }
    return { label: 'Active', bg: '#dcfce7', color: '#166534' };
  };

  return (
    <div style={cardStyle}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Promotions & Promo Codes</h2>
        <button
          onClick={onAdd}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          + Add Promotion
        </button>
      </div>

      {promotions.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>tag</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>No promotions yet</div>
          <div style={{ fontSize: '14px' }}>Create promotions and promo codes to offer discounts</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Promotion</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Code</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Discount</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Valid Period</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Usage</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {promotions.map((promo) => {
                const status = getStatusBadge(promo);
                return (
                  <tr key={promo.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: '600', color: '#1a1a2e' }}>{promo.promo_name}</div>
                      {promo.description && (
                        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>{promo.description}</div>
                      )}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        {promo.auto_activate && (
                          <span style={{
                            padding: '2px 6px',
                            backgroundColor: '#dbeafe',
                            color: '#1d4ed8',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '500'
                          }}>
                            Auto-apply
                          </span>
                        )}
                        {promo.can_stack && (
                          <span style={{
                            padding: '2px 6px',
                            backgroundColor: '#e0e7ff',
                            color: '#4338ca',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '500'
                          }}>
                            Stackable
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      {promo.promo_code ? (
                        <code style={{
                          padding: '4px 8px',
                          backgroundColor: '#f3f4f6',
                          borderRadius: '4px',
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#1a1a2e'
                        }}>
                          {promo.promo_code}
                        </code>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: '13px' }}>No code</span>
                      )}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontWeight: '600', color: '#059669' }}>
                        {promo.discount_type === 'percent'
                          ? `${promo.discount_value}% off`
                          : `$${parseFloat(promo.discount_value).toFixed(2)} off`}
                      </div>
                      {promo.min_purchase_cents && (
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                          Min: ${(promo.min_purchase_cents / 100).toFixed(2)}
                        </div>
                      )}
                      {promo.max_discount_cents && (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          Max: ${(promo.max_discount_cents / 100).toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px', fontSize: '13px', color: '#6b7280' }}>
                      <div>{formatDate(promo.start_date)}</div>
                      <div style={{ color: '#9ca3af' }}>to</div>
                      <div>{formatDate(promo.end_date)}</div>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontWeight: '600', color: '#1a1a2e' }}>
                        {promo.times_used || promo.current_uses || 0}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {promo.max_uses_total ? `of ${promo.max_uses_total}` : 'uses'}
                      </div>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: status.bg,
                        color: status.color,
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}>
                        {status.label}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                        <button
                          onClick={() => onEdit(promo)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#f3f4f6',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete(promo.id)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PromotionManager;
