/**
 * Whirlpool Central Product Data Extractor
 *
 * Run this script in browser console while on a product page at whirlpoolcentral.ca
 * Example: https://whirlpoolcentral.ca/product/WRF535SWHV/
 *
 * Usage:
 * 1. Open browser console (F12 -> Console)
 * 2. Paste this entire script and press Enter
 * 3. Data will be logged, copied to clipboard, and downloaded as JSON
 */

(function() {
  'use strict';

  console.log('🔍 Whirlpool Central Product Extractor v1.0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // ============================================
  // EXTRACTION FUNCTIONS
  // ============================================

  /**
   * Get text content safely
   */
  function getText(selector, context = document) {
    const el = context.querySelector(selector);
    return el ? el.textContent.trim() : null;
  }

  /**
   * Get all matching elements
   */
  function getAll(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
  }

  /**
   * Extract SKU from URL or page
   */
  function extractSKU() {
    // Try URL first
    const urlMatch = window.location.pathname.match(/\/product\/([A-Z0-9]+)/i);
    if (urlMatch) return urlMatch[1];

    // Try breadcrumb
    const breadcrumb = getText('.breadcrumb li:last-child, .breadcrumbs li:last-child');
    if (breadcrumb) return breadcrumb;

    // Try page title or header
    const header = getText('h1, .product-title, .product-name');
    if (header) {
      const match = header.match(/([A-Z]{2,3}[A-Z0-9]{5,})/i);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Extract brand from page
   */
  function extractBrand() {
    // Common brand selectors
    const brandSelectors = [
      '.brand-name', '.product-brand', '[data-brand]',
      '.brand', 'img[alt*="brand"]', '.manufacturer'
    ];

    for (const sel of brandSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        if (el.dataset.brand) return el.dataset.brand;
        if (el.alt) return el.alt;
        if (el.textContent) return el.textContent.trim();
      }
    }

    // Try to detect from page content
    const brands = ['Whirlpool', 'Maytag', 'KitchenAid', 'JennAir', 'Amana'];
    const pageText = document.body.innerText;
    for (const brand of brands) {
      if (pageText.includes(brand)) return brand;
    }

    // Check logo images
    const logos = getAll('img[src*="logo"], img[alt*="logo"]');
    for (const logo of logos) {
      for (const brand of brands) {
        if (logo.src.toLowerCase().includes(brand.toLowerCase()) ||
            logo.alt.toLowerCase().includes(brand.toLowerCase())) {
          return brand;
        }
      }
    }

    return 'Whirlpool'; // Default
  }

  /**
   * Extract product title
   */
  function extractTitle() {
    const titleSelectors = [
      'h1.product-title', 'h1.product-name', '.product-title h1',
      'h1', '.title h1', '[data-product-title]'
    ];

    for (const sel of titleSelectors) {
      const title = getText(sel);
      if (title && title.length > 10) return title;
    }

    return document.title.split('|')[0].trim();
  }

  /**
   * Extract product description
   */
  function extractDescription() {
    const descSelectors = [
      '.product-description', '.description', '[data-description]',
      '.product-info p', '.product-details p', '.overview p'
    ];

    for (const sel of descSelectors) {
      const desc = getText(sel);
      if (desc && desc.length > 20) return desc;
    }

    return null;
  }

  /**
   * Extract product status
   */
  function extractStatus() {
    const statusSelectors = [
      '.product-status', '.status', '[data-status]',
      '.availability', '.stock-status', '.product-availability'
    ];

    for (const sel of statusSelectors) {
      const status = getText(sel);
      if (status) return status;
    }

    // Look for status text patterns
    const patterns = [
      /(\d+\s*-\s*(Active|Discontinued|Phase Out|Limited))/i,
      /(Available|In Stock|Out of Stock|Discontinued)/i
    ];

    const pageText = document.body.innerText;
    for (const pattern of patterns) {
      const match = pageText.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Extract category
   */
  function extractCategory() {
    // Try breadcrumb
    const breadcrumbs = getAll('.breadcrumb li, .breadcrumbs li, nav[aria-label="breadcrumb"] li');
    if (breadcrumbs.length > 1) {
      // Skip first (Home) and last (current product)
      const categoryItems = breadcrumbs.slice(1, -1);
      if (categoryItems.length > 0) {
        return categoryItems.map(li => li.textContent.trim()).join(' > ');
      }
    }

    // Try category selectors
    const catSelectors = ['.product-category', '.category', '[data-category]'];
    for (const sel of catSelectors) {
      const cat = getText(sel);
      if (cat) return cat;
    }

    return null;
  }

  /**
   * Extract UPC/GTIN
   */
  function extractIdentifiers() {
    const identifiers = { upc: null, gtin: null, ean: null };

    // Look for labeled identifiers
    const labels = getAll('dt, th, .label, strong');
    labels.forEach(label => {
      const text = label.textContent.toLowerCase();
      const valueEl = label.nextElementSibling || label.parentElement.querySelector('dd, td, .value, span');
      const value = valueEl ? valueEl.textContent.trim() : null;

      if (text.includes('upc') && value) identifiers.upc = value;
      if (text.includes('gtin') && value) identifiers.gtin = value;
      if (text.includes('ean') && value) identifiers.ean = value;
    });

    // Look for barcode patterns in page
    const barcodePattern = /\b(\d{12,14})\b/g;
    const pageText = document.body.innerText;
    const matches = pageText.match(barcodePattern);
    if (matches && !identifiers.upc) {
      identifiers.upc = matches[0];
    }

    return identifiers;
  }

  /**
   * Extract rating and reviews
   */
  function extractRating() {
    const rating = { score: null, count: null };

    // Look for star ratings
    const ratingSelectors = [
      '.rating', '.stars', '.review-rating', '[data-rating]',
      '.star-rating', '.product-rating'
    ];

    for (const sel of ratingSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        // Check data attribute
        if (el.dataset.rating) {
          rating.score = parseFloat(el.dataset.rating);
          break;
        }
        // Check text content
        const text = el.textContent;
        const match = text.match(/([\d.]+)\s*(?:out of|\/)\s*5/i);
        if (match) {
          rating.score = parseFloat(match[1]);
          break;
        }
        // Check for star count
        const filledStars = el.querySelectorAll('.filled, .active, [class*="full"]').length;
        if (filledStars > 0) {
          rating.score = filledStars;
          break;
        }
      }
    }

    // Look for review count
    const countPatterns = [
      /(\d+)\s*reviews?/i,
      /(\d+)\s*ratings?/i,
      /\((\d+)\)/
    ];

    const pageText = document.body.innerText;
    for (const pattern of countPatterns) {
      const match = pageText.match(pattern);
      if (match) {
        rating.count = parseInt(match[1]);
        break;
      }
    }

    return rating;
  }

  /**
   * Extract all images
   */
  function extractImages() {
    const images = {
      hero: null,
      gallery: [],
      lifestyle: [],
      all: []
    };

    // Find main/hero image
    const heroSelectors = [
      '.main-image img', '.hero-image img', '.product-image img',
      '.primary-image img', '#main-image img', '.gallery-main img',
      'img.product-image', 'img[data-main]'
    ];

    for (const sel of heroSelectors) {
      const img = document.querySelector(sel);
      if (img && img.src) {
        images.hero = img.src;
        break;
      }
    }

    // Find all product images
    const allImages = getAll('img');
    const seenUrls = new Set();

    allImages.forEach(img => {
      const src = img.src || img.dataset.src || img.dataset.lazySrc;
      if (!src) return;

      // Skip tiny images, icons, logos
      if (img.width < 50 || img.height < 50) return;
      if (src.includes('icon') || src.includes('logo') || src.includes('sprite')) return;
      if (src.includes('data:image')) return;

      // Get high-res version if available
      let highResSrc = src;
      if (img.dataset.zoom) highResSrc = img.dataset.zoom;
      if (img.dataset.large) highResSrc = img.dataset.large;
      if (img.dataset.original) highResSrc = img.dataset.original;

      // Try to get largest version by modifying URL
      highResSrc = highResSrc
        .replace(/\?.*$/, '') // Remove query params
        .replace(/_\d+x\d+/, '') // Remove size suffix
        .replace(/\/\d+x\d+\//, '/'); // Remove size path

      if (seenUrls.has(highResSrc)) return;
      seenUrls.add(highResSrc);

      // Determine image type from context
      const container = img.closest('[class*="gallery"], [class*="image"], [data-type], figure');
      const alt = img.alt || '';
      const className = (container?.className || '') + ' ' + (img.className || '');

      let type = 'product';
      if (className.includes('hero') || className.includes('main')) type = 'hero';
      else if (className.includes('lifestyle') || alt.toLowerCase().includes('lifestyle')) type = 'lifestyle';
      else if (className.includes('feature')) type = 'feature';
      else if (className.includes('open')) type = 'open';
      else if (className.includes('closed')) type = 'closed';
      else if (className.includes('detail')) type = 'detail';
      else if (className.includes('thumb')) type = 'thumbnail';

      const imageData = {
        type: type,
        url: highResSrc,
        alt: alt,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height
      };

      if (type === 'hero' && !images.hero) {
        images.hero = highResSrc;
      } else if (type === 'lifestyle') {
        images.lifestyle.push(imageData);
      } else {
        images.gallery.push(imageData);
      }

      images.all.push(imageData);
    });

    // Also look for images in data attributes or scripts
    const scripts = getAll('script[type="application/json"], script[type="application/ld+json"]');
    scripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        if (data.image) {
          const imgUrls = Array.isArray(data.image) ? data.image : [data.image];
          imgUrls.forEach(url => {
            if (!seenUrls.has(url)) {
              seenUrls.add(url);
              images.all.push({ type: 'schema', url: url });
            }
          });
        }
      } catch (e) {}
    });

    return images;
  }

  /**
   * Extract available finishes/colors
   */
  function extractFinishes() {
    const finishes = [];

    // Look for color/finish swatches
    const swatchSelectors = [
      '.color-swatch', '.finish-option', '.variant-option',
      '[data-color]', '[data-finish]', '.color-picker button',
      '.finish-selector button', '.swatch'
    ];

    for (const sel of swatchSelectors) {
      const swatches = getAll(sel);
      swatches.forEach(swatch => {
        const name = swatch.dataset.color || swatch.dataset.finish ||
                     swatch.title || swatch.getAttribute('aria-label') ||
                     swatch.textContent.trim();
        const sku = swatch.dataset.sku || swatch.dataset.model || null;
        const img = swatch.querySelector('img')?.src || swatch.style.backgroundImage?.match(/url\(['"]?(.+?)['"]?\)/)?.[1];

        if (name) {
          finishes.push({ name, sku, image: img || null });
        }
      });
    }

    // Look for finish dropdown
    const finishSelect = document.querySelector('select[name*="color"], select[name*="finish"], select[name*="variant"]');
    if (finishSelect) {
      getAll('option', finishSelect).forEach(opt => {
        if (opt.value && opt.textContent.trim()) {
          finishes.push({ name: opt.textContent.trim(), sku: opt.value, image: null });
        }
      });
    }

    return finishes;
  }

  /**
   * Extract available sections/tabs
   */
  function extractSections() {
    const sections = [];

    // Look for tabs
    const tabSelectors = [
      '.tab', '.nav-tab', '[role="tab"]', '.accordion-header',
      '.section-header', '.panel-header', '.collapsible-header',
      'button[data-toggle="collapse"]', '.tab-link', '.tabs li'
    ];

    for (const sel of tabSelectors) {
      const tabs = getAll(sel);
      tabs.forEach(tab => {
        const name = tab.textContent.trim().replace(/\s+/g, ' ');
        if (name && name.length > 2 && name.length < 100 && !sections.includes(name)) {
          sections.push(name);
        }
      });
    }

    // Look for section headings
    const headings = getAll('h2, h3, h4');
    headings.forEach(h => {
      const name = h.textContent.trim();
      if (name && name.length > 2 && name.length < 100 && !sections.includes(name)) {
        // Check if it looks like a product section
        const sectionKeywords = ['spec', 'dimension', 'feature', 'accessory', 'part',
                                 'manual', 'video', 'document', 'install', 'warranty',
                                 'repair', 'service', 'smart', 'tip', 'icon', 'badge'];
        if (sectionKeywords.some(kw => name.toLowerCase().includes(kw))) {
          sections.push(name);
        }
      }
    });

    return sections;
  }

  /**
   * Extract specifications
   */
  function extractSpecifications() {
    const specs = {};

    // Look for spec tables
    const tables = getAll('table');
    tables.forEach(table => {
      const rows = getAll('tr', table);
      rows.forEach(row => {
        const cells = getAll('td, th', row);
        if (cells.length >= 2) {
          const key = cells[0].textContent.trim();
          const value = cells[1].textContent.trim();
          if (key && value) {
            specs[key] = value;
          }
        }
      });
    });

    // Look for definition lists
    const dls = getAll('dl');
    dls.forEach(dl => {
      const dts = getAll('dt', dl);
      dts.forEach(dt => {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName === 'DD') {
          const key = dt.textContent.trim();
          const value = dd.textContent.trim();
          if (key && value) {
            specs[key] = value;
          }
        }
      });
    });

    // Look for key-value pairs in divs
    const kvPairs = getAll('.spec-row, .specification, [class*="spec-item"]');
    kvPairs.forEach(pair => {
      const label = pair.querySelector('.label, .key, .spec-label, dt, strong');
      const value = pair.querySelector('.value, .spec-value, dd, span:last-child');
      if (label && value) {
        specs[label.textContent.trim()] = value.textContent.trim();
      }
    });

    return specs;
  }

  /**
   * Extract feature descriptions
   */
  function extractFeatures() {
    const features = [];

    // Look for feature lists
    const featureLists = getAll('.features ul, .feature-list, [class*="feature"] ul');
    featureLists.forEach(list => {
      getAll('li', list).forEach(li => {
        const text = li.textContent.trim();
        if (text && text.length > 5) {
          features.push(text);
        }
      });
    });

    // Look for feature sections
    const featureHeadings = getAll('h3, h4, strong');
    featureHeadings.forEach(h => {
      const container = h.closest('.feature, [class*="feature"]');
      if (container) {
        const title = h.textContent.trim();
        const desc = container.textContent.replace(title, '').trim();
        if (title && desc) {
          features.push({ title, description: desc });
        }
      }
    });

    return features;
  }

  /**
   * Extract document/asset links
   */
  function extractAssets() {
    const assets = [];
    const seenUrls = new Set();

    // Look for PDF and document links
    const docLinks = getAll('a[href*=".pdf"], a[href*="document"], a[href*="manual"], a[href*="spec"]');
    docLinks.forEach(link => {
      const url = link.href;
      if (seenUrls.has(url)) return;
      seenUrls.add(url);

      const name = link.textContent.trim() || link.title || 'Document';
      let type = 'document';
      if (url.includes('manual')) type = 'manual';
      else if (url.includes('spec')) type = 'specification';
      else if (url.includes('install')) type = 'installation';
      else if (url.includes('warranty')) type = 'warranty';

      assets.push({ name, type, url });
    });

    // Look for video links
    const videoLinks = getAll('a[href*="youtube"], a[href*="vimeo"], a[href*="video"], iframe[src*="youtube"], iframe[src*="vimeo"]');
    videoLinks.forEach(el => {
      const url = el.href || el.src;
      if (seenUrls.has(url)) return;
      seenUrls.add(url);

      const name = el.textContent?.trim() || el.title || 'Video';
      assets.push({ name, type: 'video', url });
    });

    return assets;
  }

  // ============================================
  // MAIN EXTRACTION
  // ============================================

  function extractProductData() {
    console.log('📦 Extracting product data...');

    const sku = extractSKU();
    const identifiers = extractIdentifiers();
    const rating = extractRating();

    const productData = {
      // Metadata
      sku: sku,
      url: window.location.href,
      scrapedAt: new Date().toISOString(),
      source: 'whirlpoolcentral.ca',

      // Basic Info
      brand: extractBrand(),
      title: extractTitle(),
      description: extractDescription(),
      status: extractStatus(),
      category: extractCategory(),

      // Identifiers
      upc: identifiers.upc,
      gtin: identifiers.gtin,
      ean: identifiers.ean,

      // Reviews
      rating: rating.score,
      reviewCount: rating.count,

      // Variants
      availableFinishes: extractFinishes(),

      // Images
      images: extractImages(),

      // Content Sections
      availableSections: extractSections(),
      specifications: extractSpecifications(),
      features: extractFeatures(),
      assets: extractAssets()
    };

    return productData;
  }

  // ============================================
  // OUTPUT FUNCTIONS
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

    console.log(`💾 Downloaded: ${filename}`);
  }

  async function copyToClipboard(data) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      console.log('📋 Copied to clipboard!');
      return true;
    } catch (err) {
      console.warn('⚠️ Could not copy to clipboard:', err);
      return false;
    }
  }

  // ============================================
  // EXECUTE
  // ============================================

  try {
    const data = extractProductData();

    console.log('');
    console.log('✅ EXTRACTION COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 SKU: ${data.sku}`);
    console.log(`🏷️  Brand: ${data.brand}`);
    console.log(`📝 Title: ${data.title?.substring(0, 50)}...`);
    console.log(`📂 Category: ${data.category}`);
    console.log(`📊 Status: ${data.status}`);
    console.log(`⭐ Rating: ${data.rating} (${data.reviewCount} reviews)`);
    console.log(`🖼️  Images: ${data.images.all.length} found`);
    console.log(`📑 Sections: ${data.availableSections.length} available`);
    console.log(`📎 Assets: ${data.assets.length} documents/videos`);
    console.log(`🎨 Finishes: ${data.availableFinishes.length} options`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Full data logged
    console.log('📋 Full Product Data:');
    console.log(data);

    // Copy to clipboard
    copyToClipboard(data);

    // Download as JSON
    const filename = `${data.sku || 'product'}_${new Date().toISOString().slice(0,10)}.json`;
    downloadJSON(data, filename);

    // Make data available in console
    window.extractedProduct = data;
    console.log('');
    console.log('💡 TIP: Access data via window.extractedProduct');
    console.log('💡 TIP: Run extractProductData() to re-extract');

    // Return the data
    return data;

  } catch (error) {
    console.error('❌ Extraction failed:', error);
    throw error;
  }

})();
