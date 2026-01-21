import React, { useState, useEffect, useCallback } from 'react';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

/**
 * QuotePromotionAlerts - Shows eligible and applied promotions for a quote
 *
 * Displays:
 * - Applied promotions with option to remove
 * - Eligible promotions with "Apply" button
 * - Partial matches (close to qualifying) with next tier info
 */
const QuotePromotionAlerts = ({ quotationId, onPromotionChange }) => {
  const [eligiblePromotions, setEligiblePromotions] = useState(null);
  const [appliedPromotions, setAppliedPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(true);

  // Fetch eligible promotions
  const fetchPromotions = useCallback(async () => {
    if (!quotationId) return;

    try {
      setLoading(true);
      setError(null);

      const [eligibleRes, appliedRes] = await Promise.all([
        fetch(`${API_URL}/promotions/manufacturer/quote/${quotationId}/eligible`, {
          headers: getAuthHeaders()
        }),
        fetch(`${API_URL}/promotions/manufacturer/quote/${quotationId}/applied`, {
          headers: getAuthHeaders()
        })
      ]);

      if (eligibleRes.ok) {
        const eligibleResult = await eligibleRes.json();
        // API returns { success, data } - extract the data
        setEligiblePromotions(eligibleResult.data || eligibleResult);
      }

      if (appliedRes.ok) {
        const appliedResult = await appliedRes.json();
        // API returns { success, data } - extract the array
        const appliedData = appliedResult.data || appliedResult;
        setAppliedPromotions(Array.isArray(appliedData) ? appliedData : []);
      }

    } catch (err) {
      console.error('Error fetching promotions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [quotationId]);

  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  // Apply a promotion
  const applyPromotion = async (promotionId) => {
    try {
      setApplying(promotionId);
      setError(null);

      const response = await fetch(
        `${API_URL}/promotions/manufacturer/quote/${quotationId}/apply/${promotionId}`,
        {
          method: 'POST',
          headers: getAuthHeaders()
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        const errorMsg = typeof errData.error === 'string'
          ? errData.error
          : (errData.error?.message || errData.message || 'Failed to apply promotion');
        throw new Error(errorMsg);
      }

      await fetchPromotions();
      if (onPromotionChange) onPromotionChange();

    } catch (err) {
      console.error('Error applying promotion:', err);
      setError(err.message);
    } finally {
      setApplying(null);
    }
  };

  // Remove a promotion
  const removePromotion = async (promotionId) => {
    if (!window.confirm('Remove this promotion from the quote?')) return;

    try {
      setApplying(promotionId);
      setError(null);

      const response = await fetch(
        `${API_URL}/promotions/manufacturer/quote/${quotationId}/remove/${promotionId}`,
        {
          method: 'DELETE',
          headers: getAuthHeaders()
        }
      );

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to remove promotion');
      }

      await fetchPromotions();
      if (onPromotionChange) onPromotionChange();

    } catch (err) {
      console.error('Error removing promotion:', err);
      setError(err.message);
    } finally {
      setApplying(null);
    }
  };

  // Don't render if no data
  if (loading) {
    return (
      <div style={{ padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '8px', marginBottom: '16px' }}>
        <div style={{ color: '#0369a1', fontSize: '14px' }}>Checking promotions...</div>
      </div>
    );
  }

  const hasApplied = appliedPromotions.length > 0;
  const hasEligible = eligiblePromotions?.bundlePromotions?.some(p => p.isEligible) ||
                      eligiblePromotions?.giftPromotions?.some(p => p.isEligible) ||
                      eligiblePromotions?.badges?.some(p => p.isEligible);
  const hasPartial = eligiblePromotions?.bundlePromotions?.some(p => p.partialMatch);

  // Debug logging
  console.log('[QuotePromotionAlerts] quotationId:', quotationId);
  console.log('[QuotePromotionAlerts] eligiblePromotions:', eligiblePromotions);
  console.log('[QuotePromotionAlerts] hasEligible:', hasEligible, 'hasApplied:', hasApplied, 'hasPartial:', hasPartial);

  if (!hasApplied && !hasEligible && !hasPartial) {
    console.log('[QuotePromotionAlerts] Returning null - no promotions to show');
    return null; // No promotions to show
  }

  const formatCents = (cents) => `$${(cents / 100).toFixed(0)}`;

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: hasApplied ? '#d1fae5' : hasEligible ? '#fef3c7' : '#e0e7ff',
          borderRadius: expanded ? '8px 8px 0 0' : '8px',
          cursor: 'pointer',
          border: `1px solid ${hasApplied ? '#86efac' : hasEligible ? '#fcd34d' : '#a5b4fc'}`,
          borderBottom: expanded ? 'none' : undefined
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>
            {hasApplied ? '✓' : hasEligible ? '🏷️' : '💡'}
          </span>
          <span style={{
            fontWeight: '600',
            color: hasApplied ? '#065f46' : hasEligible ? '#92400e' : '#4338ca'
          }}>
            {hasApplied
              ? `${appliedPromotions.length} Promotion${appliedPromotions.length > 1 ? 's' : ''} Applied`
              : hasEligible
              ? 'Eligible for Manufacturer Promotions!'
              : 'Almost Eligible for Savings'}
          </span>
        </div>
        <span style={{
          color: hasApplied ? '#065f46' : hasEligible ? '#92400e' : '#4338ca',
          fontSize: '12px'
        }}>
          {expanded ? '▲ Collapse' : '▼ Expand'}
        </span>
      </div>

      {/* Content */}
      {expanded && (
        <div style={{
          padding: '16px',
          backgroundColor: '#fff',
          border: `1px solid ${hasApplied ? '#86efac' : hasEligible ? '#fcd34d' : '#a5b4fc'}`,
          borderTop: 'none',
          borderRadius: '0 0 8px 8px'
        }}>
          {error && (
            <div style={{
              padding: '8px 12px',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              borderRadius: '6px',
              marginBottom: '12px',
              fontSize: '13px'
            }}>
              {error}
            </div>
          )}

          {/* Applied Promotions */}
          {appliedPromotions.length > 0 && (
            <div style={{ marginBottom: hasEligible || hasPartial ? '16px' : 0 }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                Applied Promotions
              </div>
              {appliedPromotions.map((promo) => (
                <div
                  key={promo.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    backgroundColor: '#f0fdf4',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    border: '1px solid #86efac'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '600', color: '#065f46' }}>{promo.promo_name}</div>
                    <div style={{ fontSize: '13px', color: '#166534', marginTop: '2px' }}>
                      {promo.promo_type === 'bundle_savings' && (
                        <>Saving {formatCents(promo.discount_amount_cents)} ({promo.qualifying_count} qualifying items)</>
                      )}
                      {promo.promo_type === 'bonus_gift' && (
                        <>Free gift included: {promo.gift_description}</>
                      )}
                      {promo.promo_type === 'guarantee' && (
                        <>{promo.badge_text || promo.promo_name}</>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removePromotion(promo.promotion_id)}
                    disabled={applying === promo.promotion_id}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#fee2e2',
                      color: '#dc2626',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: applying === promo.promotion_id ? 'not-allowed' : 'pointer',
                      opacity: applying === promo.promotion_id ? 0.6 : 1
                    }}
                  >
                    {applying === promo.promotion_id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Eligible Bundle Promotions */}
          {eligiblePromotions?.bundlePromotions?.filter(p => p.isEligible && !appliedPromotions.some(a => a.promotion_id === p.id)).length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                Available Savings
              </div>
              {eligiblePromotions.bundlePromotions
                .filter(p => p.isEligible && !appliedPromotions.some(a => a.promotion_id === p.id))
                .map((promo) => (
                  <div
                    key={promo.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px',
                      backgroundColor: '#fffbeb',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      border: '1px solid #fcd34d'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', color: '#92400e' }}>{promo.promo_name}</div>
                      <div style={{ fontSize: '13px', color: '#b45309', marginTop: '2px' }}>
                        Save {formatCents(promo.discountCents)} with {promo.qualifyingCount} qualifying {promo.manufacturer} items
                      </div>
                      {promo.nextTierInfo && (
                        <div style={{ fontSize: '12px', color: '#059669', marginTop: '4px' }}>
                          💡 {promo.nextTierInfo.message}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => applyPromotion(promo.id)}
                      disabled={applying === promo.id}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#059669',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: applying === promo.id ? 'not-allowed' : 'pointer',
                        opacity: applying === promo.id ? 0.6 : 1
                      }}
                    >
                      {applying === promo.id ? 'Applying...' : `Apply ${formatCents(promo.discountCents)}`}
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* Eligible Gift Promotions */}
          {eligiblePromotions?.giftPromotions?.filter(p => p.isEligible && !appliedPromotions.some(a => a.promotion_id === p.id)).length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                Bonus Gifts
              </div>
              {eligiblePromotions.giftPromotions
                .filter(p => p.isEligible && !appliedPromotions.some(a => a.promotion_id === p.id))
                .map((promo) => (
                  <div
                    key={promo.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px',
                      backgroundColor: '#f0fdf4',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      border: '1px solid #86efac'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', color: '#065f46' }}>🎁 {promo.promo_name}</div>
                      <div style={{ fontSize: '13px', color: '#166534', marginTop: '2px' }}>
                        {promo.gift_description}
                        {promo.gift_value_cents && ` (${formatCents(promo.gift_value_cents)} value)`}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                        {promo.redemption_type === 'consumer_registration'
                          ? 'Customer registers online to receive gift'
                          : 'Gift applied at dealer'}
                      </div>
                    </div>
                    <button
                      onClick={() => applyPromotion(promo.id)}
                      disabled={applying === promo.id}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#059669',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: applying === promo.id ? 'not-allowed' : 'pointer',
                        opacity: applying === promo.id ? 0.6 : 1
                      }}
                    >
                      {applying === promo.id ? 'Adding...' : 'Add to Quote'}
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* Partial Matches - Close to Qualifying */}
          {eligiblePromotions?.bundlePromotions?.filter(p => p.partialMatch && !p.isEligible).length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
                Almost There!
              </div>
              {eligiblePromotions.bundlePromotions
                .filter(p => p.partialMatch && !p.isEligible)
                .map((promo) => (
                  <div
                    key={promo.id}
                    style={{
                      padding: '12px',
                      backgroundColor: '#f0f9ff',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      border: '1px solid #bae6fd'
                    }}
                  >
                    <div style={{ fontWeight: '500', color: '#0369a1' }}>{promo.promo_name}</div>
                    <div style={{ fontSize: '13px', color: '#0284c7', marginTop: '4px' }}>
                      {promo.nextTierInfo?.message || `Add more ${promo.manufacturer} items to qualify`}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      Currently: {promo.qualifyingCount} qualifying item{promo.qualifyingCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Badges/Guarantees */}
          {eligiblePromotions?.badges?.filter(p => p.isEligible).length > 0 && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {eligiblePromotions.badges
                .filter(p => p.isEligible)
                .map((badge) => (
                  <span
                    key={badge.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      backgroundColor: badge.badge_color || '#059669',
                      color: '#fff',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}
                    title={badge.promo_name}
                  >
                    ✓ {badge.badge_text || badge.promo_name}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default QuotePromotionAlerts;
