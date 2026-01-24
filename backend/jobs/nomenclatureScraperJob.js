/**
 * Nomenclature Scraper Scheduled Job
 *
 * Automatically scrapes nomenclature data from whirlpoolcentral.ca
 * on a weekly schedule and monitors data freshness.
 *
 * Schedule: Every Sunday at 2:00 AM
 */

const cron = require('node-cron');
const { Pool } = require('pg');

// Module state
let isInitialized = false;
let pool = null;
let NomenclatureScraper = null;

/**
 * Initialize the scraper job
 */
const init = (dbPool) => {
  if (isInitialized) return;

  pool = dbPool;
  NomenclatureScraper = require('../scrapers/NomenclatureScraper');
  isInitialized = true;

  console.log('✅ Nomenclature scraper job initialized');
};

/**
 * Run the nomenclature scrape
 */
const runScrape = async () => {
  if (!pool || !NomenclatureScraper) {
    console.error('Nomenclature scraper job not initialized');
    return;
  }

  console.log('\n========================================');
  console.log('  SCHEDULED NOMENCLATURE SCRAPE');
  console.log('  Started:', new Date().toISOString());
  console.log('========================================\n');

  const scraper = new NomenclatureScraper(pool);

  try {
    // Create a system job (user_id = null for automated jobs)
    const jobId = await scraper.createJob(null, 'full');
    await scraper.startJob(jobId);

    // Run the scrape
    await scraper.initBrowser();
    await scraper.login();
    const results = await scraper.scrapeAllBrandCategories(jobId);

    // Complete the job
    await scraper.completeJob(jobId, results);

    console.log('\n========================================');
    console.log('  SCRAPE COMPLETED');
    console.log(`  Templates: ${results.templates}`);
    console.log(`  Rules: ${results.rules}`);
    console.log(`  Codes: ${results.codes}`);
    console.log(`  Errors: ${results.errors?.length || 0}`);
    console.log('========================================\n');

  } catch (err) {
    console.error('Scheduled scrape failed:', err);
  } finally {
    await scraper.closeBrowser();
  }
};

/**
 * Check data freshness and log warning if stale
 */
const checkFreshness = async () => {
  if (!pool) return;

  try {
    // Get the most recent scrape date
    const result = await pool.query(`
      SELECT MAX(scraped_at) as last_scrape
      FROM nomenclature_templates
      WHERE is_scraped = true
    `);

    const lastScrape = result.rows[0]?.last_scrape;

    if (!lastScrape) {
      console.log('⚠️  No nomenclature data has been scraped yet');
      return;
    }

    const daysSinceLastScrape = Math.floor(
      (Date.now() - new Date(lastScrape).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastScrape > 30) {
      console.log(`⚠️  Nomenclature data is ${daysSinceLastScrape} days old (>30 days)`);
    } else if (daysSinceLastScrape > 14) {
      console.log(`📋 Nomenclature data is ${daysSinceLastScrape} days old`);
    }

  } catch (err) {
    console.error('Error checking nomenclature freshness:', err);
  }
};

/**
 * Start the scheduled job
 *
 * Schedule options:
 * - '0 2 * * 0' = Every Sunday at 2:00 AM
 * - '0 2 * * *' = Every day at 2:00 AM
 * - '0 2 1 * *' = First day of every month at 2:00 AM
 */
const startSchedule = (schedule = '0 2 * * 0') => {
  if (!isInitialized) {
    console.error('Cannot start schedule - job not initialized');
    return null;
  }

  // Validate cron expression
  if (!cron.validate(schedule)) {
    console.error('Invalid cron schedule:', schedule);
    return null;
  }

  console.log(`📅 Nomenclature scraper scheduled: ${schedule}`);

  // Schedule the main scrape job
  const scrapeJob = cron.schedule(schedule, () => {
    console.log('Running scheduled nomenclature scrape...');
    runScrape().catch(err => {
      console.error('Scheduled scrape error:', err);
    });
  }, {
    timezone: 'America/Toronto' // Adjust to your timezone
  });

  // Also check freshness daily at startup time
  const freshnessJob = cron.schedule('0 8 * * *', () => {
    checkFreshness();
  }, {
    timezone: 'America/Toronto'
  });

  return { scrapeJob, freshnessJob };
};

/**
 * Get scrape statistics
 */
const getStats = async () => {
  if (!pool) return null;

  try {
    const [templates, jobs, lastScrape] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM nomenclature_templates WHERE is_scraped = true'),
      pool.query('SELECT COUNT(*) as count FROM nomenclature_scrape_jobs'),
      pool.query('SELECT MAX(scraped_at) as last FROM nomenclature_templates')
    ]);

    return {
      scrapedTemplates: parseInt(templates.rows[0].count),
      totalJobs: parseInt(jobs.rows[0].count),
      lastScrapeDate: lastScrape.rows[0].last
    };
  } catch (err) {
    console.error('Error getting scrape stats:', err);
    return null;
  }
};

module.exports = {
  init,
  startSchedule,
  runScrape,
  checkFreshness,
  getStats
};
