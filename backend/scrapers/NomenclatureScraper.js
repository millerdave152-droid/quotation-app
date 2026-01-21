/**
 * NomenclatureScraper
 *
 * Scraper for Whirlpool Central SKU nomenclature pages.
 * Extracts position-based decoding rules and code meanings.
 *
 * Target: https://whirlpoolcentral.ca/sku-nomenclature/
 *
 * NOTE: Requires valid Whirlpool Central dealer credentials.
 * Set WHIRLPOOL_CENTRAL_USERNAME and WHIRLPOOL_CENTRAL_PASSWORD in .env
 */

const puppeteer = require('puppeteer');
const path = require('path');

class NomenclatureScraper {
  constructor(pool) {
    this.pool = pool;
    this.browser = null;
    this.page = null;
    this.baseUrl = 'https://whirlpoolcentral.ca';
    this.nomenclatureUrl = 'https://whirlpoolcentral.ca/sku-nomenclature/';
    this.isLoggedIn = false;
    this.rateLimit = 2000; // ms between requests
  }

  // ============ BROWSER MANAGEMENT ============

  async initBrowser() {
    if (this.browser) return;

    console.log('Launching browser for nomenclature scraping...');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    this.page = await this.browser.newPage();

    // Set realistic viewport and user agent
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set default timeout
    this.page.setDefaultTimeout(30000);

    console.log('Browser initialized');
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
      console.log('Browser closed');
    }
  }

  // ============ AUTHENTICATION ============

  async login() {
    if (this.isLoggedIn) return true;

    const username = process.env.WHIRLPOOL_CENTRAL_USERNAME;
    const password = process.env.WHIRLPOOL_CENTRAL_PASSWORD;

    if (!username || !password) {
      throw new Error('Whirlpool Central credentials not configured. Set WHIRLPOOL_CENTRAL_USERNAME and WHIRLPOOL_CENTRAL_PASSWORD in .env');
    }

    console.log('Logging into Whirlpool Central...');

    try {
      await this.page.goto(`${this.baseUrl}/login`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Wait for login form
      await this.page.waitForSelector('input[type="text"], input[type="email"], input[name="username"]', { timeout: 15000 });

      // Fill credentials
      const usernameSelectors = ['input[type="email"]', 'input[type="text"]', 'input[name="username"]', 'input[name="email"]', '#email', '#username'];
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
      const loginButtonSelectors = ['button[type="submit"]', 'input[type="submit"]', '.login-button', '#login-btn'];

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
      await new Promise(resolve => setTimeout(resolve, 2000));
      const finalUrl = this.page.url();

      if (finalUrl.includes('/login') || finalUrl.includes('/auth')) {
        throw new Error('Login failed - still on login page');
      }

      this.isLoggedIn = true;
      console.log('Login successful');
      return true;

    } catch (err) {
      console.error('Login failed:', err.message);
      throw err;
    }
  }

  // ============ NOMENCLATURE SCRAPING ============

  /**
   * Get available brands and categories from the nomenclature page
   */
  async getBrandsAndCategories() {
    console.log('Fetching available brands and categories...');

    await this.page.goto(this.nomenclatureUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract brand/category options from the page
    const options = await this.page.evaluate(() => {
      const brands = [];
      const categories = [];

      // Look for dropdowns or tabs for brand selection
      const brandSelects = document.querySelectorAll('select[name*="brand"], select[id*="brand"], .brand-select option');
      brandSelects.forEach(opt => {
        if (opt.value && opt.value !== '') {
          brands.push({ value: opt.value, label: opt.textContent.trim() });
        }
      });

      // Look for category selection
      const categorySelects = document.querySelectorAll('select[name*="category"], select[id*="category"], .category-select option');
      categorySelects.forEach(opt => {
        if (opt.value && opt.value !== '') {
          categories.push({ value: opt.value, label: opt.textContent.trim() });
        }
      });

      // Also check for tab navigation
      const tabs = document.querySelectorAll('[data-brand], [data-category], .brand-tab, .category-tab');
      tabs.forEach(tab => {
        const brand = tab.getAttribute('data-brand');
        const category = tab.getAttribute('data-category');
        if (brand) brands.push({ value: brand, label: tab.textContent.trim() });
        if (category) categories.push({ value: category, label: tab.textContent.trim() });
      });

      return { brands, categories };
    });

    console.log(`Found ${options.brands.length} brands and ${options.categories.length} categories`);
    return options;
  }

  /**
   * Scrape nomenclature rules for a specific brand/category
   */
  async scrapeNomenclaturePage(brand, category) {
    console.log(`Scraping nomenclature for ${brand} - ${category}...`);

    // Navigate to specific brand/category nomenclature
    const url = `${this.nomenclatureUrl}?brand=${encodeURIComponent(brand)}&category=${encodeURIComponent(category)}`;

    await this.page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for content
    await new Promise(resolve => setTimeout(resolve, this.rateLimit));

    // Extract nomenclature data from the page
    const nomenclatureData = await this.page.evaluate((brand, category) => {
      const result = {
        brand,
        category,
        templateName: '',
        description: '',
        exampleModels: [],
        rules: [],
        sourceUrl: window.location.href
      };

      // Try to find the main nomenclature content area
      const contentArea = document.querySelector('.nomenclature-content, .sku-breakdown, .model-decoder, main, article, .content');

      if (!contentArea) {
        return result;
      }

      // Extract title/template name
      const titleEl = contentArea.querySelector('h1, h2, .title, .heading');
      if (titleEl) {
        result.templateName = titleEl.textContent.trim();
      }

      // Extract description
      const descEl = contentArea.querySelector('.description, .intro, p:first-of-type');
      if (descEl) {
        result.description = descEl.textContent.trim();
      }

      // Look for nomenclature tables (position-based breakdown)
      const tables = contentArea.querySelectorAll('table');

      tables.forEach(table => {
        const rows = table.querySelectorAll('tr');

        rows.forEach((row, rowIdx) => {
          // Skip header row
          if (rowIdx === 0) return;

          const cells = row.querySelectorAll('td, th');
          if (cells.length >= 3) {
            // Common patterns:
            // Position | Segment Name | Codes/Meanings
            // or: Position | Code | Meaning

            const position = cells[0]?.textContent?.trim();
            const segmentOrCode = cells[1]?.textContent?.trim();
            const meaningOrCodes = cells[2]?.textContent?.trim();

            // Parse position (e.g., "1-2", "3", "4-5")
            let posStart = 1, posEnd = 1;
            const posMatch = position?.match(/(\d+)(?:-(\d+))?/);
            if (posMatch) {
              posStart = parseInt(posMatch[1]);
              posEnd = posMatch[2] ? parseInt(posMatch[2]) : posStart;
            }

            // Check if this is a rule row or a code row
            if (cells.length >= 4) {
              // Likely: Position | Name | Code | Meaning
              const code = cells[2]?.textContent?.trim();
              const meaning = cells[3]?.textContent?.trim();

              // Find or create rule
              let rule = result.rules.find(r => r.positionStart === posStart && r.positionEnd === posEnd);
              if (!rule) {
                rule = {
                  positionStart: posStart,
                  positionEnd: posEnd,
                  segmentName: segmentOrCode,
                  codes: []
                };
                result.rules.push(rule);
              }

              if (code && meaning) {
                rule.codes.push({ code, meaning, raw: row.textContent.trim() });
              }
            } else {
              // Simpler table: Position | Segment | Codes list
              let rule = result.rules.find(r => r.positionStart === posStart && r.positionEnd === posEnd);
              if (!rule) {
                rule = {
                  positionStart: posStart,
                  positionEnd: posEnd,
                  segmentName: segmentOrCode,
                  description: meaningOrCodes,
                  codes: []
                };
                result.rules.push(rule);
              }
            }
          }
        });
      });

      // Also look for definition lists (dl/dt/dd)
      const dlLists = contentArea.querySelectorAll('dl');
      dlLists.forEach(dl => {
        const dts = dl.querySelectorAll('dt');
        const dds = dl.querySelectorAll('dd');

        dts.forEach((dt, idx) => {
          const code = dt.textContent.trim();
          const meaning = dds[idx]?.textContent?.trim() || '';

          // Try to associate with a rule based on position
          if (result.rules.length > 0) {
            // Add to first rule that doesn't have this code
            const rule = result.rules.find(r => !r.codes.some(c => c.code === code));
            if (rule) {
              rule.codes.push({ code, meaning, raw: dt.textContent + ' - ' + meaning });
            }
          }
        });
      });

      // Look for example models
      const exampleElements = contentArea.querySelectorAll('.example-model, .model-example, code, .model-number');
      exampleElements.forEach(el => {
        const model = el.textContent.trim();
        if (model && model.length >= 5 && model.length <= 20 && /^[A-Z0-9]+$/i.test(model)) {
          result.exampleModels.push(model);
        }
      });

      return result;
    }, brand, category);

    return nomenclatureData;
  }

  /**
   * Scrape all brands and categories
   */
  async scrapeAllBrandCategories(jobId) {
    const results = {
      brands: 0,
      categories: 0,
      templates: 0,
      rules: 0,
      codes: 0,
      errors: []
    };

    try {
      // Get available brands/categories
      const options = await this.getBrandsAndCategories();

      // If no options found via selectors, use default Whirlpool brands
      const brands = options.brands.length > 0 ? options.brands : [
        { value: 'whirlpool', label: 'Whirlpool' },
        { value: 'kitchenaid', label: 'KitchenAid' },
        { value: 'maytag', label: 'Maytag' },
        { value: 'amana', label: 'Amana' },
        { value: 'jennair', label: 'JennAir' }
      ];

      const categories = options.categories.length > 0 ? options.categories : [
        { value: 'refrigerators', label: 'Refrigerators' },
        { value: 'washers', label: 'Washers' },
        { value: 'dryers', label: 'Dryers' },
        { value: 'ranges', label: 'Ranges' },
        { value: 'dishwashers', label: 'Dishwashers' },
        { value: 'microwaves', label: 'Microwaves' },
        { value: 'cooktops', label: 'Cooktops' },
        { value: 'ovens', label: 'Ovens' },
        { value: 'freezers', label: 'Freezers' }
      ];

      results.brands = brands.length;
      results.categories = categories.length;

      // Update job progress
      if (jobId) {
        await this.updateJobProgress(jobId, {
          brands_found: brands.length,
          categories_found: categories.length
        });
      }

      // Scrape each brand/category combination
      for (const brand of brands) {
        for (const category of categories) {
          try {
            const data = await this.scrapeNomenclaturePage(brand.value, category.value);

            if (data.rules && data.rules.length > 0) {
              // Save to database
              const saved = await this.saveNomenclatureData(data, jobId);
              results.templates += saved.templates;
              results.rules += saved.rules;
              results.codes += saved.codes;

              console.log(`  Saved ${brand.label} ${category.label}: ${saved.rules} rules, ${saved.codes} codes`);
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, this.rateLimit));

          } catch (err) {
            console.error(`  Error scraping ${brand.label} ${category.label}:`, err.message);
            results.errors.push(`${brand.label} ${category.label}: ${err.message}`);
          }
        }
      }

      return results;

    } catch (err) {
      console.error('Scrape failed:', err);
      throw err;
    }
  }

  // ============ DATABASE OPERATIONS ============

  /**
   * Save scraped nomenclature data to database
   */
  async saveNomenclatureData(data, jobId) {
    const saved = { templates: 0, rules: 0, codes: 0 };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Normalize brand name
      const manufacturer = data.brand.toUpperCase().replace(/[^A-Z]/g, '');
      const productType = data.category.toLowerCase();

      // Upsert template
      const templateResult = await client.query(`
        INSERT INTO nomenclature_templates (
          manufacturer, product_type, template_name, description,
          example_models, source_url, scraped_at, is_scraped, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), true, true)
        ON CONFLICT (manufacturer, product_type)
        DO UPDATE SET
          template_name = COALESCE(EXCLUDED.template_name, nomenclature_templates.template_name),
          description = COALESCE(EXCLUDED.description, nomenclature_templates.description),
          example_models = COALESCE(EXCLUDED.example_models, nomenclature_templates.example_models),
          source_url = EXCLUDED.source_url,
          scraped_at = NOW(),
          is_scraped = true,
          version = nomenclature_templates.version + 1,
          updated_at = NOW()
        RETURNING id, (xmax = 0) as is_new
      `, [
        manufacturer,
        productType,
        data.templateName || `${manufacturer} ${productType} Nomenclature`,
        data.description || null,
        data.exampleModels.length > 0 ? data.exampleModels : null,
        data.sourceUrl
      ]);

      const templateId = templateResult.rows[0].id;
      const isNewTemplate = templateResult.rows[0].is_new;
      if (isNewTemplate) saved.templates++;

      // Colors for segments
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

      // Save rules and codes
      for (let i = 0; i < data.rules.length; i++) {
        const rule = data.rules[i];
        const color = colors[i % colors.length];

        // Upsert rule
        const ruleResult = await client.query(`
          INSERT INTO nomenclature_rules (
            template_id, position_start, position_end, segment_name,
            segment_description, display_order, color
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT ON CONSTRAINT nomenclature_rules_template_position_unique
          DO UPDATE SET
            segment_name = COALESCE(EXCLUDED.segment_name, nomenclature_rules.segment_name),
            segment_description = COALESCE(EXCLUDED.segment_description, nomenclature_rules.segment_description),
            display_order = EXCLUDED.display_order
          RETURNING id, (xmax = 0) as is_new
        `, [
          templateId,
          rule.positionStart,
          rule.positionEnd,
          rule.segmentName,
          rule.description || null,
          i,
          color
        ]);

        // Check if constraint exists, if not create rule without ON CONFLICT
        let ruleId;
        if (ruleResult.rows.length > 0) {
          ruleId = ruleResult.rows[0].id;
          if (ruleResult.rows[0].is_new) saved.rules++;
        } else {
          // Fallback: try simple insert
          const fallbackResult = await client.query(`
            INSERT INTO nomenclature_rules (
              template_id, position_start, position_end, segment_name,
              segment_description, display_order, color
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
          `, [
            templateId,
            rule.positionStart,
            rule.positionEnd,
            rule.segmentName,
            rule.description || null,
            i,
            color
          ]);
          ruleId = fallbackResult.rows[0].id;
          saved.rules++;
        }

        // Save codes
        for (const code of rule.codes || []) {
          try {
            await client.query(`
              INSERT INTO nomenclature_codes (
                rule_id, code_value, code_meaning, scraped_raw, is_common
              ) VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (rule_id, code_value)
              DO UPDATE SET
                code_meaning = COALESCE(EXCLUDED.code_meaning, nomenclature_codes.code_meaning),
                scraped_raw = EXCLUDED.scraped_raw
            `, [
              ruleId,
              code.code,
              code.meaning,
              code.raw || null,
              false
            ]);
            saved.codes++;
          } catch (err) {
            // Skip duplicate codes
            if (!err.message.includes('duplicate')) {
              console.error('Error saving code:', err.message);
            }
          }
        }
      }

      await client.query('COMMIT');

      // Log change if job tracking
      if (jobId && (saved.templates > 0 || saved.rules > 0 || saved.codes > 0)) {
        await this.logChange(jobId, templateId, 'template', isNewTemplate ? 'added' : 'modified');
      }

      return saved;

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Update scrape job progress
   */
  async updateJobProgress(jobId, updates) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');

    await this.pool.query(
      `UPDATE nomenclature_scrape_jobs SET ${setClause} WHERE id = $1`,
      [jobId, ...values]
    );
  }

  /**
   * Log nomenclature changes
   */
  async logChange(jobId, templateId, entityType, changeType, fieldName = null, oldValue = null, newValue = null) {
    await this.pool.query(`
      INSERT INTO nomenclature_change_log (
        template_id, entity_type, change_type, field_name, old_value, new_value, scrape_job_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [templateId, entityType, changeType, fieldName, oldValue, newValue, jobId]);
  }

  // ============ JOB MANAGEMENT ============

  /**
   * Create a new scrape job
   */
  async createJob(userId, jobType = 'full', targetBrand = null, targetCategory = null) {
    const result = await this.pool.query(`
      INSERT INTO nomenclature_scrape_jobs (
        status, job_type, target_brand, target_category, created_by
      ) VALUES ('pending', $1, $2, $3, $4)
      RETURNING id
    `, [jobType, targetBrand, targetCategory, userId]);

    return result.rows[0].id;
  }

  /**
   * Start scrape job
   */
  async startJob(jobId) {
    await this.pool.query(`
      UPDATE nomenclature_scrape_jobs
      SET status = 'running', started_at = NOW()
      WHERE id = $1
    `, [jobId]);
  }

  /**
   * Complete scrape job
   */
  async completeJob(jobId, results) {
    await this.pool.query(`
      UPDATE nomenclature_scrape_jobs
      SET status = 'completed',
          completed_at = NOW(),
          templates_created = $2,
          rules_created = $3,
          codes_created = $4,
          error_log = $5
      WHERE id = $1
    `, [
      jobId,
      results.templates || 0,
      results.rules || 0,
      results.codes || 0,
      results.errors?.length > 0 ? results.errors.join('\n') : null
    ]);
  }

  /**
   * Fail scrape job
   */
  async failJob(jobId, error) {
    await this.pool.query(`
      UPDATE nomenclature_scrape_jobs
      SET status = 'failed', completed_at = NOW(), error_log = $2
      WHERE id = $1
    `, [jobId, error]);
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId) {
    const result = await this.pool.query(
      'SELECT * FROM nomenclature_scrape_jobs WHERE id = $1',
      [jobId]
    );
    return result.rows[0];
  }

  /**
   * Get recent jobs
   */
  async getRecentJobs(limit = 10) {
    const result = await this.pool.query(`
      SELECT * FROM nomenclature_scrape_jobs
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  // ============ MAIN ENTRY POINT ============

  /**
   * Run a full nomenclature scrape
   */
  async runFullScrape(userId) {
    let jobId;

    try {
      // Create job
      jobId = await this.createJob(userId, 'full');
      await this.startJob(jobId);

      // Initialize browser
      await this.initBrowser();

      // Login
      await this.login();

      // Scrape all brands/categories
      const results = await this.scrapeAllBrandCategories(jobId);

      // Complete job
      await this.completeJob(jobId, results);

      console.log('\nScrape completed:', results);
      return { jobId, ...results };

    } catch (err) {
      console.error('Scrape failed:', err);
      if (jobId) {
        await this.failJob(jobId, err.message);
      }
      throw err;

    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * Scrape a single brand
   */
  async scrapeSingleBrand(userId, brand) {
    let jobId;

    try {
      jobId = await this.createJob(userId, 'single_brand', brand);
      await this.startJob(jobId);

      await this.initBrowser();
      await this.login();

      const results = {
        brands: 1,
        categories: 0,
        templates: 0,
        rules: 0,
        codes: 0,
        errors: []
      };

      const categories = ['refrigerators', 'washers', 'dryers', 'ranges', 'dishwashers', 'microwaves'];
      results.categories = categories.length;

      for (const category of categories) {
        try {
          const data = await this.scrapeNomenclaturePage(brand, category);

          if (data.rules && data.rules.length > 0) {
            const saved = await this.saveNomenclatureData(data, jobId);
            results.templates += saved.templates;
            results.rules += saved.rules;
            results.codes += saved.codes;
          }

          await new Promise(resolve => setTimeout(resolve, this.rateLimit));
        } catch (err) {
          results.errors.push(`${brand} ${category}: ${err.message}`);
        }
      }

      await this.completeJob(jobId, results);
      return { jobId, ...results };

    } catch (err) {
      if (jobId) await this.failJob(jobId, err.message);
      throw err;

    } finally {
      await this.closeBrowser();
    }
  }
}

module.exports = NomenclatureScraper;
