import React from 'react';

/**
 * VolumeDiscountIndicator - Shows volume discount info on line items
 */
const VolumeDiscountIndicator = ({ discount, quantity, showNextTier = true }) => {
  if (!discount) return null;

  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    backgroundColor: '#dcfce7',
    border: '1px solid #86efac',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#166534',
    fontWeight: '500'
  };

  const nextTierStyle = {
    marginTop: '4px',
    fontSize: '11px',
    color: '#6b7280'
  };

  // Find next tier if available
  const nextTier = discount.tiers?.find(t =>
    t.min_quantity > quantity && (!t.max_quantity || t.min_quantity <= t.max_quantity)
  );

  return (
    <div>
      <div style={badgeStyle}>
        <span>%</span>
        <span>{discount.label || `${discount.value}% volume discount`}</span>
      </div>
      {showNextTier && nextTier && (
        <div style={nextTierStyle}>
          Add {nextTier.min_quantity - quantity} more for {nextTier.discount_value}% off
        </div>
      )}
    </div>
  );
};

export default VolumeDiscountIndicator;
