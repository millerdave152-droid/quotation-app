import React, { useEffect, useRef, useState } from 'react';
import '@google/model-viewer';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

/**
 * Product3DViewer - Interactive 3D model viewer using Google model-viewer
 *
 * Features:
 * - WebGL-based 3D rendering
 * - AR Quick Look support (iOS)
 * - Material/color switching
 * - Hotspot annotations
 * - Camera controls
 */
const Product3DViewer = ({
  productId,
  modelUrl,
  modelData,
  onMaterialChange,
  onConfigurationSave,
  showControls = true,
  showMaterials = true,
  showHotspots = true,
  showARButton = true,
  height = '400px',
  autoRotate = false,
  compact = false
}) => {
  const modelViewerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [model, setModel] = useState(modelData || null);
  const [selectedMaterials, setSelectedMaterials] = useState({});
  const [activeHotspot, setActiveHotspot] = useState(null);

  // Fetch model data if not provided
  useEffect(() => {
    if (modelData) {
      setModel(modelData);
      setLoading(false);
      return;
    }

    if (productId) {
      fetchModelData();
    } else if (modelUrl) {
      setModel({ model_url: modelUrl });
      setLoading(false);
    }
  }, [productId, modelUrl, modelData]);

  const fetchModelData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/product-3d/${productId}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError('No 3D model available for this product');
        } else {
          throw new Error('Failed to load 3D model');
        }
        return;
      }
      const data = await response.json();
      setModel(data);
    } catch (err) {
      console.error('Error fetching 3D model:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle material change
  const handleMaterialSelect = async (category, material) => {
    const newSelection = { ...selectedMaterials, [category]: material };
    setSelectedMaterials(newSelection);

    // Apply material to model-viewer if it supports it
    if (modelViewerRef.current && material.base_color_hex) {
      // Note: Actual material application requires model with named materials
      // This is a simplified example
      console.log('Applied material:', material.display_name);
    }

    if (onMaterialChange) {
      onMaterialChange(newSelection);
    }
  };

  // Handle hotspot click
  const handleHotspotClick = (hotspot) => {
    setActiveHotspot(activeHotspot?.id === hotspot.id ? null : hotspot);
  };

  // Render loading state
  if (loading) {
    return (
      <div style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f3f4f6',
        borderRadius: '12px'
      }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>Loading 3D Model...</div>
        </div>
      </div>
    );
  }

  // Render error state
  if (error || !model) {
    return (
      <div style={{
        height: compact ? '200px' : height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        borderRadius: '12px',
        border: '1px dashed #d1d5db'
      }}>
        <div style={{ textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>3D</div>
          <div style={{ fontSize: '14px' }}>{error || 'No 3D model available'}</div>
        </div>
      </div>
    );
  }

  // Group materials by category
  const materialsByCategory = (model.materials || []).reduce((acc, mat) => {
    const cat = mat.category || 'default';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mat);
    return acc;
  }, {});

  const containerStyle = {
    position: 'relative',
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#f9fafb'
  };

  const viewerStyle = {
    width: '100%',
    height,
    backgroundColor: '#f0f0f0'
  };

  const controlsStyle = {
    position: 'absolute',
    bottom: '16px',
    left: '16px',
    right: '16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    pointerEvents: 'none'
  };

  const buttonStyle = {
    padding: '8px 16px',
    backgroundColor: 'rgba(255,255,255,0.95)',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  };

  return (
    <div style={containerStyle}>
      {/* model-viewer Web Component */}
      <model-viewer
        ref={modelViewerRef}
        src={model.model_url?.startsWith('http') ? model.model_url : `http://localhost:3001${model.model_url}`}
        ios-src={model.usdz_url}
        poster={model.poster_url}
        alt={`3D model of ${model.product_model || 'product'}`}
        camera-controls
        touch-action="pan-y"
        auto-rotate={autoRotate || undefined}
        camera-orbit={model.camera_orbit || '0deg 75deg 105%'}
        camera-target={model.camera_target || '0m 0m 0m'}
        field-of-view={model.field_of_view || '30deg'}
        min-camera-orbit={model.min_camera_orbit || 'auto auto auto'}
        max-camera-orbit={model.max_camera_orbit || 'auto auto auto'}
        exposure={model.exposure || 1}
        shadow-intensity={model.shadow_intensity || 1}
        shadow-softness={model.shadow_softness || 1}
        environment-image={model.environment_image || 'neutral'}
        ar
        ar-modes="webxr scene-viewer quick-look"
        ar-scale={model.ar_scale || 'auto'}
        ar-placement={model.ar_placement || 'floor'}
        style={viewerStyle}
        loading="eager"
        reveal="auto"
      >
        {/* Hotspots */}
        {showHotspots && (model.hotspots || []).map((hotspot) => (
          <button
            key={hotspot.id}
            className="hotspot"
            slot={`hotspot-${hotspot.id}`}
            data-position={`${hotspot.position_x}m ${hotspot.position_y}m ${hotspot.position_z}m`}
            data-normal={`${hotspot.normal_x} ${hotspot.normal_y} ${hotspot.normal_z}`}
            onClick={() => handleHotspotClick(hotspot)}
            style={{
              backgroundColor: activeHotspot?.id === hotspot.id ? '#6366f1' : '#fff',
              color: activeHotspot?.id === hotspot.id ? '#fff' : '#1a1a2e',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}
          >
            i
          </button>
        ))}

        {/* Progress bar */}
        <div className="progress-bar" slot="progress-bar" style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '4px',
          backgroundColor: '#6366f1'
        }}>
          <div className="update-bar" style={{
            backgroundColor: '#818cf8',
            height: '100%'
          }} />
        </div>

        {/* AR Button */}
        {showARButton && (
          <button
            slot="ar-button"
            style={{
              position: 'absolute',
              bottom: '16px',
              right: '16px',
              padding: '10px 20px',
              backgroundColor: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
            }}
          >
            View in AR
          </button>
        )}
      </model-viewer>

      {/* Controls Overlay */}
      {showControls && !compact && (
        <div style={controlsStyle}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={buttonStyle}
              onClick={() => {
                if (modelViewerRef.current) {
                  modelViewerRef.current.resetTurntableRotation();
                  modelViewerRef.current.jumpCameraToGoal();
                }
              }}
            >
              Reset View
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={buttonStyle}
              onClick={() => {
                if (modelViewerRef.current) {
                  // Toggle fullscreen
                  if (document.fullscreenElement) {
                    document.exitFullscreen();
                  } else {
                    modelViewerRef.current.requestFullscreen();
                  }
                }
              }}
            >
              Fullscreen
            </button>
          </div>
        </div>
      )}

      {/* Materials Panel */}
      {showMaterials && Object.keys(materialsByCategory).length > 0 && (
        <div style={{
          padding: '16px',
          backgroundColor: '#fff',
          borderTop: '1px solid #e5e7eb'
        }}>
          {Object.entries(materialsByCategory).map(([category, materials]) => (
            <div key={category} style={{ marginBottom: '12px' }}>
              <div style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                marginBottom: '8px'
              }}>
                {category}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {materials.map((mat) => (
                  <button
                    key={mat.id}
                    onClick={() => handleMaterialSelect(category, mat)}
                    title={mat.display_name || mat.material_name}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      border: selectedMaterials[category]?.id === mat.id
                        ? '2px solid #6366f1'
                        : '2px solid #e5e7eb',
                      backgroundColor: mat.base_color_hex || '#f3f4f6',
                      backgroundImage: mat.swatch_url ? `url(${mat.swatch_url})` : 'none',
                      backgroundSize: 'cover',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hotspot Detail Panel */}
      {activeHotspot && (
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          width: '250px',
          padding: '16px',
          backgroundColor: 'rgba(255,255,255,0.98)',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
          }}>
            <div style={{ fontWeight: '600', fontSize: '14px', color: '#1a1a2e' }}>
              {activeHotspot.label}
            </div>
            <button
              onClick={() => setActiveHotspot(null)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: '#9ca3af'
              }}
            >
              x
            </button>
          </div>
          {activeHotspot.description && (
            <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
              {activeHotspot.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Product3DViewer;
