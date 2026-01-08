/**
 * Whirlpool Central Product Data Extractor v2.0
 * Optimized for whirlpoolcentral.ca DOM structure
 *
 * Run in browser console on a product page
 */

(function() {
  'use strict';

  console.log('🔍 Whirlpool Central Extractor v2.0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const getText = (s, c = document) => { const e = c.querySelector(s); return e ? e.textContent.trim() : null; };
  const getAll = (s, c = document) => Array.from(c.querySelectorAll(s));

  // ============================================
  // EXTRACT RAW SPECIFICATIONS FIRST
  // (This contains most of the accurate data)
  // ============================================
  function extractSpecifications() {
    const specs = {};

    // Get all tables
    getAll('table').forEach(table => {
      getAll('tr', table).forEach(row => {
        const cells = getAll('td, th', row);
        if (cells.length >= 2) {
          let key = cells[0].textContent.trim().replace(/:$/, '');
          let value = cells[1].textContent.trim();
          if (key && value && key.length < 100 && value.length < 500) {
            specs[key] = value;
          }
        }
      });
    });

    // Get definition lists
    getAll('dl').forEach(dl => {
      getAll('dt', dl).forEach(dt => {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          let key = dt.textContent.trim().replace(/:$/, '');
          let value = dd.textContent.trim();
          if (key && value) specs[key] = value;
        }
      });
    });

    return specs;
  }

  // ============================================
  // EXTRACT IMAGES
  // ============================================
  function extractImages() {
    const images = { hero: null, gallery: [], all: [] };
    const seen = new Set();
    const sku = (window.location.pathname.match(/\/product\/([A-Z0-9-]+)/i) || [])[1] || '';

    // Helper to extract URL from background-image
    const extractBgUrl = (style) => {
      const match = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
      return match ? match[1] : null;
    };

    // Helper to determine image type from element context
    const getImageType = (el) => {
      const text = (el.textContent || '').toLowerCase();
      const cls = (el.className || '').toLowerCase();
      const parentText = (el.closest('[class*="image"], [class*="gallery"]')?.textContent || '').toLowerCase();

      if (text.includes('hero') || cls.includes('hero')) return 'hero';
      if (text.includes('feature') || cls.includes('feature')) return 'feature';
      if (text.includes('lifestyle') || cls.includes('lifestyle')) return 'lifestyle';
      if (text.includes('open') || parentText.includes('open')) return 'interior-open';
      if (text.includes('closed') || parentText.includes('closed')) return 'interior-closed';
      if (text.includes('quartz') || parentText.includes('quartz')) return 'quartz';
      if (text.includes('quartz') || parentText.includes('quartz')) return 'quartz';
      if (text.includes('quartz') || parentText.includes('quartz')) return 'quartz';
      return 'gallery';
    };

    // 1. Extract from CSS background-image (main source on Whirlpool Central)
    getAll('[style*="background"]').forEach(el => {
      const bgUrl = extractBgUrl(el.style.backgroundImage || '');
      if (!bgUrl) return;

      // Only product images from CDN
      if (!bgUrl.includes('wpcstorage') && !bgUrl.includes('digitalocean') && !bgUrl.includes(sku)) return;
      // Skip icons/badges/thumbnails
      if (bgUrl.includes('icon') || bgUrl.includes('badge') || bgUrl.includes('thumbnail') || bgUrl.includes('preview')) return;

      if (seen.has(bgUrl)) return;
      seen.add(bgUrl);

      const type = getImageType(el);
      const data = { type, url: bgUrl, source: 'background-image' };

      // First image with SKU is likely the hero
      if (!images.hero && bgUrl.includes(sku)) {
        images.hero = bgUrl;
        data.type = 'hero';
      }

      images.gallery.push(data);
      images.all.push(data);
    });

    // 2. Extract from <img> tags (accessories, related products)
    getAll('img').forEach(img => {
      let src = img.src || img.dataset.src || img.dataset.lazySrc;
      if (!src) return;

      // Skip small/theme/UI images
      if (img.width < 80 || img.height < 80) return;
      if (src.includes('icon') || src.includes('logo') || src.includes('sprite')) return;
      if (src.includes('/themes/') || src.includes('rewards') || src.includes('banner')) return;
      if (src.includes('profile-default') || src.includes('image-soon')) return;

      // Only CDN images
      if (!src.includes('wpcstorage') && !src.includes('digitalocean')) return;

      if (seen.has(src)) return;
      seen.add(src);

      const data = {
        type: 'accessory',
        url: src,
        alt: img.alt || '',
        source: 'img-tag'
      };

      images.all.push(data);
    });

    // 3. Look for data attributes with image URLs
    getAll('[data-image], [data-src], [data-original]').forEach(el => {
      const src = el.dataset.image || el.dataset.src || el.dataset.original;
      if (!src || seen.has(src)) return;
      if (!src.includes('wpcstorage') && !src.includes(sku)) return;

      seen.add(src);
      images.all.push({ type: 'lazy', url: src, source: 'data-attr' });
    });

    return images;
  }

  // ============================================
  // EXTRACT ASSETS (PDFs, Documents)
  // ============================================
  function extractAssets() {
    const assets = [];
    const seen = new Set();

    getAll('a[href]').forEach(link => {
      const href = link.href || '';
      const text = link.textContent.trim();

      // PDF documents
      if (href.includes('.pdf') || href.includes('document') || href.includes('download')) {
        if (seen.has(href)) return;
        seen.add(href);

        let type = 'document';
        const lowerHref = href.toLowerCase();
        const lowerText = text.toLowerCase();

        if (lowerHref.includes('manual') || lowerText.includes('manual')) type = 'manual';
        else if (lowerHref.includes('spec') || lowerText.includes('spec')) type = 'specification';
        else if (lowerHref.includes('install') || lowerText.includes('install')) type = 'installation';
        else if (lowerHref.includes('warranty') || lowerText.includes('warranty')) type = 'warranty';
        else if (lowerHref.includes('dimension') || lowerText.includes('dimension')) type = 'dimensions';
        else if (lowerHref.includes('energy') || lowerText.includes('energy')) type = 'energy-guide';
        else if (lowerHref.includes('repair') || lowerText.includes('part')) type = 'parts-list';

        assets.push({ name: text || 'Document', type, url: href });
      }

      // Video links
      if (href.includes('youtube') || href.includes('vimeo') || href.includes('video')) {
        if (seen.has(href)) return;
        seen.add(href);
        assets.push({ name: text || 'Video', type: 'video', url: href });
      }
    });

    // Also check iframes for videos
    getAll('iframe[src]').forEach(iframe => {
      const src = iframe.src;
      if (src.includes('youtube') || src.includes('vimeo')) {
        if (!seen.has(src)) {
          seen.add(src);
          assets.push({ name: 'Embedded Video', type: 'video', url: src });
        }
      }
    });

    return assets;
  }

  // ============================================
  // EXTRACT AVAILABLE TABS/SECTIONS
  // ============================================
  function extractSections() {
    const sections = [];
    const seen = new Set();

    // Look for tab-like elements
    const tabSelectors = [
      '[role="tab"]', '.tab', '.nav-tab', '.accordion-header',
      '.accordion-toggle', '.collapse-toggle', '.panel-title',
      'button[data-toggle]', '.tab-link', '[data-tab]'
    ];

    tabSelectors.forEach(sel => {
      getAll(sel).forEach(el => {
        let name = el.textContent.trim().replace(/\s+/g, ' ');
        // Clean up common noise
        name = name.replace(/^\d+\s*/, '').replace(/[▼▲►◄]/g, '').trim();
        if (name && name.length > 2 && name.length < 60 && !seen.has(name)) {
          seen.add(name);
          sections.push(name);
        }
      });
    });

    return sections;
  }

  // ============================================
  // EXTRACT COLOR/FINISH OPTIONS
  // ============================================
  function extractFinishes() {
    const finishes = [];

    // Look for color swatches or finish selectors
    getAll('[data-color], [data-finish], .color-swatch, .finish-option, .variant-swatch').forEach(el => {
      const name = el.dataset.color || el.dataset.finish || el.title || el.getAttribute('aria-label') || el.textContent.trim();
      const sku = el.dataset.sku || el.dataset.model || null;
      if (name && name.length < 50) {
        finishes.push({ name, sku });
      }
    });

    // Also check for finish links/buttons
    getAll('a, button').forEach(el => {
      const text = el.textContent.trim();
      // Common finish names
      if (/^(Black Stainless|Stainless Steel|White|Black|Bisque|Slate|Fingerprint Resistant)/i.test(text)) {
        if (!finishes.find(f => f.name === text)) {
          finishes.push({ name: text, sku: null });
        }
      }
    });

    return finishes;
  }

  // ============================================
  // MAIN EXTRACTION
  // ============================================
  function extractProduct() {
    // Get SKU from URL
    const urlMatch = window.location.pathname.match(/\/product\/([A-Z0-9-]+)/i);
    const sku = urlMatch ? urlMatch[1] : null;

    // Extract specifications first - this has most accurate data
    const specs = extractSpecifications();

    // Parse rating from specs
    let rating = null;
    let reviewCount = null;
    const ratingSpec = specs['Rating'] || specs['Rating '] || '';
    const ratingMatch = ratingSpec.match(/([\d.]+)\s*[-–]\s*(\d+)\s*review/i);
    if (ratingMatch) {
      rating = parseFloat(ratingMatch[1]);
      reviewCount = parseInt(ratingMatch[2]);
    }

    // Extract from specs with fallbacks
    const brand = specs['Brand'] || specs['Brand:'] || 'Whirlpool';
    const category = specs['Category'] || specs['Category:'] || null;
    const status = specs['Status'] || specs['Status:'] || null;
    const gtin = specs['GTIN'] || specs['GTIN:'] || null;
    const upc = specs['UPC'] || specs['UPC:'] || null;
    const dateCreated = specs['Date Created'] || specs['Date Created:'] || null;

    // Build clean specs (remove metadata fields)
    const cleanSpecs = {};
    const metaKeys = ['Brand', 'Brand:', 'Category', 'Category:', 'Status', 'Status:',
                      'GTIN', 'GTIN:', 'UPC', 'UPC:', 'SKU', 'SKU:', 'Rating', 'Rating :',
                      'Date Created', 'Date Created:', 'Download', 'Download:'];

    Object.entries(specs).forEach(([key, value]) => {
      // Skip metadata and malformed entries
      if (metaKeys.includes(key)) return;
      if (key.includes('\n') || value.includes('\n\t\t')) return;
      if (key.length > 80) return;
      cleanSpecs[key] = value;
    });

    // Get product title - try multiple approaches
    let title = null;

    // Try h1 that contains the SKU or product description
    getAll('h1, h2').forEach(h => {
      const text = h.textContent.trim();
      if (text.includes(sku) || text.includes('French Door') || text.includes('Refrigerator') ||
          text.includes('Washer') || text.includes('Dryer') || text.includes('Range') ||
          text.includes('Dishwasher') || text.includes('Microwave')) {
        if (!title || text.length > title.length) {
          title = text;
        }
      }
    });

    // Fallback: construct from specs
    if (!title) {
      const width = specs['Popular Width'] || specs['Width'] || '';
      const type = specs['Type Of Refrigerator'] || specs['Type'] || category || '';
      const capacity = specs['Capacity (cubic feet)'] || specs['Total Volume Cu Ft'] || '';

      if (type) {
        title = `${width} ${type}${capacity ? ` - ${capacity} cu. ft.` : ''}`.trim();
      }
    }

    // Get images
    const images = extractImages();

    // Get assets
    const assets = extractAssets();

    // Get sections
    const sections = extractSections();

    // Get finishes
    const finishes = extractFinishes();

    // Build final product object
    const product = {
      // Identification
      sku: sku,
      upc: upc?.replace(/^0+/, '') || null,  // Remove leading zeros
      gtin: gtin,

      // Source
      url: window.location.href,
      scrapedAt: new Date().toISOString(),
      source: 'whirlpoolcentral.ca',

      // Basic Info
      brand: brand,
      title: title,
      category: category,
      status: status,
      dateCreated: dateCreated,

      // Reviews
      rating: rating,
      reviewCount: reviewCount,

      // Variants
      availableFinishes: finishes,

      // Media
      images: {
        hero: images.hero,
        count: images.all.length,
        gallery: images.gallery
      },

      // Content
      availableSections: sections,
      assets: assets,

      // Full Specifications
      specifications: cleanSpecs
    };

    return product;
  }

  // ============================================
  // OUTPUT
  // ============================================
  function downloadJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ============================================
  // EXECUTE
  // ============================================
  try {
    const product = extractProduct();

    console.log('');
    console.log('✅ EXTRACTION COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 SKU: ${product.sku}`);
    console.log(`🏷️  Brand: ${product.brand}`);
    console.log(`📝 Title: ${product.title || '(not found)'}`);
    console.log(`📂 Category: ${product.category}`);
    console.log(`📊 Status: ${product.status}`);
    console.log(`⭐ Rating: ${product.rating} (${product.reviewCount} reviews)`);
    console.log(`🔢 UPC: ${product.upc}`);
    console.log(`🖼️  Images: ${product.images.count} found`);
    console.log(`📎 Assets: ${product.assets.length} documents`);
    console.log(`📐 Specs: ${Object.keys(product.specifications).length} fields`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Log full data
    console.log('');
    console.log('📋 Full Product Data:');
    console.log(product);

    // Copy to clipboard
    navigator.clipboard.writeText(JSON.stringify(product, null, 2))
      .then(() => console.log('📋 Copied to clipboard!'))
      .catch(e => console.warn('Could not copy:', e));

    // Download JSON
    const filename = `${product.sku}_${new Date().toISOString().slice(0,10)}.json`;
    downloadJSON(product, filename);
    console.log(`💾 Downloaded: ${filename}`);

    // Store globally
    window.extractedProduct = product;
    console.log('');
    console.log('💡 Access via: window.extractedProduct');

    return product;

  } catch (error) {
    console.error('❌ Extraction failed:', error);
    throw error;
  }

})();
