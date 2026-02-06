/**
 * TeleTime POS - Signature Canvas Component
 * Vanilla JS canvas drawing with touch and mouse support
 * No external dependencies - lightweight implementation
 */

import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';

/**
 * Convert strokes to SVG path data
 */
function strokesToSVG(strokes, width, height) {
  if (!strokes.length) return '';

  const paths = strokes.map(stroke => {
    if (stroke.points.length < 2) return '';

    let d = `M ${stroke.points[0].x.toFixed(1)} ${stroke.points[0].y.toFixed(1)}`;

    // Use quadratic curves for smooth lines
    for (let i = 1; i < stroke.points.length - 1; i++) {
      const xc = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
      const yc = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
      d += ` Q ${stroke.points[i].x.toFixed(1)} ${stroke.points[i].y.toFixed(1)} ${xc.toFixed(1)} ${yc.toFixed(1)}`;
    }

    // Connect to last point
    const last = stroke.points[stroke.points.length - 1];
    d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

    return d;
  }).filter(Boolean);

  if (!paths.length) return '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <path d="${paths.join(' ')}" fill="none" stroke="#1f2937" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

/**
 * Signature Canvas Component
 * Exposes methods via ref: clear(), isEmpty(), toSVG(), toPNG(), getStrokes()
 */
const SignatureCanvas = forwardRef(function SignatureCanvas({
  width = 600,
  height = 200,
  strokeColor = '#1f2937',
  strokeWidth = 2.5,
  backgroundColor = 'transparent',
  onStrokeStart,
  onStrokeEnd,
  onChange,
  className = '',
}, ref) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);
  const isDrawingRef = useRef(false);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set up high-DPI canvas
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;

    contextRef.current = ctx;

    // Clear canvas
    if (backgroundColor && backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }
  }, [width, height, strokeColor, strokeWidth, backgroundColor]);

  // Redraw all strokes
  const redraw = useCallback(() => {
    const ctx = contextRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    // Clear
    ctx.clearRect(0, 0, width, height);

    if (backgroundColor && backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }

    // Draw all strokes
    const allStrokes = [...strokesRef.current];
    if (currentStrokeRef.current) {
      allStrokes.push(currentStrokeRef.current);
    }

    allStrokes.forEach(stroke => {
      if (stroke.points.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = stroke.color || strokeColor;
      ctx.lineWidth = stroke.width || strokeWidth;

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length - 1; i++) {
        const xc = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
        const yc = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, xc, yc);
      }

      const last = stroke.points[stroke.points.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    });
  }, [width, height, strokeColor, strokeWidth, backgroundColor]);

  // Get point from event
  const getPoint = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    let clientX, clientY, pressure = 0.5;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      if (e.touches[0].force !== undefined && e.touches[0].force > 0) {
        pressure = e.touches[0].force;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
      if (e.pressure !== undefined && e.pressure > 0) {
        pressure = e.pressure;
      }
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      pressure,
      timestamp: Date.now(),
    };
  }, []);

  // Start drawing
  const handleStart = useCallback((e) => {
    e.preventDefault();
    const point = getPoint(e);
    if (!point) return;

    isDrawingRef.current = true;
    currentStrokeRef.current = {
      points: [point],
      color: strokeColor,
      width: strokeWidth,
    };

    onStrokeStart?.();
  }, [getPoint, strokeColor, strokeWidth, onStrokeStart]);

  // Continue drawing
  const handleMove = useCallback((e) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    e.preventDefault();

    const point = getPoint(e);
    if (!point) return;

    const lastPoint = currentStrokeRef.current.points[currentStrokeRef.current.points.length - 1];
    const distance = Math.sqrt(
      Math.pow(point.x - lastPoint.x, 2) + Math.pow(point.y - lastPoint.y, 2)
    );

    // Minimum distance threshold to reduce noise
    if (distance > 1.5) {
      currentStrokeRef.current.points.push(point);
      redraw();
    }
  }, [getPoint, redraw]);

  // End drawing
  const handleEnd = useCallback((e) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();

    if (currentStrokeRef.current && currentStrokeRef.current.points.length >= 2) {
      strokesRef.current.push(currentStrokeRef.current);
      onChange?.(strokesRef.current.length);
    }

    currentStrokeRef.current = null;
    isDrawingRef.current = false;
    redraw();
    onStrokeEnd?.();
  }, [redraw, onChange, onStrokeEnd]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    /**
     * Clear all strokes
     */
    clear() {
      strokesRef.current = [];
      currentStrokeRef.current = null;
      isDrawingRef.current = false;
      redraw();
      onChange?.(0);
    },

    /**
     * Check if canvas is empty
     */
    isEmpty() {
      return strokesRef.current.length === 0;
    },

    /**
     * Get stroke count
     */
    getStrokeCount() {
      return strokesRef.current.length;
    },

    /**
     * Get all strokes data
     */
    getStrokes() {
      return strokesRef.current;
    },

    /**
     * Export as SVG string
     */
    toSVG() {
      return strokesToSVG(strokesRef.current, width, height);
    },

    /**
     * Export as SVG base64 data URL
     */
    toSVGDataURL() {
      const svg = strokesToSVG(strokesRef.current, width, height);
      return svg ? 'data:image/svg+xml;base64,' + btoa(svg) : '';
    },

    /**
     * Export as PNG base64 data URL
     */
    toPNG() {
      const canvas = canvasRef.current;
      if (!canvas) return '';
      return canvas.toDataURL('image/png');
    },

    /**
     * Export as JPEG base64 data URL
     */
    toJPEG(quality = 0.9) {
      const canvas = canvasRef.current;
      if (!canvas) return '';
      return canvas.toDataURL('image/jpeg', quality);
    },

    /**
     * Check if signature is valid (has minimum strokes)
     */
    isValid(minStrokes = 1, minPoints = 10) {
      const strokes = strokesRef.current;
      if (strokes.length < minStrokes) return false;

      const totalPoints = strokes.reduce((sum, s) => sum + s.points.length, 0);
      return totalPoints >= minPoints;
    },

    /**
     * Get bounding box of signature
     */
    getBoundingBox() {
      const points = strokesRef.current.flatMap(s => s.points);
      if (!points.length) return null;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      points.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });

      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    },

    /**
     * Get trimmed signature (cropped to content)
     */
    toTrimmedPNG(padding = 10) {
      const box = this.getBoundingBox();
      if (!box) return '';

      const trimmedCanvas = document.createElement('canvas');
      const trimmedWidth = box.width + padding * 2;
      const trimmedHeight = box.height + padding * 2;

      trimmedCanvas.width = trimmedWidth;
      trimmedCanvas.height = trimmedHeight;

      const trimmedCtx = trimmedCanvas.getContext('2d');
      trimmedCtx.lineCap = 'round';
      trimmedCtx.lineJoin = 'round';

      // Draw strokes offset by bounding box
      strokesRef.current.forEach(stroke => {
        if (stroke.points.length < 2) return;

        trimmedCtx.beginPath();
        trimmedCtx.strokeStyle = stroke.color || strokeColor;
        trimmedCtx.lineWidth = stroke.width || strokeWidth;

        const offsetX = -box.x + padding;
        const offsetY = -box.y + padding;

        trimmedCtx.moveTo(stroke.points[0].x + offsetX, stroke.points[0].y + offsetY);

        for (let i = 1; i < stroke.points.length; i++) {
          trimmedCtx.lineTo(stroke.points[i].x + offsetX, stroke.points[i].y + offsetY);
        }
        trimmedCtx.stroke();
      });

      return trimmedCanvas.toDataURL('image/png');
    },
  }), [width, height, strokeColor, strokeWidth, redraw, onChange]);

  return (
    <canvas
      ref={canvasRef}
      className={`touch-none ${className}`}
      style={{
        width,
        height,
        cursor: 'crosshair',
      }}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      onTouchCancel={handleEnd}
    />
  );
});

export default SignatureCanvas;
