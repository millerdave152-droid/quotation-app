import React from 'react';

/**
 * AppliedDiscountsDisplay - Shows breakdown of all applied discounts in quote totals
 */
const AppliedDiscountsDisplay = ({
  appliedDiscounts = [],
  originalSubtotal,
  discountTotal,
  finalSubtotal
}) => {
  if (appliedDiscounts.length === 0 && discountTotal === 0) {
    return null;
  }

  const containerStyle = {
    backgroundColor: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '16px'
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    color: '#166534',
    fontWeight: '600',
    fontSize: '14px'
  };

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    fontSize: '14px'
  };

  const labelStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#374151'
  };

  const badgeStyle = (source) => {
    const colors = {
      volume: { bg: '#dbeafe', color: '#1d4ed8' },
      promo: { bg: '#fef3c7', color: '#92400e' },
      manual: { bg: '#e0e7ff', color: '#4338ca' },
      default: { bg: '#f3f4f6', color: '#374151' }
    };
    const { bg, color } = colors[source] || colors.default;
    return {
      padding: '2px 6px',
      backgroundColor: bg,
      color: color,
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: '500',
      textTransform: 'uppercase'
    };
  };

  const valueStyle = {
    fontWeight: '600',
    color: '#059669'
  };

  const totalRowStyle = {
    ...rowStyle,
    borderTop: '1px solid #86efac',
    marginTop: '8px',
    paddingTop: '12px',
    fontWeight: '600'
  };

  const formatCurrency = (cents) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span>%</span>
        <span>Applied Discounts</span>
      </div>

      {/* Individual Discounts */}
      {appliedDiscounts.map((discount, index) => (
        <div key={index} style={rowStyle}>
          <div style={labelStyle}>
            <span style={badgeStyle(discount.source)}>{discount.source}</span>
            <span>{discount.label || discount.ruleName || discount.promoCode || 'Discount'}</span>
            {discount.type === 'percent' && (
              <span style={{ color: '#6b7280', fontSize: '12px' }}>({discount.value}%)</span>
            )}
          </div>
          <span style={valueStyle}>
            -{formatCurrency(discount.discountAmountCents || 0)}
          </span>
        </div>
      ))}

      {/* Fallback if no detailed discounts but there is a total */}
      {appliedDiscounts.length === 0 && discountTotal > 0 && (
        <div style={rowStyle}>
          <div style={labelStyle}>
            <span>Discount Applied</span>
          </div>
          <span style={valueStyle}>-{formatCurrency(discountTotal)}</span>
        </div>
      )}

      {/* Total Savings */}
      <div style={totalRowStyle}>
        <span style={{ color: '#166534' }}>Total Savings</span>
        <span style={{ color: '#166534', fontSize: '16px' }}>
          -{formatCurrency(discountTotal)}
        </span>
      </div>

      {/* Percentage Saved */}
      {originalSubtotal > 0 && (
        <div style={{ textAlign: 'right', fontSize: '12px', color: '#166534', marginTop: '4px' }}>
          You save {((discountTotal / originalSubtotal) * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
};

export default AppliedDiscountsDisplay;
