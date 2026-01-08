#!/usr/bin/env node

/**
 * Vendor Product Scraper CLI
 *
 * Usage:
 *   node scripts/scrape-vendor.js --vendor whirlpool --full
 *   node scripts/scrape-vendor.js --vendor whirlpool --category Laundry
 *   node scripts/scrape-vendor.js --vendor whirlpool --model WFW9620HW
 *   node scripts/scrape-vendor.js --vendor whirlpool --incremental
 *
 * Options:
 *   --vendor      Vendor name (required): whirlpool
 *   --full        Full catalog scrape
 *   --incremental Incremental scrape (new/changed only)
 *   --category    Scrape specific category
 *   --model       Scrape single product by model number
 *   --no-images   Skip image downloads
 *   --max         Max products per category (default: 500)
 *   --help        Show help
 */

require('dotenv').config();

const VendorScraperService = require('../services/VendorScraperService');
const WhirlpoolCentralScraper = require('../scrapers/WhirlpoolCentralScraper');

// Parse command line arguments
function parseArgs() {
  const args = {
    vendor: null,
    full: false,
    incremental: false,
    category: null,
    model: null,
    downloadImages: true,
    maxProducts: 500,
    help: false
  };

  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--vendor':
      case '-v':
        args.vendor = argv[++i];
        break;
      case '--full':
      case '-f':
        args.full = true;
        break;
      case '--incremental':
      case '-i':
        args.incremental = true;
        break;
      case '--category':
      case '-c':
        args.category = argv[++i];
        break;
      case '--model':
      case '-m':
        args.model = argv[++i];
        break;
      case '--no-images':
        args.downloadImages = false;
        break;
      case '--max':
        args.maxProducts = parseInt(argv[++i]);
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }

  return args;
}

function showHelp() {
  console.log(`
Vendor Product Scraper CLI
===========================

Usage:
  node scripts/scrape-vendor.js [options]

Options:
  --vendor, -v <name>    Vendor name (required)
                         Supported: whirlpool

  --full, -f             Full catalog scrape (all categories)

  --incremental, -i      Incremental scrape (only new/changed products)

  --category, -c <name>  Scrape specific category
                         Examples: Cooking, Cleaning, Refrigeration, Laundry

  --model, -m <number>   Scrape single product by model number

  --no-images            Skip downloading images (faster scrape)

  --max <number>         Max products per category (default: 500)

  --help, -h             Show this help message

Examples:
  # Full catalog scrape
  node scripts/scrape-vendor.js --vendor whirlpool --full

  # Scrape only Laundry category
  node scripts/scrape-vendor.js --vendor whirlpool --category Laundry

  # Scrape single product
  node scripts/scrape-vendor.js --vendor whirlpool --model WFW9620HW

  # Full scrape without images
  node scripts/scrape-vendor.js --vendor whirlpool --full --no-images

Environment Variables Required:
  WHIRLPOOL_CENTRAL_USERNAME  - Dealer portal username
  WHIRLPOOL_CENTRAL_PASSWORD  - Dealer portal password

Note: Scraping respects rate limits (2 second delay between requests)
      to avoid overloading the vendor's servers.
`);
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (!args.vendor) {
    console.error('Error: --vendor is required');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  if (!args.full && !args.incremental && !args.category && !args.model) {
    console.error('Error: Must specify --full, --incremental, --category, or --model');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('VENDOR PRODUCT SCRAPER');
  console.log('='.repeat(60));
  console.log(`Vendor: ${args.vendor}`);
  console.log(`Mode: ${args.model ? 'Single Product' : args.category ? 'Category' : args.full ? 'Full Catalog' : 'Incremental'}`);
  if (args.category) console.log(`Category: ${args.category}`);
  if (args.model) console.log(`Model: ${args.model}`);
  console.log(`Download Images: ${args.downloadImages}`);
  console.log(`Max Products/Category: ${args.maxProducts}`);
  console.log('='.repeat(60));
  console.log('');

  try {
    // Get vendor source from database
    const vendorSource = await VendorScraperService.getVendorSourceByName(args.vendor);

    if (!vendorSource) {
      console.error(`Error: Vendor not found: ${args.vendor}`);
      console.log('Available vendors:');
      const sources = await VendorScraperService.getAllVendorSources();
      sources.forEach(s => console.log(`  - ${s.name}`));
      process.exit(1);
    }

    console.log(`Found vendor: ${vendorSource.name}`);
    console.log(`Base URL: ${vendorSource.base_url}`);
    console.log(`Last sync: ${vendorSource.last_sync || 'Never'}`);
    console.log('');

    // Initialize browser and scraper
    console.log('Initializing browser...');
    const page = await VendorScraperService.createPage();

    let scraper;
    if (args.vendor.toLowerCase().includes('whirlpool')) {
      scraper = new WhirlpoolCentralScraper(page, vendorSource);
    } else {
      console.error(`Error: No scraper available for: ${args.vendor}`);
      process.exit(1);
    }

    // Execute scrape based on mode
    let result;

    if (args.model) {
      // Single product scrape
      console.log(`\nScraping single product: ${args.model}`);
      result = await scraper.scrapeSingleProduct(args.model, {
        downloadImages: args.downloadImages
      });

    } else {
      // Catalog scrape (full or category)
      const categories = args.category ? [args.category] : null;

      console.log('\nStarting catalog scrape...');
      result = await scraper.scrapeFullCatalog({
        categories,
        maxProductsPerCategory: args.maxProducts,
        downloadImages: args.downloadImages
      });
    }

    // Show results
    console.log('\n' + '='.repeat(60));
    console.log('SCRAPE COMPLETED');
    console.log('='.repeat(60));

    if (result.stats) {
      console.log(`Products Found: ${result.stats.productsFound}`);
      console.log(`Products Scraped: ${result.stats.productsScraped}`);
      console.log(`Products Failed: ${result.stats.productsFailed}`);
      console.log(`Images Downloaded: ${result.stats.imagesDownloaded}`);
    } else if (result.product) {
      console.log(`Product: ${result.product.name}`);
      console.log(`Model: ${result.product.model_number}`);
      console.log(`Images: ${result.imagesDownloaded}`);
    }

    console.log('='.repeat(60));

  } catch (error) {
    console.error('\nScrape failed:', error.message);
    if (error.message.includes('credentials')) {
      console.log('\nMake sure to set these environment variables:');
      console.log('  WHIRLPOOL_CENTRAL_USERNAME');
      console.log('  WHIRLPOOL_CENTRAL_PASSWORD');
    }
    process.exit(1);

  } finally {
    // Clean up
    console.log('\nCleaning up...');
    await VendorScraperService.closeBrowser();
    process.exit(0);
  }
}

// Run main
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
