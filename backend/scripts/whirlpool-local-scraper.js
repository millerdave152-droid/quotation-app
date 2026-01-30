#!/usr/bin/env node
/**
 * WhirlpoolCentral Local Scraper
 *
 * Run this script from YOUR LOCAL MACHINE (with whitelisted IP)
 * NOT from the server (which is blocked).
 *
 * Usage:
 *   cd backend
 *   node scripts/whirlpool-local-scraper.js
 *
 * Options:
 *   --category=Refrigeration   Scrape only one category
 *   --limit=50                 Limit products per category
 *   --headless=false           Show browser (for debugging)
 *   --output=products.json     Output file name
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Configuration
const CONFIG = {
  baseUrl: 'https://whirlpoolcentral.ca',
  username: process.env.WHIRLPOOL_CENTRAL_USERNAME,
  password: process.env.WHIRLPOOL_CENTRAL_PASSWORD,
  categories: ['Refrigeration', 'Laundry', 'Cooking', 'Cleaning'],
  delayBetweenProducts: 1500, // ms between product requests
  delayBetweenPages: 2000,    // ms between pagination
  outputDir: path.join(__dirname, '..', 'data', 'scraped')
};

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = value || true;
  return acc;
}, {});

const OPTIONS = {
  category: args.category || null,        // Single category or all
  limit: parseInt(args.limit) || 1000,    // Max products per category
  headless: args.headless !== 'false',    // Show browser?
  output: args.output || 'whirlpool_products.json'
};

class WhirlpoolLocalScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.products = [];
    this.errors = [];
  }

  async init() {
    console.log('🚀 Starting WhirlpoolCentral Local Scraper...\n');

    // Validate credentials
    if (!CONFIG.username || !CONFIG.password) {
      throw new Error('Missing credentials. Set WHIRLPOOL_CENTRAL_USERNAME and WHIRLPOOL_CENTRAL_PASSWORD in .env');
    }

    // Create output directory
    await fs.mkdir(CONFIG.outputDir, { recursive: true });

    // Launch browser
    this.browser = await puppeteer.launch({
      headless: OPTIONS.headless ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080'
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });

    this.page = await this.browser.newPage();

    // Set realistic user agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('✅ Browser launched\n');
  }

  async login() {
    console.log('🔐 Logging in to WhirlpoolCentral...');

    await this.page.goto(`${CONFIG.baseUrl}/login`, { waitUntil: 'networkidle2' });

    // Check for IP block
    const pageText = await this.page.evaluate(() => document.body?.innerText || '');
    if (pageText.includes('No access') && pageText.includes('Contact admin')) {
      throw new Error('IP BLOCKED: Your IP is not whitelisted. Run this script from a whitelisted machine.');
    }

    // Wait for and fill login form (WordPress)
    await this.page.waitForSelector('#user_login, input[name="log"]', { timeout: 15000 });

    // Fill username
    const usernameInput = await this.page.$('#user_login') || await this.page.$('input[name="log"]');
    if (usernameInput) {
      await usernameInput.click({ clickCount: 3 });
      await usernameInput.type(CONFIG.username, { delay: 50 });
    }

    // Fill password
    const passwordInput = await this.page.$('#user_pass') || await this.page.$('input[name="pwd"]');
    if (passwordInput) {
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(CONFIG.password, { delay: 50 });
    }

    // Click login button
    const loginBtn = await this.page.$('#wp-submit') || await this.page.$('input[type="submit"]');
    if (loginBtn) {
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
        loginBtn.click()
      ]);
    }

    // Verify login success
    const finalUrl = this.page.url();
    if (finalUrl.includes('wp-login') || finalUrl.includes('login')) {
      throw new Error('Login failed. Check your credentials.');
    }

    console.log('✅ Logged in successfully\n');
  }

  async scrapeCategory(categoryName) {
    console.log(`\n📂 Scraping category: ${categoryName}`);

    const categoryProducts = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && categoryProducts.length < OPTIONS.limit) {
      // Navigate to category page
      const categoryUrl = `${CONFIG.baseUrl}/products/?category=${encodeURIComponent(categoryName)}&page=${page}`;
      console.log(`   Page ${page}: ${categoryUrl}`);

      await this.page.goto(categoryUrl, { waitUntil: 'networkidle2' });
      await this.delay(CONFIG.delayBetweenPages);

      // Extract product links from listing page
      const productLinks = await this.page.evaluate(() => {
        const links = [];
        // Try various selectors for product cards
        const productCards = document.querySelectorAll(
          '.product-card a, .product-item a, [data-product] a, .product a[href*="product"]'
        );

        productCards.forEach(card => {
          if (card.href && !links.includes(card.href)) {
            links.push(card.href);
          }
        });

        // Also try finding links with model numbers in the URL
        document.querySelectorAll('a[href]').forEach(a => {
          if (a.href.includes('/product/') && !links.includes(a.href)) {
            links.push(a.href);
          }
        });

        return links;
      });

      if (productLinks.length === 0) {
        console.log(`   No more products found on page ${page}`);
        hasMore = false;
        break;
      }

      console.log(`   Found ${productLinks.length} product links`);

      // Scrape each product
      for (const productUrl of productLinks) {
        if (categoryProducts.length >= OPTIONS.limit) break;

        try {
          const product = await this.scrapeProduct(productUrl, categoryName);
          if (product) {
            categoryProducts.push(product);
            console.log(`   ✓ [${categoryProducts.length}] ${product.modelNumber} - ${product.name.substring(0, 50)}...`);
          }
        } catch (err) {
          console.log(`   ✗ Error scraping ${productUrl}: ${err.message}`);
          this.errors.push({ url: productUrl, error: err.message });
        }

        await this.delay(CONFIG.delayBetweenProducts);
      }

      // Check for next page
      const hasNextPage = await this.page.evaluate(() => {
        const nextBtn = document.querySelector('.pagination .next:not(.disabled), a[rel="next"], .next-page');
        return !!nextBtn;
      });

      if (!hasNextPage) {
        hasMore = false;
      } else {
        page++;
      }
    }

    console.log(`\n   ✅ Completed ${categoryName}: ${categoryProducts.length} products`);
    return categoryProducts;
  }

  async scrapeProduct(productUrl, category) {
    await this.page.goto(productUrl, { waitUntil: 'networkidle2' });

    const productData = await this.page.evaluate((cat) => {
      const getText = (selectors) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return el.textContent.trim();
        }
        return null;
      };

      const getAttr = (selectors, attr) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return el.getAttribute(attr);
        }
        return null;
      };

      // Extract model number
      let modelNumber = getText(['.model-number', '.sku', '[data-model]', '.product-sku']);
      if (!modelNumber) {
        // Try to extract from page content
        const pageText = document.body.innerText;
        const modelMatch = pageText.match(/Model[:\s#]*([A-Z0-9-]+)/i);
        if (modelMatch) modelNumber = modelMatch[1];
      }

      // Extract name
      const name = getText(['h1', '.product-name', '.product-title']);

      // Extract brand
      let brand = getText(['.brand', '.product-brand', '[data-brand]']);
      if (!brand) {
        const brands = ['KitchenAid', 'Whirlpool', 'Maytag', 'Amana', 'JennAir'];
        const pageText = document.body.innerText;
        for (const b of brands) {
          if (pageText.includes(b)) {
            brand = b;
            break;
          }
        }
      }

      // Extract description
      const description = getText(['.product-description', '.description', '[itemprop="description"]']);

      // Extract specifications
      const specifications = {};
      const specRows = document.querySelectorAll('.specifications tr, .specs tr, .product-specs tr');
      specRows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length >= 2) {
          const key = cells[0].textContent.trim();
          const value = cells[1].textContent.trim();
          if (key && value) specifications[key] = value;
        }
      });

      // Try definition lists too
      const dts = document.querySelectorAll('.specifications dt, .specs dt');
      const dds = document.querySelectorAll('.specifications dd, .specs dd');
      dts.forEach((dt, i) => {
        if (dds[i]) {
          specifications[dt.textContent.trim()] = dds[i].textContent.trim();
        }
      });

      // Extract UPC/GTIN
      const upc = getText(['[data-upc]', '.upc']) || specifications['UPC'] || specifications['GTIN'];

      // Extract images
      const imageUrls = [];
      const images = document.querySelectorAll('.product-gallery img, .product-images img, [data-gallery] img');
      images.forEach(img => {
        const url = img.dataset.zoom || img.dataset.large || img.dataset.src || img.src;
        if (url && !url.includes('placeholder') && !imageUrls.includes(url)) {
          imageUrls.push(url);
        }
      });

      // Extract features
      const features = [];
      const featureItems = document.querySelectorAll('.features li, .product-features li, [data-features] li');
      featureItems.forEach(item => {
        const text = item.textContent.trim();
        if (text.length > 5) features.push(text);
      });

      // Extract subcategory
      const subcategory = getText(['.subcategory', '.product-subcategory', '[data-subcategory]']);

      // Extract status
      const status = getText(['.product-status', '.status', '[data-status]']);

      return {
        modelNumber,
        name,
        brand,
        category: cat,
        subcategory,
        description,
        specifications,
        upc,
        status,
        features,
        imageUrls
      };
    }, category);

    if (!productData.modelNumber || !productData.name) {
      return null;
    }

    return {
      vendor: 'Whirlpool',
      modelNumber: productData.modelNumber,
      name: productData.name,
      brand: productData.brand || 'Whirlpool',
      category: productData.category,
      subcategory: productData.subcategory,
      description: productData.description,
      specifications: productData.specifications,
      features: productData.features,
      imageUrls: productData.imageUrls,
      msrp: null,
      dealerPrice: null,
      _meta: {
        upc: productData.upc,
        status: productData.status,
        scrapedAt: new Date().toISOString(),
        sourceUrl: productUrl
      }
    };
  }

  async run() {
    try {
      await this.init();
      await this.login();

      const categories = OPTIONS.category
        ? [OPTIONS.category]
        : CONFIG.categories;

      console.log(`\n📋 Categories to scrape: ${categories.join(', ')}`);
      console.log(`📊 Max products per category: ${OPTIONS.limit}`);
      console.log(`📁 Output: ${OPTIONS.output}\n`);

      for (const category of categories) {
        const categoryProducts = await this.scrapeCategory(category);
        this.products.push(...categoryProducts);

        // Save intermediate results
        await this.saveResults();
      }

      console.log('\n' + '='.repeat(50));
      console.log('📊 SCRAPING COMPLETE');
      console.log('='.repeat(50));
      console.log(`Total products: ${this.products.length}`);
      console.log(`Errors: ${this.errors.length}`);
      console.log(`Output file: ${path.join(CONFIG.outputDir, OPTIONS.output)}`);

      await this.saveResults();

    } catch (err) {
      console.error('\n❌ Fatal error:', err.message);
      throw err;
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  async saveResults() {
    const outputPath = path.join(CONFIG.outputDir, OPTIONS.output);

    // Save products (ready for bulk import)
    await fs.writeFile(outputPath, JSON.stringify(this.products, null, 2));

    // Save errors log
    if (this.errors.length > 0) {
      const errorPath = path.join(CONFIG.outputDir, 'scrape_errors.json');
      await fs.writeFile(errorPath, JSON.stringify(this.errors, null, 2));
    }

    console.log(`💾 Saved ${this.products.length} products to ${outputPath}`);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the scraper
const scraper = new WhirlpoolLocalScraper();
scraper.run()
  .then(() => {
    console.log('\n✅ Scraper finished successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Scraper failed:', err);
    process.exit(1);
  });
