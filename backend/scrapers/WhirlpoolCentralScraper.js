/**
 * WhirlpoolCentralScraper
 *
 * Specialized scraper for Whirlpool Central dealer portal (whirlpoolcentral.ca).
 * Handles authentication, catalog navigation, and data extraction.
 *
 * NOTE: This scraper requires valid Whirlpool Central dealer credentials.
 * Set WHIRLPOOL_CENTRAL_USERNAME and WHIRLPOOL_CENTRAL_PASSWORD in .env
 */

const VendorScraperService = require('../services/VendorScraperService');

class WhirlpoolCentralScraper {
  constructor(page, vendorSource) {
    this.page = page;
    this.vendorSource = vendorSource;
    this.baseUrl = vendorSource.base_url || 'https://whirlpoolcentral.ca';
    this.isLoggedIn = false;
  }

  // ============ AUTHENTICATION ============

  async login() {
    const username = process.env.WHIRLPOOL_CENTRAL_USERNAME;
    const password = process.env.WHIRLPOOL_CENTRAL_PASSWORD;

    if (!username || !password) {
      throw new Error('Whirlpool Central credentials not configured. Set WHIRLPOOL_CENTRAL_USERNAME and WHIRLPOOL_CENTRAL_PASSWORD in .env');
    }

    console.log('Navigating to Whirlpool Central login page...');

    try {
      // Navigate to login page
      await this.page.goto(`${this.baseUrl}/login`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for login form
      await this.page.waitForSelector('input[type="email"], input[name="username"], input[name="email"], #email', { timeout: 10000 });

      // Fill in credentials - try multiple possible selectors
      const usernameSelectors = ['input[type="email"]', 'input[name="username"]', 'input[name="email"]', '#email', '#username'];
      const passwordSelectors = ['input[type="password"]', 'input[name="password"]', '#password'];

      for (const selector of usernameSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          await element.type(username, { delay: 50 });
          break;
        }
      }

      for (const selector of passwordSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          await element.type(password, { delay: 50 });
          break;
        }
      }

      // Click login button
      const loginButtonSelectors = ['button[type="submit"]', 'input[type="submit"]', '.login-button', '#login-btn', 'button:contains("Sign In")', 'button:contains("Login")'];

      for (const selector of loginButtonSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            await Promise.all([
              this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
              element.click()
            ]);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // Verify login success
      await this.page.waitForTimeout(2000);
      const currentUrl = this.page.url();

      if (currentUrl.includes('login') || currentUrl.includes('signin')) {
        // Check for error messages
        const errorText = await this.page.evaluate(() => {
          const error = document.querySelector('.error, .alert-danger, .login-error');
          return error ? error.textContent : null;
        });

        if (errorText) {
          throw new Error(`Login failed: ${errorText}`);
        }
        throw new Error('Login failed: Still on login page');
      }

      this.isLoggedIn = true;
      console.log('Successfully logged in to Whirlpool Central');
      return true;

    } catch (error) {
      console.error('Login error:', error.message);
      throw error;
    }
  }

  async checkLoginStatus() {
    const currentUrl = this.page.url();
    if (currentUrl.includes('login') || currentUrl.includes('signin')) {
      this.isLoggedIn = false;
      return false;
    }

    // Check for common logged-in indicators
    const isLoggedIn = await this.page.evaluate(() => {
      const logoutLink = document.querySelector('a[href*="logout"], .logout, .sign-out');
      const accountMenu = document.querySelector('.account-menu, .user-menu, .my-account');
      return !!(logoutLink || accountMenu);
    });

    this.isLoggedIn = isLoggedIn;
    return isLoggedIn;
  }

  // ============ CATALOG NAVIGATION ============

