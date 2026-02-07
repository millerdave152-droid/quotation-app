import { authFetch } from '../../services/authFetch';
/**
 * PricingPanel Component
 * Displays comprehensive pricing information for products including:
 * - All price points (MSRP, MAP, LAP, UMRP, PMAP, promo)
 * - Real-time margin calculator
 * - Price violation indicators
 * - Customer-specific pricing
 * - Purchase history
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Info,
  Target,
  History,
  Tag,
  Percent,
  Calculator,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Star,
  Shield
} from 'lucide-react';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// Format cents to currency string
const formatCurrency = (cents) => {
  if (cents === null || cents === undefined) return '—';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(cents / 100);
};

// Format percentage
const formatPercent = (value) => {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(1)}%`;
};

// Price point badge component
const PricePointBadge = ({ label, value, type = 'default', tooltip }) => {
  const typeStyles = {
    default: { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' },
    msrp: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    map: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
    lap: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
    umrp: { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
    promo: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
    cost: { bg: '#f5f5f4', text: '#44403c', border: '#d6d3d1' }
  };

  const style = typeStyles[type] || typeStyles.default;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 12px',
        backgroundColor: style.bg,
        borderRadius: '8px',
        border: `1px solid ${style.border}`,
        minWidth: '90px'
      }}
      title={tooltip}
    >
      <span style={{ fontSize: '11px', color: style.text, opacity: 0.8, marginBottom: '2px' }}>
        {label}
      </span>
      <span style={{ fontSize: '14px', fontWeight: '600', color: style.text }}>
        {formatCurrency(value)}
      </span>
    </div>
  );
};

// Violation alert component
const ViolationAlert = ({ violations }) => {
  if (!violations || violations.length === 0) return null;

  const severityColors = {
    critical: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', icon: AlertCircle },
    high: { bg: '#fff7ed', border: '#f97316', text: '#c2410c', icon: AlertTriangle },
    medium: { bg: '#fefce8', border: '#eab308', text: '#a16207', icon: AlertTriangle },
    low: { bg: '#f0fdf4', border: '#22c55e', text: '#166534', icon: Info }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
      {violations.map((violation, idx) => {
        const colors = severityColors[violation.severity] || severityColors.medium;
        const Icon = colors.icon;
        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              backgroundColor: colors.bg,
              borderLeft: `4px solid ${colors.border}`,
              borderRadius: '0 6px 6px 0'
            }}
          >
            <Icon size={18} color={colors.border} />
            <span style={{ fontSize: '13px', color: colors.text, flex: 1 }}>
              {violation.message}
            </span>
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              backgroundColor: colors.border,
              color: 'white',
              borderRadius: '10px',
              fontWeight: '500'
            }}>
              {violation.severity.toUpperCase()}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// Margin indicator component
const MarginIndicator = ({ marginPercent, targetMargin, minMargin }) => {
  let color = '#22c55e'; // green
  let status = 'Healthy';
  let Icon = CheckCircle;

  if (marginPercent < minMargin) {
    color = '#ef4444'; // red
    status = 'Below Minimum';
    Icon = AlertCircle;
  } else if (marginPercent < targetMargin) {
    color = '#f59e0b'; // amber
    status = 'Below Target';
    Icon = AlertTriangle;
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      backgroundColor: `${color}15`,
      borderRadius: '6px',
      border: `1px solid ${color}40`
    }}>
      <Icon size={18} color={color} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color }}>
          {formatPercent(marginPercent)} Margin
        </div>
        <div style={{ fontSize: '11px', color: '#6b7280' }}>
          {status} (Target: {formatPercent(targetMargin)})
        </div>
      </div>
    </div>
  );
};

// Customer tier badge
const CustomerTierBadge = ({ tier, discountPercent }) => {
  const tierColors = {
    'Standard': { bg: '#f3f4f6', text: '#4b5563' },
    'Preferred': { bg: '#dbeafe', text: '#1d4ed8' },
    'VIP': { bg: '#fef3c7', text: '#b45309' },
    'Trade': { bg: '#d1fae5', text: '#047857' },
    'Builder': { bg: '#ede9fe', text: '#6d28d9' }
  };

  const colors = tierColors[tier] || tierColors['Standard'];

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      backgroundColor: colors.bg,
      borderRadius: '12px'
    }}>
      <Star size={14} color={colors.text} fill={colors.text} />
      <span style={{ fontSize: '12px', fontWeight: '600', color: colors.text }}>
        {tier}
      </span>
      {discountPercent > 0 && (
        <span style={{ fontSize: '11px', color: colors.text, opacity: 0.8 }}>
          ({discountPercent}% off)
        </span>
      )}
    </div>
  );
};

// Main PricingPanel component
const PricingPanel = ({
  productId,
  customerId = null,
  currentPrice = null,
  onPriceChange = null,
  onRecommendedPriceSelect = null,
  expanded = false,
  showSimulator = true,
  compact = false
}) => {
  const [priceData, setPriceData] = useState(null);
  const [margins, setMargins] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [violations, setViolations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [simulatedPrice, setSimulatedPrice] = useState('');
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulating, setSimulating] = useState(false);

  // Fetch pricing data
  const fetchPricingData = useCallback(async () => {
    if (!productId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch price points and margins
      const [priceResponse, marginsResponse] = await Promise.all([
        authFetch(`${API_BASE}/pricing/${productId}`),
        authFetch(`${API_BASE}/pricing/${productId}/margins${currentPrice ? `?sellPrice=${currentPrice}` : ''}`)
      ]);

      if (!priceResponse.ok || !marginsResponse.ok) {
        throw new Error('Failed to fetch pricing data');
      }

      const priceDataResult = await priceResponse.json();
      const marginsResult = await marginsResponse.json();

      setPriceData(priceDataResult);
      setMargins(marginsResult);

      // Fetch customer-specific recommendation if customer provided
      if (customerId) {
        const recResponse = await authFetch(`${API_BASE}/pricing/customer/${customerId}/${productId}`);
        if (recResponse.ok) {
          const recResult = await recResponse.json();
          setRecommendation(recResult);
        }
      }

      // Check violations if current price set
      if (currentPrice) {
        const violationResponse = await authFetch(`${API_BASE}/pricing/${productId}/check-violations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sellPriceCents: currentPrice })
        });
        if (violationResponse.ok) {
          const violationResult = await violationResponse.json();
          setViolations(violationResult);
        }
      }

    } catch (err) {
      console.error('Error fetching pricing data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [productId, customerId, currentPrice]);

  useEffect(() => {
    fetchPricingData();
  }, [fetchPricingData]);

  // Simulate margin at proposed price
  const handleSimulate = async () => {
    if (!simulatedPrice || !productId) return;

    const priceCents = Math.round(parseFloat(simulatedPrice) * 100);
    if (isNaN(priceCents) || priceCents <= 0) return;

    setSimulating(true);
    try {
      const response = await authFetch(`${API_BASE}/pricing/${productId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposedPriceCents: priceCents })
      });

      if (response.ok) {
        const result = await response.json();
        setSimulationResult(result);
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulating(false);
    }
  };

  // Apply recommended price
  const handleApplyRecommended = () => {
    if (recommendation?.recommendedPrice && onRecommendedPriceSelect) {
      onRecommendedPriceSelect(recommendation.recommendedPrice);
    }
  };

  if (loading) {
    return (
      <div style={{
        padding: compact ? '12px' : '20px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <RefreshCw size={20} className="animate-spin" style={{ color: '#6b7280' }} />
        <span style={{ marginLeft: '8px', color: '#6b7280', fontSize: '13px' }}>
          Loading pricing...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: compact ? '12px' : '20px',
        backgroundColor: '#fef2f2',
        borderRadius: '8px',
        color: '#991b1b',
        fontSize: '13px'
      }}>
        <AlertCircle size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
        {error}
      </div>
    );
  }

  if (!priceData) return null;

  // Compact mode - just show key info
  if (compact) {
    return (
      <div style={{
        padding: '12px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>Cost</span>
            <span style={{ marginLeft: '8px', fontWeight: '600' }}>
              {formatCurrency(priceData.cost_cents)}
            </span>
          </div>
          <div>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>MSRP</span>
            <span style={{ marginLeft: '8px', fontWeight: '600' }}>
              {formatCurrency(priceData.msrp_cents)}
            </span>
          </div>
          {priceData.map_cents && (
            <div>
              <span style={{ fontSize: '12px', color: '#92400e' }}>MAP</span>
              <span style={{ marginLeft: '8px', fontWeight: '600', color: '#92400e' }}>
                {formatCurrency(priceData.map_cents)}
              </span>
            </div>
          )}
          {margins?.custom && (
            <div style={{
              padding: '4px 10px',
              backgroundColor: margins.custom.margin_percent >= (priceData.min_margin_percent || 10) ? '#d1fae5' : '#fef2f2',
              borderRadius: '4px'
            }}>
              <span style={{ fontSize: '12px', fontWeight: '600' }}>
                {formatPercent(margins.custom.margin_percent)} margin
              </span>
            </div>
          )}
        </div>
        {violations?.hasViolations && (
          <div style={{
            marginTop: '8px',
            padding: '6px 10px',
            backgroundColor: '#fef2f2',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <AlertTriangle size={14} color="#ef4444" />
            <span style={{ fontSize: '12px', color: '#991b1b' }}>
              {violations.violations.length} price violation(s)
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          backgroundColor: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          cursor: 'pointer'
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <DollarSign size={20} color="#3b82f6" />
          <span style={{ fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
            Pricing Intelligence
          </span>
          {priceData.model && (
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {priceData.manufacturer} {priceData.model}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {violations?.hasViolations && (
            <span style={{
              padding: '4px 10px',
              backgroundColor: '#fef2f2',
              color: '#991b1b',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: '500'
            }}>
              {violations.violations.length} Violation(s)
            </span>
          )}
          {recommendation?.tier && (
            <CustomerTierBadge
              tier={recommendation.tier}
              discountPercent={recommendation.discountPercent}
            />
          )}
          {isExpanded ? <ChevronUp size={20} color="#6b7280" /> : <ChevronDown size={20} color="#6b7280" />}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div style={{ padding: '20px' }}>
          {/* Price Points Grid */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '13px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <Tag size={14} />
              Price Points
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <PricePointBadge label="Cost" value={priceData.cost_cents} type="cost" tooltip="Dealer cost" />
              <PricePointBadge label="MSRP" value={priceData.msrp_cents} type="msrp" tooltip="Manufacturer Suggested Retail Price" />
              {priceData.map_cents && (
                <PricePointBadge label="MAP" value={priceData.map_cents} type="map" tooltip="Minimum Advertised Price" />
              )}
              {priceData.lap_cents && (
                <PricePointBadge label="LAP" value={priceData.lap_cents} type="lap" tooltip="Lowest Advertised Price" />
              )}
              {priceData.umrp_cents && (
                <PricePointBadge label="UMRP" value={priceData.umrp_cents} type="umrp" tooltip="Unilateral Minimum Resale Price" />
              )}
              {priceData.pmap_cents && (
                <PricePointBadge label="PMAP" value={priceData.pmap_cents} type="default" tooltip="Premium MAP" />
              )}
              {priceData.promo_active && priceData.promo_price_cents && (
                <PricePointBadge
                  label={`Promo: ${priceData.promo_name || 'Active'}`}
                  value={priceData.promo_price_cents}
                  type="promo"
                  tooltip={priceData.promo_end_date ? `Ends ${new Date(priceData.promo_end_date).toLocaleDateString()}` : 'Active promotion'}
                />
              )}
            </div>
          </div>

          {/* Margin Analysis */}
          {margins && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Percent size={14} />
                Margin Analysis
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginBottom: '12px'
              }}>
                {/* At MSRP */}
                {margins.msrp?.price_cents && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#f0f9ff',
                    borderRadius: '8px',
                    border: '1px solid #bae6fd'
                  }}>
                    <div style={{ fontSize: '11px', color: '#0369a1', marginBottom: '4px' }}>At MSRP</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#0c4a6e' }}>
                      {formatPercent(margins.msrp.margin_percent)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#0369a1' }}>
                      Profit: {formatCurrency(margins.msrp.profit_cents)}
                    </div>
                  </div>
                )}

                {/* At MAP */}
                {margins.map?.price_cents && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#fffbeb',
                    borderRadius: '8px',
                    border: '1px solid #fcd34d'
                  }}>
                    <div style={{ fontSize: '11px', color: '#b45309', marginBottom: '4px' }}>At MAP</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#92400e' }}>
                      {formatPercent(margins.map.margin_percent)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#b45309' }}>
                      Profit: {formatCurrency(margins.map.profit_cents)}
                    </div>
                  </div>
                )}

                {/* Current Price */}
                {margins.custom && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: margins.custom.margin_percent >= (priceData.min_margin_percent || 10) ? '#f0fdf4' : '#fef2f2',
                    borderRadius: '8px',
                    border: `1px solid ${margins.custom.margin_percent >= (priceData.min_margin_percent || 10) ? '#86efac' : '#fca5a5'}`
                  }}>
                    <div style={{
                      fontSize: '11px',
                      color: margins.custom.margin_percent >= (priceData.min_margin_percent || 10) ? '#166534' : '#991b1b',
                      marginBottom: '4px'
                    }}>
                      Current Price
                    </div>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: '700',
                      color: margins.custom.margin_percent >= (priceData.min_margin_percent || 10) ? '#15803d' : '#dc2626'
                    }}>
                      {formatPercent(margins.custom.margin_percent)}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: margins.custom.margin_percent >= (priceData.min_margin_percent || 10) ? '#166534' : '#991b1b'
                    }}>
                      Profit: {formatCurrency(margins.custom.profit_cents)}
                    </div>
                  </div>
                )}

                {/* Promo */}
                {margins.promo && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#ecfdf5',
                    borderRadius: '8px',
                    border: '1px solid #6ee7b7'
                  }}>
                    <div style={{ fontSize: '11px', color: '#047857', marginBottom: '4px' }}>
                      At Promo ({margins.promo.promo_name || 'Active'})
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#065f46' }}>
                      {formatPercent(margins.promo.margin_percent)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#047857' }}>
                      Profit: {formatCurrency(margins.promo.profit_cents)}
                    </div>
                  </div>
                )}
              </div>

              {/* Margin Indicator */}
              {margins.custom && (
                <MarginIndicator
                  marginPercent={margins.custom.margin_percent}
                  targetMargin={priceData.target_margin_percent || 20}
                  minMargin={priceData.min_margin_percent || 10}
                />
              )}
            </div>
          )}

          {/* Price Violations */}
          {violations?.hasViolations && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Shield size={14} />
                Price Violations
              </div>
              <ViolationAlert violations={violations.violations} />
            </div>
          )}

          {/* Customer Recommendation */}
          {recommendation && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Target size={14} />
                Recommended Price
              </div>

              <div style={{
                padding: '16px',
                backgroundColor: '#f0fdf4',
                borderRadius: '8px',
                border: '1px solid #86efac'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#15803d' }}>
                      {formatCurrency(recommendation.recommendedPrice)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#166534', marginTop: '4px' }}>
                      Based on: {recommendation.priceSource === 'negotiated' ? 'Negotiated Price' :
                        recommendation.priceSource === 'tier' ? `${recommendation.tier} Tier` :
                        recommendation.priceSource === 'category_discount' ? 'Category Discount' :
                        recommendation.priceSource === 'promo' ? 'Active Promotion' : 'MSRP'}
                      {recommendation.discountPercent > 0 && ` (${recommendation.discountPercent}% off)`}
                    </div>
                  </div>
                  {onRecommendedPriceSelect && (
                    <button
                      onClick={handleApplyRecommended}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#16a34a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Apply Price
                    </button>
                  )}
                </div>

                {/* Purchase History */}
                {recommendation.purchaseHistory && (
                  <div style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid #86efac'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      color: '#166534',
                      marginBottom: '8px'
                    }}>
                      <History size={14} />
                      Customer History
                    </div>
                    <div style={{ display: 'flex', gap: '20px', fontSize: '12px' }}>
                      <div>
                        <span style={{ color: '#6b7280' }}>Purchased:</span>
                        <span style={{ fontWeight: '600', marginLeft: '4px' }}>
                          {recommendation.purchaseHistory.timesPurchased}x
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>Last Paid:</span>
                        <span style={{ fontWeight: '600', marginLeft: '4px' }}>
                          {formatCurrency(recommendation.purchaseHistory.lastPricePaid)}
                        </span>
                      </div>
                      <div>
                        <span style={{ color: '#6b7280' }}>Avg Paid:</span>
                        <span style={{ fontWeight: '600', marginLeft: '4px' }}>
                          {formatCurrency(recommendation.purchaseHistory.avgPricePaid)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Price Simulator */}
          {showSimulator && (
            <div>
              <div style={{
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Calculator size={14} />
                Price Simulator
              </div>

              <div style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start'
              }}>
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    value={simulatedPrice}
                    onChange={(e) => setSimulatedPrice(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSimulate()}
                    placeholder="Enter price to simulate..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: '14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      outline: 'none'
                    }}
                  />
                </div>
                <button
                  onClick={handleSimulate}
                  disabled={simulating || !simulatedPrice}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: simulating ? '#9ca3af' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: simulating ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {simulating && <RefreshCw size={14} className="animate-spin" />}
                  Calculate
                </button>
              </div>

              {/* Simulation Result */}
              {simulationResult && (
                <div style={{
                  marginTop: '12px',
                  padding: '16px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '16px',
                    marginBottom: simulationResult.hasViolations ? '12px' : 0
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>Margin</div>
                      <div style={{
                        fontSize: '18px',
                        fontWeight: '700',
                        color: simulationResult.meetsMinMargin ? '#15803d' : '#dc2626'
                      }}>
                        {formatPercent(simulationResult.marginPercent)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>Markup</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937' }}>
                        {formatPercent(simulationResult.markupPercent)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>Profit</div>
                      <div style={{
                        fontSize: '18px',
                        fontWeight: '700',
                        color: simulationResult.profitCents > 0 ? '#15803d' : '#dc2626'
                      }}>
                        {formatCurrency(simulationResult.profitCents)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>MSRP Discount</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#1f2937' }}>
                        {simulationResult.discountFromMsrp ? formatPercent(simulationResult.discountFromMsrp) : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Simulation Violations */}
                  {simulationResult.hasViolations && (
                    <ViolationAlert violations={simulationResult.violations} />
                  )}

                  {/* Status badges */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: simulationResult.meetsMinMargin ? '#d1fae5' : '#fef2f2',
                      color: simulationResult.meetsMinMargin ? '#065f46' : '#991b1b',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '500'
                    }}>
                      {simulationResult.meetsMinMargin ? 'Meets Min Margin' : 'Below Min Margin'}
                    </span>
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: simulationResult.meetsTargetMargin ? '#d1fae5' : '#fef3c7',
                      color: simulationResult.meetsTargetMargin ? '#065f46' : '#92400e',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '500'
                    }}>
                      {simulationResult.meetsTargetMargin ? 'Meets Target' : 'Below Target'}
                    </span>
                    {!simulationResult.hasViolations && (
                      <span style={{
                        padding: '4px 10px',
                        backgroundColor: '#d1fae5',
                        color: '#065f46',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}>
                        <CheckCircle size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                        No Violations
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PricingPanel;
