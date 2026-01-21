import React, { useState, useEffect } from 'react';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

/**
 * ProductPromotionBadge - Shows promotion badges on product cards
 *
 * Displays:
 * - Bundle savings indicators
 * - Bonus gift badges
 * - Guarantee badges (e.g., "30-Day Money-Back")
 */
const ProductPromotionBadge = ({ productId, model, manufacturer, compact = false }) => {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBadges = async () => {
      try {
        const params = new URLSearchParams();
        if (productId) params.append('productId', productId);
        if (model) params.append('model', model);
        if (manufacturer) params.append('manufacturer', manufacturer);

        const response = await fetch(
          `${API_URL}/promotions/manufacturer/product/${productId || 0}/badges?${params}`,
          { headers: getAuthHeaders() }
        );

        if (response.ok) {
          const data = await response.json();
          setBadges(data);
        }
      } catch (err) {
        console.error('Error fetching promotion badges:', err);
      } finally {
        setLoading(false);
      }
    };

    if (productId || model) {
      fetchBadges();
    } else {
      setLoading(false);
    }
  }, [productId, model, manufacturer]);

  if (loading || badges.length === 0) {
    return null;
  }

  // Badge icon based on type
  const getBadgeIcon = (type) => {
    switch (type) {
      case 'bundle_savings': return '💰';
      case 'bonus_gift': return '🎁';
      case 'guarantee': return '✓';
      default: return '🏷️';
    }
  };

  // Compact mode shows just icons
  if (compact) {
    return (
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {badges.map((badge, idx) => (
          <span
            key={idx}
            title={badge.tooltip || badge.text}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              backgroundColor: badge.color || '#059669',
              color: '#fff',
              borderRadius: '50%',
              fontSize: '12px',
              cursor: 'help'
            }}
          >
            {getBadgeIcon(badge.type)}
          </span>
        ))}
      </div>
    );
  }

  // Full badges with text
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {badges.map((badge, idx) => (
        <span
          key={idx}
          title={badge.tooltip}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            backgroundColor: badge.color || '#059669',
            color: '#fff',
            borderRadius: '9999px',
            fontSize: '11px',
            fontWeight: '500',
            whiteSpace: 'nowrap'
          }}
        >
          {getBadgeIcon(badge.type)} {badge.text}
        </span>
      ))}
    </div>
  );
};

/**
 * ProductPromotionBadgeInline - Inline badge for use in tables/lists
 */
export const ProductPromotionBadgeInline = ({ productId, model, manufacturer }) => {
  const [badges, setBadges] = useState([]);

  useEffect(() => {
    const fetchBadges = async () => {
      try {
        const params = new URLSearchParams();
        if (productId) params.append('productId', productId);
        if (model) params.append('model', model);
        if (manufacturer) params.append('manufacturer', manufacturer);

        const response = await fetch(
          `${API_URL}/promotions/manufacturer/product/${productId || 0}/badges?${params}`,
          { headers: getAuthHeaders() }
        );

        if (response.ok) {
          const data = await response.json();
          setBadges(data);
        }
      } catch (err) {
        console.error('Error fetching promotion badges:', err);
      }
    };

    if (productId || model) {
      fetchBadges();
    }
  }, [productId, model, manufacturer]);

  if (badges.length === 0) {
    return null;
  }

  // Show count badge for multiple promotions
  if (badges.length > 2) {
    return (
      <span
        title={badges.map(b => b.text).join(', ')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 6px',
          backgroundColor: '#059669',
          color: '#fff',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: '500',
          cursor: 'help'
        }}
      >
        🏷️ {badges.length} Promos
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', gap: '4px' }}>
      {badges.slice(0, 2).map((badge, idx) => (
        <span
          key={idx}
          title={badge.tooltip || badge.text}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 6px',
            backgroundColor: badge.color || '#059669',
            color: '#fff',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: '500'
          }}
        >
          {badge.type === 'guarantee' ? '✓' : badge.type === 'bonus_gift' ? '🎁' : '💰'}
        </span>
      ))}
    </span>
  );
};

export default ProductPromotionBadge;
