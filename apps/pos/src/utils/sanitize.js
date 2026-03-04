/**
 * TeleTime POS - HTML/SVG Sanitization Utilities
 * Prevents XSS attacks when rendering user-controllable content
 */

/**
 * HTML entities to escape
 */
const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML insertion
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') {
    return str === null || str === undefined ? '' : String(str);
  }
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ESCAPE_MAP[char]);
}

/**
 * Allowed SVG elements (safe subset)
 */
const ALLOWED_SVG_ELEMENTS = new Set([
  'svg', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse',
  'g', 'defs', 'clippath', 'lineargradient', 'radialgradient', 'stop',
  'text', 'tspan', 'title', 'desc',
]);

/**
 * Allowed SVG attributes (safe subset)
 */
const ALLOWED_SVG_ATTRIBUTES = new Set([
  // Presentation attributes
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'stroke-opacity',
  'fill-opacity', 'opacity', 'fill-rule', 'clip-rule', 'clip-path',
  // Geometry
  'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'width', 'height', 'points', 'transform',
  // Viewbox
  'viewbox', 'preserveaspectratio', 'xmlns',
  // Text
  'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline',
  // Gradient
  'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform',
  // IDs and references
  'id', 'class',
]);

/**
 * Dangerous patterns to remove from SVG
 */
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /\bon\w+\s*=/gi, // Event handlers like onclick, onload, onerror
  /javascript:/gi,
  /data:/gi, // data: URIs can contain scripts
  /<foreignobject\b[^>]*>[\s\S]*?<\/foreignobject>/gi,
  /<animate\b[^>]*>/gi,
  /<set\b[^>]*>/gi,
  /<use\b[^>]*>/gi, // Can reference external resources
];

/**
 * Sanitize SVG content to prevent XSS
 * Removes dangerous elements, attributes, and patterns
 * @param {string} svgContent - Raw SVG string
 * @returns {string} Sanitized SVG safe for rendering
 */
export function sanitizeSvg(svgContent) {
  if (typeof svgContent !== 'string' || !svgContent.trim()) {
    return '';
  }

  let sanitized = svgContent;

  // Remove dangerous patterns first
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Parse and rebuild SVG to ensure only safe elements/attributes
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitized, 'image/svg+xml');

    // Check for parsing errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      console.warn('[sanitizeSvg] Parse error:', parserError.textContent);
      return '';
    }

    // Recursively sanitize all elements
    const sanitizeElement = (element) => {
      const tagName = element.tagName.toLowerCase();

      // Remove disallowed elements
      if (!ALLOWED_SVG_ELEMENTS.has(tagName)) {
        element.remove();
        return;
      }

      // Remove disallowed attributes
      const attrsToRemove = [];
      for (const attr of element.attributes) {
        const attrName = attr.name.toLowerCase();
        if (!ALLOWED_SVG_ATTRIBUTES.has(attrName)) {
          attrsToRemove.push(attr.name);
        }
        // Check attribute values for dangerous content
        if (attr.value && /javascript:|data:/i.test(attr.value)) {
          attrsToRemove.push(attr.name);
        }
      }
      attrsToRemove.forEach((attr) => element.removeAttribute(attr));

      // Sanitize children
      Array.from(element.children).forEach(sanitizeElement);
    };

    const svgElement = doc.documentElement;
    if (svgElement.tagName.toLowerCase() === 'svg') {
      sanitizeElement(svgElement);
      return svgElement.outerHTML;
    }

    return '';
  } catch (error) {
    console.error('[sanitizeSvg] Error sanitizing SVG:', error);
    return '';
  }
}

export default {
  escapeHtml,
  sanitizeSvg,
};
