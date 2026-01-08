import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import PropTypes from 'prop-types';

/**
 * SignaturePad - A reusable signature capture component
 *
 * Features:
 * - High-DPI canvas support
 * - Stroke-based drawing with undo
 * - Touch and mouse support
 * - Export as PNG base64
 */
const SignaturePad = forwardRef(({
  width = 400,
  height = 200,
  strokeColor = '#1a1a2e',
  strokeWidth = 2,
  backgroundColor = '#ffffff',
  showControls = true,
  onChange,
  disabled = false,
  className = '',
  style = {},
  label = 'Sign here',
  showLabel = true
}, ref) => {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState([]); // Array of strokes for undo
  const [currentStroke, setCurrentStroke] = useState([]); // Current stroke points
  const [isEmpty, setIsEmpty] = useState(true);

  // Initialize canvas with high-DPI support
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;

    // Set display size
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Set actual size in memory (scaled for high DPI)
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Set drawing styles
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;

    contextRef.current = ctx;

    // Draw background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Redraw existing strokes
    redrawStrokes();
  }, [width, height, strokeColor, strokeWidth, backgroundColor]);

  // Redraw all strokes on the canvas
  const redrawStrokes = useCallback(() => {
    const ctx = contextRef.current;
    if (!ctx) return;

    // Clear and redraw background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Redraw all strokes
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;

    strokes.forEach(stroke => {
      if (stroke.length < 2) return;

      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);

      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    });
  }, [strokes, backgroundColor, strokeColor, strokeWidth, width, height]);

  // Redraw when strokes change
  useEffect(() => {
    redrawStrokes();
  }, [strokes, redrawStrokes]);

  // Get coordinates from event (supports both mouse and touch)
  const getCoordinates = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    if (event.touches && event.touches.length > 0) {
      return {
        x: event.touches[0].clientX - rect.left,
        y: event.touches[0].clientY - rect.top
      };
    }

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  // Start drawing
  const startDrawing = (event) => {
    if (disabled) return;

    event.preventDefault();
    const coords = getCoordinates(event);

    setIsDrawing(true);
    setCurrentStroke([coords]);

    const ctx = contextRef.current;
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
  };

  // Continue drawing
  const draw = (event) => {
    if (!isDrawing || disabled) return;

    event.preventDefault();
    const coords = getCoordinates(event);

    setCurrentStroke(prev => [...prev, coords]);

    const ctx = contextRef.current;
    if (ctx) {
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }
  };

  // Stop drawing
  const stopDrawing = (event) => {
    if (!isDrawing) return;

    event?.preventDefault();
    setIsDrawing(false);

    if (currentStroke.length > 0) {
      const newStrokes = [...strokes, currentStroke];
      setStrokes(newStrokes);
      setCurrentStroke([]);
      setIsEmpty(false);

      // Notify parent of change
      if (onChange) {
        const dataUrl = canvasRef.current?.toDataURL('image/png');
        onChange(dataUrl);
      }
    }
  };

  // Clear the canvas
  const clear = useCallback(() => {
    setStrokes([]);
    setCurrentStroke([]);
    setIsEmpty(true);

    const ctx = contextRef.current;
    if (ctx) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    if (onChange) {
      onChange(null);
    }
  }, [backgroundColor, width, height, onChange]);

  // Undo last stroke
  const undo = useCallback(() => {
    if (strokes.length === 0) return;

    const newStrokes = strokes.slice(0, -1);
    setStrokes(newStrokes);
    setIsEmpty(newStrokes.length === 0);

    if (onChange) {
      if (newStrokes.length === 0) {
        onChange(null);
      } else {
        // Need to redraw and get new data URL after state updates
        setTimeout(() => {
          const dataUrl = canvasRef.current?.toDataURL('image/png');
          onChange(dataUrl);
        }, 0);
      }
    }
  }, [strokes, onChange]);

  // Check if canvas is empty
  const checkIsEmpty = useCallback(() => {
    return strokes.length === 0;
  }, [strokes]);

  // Get canvas as data URL
  const toDataURL = useCallback((type = 'image/png') => {
    return canvasRef.current?.toDataURL(type) || null;
  }, []);

  // Get strokes data
  const getStrokes = useCallback(() => {
    return strokes;
  }, [strokes]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    clear,
    undo,
    isEmpty: checkIsEmpty,
    toDataURL,
    getStrokes
  }), [clear, undo, checkIsEmpty, toDataURL, getStrokes]);

  const containerStyle = {
    display: 'inline-block',
    ...style
  };

  const canvasContainerStyle = {
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: backgroundColor,
    position: 'relative'
  };

  const canvasStyle = {
    display: 'block',
    cursor: disabled ? 'not-allowed' : 'crosshair',
    touchAction: 'none', // Prevent scrolling while drawing
    opacity: disabled ? 0.6 : 1
  };

  const labelStyle = {
    position: 'absolute',
    bottom: '8px',
    left: '50%',
    transform: 'translateX(-50%)',
    color: '#9ca3af',
    fontSize: '12px',
    pointerEvents: 'none',
    opacity: isEmpty ? 1 : 0,
    transition: 'opacity 0.2s'
  };

  const controlsStyle = {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
    justifyContent: 'flex-end'
  };

  const buttonStyle = {
    padding: '6px 12px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#fff',
    color: '#374151',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.15s'
  };

  const buttonHoverStyle = {
    backgroundColor: '#f3f4f6'
  };

  return (
    <div style={containerStyle} className={className}>
      <div style={canvasContainerStyle}>
        <canvas
          ref={canvasRef}
          style={canvasStyle}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {showLabel && (
          <div style={labelStyle}>
            {label}
          </div>
        )}
      </div>

      {showControls && (
        <div style={controlsStyle}>
          <button
            type="button"
            style={buttonStyle}
            onClick={undo}
            disabled={disabled || strokes.length === 0}
            onMouseOver={(e) => Object.assign(e.target.style, buttonHoverStyle)}
            onMouseOut={(e) => Object.assign(e.target.style, buttonStyle)}
          >
            <span>↩</span> Undo
          </button>
          <button
            type="button"
            style={{
              ...buttonStyle,
              backgroundColor: '#fee2e2',
              borderColor: '#fecaca',
              color: '#dc2626'
            }}
            onClick={clear}
            disabled={disabled || strokes.length === 0}
          >
            <span>✕</span> Clear
          </button>
        </div>
      )}
    </div>
  );
});

SignaturePad.displayName = 'SignaturePad';

SignaturePad.propTypes = {
  width: PropTypes.number,
  height: PropTypes.number,
  strokeColor: PropTypes.string,
  strokeWidth: PropTypes.number,
  backgroundColor: PropTypes.string,
  showControls: PropTypes.bool,
  onChange: PropTypes.func,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object,
  label: PropTypes.string,
  showLabel: PropTypes.bool
};

export default SignaturePad;