  async getCategoryUrls() {
    console.log('Fetching category URLs...');

    try {
      // Navigate to products page
      await this.page.goto(`${this.baseUrl}/products`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Extract category links - adjust selectors based on actual site structure
      const categories = await this.page.evaluate(() => {
        const categoryLinks = [];

        // Try various possible category selectors
        const selectors = [
          '.category-nav a',
          '.product-categories a',
          '.sidebar-nav a',
          'nav.categories a',
          '.category-list a',
          '[data-category] a',
          '.nav-categories a'
        ];

        for (const selector of selectors) {
          const links = document.querySelectorAll(selector);
          if (links.length > 0) {
            links.forEach(link => {
              const href = link.href;
              const name = link.textContent.trim();
              if (href && name && !categoryLinks.some(c => c.url === href)) {
                categoryLinks.push({ name, url: href });
              }
            });
          }
        }

        // If no category nav found, try to find category filters
        if (categoryLinks.length === 0) {
          const filterOptions = document.querySelectorAll('[data-filter-category], .filter-category option');
          filterOptions.forEach(opt => {
            const value = opt.value || opt.dataset.filterCategory;
            const name = opt.textContent.trim();
            if (value && name) {
              categoryLinks.push({ name, url: value });
            }
          });
        }

        return categoryLinks;
      });

      // Map to standard categories
      const standardCategories = ['Cooking', 'Cleaning', 'Refrigeration', 'Laundry'];
      const mappedCategories = categories.map(cat => {
        const lowerName = cat.name.toLowerCase();
        let standardCategory = cat.name;

        if (lowerName.includes('range') || lowerName.includes('oven') || lowerName.includes('cook') || lowerName.includes('microwave')) {
          standardCategory = 'Cooking';
        } else if (lowerName.includes('dishwash') || lowerName.includes('clean')) {
          standardCategory = 'Cleaning';
        } else if (lowerName.includes('fridge') || lowerName.includes('refrig') || lowerName.includes('freezer')) {
          standardCategory = 'Refrigeration';
        } else if (lowerName.includes('wash') || lowerName.includes('dry') || lowerName.includes('laundry')) {
          standardCategory = 'Laundry';
        }

        return {
          ...cat,
          standardCategory
        };
      });

      console.log(`Found ${mappedCategories.length} categories`);
      return mappedCategories;

    } catch (error) {
      console.error('Error fetching categories:', error.message);
      return [];
    }
  }

  async getProductListFromCategory(categoryUrl, options = {}) {
    const { maxProducts = 1000 } = options;
    console.log(`Fetching product list from category: ${categoryUrl}`);

    try {
      await this.page.goto(categoryUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      const products = [];
      let hasNextPage = true;
      let pageNum = 1;

      while (hasNextPage && products.length < maxProducts) {
        console.log(`  Scraping page ${pageNum}...`);

        // Extract product links from current page
        const pageProducts = await this.page.evaluate(() => {
          const items = [];

          // Try various product card selectors
          const selectors = [
            '.product-card',
            '.product-item',
            '.product-tile',
            '[data-product]',
            '.product-grid-item',
            '.product'
          ];

          let productElements = [];
          for (const selector of selectors) {
            productElements = document.querySelectorAll(selector);
            if (productElements.length > 0) break;
          }

          productElements.forEach(el => {
            // Find link
            const linkEl = el.querySelector('a[href*="product"], a.product-link, a');
            const link = linkEl ? linkEl.href : null;

            // Find model number
            const modelEl = el.querySelector('.model, .model-number, [data-model], .sku');
            const model = modelEl ? modelEl.textContent.trim() : null;

            // Find name
            const nameEl = el.querySelector('.product-name, .title, h2, h3, h4');
            const name = nameEl ? nameEl.textContent.trim() : null;

            // Find price
            const priceEl = el.querySelector('.price, .product-price, [data-price]');
            const priceText = priceEl ? priceEl.textContent : null;

            // Find image
            const imgEl = el.querySelector('img');
            const thumbnail = imgEl ? (imgEl.dataset.src || imgEl.src) : null;

            if (link) {
              items.push({ link, model, name, priceText, thumbnail });
            }
          });

          return items;
        });

        products.push(...pageProducts);
        console.log(`    Found ${pageProducts.length} products on page ${pageNum}`);

        // Check for next page
        const nextPageExists = await this.page.evaluate(() => {
          const nextBtn = document.querySelector('.pagination .next:not(.disabled), a[rel="next"], .load-more');
          return !!nextBtn;
        });

        if (nextPageExists && products.length < maxProducts) {
          // Click next page
          try {
            await Promise.all([
              this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
              this.page.click('.pagination .next, a[rel="next"], .load-more')
            ]);
            pageNum++;
            await VendorScraperService.delay(1000);
          } catch (e) {
            hasNextPage = false;
          }
        } else {
          hasNextPage = false;
        }
      }

      console.log(`  Total products found: ${products.length}`);
      return products;

    } catch (error) {
      console.error('Error fetching product list:', error.message);
      return [];
    }
  }

  // ============ PRODUCT DETAILS ============

  async getProductDetails(productUrl) {
    console.log(`Fetching product details: ${productUrl}`);

    try {
      await this.page.goto(productUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Extract all product data
      const productData = await this.page.evaluate(() => {
        const data = {
          name: null,
          modelNumber: null,
          description: null,
          brand: null,
          category: null,
          subcategory: null,
          msrpCents: null,
          dealerPriceCents: null,
          specifications: {},
          features: [],
          dimensions: {},
          energyRating: null,
          colorFinish: null,
          images: [],
          assets: []
        };

        // Name
        const nameEl = document.querySelector('h1, .product-name, .product-title');
        data.name = nameEl ? nameEl.textContent.trim() : null;

        // Model number
        const modelSelectors = ['.model-number', '[data-model]', '.sku', '.product-sku', 'span:contains("Model")'];
        for (const selector of modelSelectors) {
          const el = document.querySelector(selector);
          if (el) {
            let text = el.textContent.trim();
            // Clean up model number
            text = text.replace(/^(model|sku|item)[:\s#]*/i, '').trim();
            if (text && text.length > 3 && text.length < 30) {
              data.modelNumber = text;
              break;
            }
          }
        }

        // Brand - look for Whirlpool brands
        const brands = ['Whirlpool', 'Maytag', 'KitchenAid', 'Amana', 'JennAir', 'Gladiator'];
        const pageText = document.body.innerText;
        for (const brand of brands) {
          if (pageText.includes(brand)) {
            data.brand = brand;
            break;
          }
        }

        // Description
        const descEl = document.querySelector('.product-description, .description, [itemprop="description"]');
        data.description = descEl ? descEl.textContent.trim() : null;

        // Prices
        const priceSelectors = {
          msrp: ['.msrp', '.list-price', '.regular-price', '[data-msrp]'],
          dealer: ['.dealer-price', '.your-price', '.sale-price', '.special-price', '[data-dealer-price]']
        };

        const parsePrice = (text) => {
          if (!text) return null;
          const match = text.replace(/[^0-9.]/g, '');
          const price = parseFloat(match);
          return isNaN(price) ? null : Math.round(price * 100);
        };

        for (const selector of priceSelectors.msrp) {
          const el = document.querySelector(selector);
          if (el) {
            data.msrpCents = parsePrice(el.textContent);
            if (data.msrpCents) break;
          }
        }

        for (const selector of priceSelectors.dealer) {
          const el = document.querySelector(selector);
          if (el) {
            data.dealerPriceCents = parsePrice(el.textContent);
            if (data.dealerPriceCents) break;
          }
        }

        // Specifications table
        const specTables = document.querySelectorAll('.specifications table, .specs table, .product-specs table, [data-specifications] table');
        specTables.forEach(table => {
          const rows = table.querySelectorAll('tr');
          rows.forEach(row => {
            const cells = row.querySelectorAll('td, th');
            if (cells.length >= 2) {
              const key = cells[0].textContent.trim();
              const value = cells[1].textContent.trim();
              if (key && value) {
                data.specifications[key] = value;

                // Extract specific values
                if (key.toLowerCase().includes('energy')) {
                  data.energyRating = value;
                }
                if (key.toLowerCase().includes('color') || key.toLowerCase().includes('finish')) {
                  data.colorFinish = value;
                }
              }
            }
          });
        });

        // Also try definition lists
        const specDls = document.querySelectorAll('.specifications dl, .specs dl');
        specDls.forEach(dl => {
          const dts = dl.querySelectorAll('dt');
          const dds = dl.querySelectorAll('dd');
          dts.forEach((dt, i) => {
            if (dds[i]) {
              data.specifications[dt.textContent.trim()] = dds[i].textContent.trim();
            }
          });
        });

        // Features list
        const featureSelectors = ['.features li', '.product-features li', '[data-features] li', '.feature-list li'];
        for (const selector of featureSelectors) {
          const items = document.querySelectorAll(selector);
          if (items.length > 0) {
            items.forEach(item => {
              const text = item.textContent.trim();
              if (text && text.length > 5) {
                data.features.push(text);
              }
            });
            break;
          }
        }

        // Dimensions
        const dimPatterns = [
          { key: 'width', pattern: /width[:\s]*([0-9.]+)/i },
          { key: 'height', pattern: /height[:\s]*([0-9.]+)/i },
          { key: 'depth', pattern: /depth[:\s]*([0-9.]+)/i }
        ];

        const specText = JSON.stringify(data.specifications);
        dimPatterns.forEach(({ key, pattern }) => {
          const match = specText.match(pattern);
          if (match) {
            data.dimensions[key] = parseFloat(match[1]);
          }
        });

        // Images
        const imageSelectors = [
          '.product-gallery img',
          '.product-images img',
          '[data-gallery] img',
          '.gallery-item img',
          '.product-image-main img',
          '.product-thumbnails img'
        ];

        const seenUrls = new Set();
        for (const selector of imageSelectors) {
          const imgs = document.querySelectorAll(selector);
          imgs.forEach((img, index) => {
            // Get highest resolution URL
            const url = img.dataset.zoom || img.dataset.large || img.dataset.src || img.src;
            if (url && !seenUrls.has(url) && !url.includes('placeholder')) {
              seenUrls.add(url);
              data.images.push({
                url,
                imageType: index === 0 ? 'hero' : 'gallery',
                angle: img.alt || null,
                sortOrder: index
              });
            }
          });
        }

        // Assets (PDFs, manuals)
        const assetLinks = document.querySelectorAll('a[href*=".pdf"], a[href*="spec-sheet"], a[href*="manual"], a[href*="document"]');
        assetLinks.forEach(link => {
          const href = link.href;
          const text = link.textContent.trim().toLowerCase();
          let assetType = 'document';

          if (text.includes('spec') || href.includes('spec')) {
            assetType = 'spec_sheet';
          } else if (text.includes('manual') || text.includes('guide') || href.includes('manual')) {
            assetType = 'manual';
          } else if (text.includes('install')) {
            assetType = 'install_guide';
          } else if (text.includes('brochure')) {
            assetType = 'brochure';
          }

          data.assets.push({
            url: href,
            name: link.textContent.trim(),
            assetType
          });
        });

        return data;
      });

      return productData;

    } catch (error) {
      console.error('Error fetching product details:', error.message);
      return null;
    }
  }

  // ============ FULL SCRAPE ============

  async scrapeFullCatalog(options = {}) {
    const { categories = null, maxProductsPerCategory = 500, downloadImages = true } = options;

    // Start scrape job
    const job = await VendorScraperService.startScrapeJob(this.vendorSource.id, 'full');

    try {
      // Ensure logged in
      if (!this.isLoggedIn) {
        await this.login();
      }

      // Get categories
      let categoryList = await this.getCategoryUrls();

      // Filter categories if specified
      if (categories && categories.length > 0) {
        categoryList = categoryList.filter(cat =>
          categories.some(c => cat.name.toLowerCase().includes(c.toLowerCase()) || cat.standardCategory === c)
        );
      }

      let totalProductsFound = 0;
      let totalProductsScraped = 0;
      let totalProductsFailed = 0;
      let totalImagesDownloaded = 0;

      for (const category of categoryList) {
        console.log(`\nProcessing category: ${category.name} (${category.standardCategory})`);

        // Get product list
        const productList = await this.getProductListFromCategory(category.url, { maxProducts: maxProductsPerCategory });
        totalProductsFound += productList.length;

        await VendorScraperService.updateJobProgress(job.id, {
          productsFound: totalProductsFound,
          productsScraped: totalProductsScraped,
          productsFailed: totalProductsFailed,
          imagesDownloaded: totalImagesDownloaded
        });

        // Scrape each product
        for (let i = 0; i < productList.length; i++) {
          const productInfo = productList[i];
          console.log(`  [${i + 1}/${productList.length}] Scraping: ${productInfo.model || productInfo.name}`);

          try {
            // Respect rate limit
            await VendorScraperService.respectRateLimit(this.vendorSource);

            // Get product details
            const details = await this.getProductDetails(productInfo.link);

            if (details && details.modelNumber) {
              // Set category
              details.category = category.standardCategory;
              details.subcategory = category.name;

              // Save product
              const savedProduct = await VendorScraperService.upsertProduct(this.vendorSource.id, details);
              totalProductsScraped++;

              // Download and process images
              if (downloadImages && details.images.length > 0) {
                for (const imgData of details.images) {
                  const savedImage = await VendorScraperService.processAndSaveImage(savedProduct, imgData);
                  if (savedImage) {
                    totalImagesDownloaded++;
                  }
                }
              }

              // Save assets
              for (const assetData of details.assets) {
                await VendorScraperService.saveProductAsset(savedProduct.id, assetData);
              }

            } else {
              console.log(`    Skipped: No model number found`);
              totalProductsFailed++;
            }

          } catch (err) {
            console.error(`    Error: ${err.message}`);
            totalProductsFailed++;
          }

          // Update progress periodically
          if (i % 10 === 0) {
            await VendorScraperService.updateJobProgress(job.id, {
              productsFound: totalProductsFound,
              productsScraped: totalProductsScraped,
              productsFailed: totalProductsFailed,
              imagesDownloaded: totalImagesDownloaded
            });
          }
        }
      }

      // Complete job
      await VendorScraperService.completeJob(job.id, 'completed');
      await VendorScraperService.updateLastSync(this.vendorSource.id);

      console.log('\nScrape completed!');
      console.log(`  Products found: ${totalProductsFound}`);
      console.log(`  Products scraped: ${totalProductsScraped}`);
      console.log(`  Products failed: ${totalProductsFailed}`);
      console.log(`  Images downloaded: ${totalImagesDownloaded}`);

      return {
        success: true,
        jobId: job.id,
        stats: {
          productsFound: totalProductsFound,
          productsScraped: totalProductsScraped,
          productsFailed: totalProductsFailed,
          imagesDownloaded: totalImagesDownloaded
        }
      };

    } catch (error) {
      console.error('Scrape failed:', error);
      await VendorScraperService.completeJob(job.id, 'failed', error.message);
      throw error;
    }
  }

  // ============ SINGLE PRODUCT SCRAPE ============

  async scrapeSingleProduct(modelNumber, options = {}) {
    const { downloadImages = true } = options;

    console.log(`Scraping single product: ${modelNumber}`);

    // Start scrape job
    const job = await VendorScraperService.startScrapeJob(this.vendorSource.id, 'single_product');

    try {
      // Ensure logged in
      if (!this.isLoggedIn) {
        await this.login();
      }

      // Search for product
      await this.page.goto(`${this.baseUrl}/search?q=${encodeURIComponent(modelNumber)}`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Find product link in search results
      const productLink = await this.page.evaluate((model) => {
        const links = document.querySelectorAll('a[href*="product"]');
        for (const link of links) {
          if (link.textContent.toLowerCase().includes(model.toLowerCase()) ||
              link.href.toLowerCase().includes(model.toLowerCase())) {
            return link.href;
          }
        }
        return null;
      }, modelNumber);

      if (!productLink) {
        throw new Error(`Product not found: ${modelNumber}`);
      }

      // Get product details
      const details = await this.getProductDetails(productLink);

      if (!details || !details.modelNumber) {
        throw new Error('Failed to extract product details');
      }

      // Save product
      const savedProduct = await VendorScraperService.upsertProduct(this.vendorSource.id, details);
      let imagesDownloaded = 0;

      // Download images
      if (downloadImages && details.images.length > 0) {
        for (const imgData of details.images) {
          const savedImage = await VendorScraperService.processAndSaveImage(savedProduct, imgData);
          if (savedImage) {
            imagesDownloaded++;
          }
        }
      }

      // Save assets
      for (const assetData of details.assets) {
        await VendorScraperService.saveProductAsset(savedProduct.id, assetData);
      }

      // Complete job
      await VendorScraperService.completeJob(job.id, 'completed');

      console.log(`Product scraped successfully: ${savedProduct.model_number}`);

      return {
        success: true,
        product: savedProduct,
        imagesDownloaded
      };

    } catch (error) {
      console.error('Single product scrape failed:', error);
      await VendorScraperService.completeJob(job.id, 'failed', error.message);
      throw error;
    }
  }
}

module.exports = WhirlpoolCentralScraper;
