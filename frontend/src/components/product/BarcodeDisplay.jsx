import React, { useRef, useEffect, useState } from 'react';
import JsBarcode from 'jsbarcode';

/**
 * BarcodeDisplay - Renders a UPC/EAN barcode as SVG with format info and PNG download.
 *
 * Props:
 *   upc (string)            - UPC/EAN barcode number
 *   barcodeFormats (string)  - Raw format string from API, e.g. "UPC-A 196641097995, EAN-13 0196641097995"
 *   productId (number)       - Product ID for PNG download endpoint
 *   compact (boolean)        - Compact mode for inline previews (default false)
 */
const BarcodeDisplay = ({ upc, barcodeFormats, productId, compact = false }) => {
  const svgRef = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!upc || !svgRef.current) return;
    try {
      // Determine format: 13 digits = EAN-13, 12 digits = UPC-A
      const format = upc.length === 13 ? 'EAN13' : 'UPC';
      JsBarcode(svgRef.current, upc, {
        format,
        width: compact ? 1.5 : 2,
        height: compact ? 40 : 60,
        displayValue: true,
        fontSize: compact ? 12 : 14,
        margin: compact ? 5 : 10,
        background: '#ffffff',
      });
      setError(false);
    } catch {
      setError(true);
    }
  }, [upc, compact]);

  if (!upc) return null;

  // Parse barcode formats string into array
  const formats = barcodeFormats
    ? barcodeFormats.split(',').map(f => f.trim()).filter(Boolean)
    : [`UPC-A ${upc}`];

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '10px',
      padding: compact ? '12px' : '20px',
      textAlign: 'center',
    }}>
      {!compact && (
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#374151',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          Barcode
        </div>
      )}

      {/* SVG Barcode */}
      {error ? (
        <div style={{ color: '#9ca3af', fontSize: '13px', padding: '20px 0' }}>
          Unable to render barcode
        </div>
      ) : (
        <svg ref={svgRef} style={{ maxWidth: '100%' }} />
      )}

      {/* Barcode Formats */}
      {!compact && formats.length > 0 && (
        <div style={{
          marginTop: '12px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          justifyContent: 'center',
        }}>
          {formats.map((fmt, i) => (
            <span key={i} style={{
              display: 'inline-block',
              padding: '3px 10px',
              background: '#f3f4f6',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#6b7280',
              fontFamily: 'monospace',
            }}>
              {fmt}
            </span>
          ))}
        </div>
      )}

      {/* Download PNG Button */}
      {!compact && productId && (
        <a
          href={`/api/products/${productId}/barcode.png?scale=4`}
          download={`barcode-${upc}.png`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '12px',
            padding: '6px 14px',
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#6b7280',
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          Download PNG
        </a>
      )}
    </div>
  );
};

export default BarcodeDisplay;
