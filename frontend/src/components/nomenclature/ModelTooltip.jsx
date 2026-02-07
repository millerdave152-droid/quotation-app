import { authFetch } from '../../services/authFetch';
/**
 * ModelTooltip.jsx
 * Hover/click tooltip for model numbers showing quick decode
 * Use: Wrap any model number text with this component
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const ModelTooltip = ({ children, modelNumber, manufacturer, productName, category, style = {} }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [decodeData, setDecodeData] = useState(null);
  const [decodeError, setDecodeError] = useState(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const cacheRef = useRef({});

  // Fetch decode data
  const fetchDecode = useCallback(async () => {
    const cacheKey = `${modelNumber}-${manufacturer || ''}`;

    // Check cache first
    if (cacheRef.current[cacheKey]) {
      const cached = cacheRef.current[cacheKey];
      if (cached.error) {
        setDecodeError(cached.error);
      } else {
        setDecodeData(cached);
      }
      return;
    }

    try {
      setIsLoading(true);
      setDecodeError(null);
      const token = localStorage.getItem('auth_token');
      const url = manufacturer
        ? `${API_BASE}/api/nomenclature/decode/${encodeURIComponent(modelNumber)}?manufacturer=${encodeURIComponent(manufacturer)}`
        : `${API_BASE}/api/nomenclature/decode/${encodeURIComponent(modelNumber)}`;

      const response = await authFetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setDecodeData(data.data);
          cacheRef.current[cacheKey] = data.data;
        } else {
          // Store the error/partial match info
          const errorInfo = {
            error: data.error || 'No decode rules available',
            manufacturer: data.manufacturer || manufacturer,
            partialMatch: data.partialMatch
          };
          setDecodeError(errorInfo);
          cacheRef.current[cacheKey] = { error: errorInfo };
        }
      } else {
        setDecodeError({ error: 'Failed to fetch decode data' });
      }
    } catch (err) {
      console.error('Error fetching decode:', err);
      setDecodeError({ error: 'Network error' });
    } finally {
      setIsLoading(false);
    }
  }, [modelNumber, manufacturer]);

  // Calculate tooltip position
  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 200;

    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX + (rect.width / 2) - (tooltipWidth / 2);

    // Adjust if tooltip would go off-screen
    if (left < 8) left = 8;
    if (left + tooltipWidth > window.innerWidth - 8) {
      left = window.innerWidth - tooltipWidth - 8;
    }

    // Show above if not enough space below
    if (top + tooltipHeight > window.innerHeight + window.scrollY - 8) {
      top = rect.top + window.scrollY - tooltipHeight - 8;
    }

    setPosition({ top, left });
  }, []);

  // Handle mouse enter
  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      calculatePosition();
      if (!decodeData) {
        fetchDecode();
      }
    }, 300); // Delay before showing tooltip
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsVisible(false);
  };

  // Handle click (for mobile)
  const handleClick = (e) => {
    e.stopPropagation();
    if (!isVisible) {
      setIsVisible(true);
      calculatePosition();
      if (!decodeData) {
        fetchDecode();
      }
    } else {
      setIsVisible(false);
    }
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isVisible &&
          triggerRef.current && !triggerRef.current.contains(e.target) &&
          tooltipRef.current && !tooltipRef.current.contains(e.target)) {
        setIsVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Tooltip content
  const renderTooltip = () => {
    if (!isVisible) return null;

    return createPortal(
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute',
          top: position.top,
          left: position.left,
          width: '320px',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          border: '1px solid #e5e7eb',
          zIndex: 10000,
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease'
        }}
        onMouseEnter={() => clearTimeout(hoverTimeoutRef.current)}
        onMouseLeave={handleMouseLeave}
      >
        {/* Header */}
        <div style={{
          backgroundColor: '#1f2937',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{
            fontFamily: 'monospace',
            fontSize: '16px',
            fontWeight: '700',
            color: 'white',
            letterSpacing: '1px'
          }}>
            {modelNumber}
          </span>
          {decodeData && (
            <span style={{
              fontSize: '11px',
              padding: '2px 8px',
              backgroundColor: decodeData.confidence >= 80 ? '#059669' : '#d97706',
              color: 'white',
              borderRadius: '10px'
            }}>
              {decodeData.confidence}% match
            </span>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '12px 16px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
              <div style={{
                width: '24px',
                height: '24px',
                border: '3px solid #e5e7eb',
                borderTopColor: '#4f46e5',
                borderRadius: '50%',
                margin: '0 auto 8px',
                animation: 'spin 1s linear infinite'
              }} />
              Decoding...
            </div>
          ) : decodeData && decodeData.breakdown ? (
            <>
              {/* Brand/Type */}
              <div style={{
                fontSize: '12px',
                color: '#6b7280',
                marginBottom: '12px'
              }}>
                {decodeData.manufacturer} {decodeData.productType}
              </div>

              {/* Quick breakdown - first 4 segments */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {decodeData.breakdown.slice(0, 4).map((segment, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                  >
                    <span style={{
                      minWidth: '40px',
                      fontFamily: 'monospace',
                      fontWeight: '700',
                      color: segment.matched ? (segment.color || '#4f46e5') : '#9ca3af',
                      backgroundColor: segment.matched ? `${segment.color || '#4f46e5'}15` : '#f3f4f6',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      textAlign: 'center'
                    }}>
                      {segment.code}
                    </span>
                    <span style={{
                      fontSize: '13px',
                      color: segment.matched ? '#374151' : '#9ca3af',
                      fontStyle: segment.matched ? 'normal' : 'italic'
                    }}>
                      {segment.matched ? segment.meaning : `${segment.segment} (no data)`}
                    </span>
                  </div>
                ))}
                {decodeData.breakdown.length > 4 && (
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    fontStyle: 'italic'
                  }}>
                    +{decodeData.breakdown.length - 4} more segments...
                  </div>
                )}
              </div>
            </>
          ) : (
            // Show product info even when decode fails
            <div style={{ padding: '4px 0' }}>
              {/* Show manufacturer if available */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px'
              }}>
                <span style={{
                  padding: '4px 10px',
                  backgroundColor: '#dbeafe',
                  color: '#1e40af',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  {manufacturer || decodeError?.manufacturer || 'Unknown Brand'}
                </span>
                {category && (
                  <span style={{
                    padding: '4px 10px',
                    backgroundColor: '#fef3c7',
                    color: '#92400e',
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}>
                    {category}
                  </span>
                )}
              </div>

              {/* Product name if available */}
              {productName && (
                <div style={{
                  fontSize: '13px',
                  color: '#374151',
                  marginBottom: '12px',
                  lineHeight: '1.4'
                }}>
                  {productName}
                </div>
              )}

              {/* Info message */}
              <div style={{
                fontSize: '12px',
                color: '#6b7280',
                backgroundColor: '#f9fafb',
                padding: '10px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}>
                <span style={{ fontSize: '16px' }}>i</span>
                <div>
                  <div style={{ fontWeight: '500', marginBottom: '2px' }}>Decode rules not available</div>
                  <div style={{ fontSize: '11px' }}>
                    Visit Training Center to add nomenclature data for this brand.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          backgroundColor: '#f9fafb',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            Click for full breakdown
          </span>
          <a
            href="/training-center"
            style={{
              fontSize: '12px',
              color: '#4f46e5',
              textDecoration: 'none',
              fontWeight: '500'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            Training Center
          </a>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{
          cursor: 'pointer',
          borderBottom: '1px dashed #9ca3af',
          ...style
        }}
      >
        {children || modelNumber}
      </span>
      {renderTooltip()}

      {/* Inline keyframe animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default ModelTooltip;
