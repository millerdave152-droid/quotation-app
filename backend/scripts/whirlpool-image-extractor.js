/**
 * Whirlpool Central IMAGE ONLY Extractor
 *
 * Extracts just the images from product pages (faster than full extraction)
 *
 * USAGE:
 * 1. Open whirlpoolcentral.ca (logged in)
 * 2. Open browser console (F12 -> Console)
 * 3. Paste this entire script
 * 4. Call: extractImagesForProducts(['SKU1', 'SKU2', 'SKU3'])
 *
 * The script will output a JSON file with SKU -> image mappings
 */

(function() {
  'use strict';

  console.log('🖼️ Whirlpool Central Image Extractor v1.0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Usage: extractImagesForProducts(["SKU1", "SKU2", ...])');
  console.log('');

  const CONFIG = {
    baseUrl: 'https://whirlpoolcentral.ca/product/',
    delayBetweenProducts: 2000,
    pageLoadWait: 3000,
    iframeTimeout: 20000
  };

  window.imageResults = {};
  window.imageErrors = [];

  /**
   * Extract images from a single product page using fetch
   */
  async function extractImagesFromPage(sku) {
    return new Promise((resolve, reject) => {
      const url = CONFIG.baseUrl + sku + '/';

      // Create hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1200px;height:800px;';
      iframe.src = url;

      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          iframe.remove();
          reject(new Error(`Timeout loading ${sku}`));
        }
      }, CONFIG.iframeTimeout);

      iframe.onload = async () => {
        try {
          // Wait for images to load
          await new Promise(r => setTimeout(r, CONFIG.pageLoadWait));

          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

          // Extract all background-image URLs
          const images = [];
          const seen = new Set();

          // Get all elements with background-image
          const allElements = iframeDoc.querySelectorAll('[style*="background"]');
          allElements.forEach(el => {
            const style = el.style.backgroundImage || '';
            const match = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
            if (match && match[1]) {
              const imgUrl = match[1];
              // Only include CDN images
              if ((imgUrl.includes('wpcstorage') || imgUrl.includes('digitalocean')) && !seen.has(imgUrl)) {
                // Skip icons, badges, etc.
                if (!imgUrl.includes('icon') && !imgUrl.includes('badge') && !imgUrl.includes('preview')) {
                  seen.add(imgUrl);

                  // Determine image type from context
                  let type = 'gallery';
                  if (imgUrl.toLowerCase().includes('hero') || imgUrl.includes(sku)) {
                    type = 'hero';
                  } else if (imgUrl.toLowerCase().includes('lifestyle')) {
                    type = 'lifestyle';
                  } else if (imgUrl.toLowerCase().includes('quartz')) {
                    type = 'quartz';
                  }

                  images.push({ url: imgUrl, type });
                }
              }
            }
          });

          // Also check img tags
          const imgTags = iframeDoc.querySelectorAll('img');
          imgTags.forEach(img => {
            const src = img.src || img.dataset.src;
            if (src && (src.includes('wpcstorage') || src.includes('digitalocean'))) {
              if (!seen.has(src) && img.width > 50) {
                seen.add(src);
                images.push({ url: src, type: 'product', alt: img.alt || '' });
              }
            }
          });

          clearTimeout(timeout);
          resolved = true;
          iframe.remove();

          // Find hero image
          let hero = null;
          const heroImg = images.find(i => i.type === 'hero' || i.url.includes(sku));
          if (heroImg) {
            hero = heroImg.url;
          } else if (images.length > 0) {
            hero = images[0].url;
          }

          resolve({
            sku,
            hero,
            gallery: images,
            count: images.length
          });

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
   * Extract images for multiple products
   */
  async function extractImagesForProducts(skuList, options = {}) {
    const { delay = CONFIG.delayBetweenProducts } = options;

    console.log('');
    console.log('🖼️ STARTING IMAGE EXTRACTION');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 Products to process: ${skuList.length}`);
    console.log('');

    const results = {};
    const errors = [];
    const startTime = Date.now();

    for (let i = 0; i < skuList.length; i++) {
      const sku = skuList[i].trim().toUpperCase();
      console.log(`[${i + 1}/${skuList.length}] Extracting images: ${sku}...`);

      try {
        const data = await extractImagesFromPage(sku);
        results[sku] = data;
        window.imageResults[sku] = data;
        console.log(`   ✅ Found ${data.count} images`);
      } catch (err) {
        console.error(`   ❌ Error: ${err.message}`);
        errors.push({ sku, error: err.message });
        window.imageErrors.push({ sku, error: err.message });
      }

      // Delay between products
      if (i < skuList.length - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ IMAGE EXTRACTION COMPLETE');
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 Processed: ${Object.keys(results).length} products`);
    console.log(`❌ Errors: ${errors.length}`);
    console.log(`⏱️ Time: ${elapsed}s`);
    console.log('');

    // Download results
    const output = {
      extractedAt: new Date().toISOString(),
      source: 'whirlpoolcentral.ca',
      totalProducts: Object.keys(results).length,
      images: results,
      errors: errors
    };

    const json = JSON.stringify(output, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whirlpool_images_${Object.keys(results).length}_products_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`💾 Downloaded: ${a.download}`);
    console.log('');
    console.log('💡 Access results: window.imageResults');

    return output;
  }

  /**
   * Get all SKUs from the current category/search page
   */
  function getAllSKUsFromPage() {
    const skus = [];
    document.querySelectorAll('a[href*="/product/"]').forEach(link => {
      const match = link.href.match(/\/product\/([A-Z0-9-]+)/i);
      if (match && !skus.includes(match[1])) {
        skus.push(match[1]);
      }
    });
    console.log(`Found ${skus.length} SKUs on this page`);
    return skus;
  }

  // Expose functions
  window.extractImagesForProducts = extractImagesForProducts;
  window.getAllSKUsFromPage = getAllSKUsFromPage;

  console.log('');
  console.log('📋 Available commands:');
  console.log('  extractImagesForProducts(["SKU1", "SKU2", ...])  - Extract images');
  console.log('  getAllSKUsFromPage()                            - Get SKUs from current page');
  console.log('');

})();
