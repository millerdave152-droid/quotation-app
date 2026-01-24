/**
 * AIQuoteAssistant - Comprehensive AI suggestions panel for quote building
 * Shows bundles, cross-sells, upsells, promotions, and discount recommendations
 */

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/apiClient';

function AIQuoteAssistant({
  quoteItems = [],
  customerId,
  onAddProduct,
  onApplyDiscount,
  onApplyPromotion,
  collapsed: initialCollapsed = false
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [error, setError] = useState(null);

  const fetchSuggestions = useCallback(async () => {
    if (quoteItems.length === 0) {
      setSuggestions(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/ai/quote-builder/suggestions', {
        quoteItems: quoteItems.map(item => ({
          id: item.id,
          name: item.name || item.model,
          category: item.category,
          manufacturer: item.manufacturer,
          sell: item.sell || item.price,
          price: item.sell || item.price
        })),
        customerId
      });
      setSuggestions(response.data);
    } catch (err) {
      console.error('Error fetching AI suggestions:', err);
      setError('Unable to load suggestions');
    } finally {
      setLoading(false);
    }
  }, [quoteItems, customerId]);

  useEffect(() => {
    const timer = setTimeout(fetchSuggestions, 800);
    return () => clearTimeout(timer);
  }, [fetchSuggestions]);

  const handleAddProduct = (product) => {
    if (onAddProduct) {
      onAddProduct({
        id: product.productId,
        name: product.productName,
        model: product.productName,
        category: product.category,
        manufacturer: product.manufacturer,
        sell: product.price,
        price: product.price
      });
    }
  };

  const handleApplyDiscount = (discount) => {
    if (onApplyDiscount) {
      onApplyDiscount(discount);
    }
  };

  const handleApplyPromotion = (promotion) => {
    if (onApplyPromotion) {
      onApplyPromotion(promotion);
    }
  };

  if (quoteItems.length === 0) {
    return null;
  }

  const totalSuggestions = suggestions?.summary?.totalSuggestions || 0;

  return (
    <div className="ai-quote-assistant">
      {/* Header */}
      <div className="assistant-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="header-title">
          <span className="ai-icon">*</span>
          <span>AI Quote Assistant</span>
          {totalSuggestions > 0 && (
            <span className="suggestion-count">{totalSuggestions}</span>
          )}
        </div>
        <span className="collapse-icon">{collapsed ? '+' : '-'}</span>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="assistant-content">
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner" />
              <p>Analyzing your quote...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <p>{error}</p>
              <button className="btn btn-sm" onClick={fetchSuggestions}>Retry</button>
            </div>
          ) : suggestions ? (
            <>
              {/* Summary */}
              {suggestions.summary && (
                <div className="suggestions-summary">
                  {suggestions.summary.highlights.map((highlight, idx) => (
                    <span key={idx} className="highlight-chip">{highlight}</span>
                  ))}
                  {suggestions.summary.potentialAdditionalRevenue > 0 && (
                    <span className="revenue-chip">
                      +${suggestions.summary.potentialAdditionalRevenue.toLocaleString()} potential
                    </span>
                  )}
                </div>
              )}

              {/* Tabs */}
              <div className="suggestion-tabs">
                <button
                  className={`tab ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTab('all')}
                >
                  All
                </button>
                {suggestions.bundles?.length > 0 && (
                  <button
                    className={`tab ${activeTab === 'bundles' ? 'active' : ''}`}
                    onClick={() => setActiveTab('bundles')}
                  >
                    Bundles ({suggestions.bundles.length})
                  </button>
                )}
                {suggestions.crossSells?.length > 0 && (
                  <button
                    className={`tab ${activeTab === 'cross' ? 'active' : ''}`}
                    onClick={() => setActiveTab('cross')}
                  >
                    Add-ons ({suggestions.crossSells.length})
                  </button>
                )}
                {suggestions.upsells?.length > 0 && (
                  <button
                    className={`tab ${activeTab === 'upsells' ? 'active' : ''}`}
                    onClick={() => setActiveTab('upsells')}
                  >
                    Upgrades ({suggestions.upsells.length})
                  </button>
                )}
                {suggestions.discountSuggestions?.length > 0 && (
                  <button
                    className={`tab ${activeTab === 'discounts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('discounts')}
                  >
                    Discounts ({suggestions.discountSuggestions.length})
                  </button>
                )}
              </div>

              {/* Suggestion Cards */}
              <div className="suggestions-grid">
                {/* Bundles */}
                {(activeTab === 'all' || activeTab === 'bundles') &&
                  suggestions.bundles?.slice(0, activeTab === 'all' ? 2 : 6).map((bundle, idx) => (
                    <BundleCard
                      key={`bundle-${idx}`}
                      bundle={bundle}
                      onAdd={() => handleAddProduct(bundle)}
                    />
                  ))}

                {/* Cross-sells */}
                {(activeTab === 'all' || activeTab === 'cross') &&
                  suggestions.crossSells?.slice(0, activeTab === 'all' ? 2 : 6).map((item, idx) => (
                    <CrossSellCard
                      key={`cross-${idx}`}
                      item={item}
                      onAdd={() => handleAddProduct(item)}
                    />
                  ))}

                {/* Upsells */}
                {(activeTab === 'all' || activeTab === 'upsells') &&
                  suggestions.upsells?.slice(0, activeTab === 'all' ? 2 : 4).map((upsell, idx) => (
                    <UpsellCard
                      key={`upsell-${idx}`}
                      upsell={upsell}
                      onAdd={() => handleAddProduct(upsell)}
                    />
                  ))}

                {/* Discounts */}
                {(activeTab === 'all' || activeTab === 'discounts') &&
                  suggestions.discountSuggestions?.slice(0, activeTab === 'all' ? 2 : 4).map((discount, idx) => (
                    <DiscountCard
                      key={`discount-${idx}`}
                      discount={discount}
                      onApply={() => handleApplyDiscount(discount)}
                    />
                  ))}

                {/* Promotions */}
                {(activeTab === 'all' || activeTab === 'promotions') &&
                  suggestions.promotions?.slice(0, 2).map((promo, idx) => (
                    <PromotionCard
                      key={`promo-${idx}`}
                      promotion={promo}
                      onApply={() => handleApplyPromotion(promo)}
                    />
                  ))}
              </div>

              {/* Customer Preferences */}
              {suggestions.customerPreferences && (
                <div className="customer-insight">
                  <span className="insight-icon">i</span>
                  <span>{suggestions.customerPreferences.insight}</span>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <p>Add items to see AI suggestions</p>
            </div>
          )}
        </div>
      )}

      <style>{`
        .ai-quote-assistant {
          background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
          border: 1px solid #c7d2fe;
          border-radius: 12px;
          margin-bottom: 20px;
          overflow: hidden;
        }
        .assistant-header {
          padding: 14px 18px;
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          color: white;
        }
        .header-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 600;
          font-size: 15px;
        }
        .ai-icon {
          font-size: 18px;
        }
        .suggestion-count {
          background: rgba(255,255,255,0.2);
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 12px;
        }
        .collapse-icon {
          font-size: 18px;
          opacity: 0.8;
        }
        .assistant-content {
          padding: 16px;
        }
        .loading-state, .error-state, .empty-state {
          text-align: center;
          padding: 24px;
          color: #6b7280;
        }
        .loading-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #e5e7eb;
          border-top-color: #4f46e5;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 12px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .suggestions-summary {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }
        .highlight-chip {
          padding: 4px 10px;
          background: white;
          border-radius: 16px;
          font-size: 12px;
          color: #4f46e5;
          border: 1px solid #c7d2fe;
        }
        .revenue-chip {
          padding: 4px 10px;
          background: #22c55e;
          color: white;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 600;
        }
        .suggestion-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 12px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .suggestion-tabs .tab {
          padding: 6px 12px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          white-space: nowrap;
        }
        .suggestion-tabs .tab.active {
          background: #4f46e5;
          color: white;
          border-color: #4f46e5;
        }
        .suggestions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 12px;
        }
        .suggestion-card {
          background: white;
          border-radius: 8px;
          padding: 14px;
          border: 1px solid #e5e7eb;
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        .card-type {
          font-size: 10px;
          padding: 2px 6px;
          background: #f3f4f6;
          border-radius: 4px;
          color: #6b7280;
          text-transform: uppercase;
          font-weight: 600;
        }
        .card-type.bundle { background: #fef3c7; color: #92400e; }
        .card-type.cross-sell { background: #dcfce7; color: #166534; }
        .card-type.upsell { background: #e0e7ff; color: #4338ca; }
        .card-type.discount { background: #fee2e2; color: #991b1b; }
        .card-type.promo { background: #fce7f3; color: #9d174d; }
        .card-confidence {
          font-size: 10px;
          color: #6b7280;
        }
        .card-title {
          font-weight: 600;
          font-size: 14px;
          color: #1f2937;
          margin-bottom: 4px;
        }
        .card-meta {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 6px;
        }
        .card-reason {
          font-size: 12px;
          color: #4b5563;
          margin-bottom: 10px;
        }
        .card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .card-price {
          font-weight: 700;
          font-size: 16px;
          color: #059669;
        }
        .card-savings {
          font-size: 11px;
          color: #f59e0b;
          font-weight: 600;
        }
        .add-btn {
          padding: 6px 14px;
          background: #4f46e5;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .add-btn:hover {
          background: #4338ca;
        }
        .apply-btn {
          padding: 6px 14px;
          background: #059669;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .upsell-comparison {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .current-price {
          font-size: 13px;
          color: #9ca3af;
          text-decoration: line-through;
        }
        .arrow {
          color: #9ca3af;
        }
        .upgrade-price {
          font-size: 15px;
          font-weight: 600;
          color: #4f46e5;
        }
        .discount-value {
          font-size: 24px;
          font-weight: 700;
          color: #dc2626;
        }
        .customer-insight {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 10px;
          background: white;
          border-radius: 6px;
          font-size: 12px;
          color: #4b5563;
        }
        .insight-icon {
          width: 18px;
          height: 18px;
          background: #e0e7ff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          color: #4f46e5;
          font-weight: 600;
        }
        @media (max-width: 768px) {
          .suggestions-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

// Sub-components for different suggestion types
function BundleCard({ bundle, onAdd }) {
  return (
    <div className="suggestion-card">
      <div className="card-header">
        <span className="card-type bundle">Bundle</span>
        <span className="card-confidence">{Math.round(bundle.confidence * 100)}% match</span>
      </div>
      <div className="card-title">{bundle.productName}</div>
      <div className="card-meta">{bundle.manufacturer} - {bundle.category}</div>
      <div className="card-reason">{bundle.reason}</div>
      <div className="card-footer">
        <div>
          <span className="card-price">${bundle.price?.toFixed(2)}</span>
          {bundle.savingsIfBundled > 0 && (
            <div className="card-savings">Save {bundle.savingsIfBundled}% in bundle</div>
          )}
        </div>
        <button className="add-btn" onClick={onAdd}>+ Add</button>
      </div>
    </div>
  );
}

function CrossSellCard({ item, onAdd }) {
  return (
    <div className="suggestion-card">
      <div className="card-header">
        <span className="card-type cross-sell">Frequently Added</span>
        <span className="card-confidence">{item.coPurchaseCount}x bought together</span>
      </div>
      <div className="card-title">{item.productName}</div>
      <div className="card-meta">{item.manufacturer} - {item.category}</div>
      <div className="card-reason">{item.reason}</div>
      <div className="card-footer">
        <span className="card-price">${item.price?.toFixed(2)}</span>
        <button className="add-btn" onClick={onAdd}>+ Add</button>
      </div>
    </div>
  );
}

function UpsellCard({ upsell, onAdd }) {
  return (
    <div className="suggestion-card">
      <div className="card-header">
        <span className="card-type upsell">Upgrade</span>
      </div>
      <div className="card-title">{upsell.productName}</div>
      <div className="card-meta">
        Upgrade from: {upsell.sourceProductName}
      </div>
      <div className="upsell-comparison">
        <span className="current-price">${upsell.currentPrice?.toFixed(2)}</span>
        <span className="arrow">-&gt;</span>
        <span className="upgrade-price">${upsell.upgradedPrice?.toFixed(2)}</span>
      </div>
      <div className="card-reason">{upsell.reason}</div>
      <div className="card-footer">
        <span className="card-savings">+${upsell.priceDifference?.toFixed(2)} for premium</span>
        <button className="add-btn" onClick={onAdd}>Upgrade</button>
      </div>
    </div>
  );
}

function DiscountCard({ discount, onApply }) {
  return (
    <div className="suggestion-card">
      <div className="card-header">
        <span className="card-type discount">Discount Opportunity</span>
        <span className="card-confidence">{Math.round(discount.confidence * 100)}% confidence</span>
      </div>
      <div className="card-title">{discount.reason}</div>
      <div className="card-reason">{discount.description}</div>
      <div className="card-footer">
        <span className="discount-value">{discount.suggestedDiscount}% off</span>
        <button className="apply-btn" onClick={onApply}>Apply</button>
      </div>
    </div>
  );
}

function PromotionCard({ promotion, onApply }) {
  return (
    <div className="suggestion-card">
      <div className="card-header">
        <span className="card-type promo">Promotion</span>
        {promotion.validUntil && (
          <span className="card-confidence">
            Expires: {new Date(promotion.validUntil).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="card-title">{promotion.name}</div>
      <div className="card-reason">{promotion.description}</div>
      <div className="card-footer">
        <div>
          <span className="card-price">
            {promotion.discountType === 'percentage'
              ? `${promotion.discountValue}% off`
              : `$${promotion.discountValue} off`}
          </span>
          {promotion.estimatedSavings > 0 && (
            <div className="card-savings">Save ~${promotion.estimatedSavings}</div>
          )}
        </div>
        <button className="apply-btn" onClick={onApply}>Apply</button>
      </div>
    </div>
  );
}

export default AIQuoteAssistant;
