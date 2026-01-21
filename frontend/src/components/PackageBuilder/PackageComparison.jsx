/**
 * PackageComparison - Side-by-side tier comparison view
 * Shows feature matrix, price differences, and helps users decide
 */
import React from 'react';

const tierConfig = {
  good: { name: 'Good', color: '#10b981', bgColor: '#d1fae5', icon: '👍' },
  better: { name: 'Better', color: '#3b82f6', bgColor: '#dbeafe', icon: '⭐' },
  best: { name: 'Best', color: '#8b5cf6', bgColor: '#ede9fe', icon: '💎' }
};

const PackageComparison = ({
  packages,
  onSelectTier,
  selectedTier,
  onClose
}) => {
  if (!packages) return null;

  const tiers = ['good', 'better', 'best'];

  // Extract all unique feature categories
  const getFeatureCategories = () => {
    const categories = new Set();
    tiers.forEach(tier => {
      const pkg = packages[tier];
      if (pkg?.items) {
        pkg.items.forEach(item => {
          const slot = item.slot_label || item.slot || item.product?.category || 'Item';
          categories.add(slot);
        });
      }
    });
    return Array.from(categories);
  };

  const categories = getFeatureCategories();

  // Get product for a tier and category
  const getProduct = (tier, category) => {
    const pkg = packages[tier];
    if (!pkg?.items) return null;
    const item = pkg.items.find(i =>
      (i.slot_label || i.slot || i.product?.category) === category
    );
    return item?.product || item;
  };

  // Calculate total price for a tier
  const getTierTotal = (tier) => {
    const pkg = packages[tier];
    if (!pkg?.items) return 0;
    return pkg.items.reduce((sum, item) => {
      const price = item.product?.msrp_cents || item.msrp_cents || 0;
      return sum + price;
    }, 0);
  };

  // Calculate price difference between tiers
  const getPriceDiff = (fromTier, toTier) => {
    return (getTierTotal(toTier) - getTierTotal(fromTier)) / 100;
  };

  // Format price
  const formatPrice = (cents) => {
    return `$${(cents / 100).toLocaleString()}`;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '1000px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
              Compare Packages
            </h2>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>
              Side-by-side comparison of your options
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '8px'
            }}
          >
            ×
          </button>
        </div>

        {/* Comparison Table */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px'
          }}>
            <thead>
              <tr>
                <th style={{
                  textAlign: 'left',
                  padding: '12px 16px',
                  borderBottom: '2px solid #e5e7eb',
                  backgroundColor: '#f9fafb',
                  fontWeight: '600',
                  color: '#374151',
                  width: '140px'
                }}>
                  Feature
                </th>
                {tiers.map(tier => {
                  const config = tierConfig[tier];
                  const isSelected = selectedTier === tier;
                  return (
                    <th
                      key={tier}
                      style={{
                        textAlign: 'center',
                        padding: '12px 16px',
                        borderBottom: '2px solid #e5e7eb',
                        backgroundColor: isSelected ? config.bgColor : '#f9fafb',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onClick={() => onSelectTier(tier)}
                    >
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <span style={{ fontSize: '24px' }}>{config.icon}</span>
                        <span style={{
                          fontWeight: 'bold',
                          color: config.color,
                          fontSize: '16px'
                        }}>
                          {config.name}
                        </span>
                        {isSelected && (
                          <span style={{
                            backgroundColor: config.color,
                            color: 'white',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: 'bold'
                          }}>
                            SELECTED
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Price Row */}
              <tr>
                <td style={{
                  padding: '16px',
                  borderBottom: '1px solid #e5e7eb',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  💰 Total Price
                </td>
                {tiers.map(tier => {
                  const config = tierConfig[tier];
                  const total = getTierTotal(tier);
                  const isSelected = selectedTier === tier;
                  return (
                    <td
                      key={tier}
                      style={{
                        textAlign: 'center',
                        padding: '16px',
                        borderBottom: '1px solid #e5e7eb',
                        backgroundColor: isSelected ? `${config.bgColor}50` : 'white'
                      }}
                    >
                      <div style={{
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: config.color
                      }}>
                        {formatPrice(total)}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Price Difference Row */}
              <tr>
                <td style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #e5e7eb',
                  color: '#6b7280',
                  fontSize: '13px'
                }}>
                  Upgrade Cost
                </td>
                <td style={{
                  textAlign: 'center',
                  padding: '12px 16px',
                  borderBottom: '1px solid #e5e7eb',
                  color: '#6b7280'
                }}>
                  —
                </td>
                <td style={{
                  textAlign: 'center',
                  padding: '12px 16px',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  <span style={{
                    color: '#f59e0b',
                    fontWeight: '600'
                  }}>
                    +${getPriceDiff('good', 'better').toLocaleString()}
                  </span>
                  <span style={{
                    display: 'block',
                    fontSize: '11px',
                    color: '#9ca3af'
                  }}>
                    from Good
                  </span>
                </td>
                <td style={{
                  textAlign: 'center',
                  padding: '12px 16px',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  <span style={{
                    color: '#f59e0b',
                    fontWeight: '600'
                  }}>
                    +${getPriceDiff('better', 'best').toLocaleString()}
                  </span>
                  <span style={{
                    display: 'block',
                    fontSize: '11px',
                    color: '#9ca3af'
                  }}>
                    from Better
                  </span>
                </td>
              </tr>

              {/* Product Rows */}
              {categories.map(category => (
                <tr key={category}>
                  <td style={{
                    padding: '16px',
                    borderBottom: '1px solid #e5e7eb',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    {category}
                  </td>
                  {tiers.map(tier => {
                    const product = getProduct(tier, category);
                    const config = tierConfig[tier];
                    const isSelected = selectedTier === tier;
                    return (
                      <td
                        key={tier}
                        style={{
                          textAlign: 'center',
                          padding: '12px',
                          borderBottom: '1px solid #e5e7eb',
                          backgroundColor: isSelected ? `${config.bgColor}50` : 'white'
                        }}
                      >
                        {product ? (
                          <div>
                            <div style={{
                              fontWeight: '600',
                              color: '#111827',
                              marginBottom: '2px'
                            }}>
                              {product.manufacturer || 'Unknown'}
                            </div>
                            <div style={{
                              fontSize: '12px',
                              color: '#6b7280',
                              marginBottom: '4px'
                            }}>
                              {product.model || 'N/A'}
                            </div>
                            <div style={{
                              fontWeight: '600',
                              color: config.color
                            }}>
                              {formatPrice(product.msrp_cents || 0)}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#d1d5db' }}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Brand Cohesion Row */}
              <tr>
                <td style={{
                  padding: '16px',
                  borderBottom: '1px solid #e5e7eb',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  🎯 Brand Cohesion
                </td>
                {tiers.map(tier => {
                  const pkg = packages[tier];
                  const score = pkg?.brand_cohesion_score;
                  const config = tierConfig[tier];
                  const isSelected = selectedTier === tier;
                  return (
                    <td
                      key={tier}
                      style={{
                        textAlign: 'center',
                        padding: '16px',
                        borderBottom: '1px solid #e5e7eb',
                        backgroundColor: isSelected ? `${config.bgColor}50` : 'white'
                      }}
                    >
                      {score !== undefined ? (
                        <div>
                          <div style={{
                            fontSize: '18px',
                            fontWeight: 'bold',
                            color: score === 100 ? '#10b981' : score >= 75 ? '#f59e0b' : '#6b7280'
                          }}>
                            {score}%
                          </div>
                          {score === 100 && (
                            <div style={{
                              fontSize: '11px',
                              color: '#10b981',
                              fontWeight: '500'
                            }}>
                              Perfect Match!
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#d1d5db' }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f9fafb'
        }}>
          <div style={{ color: '#6b7280', fontSize: '14px' }}>
            {selectedTier ? (
              <span>
                Selected: <strong style={{ color: tierConfig[selectedTier].color }}>
                  {tierConfig[selectedTier].name}
                </strong> — {formatPrice(getTierTotal(selectedTier))}
              </span>
            ) : (
              'Click a column to select a package'
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px',
                backgroundColor: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Back to Cards
            </button>
            {selectedTier && (
              <button
                onClick={() => {
                  onSelectTier(selectedTier);
                  onClose();
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: tierConfig[selectedTier].color,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Confirm {tierConfig[selectedTier].name} Package
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PackageComparison;
