import React, { useState, useEffect, useCallback } from 'react';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

/**
 * UpsellRecommendations - AI-powered product upselling panel
 *
 * Shows intelligent product recommendations based on:
 * - Product affinity (frequently bought together)
 * - Category correlations
 * - Customer preferences
 * - Upsell rules
 */
const UpsellRecommendations = ({
  quoteItems = [],
  customerId,
  onAddProduct,
  maxRecommendations = 4
}) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Fetch recommendations when quote items change
  const fetchRecommendations = useCallback(async () => {
    if (quoteItems.length === 0) {
      setRecommendations([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/ai/upsell/for-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteItems: quoteItems.map(item => ({
            id: item.id,
            name: item.name || item.model,
            category: item.category,
            manufacturer: item.manufacturer
          })),
          customerId,
          limit: maxRecommendations
        })
      });

      if (response.ok) {
        const data = await response.json();
        setRecommendations(data);
      }
    } catch (err) {
      console.error('Error fetching upsell recommendations:', err);
    } finally {
      setLoading(false);
    }
  }, [quoteItems, customerId, maxRecommendations]);

  useEffect(() => {
    const timer = setTimeout(fetchRecommendations, 600);
    return () => clearTimeout(timer);
  }, [fetchRecommendations]);

  const handleAddProduct = async (recommendation) => {
    if (onAddProduct) {
      // Track interaction
      try {
        await fetch(`${API_URL}/ai/recommendations/interact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recommendationId: recommendation.id,
            accepted: true
          })
        });
      } catch (err) {
        // Silent fail for tracking
      }

      onAddProduct({
        id: recommendation.productId,
        name: recommendation.productName,
        model: recommendation.model,
        manufacturer: recommendation.manufacturer,
        category: recommendation.category,
        sell: recommendation.price,
        discountPercent: recommendation.discountPercent
      });
    }
  };

  if (quoteItems.length === 0 || (recommendations.length === 0 && !loading)) {
    return null;
  }

  const getConfidenceLabel = (confidence) => {
    if (confidence >= 0.8) return { label: 'Highly Recommended', color: '#059669' };
    if (confidence >= 0.6) return { label: 'Recommended', color: '#3b82f6' };
    return { label: 'Suggested', color: '#6b7280' };
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'product_affinity': return 'Frequently Bought Together';
      case 'category_affinity': return 'Complements Your Selection';
      case 'upsell_rule': return 'Special Offer';
      case 'customer_preference': return 'Based on Your Preferences';
      default: return 'Recommendation';
    }
  };

  const containerStyle = {
    backgroundColor: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '12px',
    marginBottom: '24px',
    overflow: 'hidden'
  };

  const headerStyle = {
    padding: '16px 20px',
    backgroundColor: '#dcfce7',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer'
  };

  const titleStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontWeight: '600',
    fontSize: '16px',
    color: '#166534'
  };

  const contentStyle = {
    padding: collapsed ? '0' : '16px 20px',
    maxHeight: collapsed ? '0' : '600px',
    overflow: 'hidden',
    transition: 'all 0.3s ease'
  };

  const cardStyle = {
    padding: '16px',
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    display: 'flex',
    gap: '16px',
    alignItems: 'center'
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle} onClick={() => setCollapsed(!collapsed)}>
        <div style={titleStyle}>
          <span style={{ fontSize: '20px' }}>sparkles</span>
          <span>Recommended Add-Ons</span>
          {recommendations.length > 0 && (
            <span style={{
              padding: '2px 8px',
              backgroundColor: '#22c55e',
              color: '#fff',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              {recommendations.length}
            </span>
          )}
        </div>
        <span style={{ fontSize: '18px', color: '#166534' }}>
          {collapsed ? '+' : '-'}
        </span>
      </div>

      <div style={contentStyle}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#166534' }}>
            Finding perfect add-ons for your quote...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {recommendations.map((rec, index) => {
              const confidence = getConfidenceLabel(rec.confidence);
              return (
                <div key={index} style={cardStyle}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '6px'
                    }}>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        backgroundColor: '#f3f4f6',
                        color: '#4b5563',
                        borderRadius: '4px',
                        fontWeight: '500'
                      }}>
                        {getTypeLabel(rec.type)}
                      </span>
                    </div>

                    <div style={{
                      fontWeight: '600',
                      fontSize: '14px',
                      color: '#1a1a2e',
                      marginBottom: '4px'
                    }}>
                      {rec.productName}
                    </div>

                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '6px'
                    }}>
                      {rec.manufacturer} • {rec.category}
                    </div>

                    <div style={{
                      fontSize: '13px',
                      color: '#4b5563',
                      marginBottom: '8px'
                    }}>
                      {rec.reason}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        fontWeight: '700',
                        fontSize: '16px',
                        color: '#059669'
                      }}>
                        ${rec.price?.toFixed(2)}
                      </div>

                      {rec.discountPercent && (
                        <span style={{
                          padding: '2px 6px',
                          backgroundColor: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          {rec.discountPercent}% OFF Bundle
                        </span>
                      )}

                      <span style={{
                        fontSize: '11px',
                        color: confidence.color,
                        fontWeight: '500'
                      }}>
                        {confidence.label}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAddProduct(rec)}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#22c55e',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    + Add
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {recommendations.length > 0 && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: '#ecfdf5',
            borderRadius: '8px',
            textAlign: 'center',
            fontSize: '13px',
            color: '#166534'
          }}>
            <span style={{ fontWeight: '600' }}>Tip:</span> Customers who purchased similar items also added these products to their orders
          </div>
        )}
      </div>
    </div>
  );
};

export default UpsellRecommendations;
