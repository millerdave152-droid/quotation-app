import React, { useState, useEffect, useCallback } from 'react';
import Product3DViewer from './Product3DViewer';

import { authFetch } from '../../services/authFetch';
const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

/**
 * ProductConfigurator3D - Full-screen modal for configuring products in 3D
 *
 * Features:
 * - Interactive 3D viewer
 * - Material/finish selection with real-time preview
 * - Configuration saving
 * - Price calculation
 * - AR viewing
 */
const ProductConfigurator3D = ({
  product,
  onClose,
  onSaveConfiguration,
  initialConfiguration = null
}) => {
  const [modelData, setModelData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMaterials, setSelectedMaterials] = useState({});
  const [priceAdjustment, setPriceAdjustment] = useState(0);
  const [leadTime, setLeadTime] = useState(0);
  const [saving, setSaving] = useState(false);

  // Fetch model data
  useEffect(() => {
    if (product?.id) {
      fetchModelData();
    }
  }, [product?.id]);

  const fetchModelData = async () => {
    try {
      setLoading(true);
      const response = await authFetch(`${API_URL}/product-3d/${product.id}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('No 3D model available for this product');
        } else {
          throw new Error('Failed to load 3D model');
        }
        return;
      }

      const data = await response.json();
      setModelData(data);

      // Load initial configuration if provided
      if (initialConfiguration) {
        setSelectedMaterials(initialConfiguration.materials || {});
      }
    } catch (err) {
      console.error('Error fetching 3D model:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate price when materials change
  useEffect(() => {
    if (Object.keys(selectedMaterials).length > 0) {
      calculatePrice();
    }
  }, [selectedMaterials]);

  const calculatePrice = async () => {
    try {
      const materialIds = Object.values(selectedMaterials).map(m => m.id);
      const response = await authFetch(`${API_URL}/product-3d/${product.id}/calculate-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_materials: materialIds })
      });

      if (response.ok) {
        const data = await response.json();
        setPriceAdjustment(data.adjustment_cents / 100);
        setLeadTime(data.lead_time_days);
      }
    } catch (err) {
      console.error('Error calculating price:', err);
    }
  };

  const handleMaterialChange = useCallback((materials) => {
    setSelectedMaterials(materials);
  }, []);

  const handleSave = async () => {
    if (!onSaveConfiguration) return;

    setSaving(true);
    try {
      const configuration = {
        materials: selectedMaterials,
        price_adjustment: priceAdjustment,
        lead_time_days: leadTime
      };

      await onSaveConfiguration(configuration);
      onClose();
    } catch (err) {
      console.error('Error saving configuration:', err);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Group materials by category
  const materialsByCategory = (modelData?.materials || []).reduce((acc, mat) => {
    const cat = mat.category || 'default';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mat);
    return acc;
  }, {});

  const basePrice = parseFloat(product?.sell || product?.cost || 0);
  const totalPrice = basePrice + priceAdjustment;

  // Modal overlay style
  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px'
  };

  const modalStyle = {
    backgroundColor: '#fff',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '1200px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
  };

  const headerStyle = {
    padding: '20px 24px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  };

  const contentStyle = {
    display: 'flex',
    flex: 1,
    overflow: 'hidden'
  };

  const viewerPanelStyle = {
    flex: 2,
    backgroundColor: '#f9fafb',
    position: 'relative'
  };

  const configPanelStyle = {
    flex: 1,
    minWidth: '300px',
    maxWidth: '400px',
    padding: '24px',
    overflowY: 'auto',
    borderLeft: '1px solid #e5e7eb'
  };

  const footerStyle = {
    padding: '16px 24px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9fafb'
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a1a2e' }}>
              Configure: {product?.model || product?.name || 'Product'}
            </h2>
            <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>
              {product?.manufacturer} - {product?.category}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#9ca3af',
              padding: '4px 8px'
            }}
          >
            x
          </button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {/* 3D Viewer */}
          <div style={viewerPanelStyle}>
            {loading ? (
              <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{ textAlign: 'center', color: '#6b7280' }}>
                  <div style={{ fontSize: '24px', marginBottom: '12px' }}>Loading 3D Model...</div>
                </div>
              </div>
            ) : error ? (
              <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                  <div style={{ fontSize: '64px', marginBottom: '16px' }}>3D</div>
                  <div style={{ fontSize: '16px' }}>{error}</div>
                  <div style={{ fontSize: '14px', marginTop: '8px', color: '#6b7280' }}>
                    Upload a 3D model in Product Management to enable this feature
                  </div>
                </div>
              </div>
            ) : (
              <Product3DViewer
                modelData={modelData}
                height="100%"
                showControls={true}
                showMaterials={false}
                showHotspots={true}
                showARButton={true}
                autoRotate={false}
                onMaterialChange={handleMaterialChange}
              />
            )}
          </div>

          {/* Configuration Panel */}
          <div style={configPanelStyle}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '600', color: '#1a1a2e' }}>
              Customize Your Product
            </h3>

            {/* Material Categories */}
            {Object.entries(materialsByCategory).map(([category, materials]) => (
              <div key={category} style={{ marginBottom: '24px' }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '12px',
                  textTransform: 'capitalize'
                }}>
                  Select {category}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {materials.map((mat) => {
                    const isSelected = selectedMaterials[category]?.id === mat.id;
                    return (
                      <button
                        key={mat.id}
                        onClick={() => handleMaterialChange({ ...selectedMaterials, [category]: mat })}
                        style={{
                          width: '60px',
                          height: '60px',
                          borderRadius: '12px',
                          border: isSelected ? '3px solid #6366f1' : '2px solid #e5e7eb',
                          backgroundColor: mat.base_color_hex || '#f3f4f6',
                          backgroundImage: mat.swatch_url ? `url(${mat.swatch_url})` : 'none',
                          backgroundSize: 'cover',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          position: 'relative'
                        }}
                        title={mat.display_name || mat.material_name}
                      >
                        {isSelected && (
                          <div style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            width: '20px',
                            height: '20px',
                            backgroundColor: '#6366f1',
                            borderRadius: '50%',
                            color: '#fff',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            OK
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Show selected material name */}
                {selectedMaterials[category] && (
                  <div style={{
                    marginTop: '8px',
                    fontSize: '13px',
                    color: '#6b7280'
                  }}>
                    Selected: <strong>{selectedMaterials[category].display_name || selectedMaterials[category].material_name}</strong>
                    {selectedMaterials[category].price_adjustment_cents > 0 && (
                      <span style={{ color: '#059669', marginLeft: '8px' }}>
                        +${(selectedMaterials[category].price_adjustment_cents / 100).toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* No materials message */}
            {Object.keys(materialsByCategory).length === 0 && !loading && (
              <div style={{
                padding: '32px',
                textAlign: 'center',
                color: '#9ca3af',
                backgroundColor: '#f9fafb',
                borderRadius: '12px'
              }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>palette</div>
                <div style={{ fontSize: '14px' }}>
                  No customization options available for this product
                </div>
              </div>
            )}

            {/* Configuration Summary */}
            {Object.keys(selectedMaterials).length > 0 && (
              <div style={{
                marginTop: '24px',
                padding: '16px',
                backgroundColor: '#f0fdf4',
                borderRadius: '12px',
                border: '1px solid #86efac'
              }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#166534',
                  marginBottom: '12px'
                }}>
                  Configuration Summary
                </div>
                {Object.entries(selectedMaterials).map(([cat, mat]) => (
                  <div key={cat} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '13px',
                    color: '#166534',
                    marginBottom: '4px'
                  }}>
                    <span style={{ textTransform: 'capitalize' }}>{cat}:</span>
                    <span>{mat.display_name || mat.material_name}</span>
                  </div>
                ))}
                {leadTime > 0 && (
                  <div style={{
                    marginTop: '8px',
                    paddingTop: '8px',
                    borderTop: '1px solid #86efac',
                    fontSize: '12px',
                    color: '#166534'
                  }}>
                    Estimated lead time: {leadTime} days
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer with pricing */}
        <div style={footerStyle}>
          <div>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>Total Price</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a2e' }}>
                ${totalPrice.toFixed(2)}
              </span>
              {priceAdjustment > 0 && (
                <span style={{ fontSize: '14px', color: '#059669' }}>
                  (+${priceAdjustment.toFixed(2)} for customizations)
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '12px 24px',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            {onSaveConfiguration && (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6366f1',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1
                }}
              >
                {saving ? 'Saving...' : 'Apply Configuration'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductConfigurator3D;
