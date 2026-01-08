/**
 * Whirlpool Central BATCH Product Extractor
 *
 * Extracts multiple products from whirlpoolcentral.ca
 *
 * USAGE:
 * 1. Open whirlpoolcentral.ca (logged in)
 * 2. Open browser console (F12 -> Console)
 * 3. Paste this entire script
 * 4. Call: extractBatch(['SKU1', 'SKU2', 'SKU3'])
 *    Or: extractBatch(['WRF535SWHV', 'WRS325SDHZ', 'WFW5605MW'])
 *
 * The script will:
 * - Open each product in a hidden iframe
 * - Extract data from each
 * - Show progress in console
 * - Download all results as JSON when complete
 */

(function() {
  'use strict';

  console.log('🔄 Whirlpool Central Batch Extractor v1.0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Usage: extractBatch(["SKU1", "SKU2", "SKU3"])');
  console.log('');

  // Configuration
  const CONFIG = {
    baseUrl: 'https://whirlpoolcentral.ca/product/',
    delayBetweenProducts: 3000,  // 3 seconds between products
    iframeTimeout: 25000,        // 25 seconds max per product (increased for images)
    pageRenderWait: 5000,        // 5 seconds for images to load
    maxRetries: 2
  };

  // Store results
  window.batchResults = [];
  window.batchErrors = [];

  /**
   * Single product extraction logic (runs inside iframe)
   */
  const extractorCode = `
    (function() {
      const getText = (s, c = document) => { const e = c.querySelector(s); return e ? e.textContent.trim() : null; };
      const getAll = (s, c = document) => Array.from(c.querySelectorAll(s));

      function extractSpecifications() {
        const specs = {};
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

      function extractImages() {
        const images = { hero: null, gallery: [], all: [] };
        const seen = new Set();
        const sku = (window.location.pathname.match(/\\/product\\/([A-Z0-9-]+)/i) || [])[1] || '';

        const extractBgUrl = (style) => {
          const match = style.match(/url\\(['"]?([^'")\s]+)['"]?\\)/);
          return match ? match[1] : null;
        };

        getAll('[style*="background"]').forEach(el => {
          const bgUrl = extractBgUrl(el.style.backgroundImage || '');
          if (!bgUrl) return;
          if (!bgUrl.includes('wpcstorage') && !bgUrl.includes('digitalocean') && !bgUrl.includes(sku)) return;
          if (bgUrl.includes('icon') || bgUrl.includes('badge') || bgUrl.includes('thumbnail') || bgUrl.includes('preview')) return;
          if (seen.has(bgUrl)) return;
          seen.add(bgUrl);

          const data = { type: 'gallery', url: bgUrl };
          if (!images.hero && bgUrl.includes(sku)) {
            images.hero = bgUrl;
            data.type = 'hero';
          }
          images.gallery.push(data);
          images.all.push(data);
        });

        getAll('img').forEach(img => {
          let src = img.src || img.dataset.src;
          if (!src) return;
          if (img.width < 80) return;
          if (!src.includes('wpcstorage') && !src.includes('digitalocean')) return;
          if (src.includes('profile-default') || src.includes('image-soon')) return;
          if (seen.has(src)) return;
          seen.add(src);
          images.all.push({ type: 'accessory', url: src, alt: img.alt || '' });
        });

        return images;
      }

      function extractAssets() {
        const assets = [];
        const seen = new Set();
        getAll('a[href]').forEach(link => {
          const href = link.href || '';
          const text = link.textContent.trim();
          if (href.includes('.pdf') || href.includes('document') || href.includes('download')) {
            if (seen.has(href)) return;
            seen.add(href);
            let type = 'document';
            if (href.includes('manual')) type = 'manual';
            else if (href.includes('spec')) type = 'specification';
            else if (href.includes('install')) type = 'installation';
            assets.push({ name: text || 'Document', type, url: href });
          }
          if (href.includes('youtube') || href.includes('vimeo')) {
            if (!seen.has(href)) {
              seen.add(href);
              assets.push({ name: text || 'Video', type: 'video', url: href });
            }
          }
        });
        return assets;
      }

      // Main extraction
      const urlMatch = window.location.pathname.match(/\\/product\\/([A-Z0-9-]+)/i);
      const sku = urlMatch ? urlMatch[1] : null;
      const specs = extractSpecifications();

      let rating = null, reviewCount = null;
      const ratingSpec = specs['Rating'] || specs['Rating '] || '';
      const ratingMatch = ratingSpec.match(/([\\d.]+)\\s*[-–]\\s*(\\d+)\\s*review/i);
      if (ratingMatch) {
        rating = parseFloat(ratingMatch[1]);
        reviewCount = parseInt(ratingMatch[2]);
      }

      const brand = specs['Brand'] || specs['Brand:'] || 'Whirlpool';
      const category = specs['Category'] || specs['Category:'] || null;
      const status = specs['Status'] || specs['Status:'] || null;
      const gtin = specs['GTIN'] || specs['GTIN:'] || null;
      const upc = specs['UPC'] || specs['UPC:'] || null;

      // Clean specs
      const cleanSpecs = {};
      const metaKeys = ['Brand', 'Brand:', 'Category', 'Category:', 'Status', 'Status:',
                        'GTIN', 'GTIN:', 'UPC', 'UPC:', 'SKU', 'SKU:', 'Rating', 'Rating :',
                        'Date Created', 'Date Created:', 'Download', 'Download:'];
      Object.entries(specs).forEach(([key, value]) => {
        if (metaKeys.includes(key)) return;
        if (key.includes('\\n') || value.includes('\\n\\t\\t')) return;
        if (key.length > 80) return;
        cleanSpecs[key] = value;
      });

      // Get title
      let title = null;
      getAll('h1, h2').forEach(h => {
        const text = h.textContent.trim();
        if (text.includes(sku) || text.includes('French Door') || text.includes('Refrigerator') ||
            text.includes('Washer') || text.includes('Dryer') || text.includes('Range') ||
            text.includes('Dishwasher') || text.includes('Microwave')) {
          if (!title || text.length > title.length) title = text;
        }
      });

      const images = extractImages();
      const assets = extractAssets();

      return {
        sku,
        upc: upc?.replace(/^0+/, '') || null,
        gtin,
        url: window.location.href,
        scrapedAt: new Date().toISOString(),
        source: 'whirlpoolcentral.ca',
        brand,
        title,
        category,
        status,
        dateCreated: specs['Date Created'] || specs['Date Created:'] || null,
        rating,
        reviewCount,
        images: {
          hero: images.hero,
          count: images.all.length,
          gallery: images.gallery
        },
        assets,
        specifications: cleanSpecs
      };
    })();
  `;

  /**
   * Extract a single product using iframe
   */
  async function extractProduct(sku) {
    return new Promise((resolve, reject) => {
      const url = CONFIG.baseUrl + sku + '/';
      console.log(`📦 Loading: ${sku}...`);

      // Create hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1200px;height:800px;';
      iframe.src = url;

      let resolved = false;

      // Timeout handler
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          iframe.remove();
          reject(new Error(`Timeout loading ${sku}`));
        }
      }, CONFIG.iframeTimeout);

      // Load handler
      iframe.onload = async () => {
        try {
          // Wait for page to fully render and images to load
          await new Promise(r => setTimeout(r, CONFIG.pageRenderWait));

          // Try to access iframe content
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

          // Execute extraction in iframe context
          const result = iframe.contentWindow.eval(extractorCode);

          clearTimeout(timeout);
          resolved = true;
          iframe.remove();

          if (result && result.sku) {
            console.log(`✅ Extracted: ${result.sku} - ${result.title?.substring(0, 40)}...`);
            resolve(result);
          } else {
            reject(new Error(`No data extracted for ${sku}`));
          }
        } catch (err) {
          clearTimeout(timeout);
          resolved = true;
          iframe.remove();
          reject(err);
        }
      };

      iframe.onerror = () => {
        clearTimeout(timeout);
        resolved = true;
        iframe.remove();
        reject(new Error(`Failed to load ${sku}`));
      };

      document.body.appendChild(iframe);
    });
  }

  /**
   * Extract multiple products in batch
   */
  async function extractBatch(skuList, options = {}) {
    const {
      delay = CONFIG.delayBetweenProducts,
      continueOnError = true
    } = options;

    console.log('');
    console.log('🚀 STARTING BATCH EXTRACTION');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 Products to extract: ${skuList.length}`);
    console.log(`⏱️  Delay between products: ${delay}ms`);
    console.log('');

    const results = [];
    const errors = [];
    const startTime = Date.now();

    for (let i = 0; i < skuList.length; i++) {
      const sku = skuList[i].trim().toUpperCase();
      console.log(`[${i + 1}/${skuList.length}] Processing: ${sku}`);

      try {
        const product = await extractProduct(sku);
        results.push(product);
        window.batchResults.push(product);
      } catch (err) {
        console.error(`❌ Error extracting ${sku}:`, err.message);
        errors.push({ sku, error: err.message });
        window.batchErrors.push({ sku, error: err.message });

        if (!continueOnError) {
          console.log('⛔ Stopping due to error');
          break;
        }
      }

      // Delay between products (except last one)
      if (i < skuList.length - 1) {
        console.log(`⏳ Waiting ${delay / 1000}s before next product...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ BATCH EXTRACTION COMPLETE');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 Successfully extracted: ${results.length}`);
    console.log(`❌ Errors: ${errors.length}`);
    console.log(`⏱️  Total time: ${elapsed}s`);
    console.log('');

    // Download results
    if (results.length > 0) {
      const output = {
        extractedAt: new Date().toISOString(),
        source: 'whirlpoolcentral.ca',
        totalProducts: results.length,
        errors: errors,
        products: results
      };

      const json = JSON.stringify(output, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whirlpool_batch_${results.length}_products_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(`💾 Downloaded: ${a.download}`);

      // Copy to clipboard
      navigator.clipboard.writeText(json)
        .then(() => console.log('📋 Copied to clipboard!'))
        .catch(() => {});
    }

    console.log('');
    console.log('💡 Access results: window.batchResults');
    console.log('💡 Access errors: window.batchErrors');

    return { results, errors };
  }

  /**
   * Extract from search results or category page
   * Run this on a search results page to get all SKUs
   */
  function getProductSKUsFromPage() {
    const skus = [];

    // Look for product links
    getAll('a[href*="/product/"]').forEach(link => {
      const match = link.href.match(/\/product\/([A-Z0-9-]+)/i);
      if (match && !skus.includes(match[1])) {
        skus.push(match[1]);
      }
    });

    console.log(`Found ${skus.length} product SKUs on this page:`);
    console.log(skus);

    return skus;
  }

  // Helper
  const getAll = (s, c = document) => Array.from(c.querySelectorAll(s));

  // Expose functions globally
  window.extractBatch = extractBatch;
  window.extractProduct = extractProduct;
  window.getProductSKUsFromPage = getProductSKUsFromPage;

  console.log('');
  console.log('📋 Available commands:');
  console.log('  extractBatch(["SKU1", "SKU2", ...])  - Extract multiple products');
  console.log('  extractProduct("SKU")                - Extract single product');
  console.log('  getProductSKUsFromPage()             - Get SKUs from current page');
  console.log('');

})();
