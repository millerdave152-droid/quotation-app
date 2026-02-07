import React, { useState } from 'react';

import { authFetch } from '../../services/authFetch';
const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

/**
 * PromoCodeInput - Component for entering and validating promo codes
 */
const PromoCodeInput = ({
  customerId,
  cartTotal,
  cartItems,
  onPromoApplied,
  onPromoRemoved,
  appliedPromo
}) => {
  const [code, setCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState(null);

  const handleValidate = async () => {
    if (!code.trim()) {
      setError('Please enter a promo code');
      return;
    }

    setValidating(true);
    setError(null);

    try {
      const response = await authFetch(`${API_URL}/advanced-pricing/promotions/validate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          customerId,
          cartTotal,
          cartItems
        })
      });

      const result = await response.json();

      if (!result.valid) {
        setError(result.error || 'Invalid promo code');
        return;
      }

      // Success - apply the promo
      onPromoApplied(result.promotion);
      setCode('');
    } catch (err) {
      console.error('Error validating promo code:', err);
      setError('Failed to validate promo code');
    } finally {
      setValidating(false);
    }
  };

  const handleRemove = () => {
    onPromoRemoved();
    setError(null);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleValidate();
    }
  };

  const containerStyle = {
    marginBottom: '16px'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '8px'
  };

  const inputContainerStyle = {
    display: 'flex',
    gap: '8px'
  };

  const inputStyle = {
    flex: 1,
    padding: '10px 12px',
    border: error ? '1px solid #dc2626' : '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    textTransform: 'uppercase'
  };

  const buttonStyle = {
    padding: '10px 16px',
    backgroundColor: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: validating ? 'not-allowed' : 'pointer',
    opacity: validating ? 0.7 : 1,
    whiteSpace: 'nowrap'
  };

  const appliedStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    backgroundColor: '#dcfce7',
    border: '1px solid #86efac',
    borderRadius: '8px'
  };

  const promoInfoStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  };

  const removeButtonStyle = {
    padding: '6px 12px',
    backgroundColor: 'transparent',
    color: '#dc2626',
    border: '1px solid #dc2626',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer'
  };

  // If a promo is already applied, show the applied state
  if (appliedPromo) {
    return (
      <div style={containerStyle}>
        <label style={labelStyle}>Promo Code</label>
        <div style={appliedStyle}>
          <div style={promoInfoStyle}>
            <span style={{ fontSize: '20px' }}>check</span>
            <div>
              <div style={{ fontWeight: '600', color: '#166534' }}>
                {appliedPromo.promo_code || appliedPromo.promo_name}
              </div>
              <div style={{ fontSize: '13px', color: '#166534' }}>
                {appliedPromo.discount_type === 'percent'
                  ? `${appliedPromo.discount_value}% off`
                  : `$${parseFloat(appliedPromo.discount_value).toFixed(2)} off`}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            style={removeButtonStyle}
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <label style={labelStyle}>Promo Code (optional)</label>
      <div style={inputContainerStyle}>
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          onKeyPress={handleKeyPress}
          placeholder="Enter promo code"
          style={inputStyle}
          disabled={validating}
        />
        <button
          type="button"
          onClick={handleValidate}
          disabled={validating || !code.trim()}
          style={buttonStyle}
        >
          {validating ? 'Validating...' : 'Apply'}
        </button>
      </div>
      {error && (
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#dc2626' }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default PromoCodeInput;
