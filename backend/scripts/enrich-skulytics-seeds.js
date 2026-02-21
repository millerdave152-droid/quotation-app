#!/usr/bin/env node
'use strict';

/**
 * Enrich Skulytics Seed Data
 *
 * Inserts 12 furniture base products, then updates all 27
 * global_skulytics_products with rich product data: images,
 * detailed specs, warranty, competitor pricing, dimensions,
 * product links, category paths, and UPCs.
 *
 * Usage:
 *   node scripts/enrich-skulytics-seeds.js
 *   node scripts/enrich-skulytics-seeds.js --dry-run
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const pool = require('../db');

// ── Image URLs (real product images from manufacturer / retailer CDNs) ──

const PRODUCT_IMAGES = {
  'SHPM88Z75N': 'https://media3.bsh-group.com/Product_Shots/MCSA02963142_J1578_2277140_SHPM88Z75N_PGA1_def.webp',
  'QC-ULTRA-BLK': 'https://assets.bose.com/content/dam/Bose_DAM/Web/consumer_electronics/global/products/headphones/qc-ultra-headphones/product_silo_images/QUHE_PDP_Ecom-Gallery-B01_Black.png',
  'V15-DETECT': 'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/primary/447033-01.png?$responsive$&cropPathE=desktop&fit=stretch,1&wid=576',
  'PVD28BYNFS': 'https://images.thdstatic.com/productImages/3b85af49-0abf-404e-9f3a-91e5a68ee476/svn/fingerprint-resistant-stainless-steel-ge-profile-french-door-refrigerators-pvd28bynfs-64_600.jpg',
  'KRMF706ESS': 'https://images.thdstatic.com/productImages/fd9e1e59-7d18-4206-a85c-e8e01aba6426/svn/stainless-steel-kitchenaid-french-door-refrigerators-krmf706ess-64_600.jpg',
  'OLED55B3PUA': 'https://www.lg.com/content/dam/channel/wcms/ca_en/tvs/oled55b3pua/gallery/DZ-01.jpg',
  'OLED65C4PUA': 'https://www.lg.com/content/dam/channel/wcms/ca_en/tvs/oled65c4pua/gallery/DZ-01.jpg',
  'WM6700HBA': 'https://www.lg.com/content/dam/channel/wcms/ca_en/washers-and-dryers/wm6700hba/gallery/DZ_01.jpg',
  'CX1-CAT-DOG': 'https://media.flixcar.com/f360cdn/Miele-10886700-52198308-fl.png',
  'QN65S95DAFXZC': 'https://image-us.samsung.com/SamsungUS/home/television-home-theater/tvs/oled-tvs/07252024/QN77S95DAFXZA-S.COM_Version_1_V01.jpg',
  'RF28T5001SR': 'https://image-us.samsung.com/SamsungUS/home/home-appliances/refrigerators/3-door-french-door/pdp/rf28t5001/rf28t5001sr-aa/gallery/RF28T5001SR_01_Silver_Scom.jpg',
  'WF53BB8700AT': 'https://image-us.samsung.com/SamsungUS/home/home-appliances/washers/bespoke/07072022/wf53bb8700atus/WF53BB8700AT_01_Silver_Steel_SCOM.jpg',
  'ERA300-BLK': 'https://media.sonos.com/images/znqtjj88/production/1dfecdf1513cd96cd28e789adac4957b97adf50b-1800x1800.png',
  'XR65A95L': 'https://www.sony.ca/image/5d02da5df552836db894cead8a68f5f3?fmt=pjpeg&bgcolor=FFFFFF&bgc=FFFFFF&wid=960&hei=540',
  'WRS325SDHZ': 'https://images.thdstatic.com/productImages/f87dba49-ff81-4286-a97b-f0f19e3c3676/svn/fingerprint-resistant-stainless-steel-whirlpool-side-by-side-refrigerators-wrs325sdhz-64_600.jpg',
};

function productImg(sku) {
  return PRODUCT_IMAGES[sku] || null;
}

function placeholderImg(brand, model, label, w = 400, h = 400) {
  // SVG data URI fallback for secondary gallery images
  const text1 = `${brand}`;
  const text2 = `${model} — ${label}`;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect fill="%23e2e8f0" width="${w}" height="${h}"/><text x="${w/2}" y="${h/2 - 12}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" font-weight="600" fill="%231e293b">${text1}</text><text x="${w/2}" y="${h/2 + 16}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="%2364748b">${text2}</text></svg>`)}`;
}

// ── Furniture Base Products (INSERT before enrichment) ───────

const FURNITURE_BASE_PRODUCTS = [
  {
    skulytics_id: 'SKU-FURN-ASH-3160168',
    sku: 'ASH-3160168',
    brand: 'Ashley',
    brand_slug: 'ashley',
    model_number: '3160168',
    model_name: 'Rawcliffe 3-Piece Sectional',
    category_slug: 'sectional',
    msrp: 2899.99,
  },
  {
    skulytics_id: 'SKU-FURN-PLR-77023-46',
    sku: 'PLR-77023-46',
    brand: 'Palliser',
    brand_slug: 'palliser',
    model_number: '77023-46',
    model_name: 'Reed Reclining Sofa',
    category_slug: 'sofa',
    msrp: 2499.99,
  },
  {
    skulytics_id: 'SKU-FURN-SS-10680',
    sku: 'SS-10680',
    brand: 'South Shore',
    brand_slug: 'south-shore',
    model_number: '10680',
    model_name: 'Agora 56" Wide TV Stand',
    category_slug: 'tv-stand',
    msrp: 349.99,
  },
  {
    skulytics_id: 'SKU-FURN-ASH-B553-QBD',
    sku: 'ASH-B553-QBD',
    brand: 'Ashley',
    brand_slug: 'ashley',
    model_number: 'B553-QBD',
    model_name: 'Johnelle Queen Panel Bed',
    category_slug: 'bed-frame',
    msrp: 1249.99,
  },
  {
    skulytics_id: 'SKU-FURN-SLY-M725-Q',
    sku: 'SLY-M725-Q',
    brand: 'Sealy',
    brand_slug: 'sealy',
    model_number: 'M725-Q',
    model_name: 'Posturepedic Plus Albany Queen Mattress',
    category_slug: 'mattress',
    msrp: 1699.99,
  },
  {
    skulytics_id: 'SKU-FURN-SS-9059',
    sku: 'SS-9059',
    brand: 'South Shore',
    brand_slug: 'south-shore',
    model_number: '9059',
    model_name: 'Gravity 6-Drawer Double Dresser',
    category_slug: 'dresser',
    msrp: 499.99,
  },
  {
    skulytics_id: 'SKU-FURN-DR-2600-TB',
    sku: 'DR-2600-TB',
    brand: 'Decor-Rest',
    brand_slug: 'decor-rest',
    model_number: '2600-TB',
    model_name: 'Custom Dining Table 42x72',
    category_slug: 'dining-table',
    msrp: 2199.99,
  },
  {
    skulytics_id: 'SKU-FURN-ASH-D677-02A',
    sku: 'ASH-D677-02A',
    brand: 'Ashley',
    brand_slug: 'ashley',
    model_number: 'D677-02A',
    model_name: 'Bolanburg Dining Chair (Set of 2)',
    category_slug: 'dining-chair',
    msrp: 549.99,
  },
  {
    skulytics_id: 'SKU-FURN-BDI-6001-CWL',
    sku: 'BDI-6001-CWL',
    brand: 'BDI',
    brand_slug: 'bdi',
    model_number: '6001-CWL',
    model_name: 'Sequel 20 6001 Desk',
    category_slug: 'desk',
    msrp: 1799.99,
  },
  {
    skulytics_id: 'SKU-FURN-HMN-462011',
    sku: 'HMN-462011',
    brand: 'Herman Miller',
    brand_slug: 'herman-miller',
    model_number: '462011',
    model_name: 'Aeron Chair Size B',
    category_slug: 'office-chair',
    msrp: 1949.99,
  },
  {
    skulytics_id: 'SKU-FURN-ASH-T138-13',
    sku: 'ASH-T138-13',
    brand: 'Ashley',
    brand_slug: 'ashley',
    model_number: 'T138-13',
    model_name: 'Laney Accent Table Set of 3',
    category_slug: 'occasional-table',
    msrp: 349.99,
  },
  {
    skulytics_id: 'SKU-FURN-DR-6300-AC',
    sku: 'DR-6300-AC',
    brand: 'Decor-Rest',
    brand_slug: 'decor-rest',
    model_number: '6300-AC',
    model_name: 'Maxwell Accent Chair',
    category_slug: 'accent-chair',
    msrp: 1299.99,
  },
];

// ── Enrichment Data ─────────────────────────────────────────

const ENRICHMENTS = [
  // ── BOSCH DISHWASHER ──────────────────────────────────────
  {
    sku: 'SHPM88Z75N',
    upc: '025947000123',
    primary_image: productImg('SHPM88Z75N'),
    images: [
      { url: productImg('SHPM88Z75N'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Bosch', 'SHPM88Z75N', 'Interior'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Bosch', 'SHPM88Z75N', 'Kitchen'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Bosch', 'SHPM88Z75N', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Capacity': '16 Place Settings',
      'Decibel Level': '40 dBA',
      'Wash Cycles': '6 (Heavy, Normal, Auto, Delicate, Express, Rinse)',
      'Dry System': 'CrystalDry with Zeolite',
      'Third Rack': 'MyWay Rack with Extra Deep Tines',
      'Interior Material': 'Stainless Steel',
      'Energy Star': 'Yes',
      'Width': '24 inches',
      'AquaStop Leak Protection': 'Yes',
      'Wi-Fi Connected': 'Yes (Home Connect)',
      'Tub Material': '18/8 Stainless Steel',
      'Adjustable Upper Rack': 'Rackmatic 3-Level',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      rack: '5 Years (Nylon-coated racks)',
      description: 'Bosch limited manufacturer warranty. Racks covered for 5 years against rust-through.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 1472.00, last_updated: '2026-02-18' },
      { retailer: 'Home Depot', price: 1520.00, last_updated: '2026-02-17' },
      { retailer: 'Lowes', price: 1552.00, last_updated: '2026-02-16' },
      { retailer: 'AJ Madison', price: 1440.00, last_updated: '2026-02-15' },
    ],
    weight_kg: 50.3,
    width_cm: 60.0,
    height_cm: 86.4,
    depth_cm: 62.7,
    product_link: 'https://www.bosch-home.ca/products/dishwashers/SHPM88Z75N',
    category_path: ['Dishwashers', 'Built-In', '24 Inch'],
  },

  // ── BOSE HEADPHONES ───────────────────────────────────────
  {
    sku: 'QC-ULTRA-BLK',
    upc: '017817845274',
    primary_image: productImg('QC-ULTRA-BLK'),
    images: [
      { url: productImg('QC-ULTRA-BLK'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Bose', 'QC Ultra', 'Side View'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Bose', 'QC Ultra', 'Lifestyle'), type: 'lifestyle', sort_order: 2 },
    ],
    specs: {
      'Type': 'Over-Ear Wireless',
      'Noise Cancellation': 'Adjustable ANC with CustomTune',
      'Spatial Audio': 'Bose Immersive Audio',
      'Battery Life': 'Up to 24 hours',
      'Quick Charge': '15 min = 2.5 hours',
      'Bluetooth': '5.3 with Multipoint',
      'Driver Size': '35mm Triport',
      'Weight': '250g',
      'Microphones': '6-mic array for calls',
      'USB-C Charging': 'Yes',
      'Carrying Case': 'Included',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      description: 'Bose limited warranty. Covers manufacturing defects in materials and workmanship.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 479.99, last_updated: '2026-02-18' },
      { retailer: 'Amazon', price: 449.99, last_updated: '2026-02-17' },
      { retailer: 'The Source', price: 499.99, last_updated: '2026-02-16' },
      { retailer: 'Bose.ca', price: 499.99, last_updated: '2026-02-15' },
    ],
    weight_kg: 0.25,
    width_cm: 19.5,
    height_cm: 20.0,
    depth_cm: 5.0,
    product_link: 'https://www.bose.ca/products/headphones/over-ear/quietcomfort-ultra',
    category_path: ['Audio', 'Headphones', 'Over-Ear'],
  },

  // ── DYSON VACUUM ──────────────────────────────────────────
  {
    sku: 'V15-DETECT',
    upc: '885609027562',
    primary_image: productImg('V15-DETECT'),
    images: [
      { url: productImg('V15-DETECT'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Dyson', 'V15 Detect', 'Parts'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Dyson', 'V15 Detect', 'In Use'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Dyson', 'V15 Detect', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Type': 'Cordless Stick Vacuum',
      'Suction Power': '230 AW (Boost mode)',
      'Run Time': 'Up to 60 minutes',
      'Bin Capacity': '0.76L',
      'Weight': '3.08 kg',
      'Filtration': 'Whole-machine HEPA filtration',
      'Laser Detection': 'Green laser reveals microscopic dust',
      'Piezo Sensor': 'Counts and sizes particles in real-time',
      'LCD Screen': 'Shows particle count by size',
      'Cleaning Modes': 'Auto, Eco, Boost',
      'Battery Type': 'Click-in removable, swappable',
      'Attachments': '10 included (hair screw, crevice, mini motorised, etc.)',
    },
    warranty: {
      parts: '2 Years',
      labor: '2 Years',
      battery: '2 Years',
      description: 'Dyson 2-year parts and labor warranty. Includes battery. Register online to activate.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 899.99, last_updated: '2026-02-18' },
      { retailer: 'Dyson.ca', price: 949.99, last_updated: '2026-02-17' },
      { retailer: 'Costco', price: 879.99, last_updated: '2026-02-16' },
      { retailer: 'Amazon', price: 869.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 3.08,
    width_cm: 26.0,
    height_cm: 126.0,
    depth_cm: 25.0,
    product_link: 'https://www.dyson.ca/vacuum-cleaners/cordless/v15-detect-absolute',
    category_path: ['Vacuums', 'Cordless', 'Stick'],
  },

  // ── GE PROFILE FRENCH DOOR FRIDGE ────────────────────────
  {
    sku: 'PVD28BYNFS',
    upc: '084691852759',
    primary_image: productImg('PVD28BYNFS'),
    images: [
      { url: productImg('PVD28BYNFS'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('GE Profile', 'PVD28BYNFS', 'Open'), type: 'product', sort_order: 1 },
      { url: placeholderImg('GE Profile', 'PVD28BYNFS', 'Kitchen'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('GE Profile', 'PVD28BYNFS', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Capacity': '27.9 cu. ft.',
      'Configuration': 'French Door with Full-Width Drawer',
      'Ice Maker': 'Hands-Free Autofill Pitcher',
      'Door-in-Door': 'No',
      'Fingerprint Resistant': 'Yes',
      'Interior LED': 'Full-width LED lighting',
      'Shelves': '5 Split Adjustable Glass Shelves',
      'Smart Features': 'Wi-Fi (SmartHQ App)',
      'Energy Star': 'Yes',
      'Depth': 'Counter-Depth',
      'Water Filter': 'RPWFE with RFID',
      'Temperature Management': 'TwinChill Evaporators',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      sealed_system: '5 Years',
      description: 'GE limited warranty. Sealed refrigeration system covered 5 years parts and labor.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 3099.99, last_updated: '2026-02-18' },
      { retailer: 'Home Depot', price: 3199.99, last_updated: '2026-02-17' },
      { retailer: 'Lowes', price: 3149.99, last_updated: '2026-02-16' },
      { retailer: 'AJ Madison', price: 2999.00, last_updated: '2026-02-14' },
    ],
    weight_kg: 140.6,
    width_cm: 91.4,
    height_cm: 175.9,
    depth_cm: 78.7,
    product_link: 'https://www.geappliances.ca/refrigerators/PVD28BYNFS',
    category_path: ['Refrigeration', 'Refrigerators', 'French Door'],
  },

  // ── KITCHENAID FRENCH DOOR FRIDGE ─────────────────────────
  {
    sku: 'KRMF706ESS',
    upc: '883049422688',
    primary_image: productImg('KRMF706ESS'),
    images: [
      { url: productImg('KRMF706ESS'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('KitchenAid', 'KRMF706ESS', 'Open'), type: 'product', sort_order: 1 },
      { url: placeholderImg('KitchenAid', 'KRMF706ESS', 'Kitchen'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('KitchenAid', 'KRMF706ESS', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Capacity': '25.8 cu. ft.',
      'Configuration': '5-Door French Door',
      'Platinum Interior': 'Yes',
      'Preserva Food Care': 'Dual Independent Cooling',
      'Herb Storage': 'Built-in with water reservoir',
      'ExtendFresh Temp': 'Yes',
      'Under-Shelf Prep Zone': 'Yes',
      'Measured Fill Water': 'External dispenser with precise measurement',
      'Shelves': '5 Adjustable (including herb storage shelf)',
      'Energy Star': 'Yes',
      'Ice System': 'PrintShield Finish Ice Maker',
      'Width': '36 inches',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      sealed_system: '5 Years (sealed refrigeration)',
      description: 'KitchenAid limited warranty. 5-year sealed system coverage. Extended plans available.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 3799.99, last_updated: '2026-02-18' },
      { retailer: 'Home Depot', price: 3849.99, last_updated: '2026-02-17' },
      { retailer: 'Lowes', price: 3899.99, last_updated: '2026-02-16' },
      { retailer: 'AJ Madison', price: 3699.00, last_updated: '2026-02-14' },
    ],
    weight_kg: 158.8,
    width_cm: 91.4,
    height_cm: 178.4,
    depth_cm: 82.2,
    product_link: 'https://www.kitchenaid.ca/refrigerators/KRMF706ESS',
    category_path: ['Refrigeration', 'Refrigerators', 'French Door'],
  },

  // ── LG 55" OLED TV ───────────────────────────────────────
  {
    sku: 'OLED55B3PUA',
    upc: '195174040102',
    primary_image: productImg('OLED55B3PUA'),
    images: [
      { url: productImg('OLED55B3PUA'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('LG', 'OLED55B3', 'Angle'), type: 'product', sort_order: 1 },
      { url: placeholderImg('LG', 'OLED55B3', 'Living Room'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('LG', 'OLED55B3', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Screen Size': '55 inches',
      'Resolution': '4K UHD (3840 x 2160)',
      'Panel Type': 'OLED',
      'HDR': 'Dolby Vision, HDR10, HLG',
      'Refresh Rate': '120Hz',
      'Processor': 'a7 Gen6 AI Processor 4K',
      'Smart Platform': 'webOS 23',
      'HDMI Ports': '4 (HDMI 2.1)',
      'Gaming': 'NVIDIA G-Sync, AMD FreeSync, VRR, ALLM',
      'Dolby Atmos': 'Yes',
      'Built-in Speaker': '20W 2.0 Channel',
      'Magic Remote': 'Included',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      panel: '2 Years (OLED panel)',
      description: 'LG limited warranty. OLED panel warranted against burn-in for 2 years.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 1399.99, last_updated: '2026-02-18' },
      { retailer: 'Costco', price: 1349.99, last_updated: '2026-02-17' },
      { retailer: 'Amazon', price: 1379.99, last_updated: '2026-02-16' },
      { retailer: 'Visions Electronics', price: 1449.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 14.2,
    width_cm: 122.8,
    height_cm: 71.4,
    depth_cm: 4.7,
    product_link: 'https://www.lg.com/ca/tvs/oled/OLED55B3PUA/',
    category_path: ['TVs', 'OLED', '55 Inch'],
  },

  // ── LG 65" OLED evo TV ────────────────────────────────────
  {
    sku: 'OLED65C4PUA',
    upc: '195174060100',
    primary_image: productImg('OLED65C4PUA'),
    images: [
      { url: productImg('OLED65C4PUA'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('LG', 'OLED65C4', 'Slim Profile'), type: 'product', sort_order: 1 },
      { url: placeholderImg('LG', 'OLED65C4', 'Living Room'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('LG', 'OLED65C4', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Screen Size': '65 inches',
      'Resolution': '4K UHD (3840 x 2160)',
      'Panel Type': 'OLED evo with Brightness Booster',
      'HDR': 'Dolby Vision, HDR10, HLG, Filmmaker Mode',
      'Refresh Rate': '144Hz (with OC)',
      'Processor': 'a9 Gen7 AI Processor 4K',
      'Smart Platform': 'webOS 24',
      'HDMI Ports': '4 (HDMI 2.1, 48Gbps)',
      'Gaming': 'NVIDIA G-Sync, AMD FreeSync Premium, VRR, ALLM, Game Optimizer',
      'Dolby Atmos': 'Yes',
      'Built-in Speaker': '40W 2.2 Channel',
      'AI Features': 'AI Picture Pro, AI Sound Pro',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      panel: '3 Years (OLED evo panel)',
      description: 'LG limited warranty. OLED evo panel warranted against burn-in for 3 years.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 2299.99, last_updated: '2026-02-18' },
      { retailer: 'Costco', price: 2199.99, last_updated: '2026-02-17' },
      { retailer: 'Amazon', price: 2249.99, last_updated: '2026-02-16' },
      { retailer: 'Visions Electronics', price: 2399.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 18.2,
    width_cm: 144.4,
    height_cm: 83.5,
    depth_cm: 4.6,
    product_link: 'https://www.lg.com/ca/tvs/oled/OLED65C4PUA/',
    category_path: ['TVs', 'OLED', '65 Inch'],
  },

  // ── LG FRONT LOAD WASHER ─────────────────────────────────
  {
    sku: 'WM6700HBA',
    upc: '048231806749',
    primary_image: productImg('WM6700HBA'),
    images: [
      { url: productImg('WM6700HBA'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('LG', 'WM6700HBA', 'Open Door'), type: 'product', sort_order: 1 },
      { url: placeholderImg('LG', 'WM6700HBA', 'Laundry Room'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('LG', 'WM6700HBA', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Capacity': '5.0 cu. ft.',
      'Spin Speed': '1300 RPM',
      'Wash Cycles': '12',
      'Steam Function': 'TurboWash 360 + Steam',
      'Smart Features': 'Wi-Fi (ThinQ App), Proactive Customer Care',
      'Energy Star': 'Most Efficient 2024',
      'Noise Level': '46 dBA',
      'Motor': 'Inverter Direct Drive',
      'Allergen Cycle': 'Yes (NSF Certified)',
      'Color': 'Black Steel',
      'Door Style': 'Front Load, Tempered Glass',
      'ezDispense': 'Auto-doses detergent for up to 18 loads',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      motor: '10 Years (Direct Drive Motor)',
      drum: 'Lifetime (Stainless Steel Drum)',
      description: 'LG limited warranty. Inverter Direct Drive motor covered for 10 years. Lifetime drum warranty.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 1099.99, last_updated: '2026-02-18' },
      { retailer: 'Home Depot', price: 1119.99, last_updated: '2026-02-17' },
      { retailer: 'Lowes', price: 1099.99, last_updated: '2026-02-16' },
      { retailer: 'AJ Madison', price: 1049.00, last_updated: '2026-02-14' },
    ],
    weight_kg: 83.0,
    width_cm: 68.6,
    height_cm: 99.1,
    depth_cm: 85.1,
    product_link: 'https://www.lg.com/ca/washing-machines/front-load/WM6700HBA/',
    category_path: ['Laundry', 'Washers', 'Front Load'],
  },

  // ── MIELE VACUUM ──────────────────────────────────────────
  {
    sku: 'CX1-CAT-DOG',
    upc: '028295506003',
    primary_image: productImg('CX1-CAT-DOG'),
    images: [
      { url: productImg('CX1-CAT-DOG'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Miele', 'CX1 Cat Dog', 'Parts'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Miele', 'CX1 Cat Dog', 'In Use'), type: 'lifestyle', sort_order: 2 },
    ],
    specs: {
      'Type': 'Bagless Canister Vacuum',
      'Suction Power': '1200W Vortex Motor',
      'Filtration': 'Lifetime HEPA (H13) filter',
      'Dust Container': '2.0L',
      'Cable Length': '7.5m (auto-rewind)',
      'Operating Radius': '11m',
      'Pet Hair': 'Electro Premium Turbo Brush',
      'Noise Level': '73 dB',
      'Weight': '8.6 kg',
      'Parking System': 'Yes',
      'Comfort Handle': 'Ergonomic with integrated controls',
      'Accessories': 'Crevice nozzle, upholstery nozzle, dusting brush',
    },
    warranty: {
      parts: '2 Years',
      labor: '2 Years',
      motor: '7 Years',
      description: 'Miele limited warranty. Motor warranted for 7 years. Register at miele.ca for full coverage.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 1049.99, last_updated: '2026-02-18' },
      { retailer: 'Amazon', price: 999.99, last_updated: '2026-02-17' },
      { retailer: 'Miele.ca', price: 1099.99, last_updated: '2026-02-16' },
      { retailer: 'Canadian Appliance Source', price: 1029.00, last_updated: '2026-02-14' },
    ],
    weight_kg: 8.6,
    width_cm: 32.0,
    height_cm: 34.0,
    depth_cm: 50.0,
    product_link: 'https://www.miele.ca/vacuums/blizzard-cx1-cat-and-dog',
    category_path: ['Vacuums', 'Canister', 'Bagless'],
  },

  // ── SAMSUNG 65" OLED TV ───────────────────────────────────
  {
    sku: 'QN65S95DAFXZC',
    upc: '887276800127',
    primary_image: productImg('QN65S95DAFXZC'),
    images: [
      { url: productImg('QN65S95DAFXZC'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Samsung', 'QN65S95D', 'Slim'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Samsung', 'QN65S95D', 'Living Room'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Samsung', 'QN65S95D', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Screen Size': '65 inches',
      'Resolution': '4K UHD (3840 x 2160)',
      'Panel Type': 'QD-OLED (2nd Gen)',
      'HDR': 'HDR10+, HDR10+ Adaptive, HLG',
      'Refresh Rate': '144Hz',
      'Processor': 'NQ4 AI Gen2 Processor',
      'Smart Platform': 'Tizen OS with Samsung Gaming Hub',
      'HDMI Ports': '4 (HDMI 2.1, 4K@144Hz)',
      'Gaming': 'Game Motion Plus, FreeSync Premium Pro, Game Bar 3.0',
      'Dolby Atmos': 'Yes (Built-in)',
      'Object Tracking Sound+': '60W 4.2.2 Channel',
      'One Connect Box': 'Yes (external connections box)',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      panel: '2 Years (QD-OLED panel)',
      description: 'Samsung limited warranty. QD-OLED panel warranted for 2 years against defects.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 3299.99, last_updated: '2026-02-18' },
      { retailer: 'Costco', price: 3199.99, last_updated: '2026-02-17' },
      { retailer: 'Amazon', price: 3249.99, last_updated: '2026-02-16' },
      { retailer: 'Visions Electronics', price: 3399.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 20.4,
    width_cm: 144.2,
    height_cm: 83.1,
    depth_cm: 1.2,
    product_link: 'https://www.samsung.com/ca/tvs/oled/QN65S95DAFXZC/',
    category_path: ['TVs', 'QD-OLED', '65 Inch'],
  },

  // ── SAMSUNG FRENCH DOOR FRIDGE (DISCONTINUED) ─────────────
  {
    sku: 'RF28T5001SR',
    upc: '887276451053',
    primary_image: productImg('RF28T5001SR'),
    images: [
      { url: productImg('RF28T5001SR'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Samsung', 'RF28T5001SR', 'Open'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Samsung', 'RF28T5001SR', 'Kitchen'), type: 'lifestyle', sort_order: 2 },
    ],
    specs: {
      'Capacity': '28 cu. ft.',
      'Configuration': 'French Door',
      'Ice Maker': 'Slim Auto Ice Maker',
      'Fingerprint Resistant': 'Yes',
      'Interior LED': 'LED Lighting (top and sides)',
      'Shelves': '4 Adjustable Full-Width',
      'Energy Star': 'Yes',
      'Twin Cooling Plus': 'Yes (independent cooling)',
      'Width': '35.75 inches',
      'Water Filter': 'HAF-QIN',
      'Status': 'DISCONTINUED',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      compressor: '10 Years (Digital Inverter Compressor)',
      description: 'Samsung limited warranty. Digital Inverter Compressor covered for 10 years. Product discontinued — parts availability may be limited.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 1799.99, last_updated: '2026-02-18' },
      { retailer: 'Home Depot', price: 1849.99, last_updated: '2026-02-17' },
      { retailer: 'Lowes', price: 1799.99, last_updated: '2026-02-16' },
      { retailer: 'AJ Madison', price: 1749.00, last_updated: '2026-02-14' },
    ],
    weight_kg: 117.9,
    width_cm: 90.8,
    height_cm: 178.9,
    depth_cm: 90.8,
    product_link: 'https://www.samsung.com/ca/refrigerators/french-door/RF28T5001SR/',
    category_path: ['Refrigeration', 'Refrigerators', 'French Door'],
  },

  // ── SAMSUNG BESPOKE FRONT LOAD WASHER ─────────────────────
  {
    sku: 'WF53BB8700AT',
    upc: '887276710051',
    primary_image: productImg('WF53BB8700AT'),
    images: [
      { url: productImg('WF53BB8700AT'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Samsung', 'WF53BB8700AT', 'Door Open'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Samsung', 'WF53BB8700AT', 'Laundry Room'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Samsung', 'WF53BB8700AT', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Capacity': '5.3 cu. ft. (Extra-Large)',
      'Spin Speed': '1200 RPM',
      'Wash Cycles': '24 preset cycles',
      'AI OptiWash': 'Detects soil level and optimizes cycle',
      'Steam Function': 'Steam Sanitize+',
      'Smart Features': 'Wi-Fi (SmartThings), Bixby voice control',
      'Energy Star': 'Most Efficient 2024',
      'Noise Level': '42 dBA (VRT Plus)',
      'Motor': 'Digital Inverter',
      'Super Speed': '28 min full wash',
      'Color': 'Brushed Navy (Bespoke)',
      'CleanGuard': 'Antimicrobial door gasket',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      motor: '10 Years (Digital Inverter Motor)',
      tub: '3 Years (Stainless Steel Drum)',
      description: 'Samsung limited warranty with 10-year motor and 3-year tub coverage.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 1349.99, last_updated: '2026-02-18' },
      { retailer: 'Home Depot', price: 1379.99, last_updated: '2026-02-17' },
      { retailer: 'Lowes', price: 1349.99, last_updated: '2026-02-16' },
      { retailer: 'AJ Madison', price: 1299.00, last_updated: '2026-02-14' },
    ],
    weight_kg: 91.6,
    width_cm: 68.6,
    height_cm: 99.1,
    depth_cm: 89.7,
    product_link: 'https://www.samsung.com/ca/washers/bespoke/WF53BB8700AT/',
    category_path: ['Laundry', 'Washers', 'Front Load'],
  },

  // ── SONOS ERA 300 SPEAKER ─────────────────────────────────
  {
    sku: 'ERA300-BLK',
    upc: '808474092119',
    primary_image: productImg('ERA300-BLK'),
    images: [
      { url: productImg('ERA300-BLK'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Sonos', 'Era 300', 'Side View'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Sonos', 'Era 300', 'Room'), type: 'lifestyle', sort_order: 2 },
    ],
    specs: {
      'Type': 'Smart Speaker with Spatial Audio',
      'Dolby Atmos': 'Yes (native)',
      'Drivers': '6 (4 tweeters + 2 woofers)',
      'Spatial Audio': 'Dolby Atmos Music, Amazon 360 Reality Audio',
      'Connectivity': 'Wi-Fi 6, Bluetooth 5.0, AirPlay 2',
      'Voice Assistants': 'Alexa built-in, Sonos Voice Control',
      'Trueplay Tuning': 'Yes (auto-adaptive)',
      'Line-In': 'USB-C, 3.5mm (with adapter)',
      'Power': 'AC power (not battery)',
      'Finish': 'Black',
      'Dimensions': '160 x 260 x 185 mm',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      description: 'Sonos limited warranty. Extended trade-up program available for upgrades.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 579.99, last_updated: '2026-02-18' },
      { retailer: 'Sonos.com', price: 599.99, last_updated: '2026-02-17' },
      { retailer: 'Amazon', price: 559.99, last_updated: '2026-02-16' },
      { retailer: 'The Source', price: 599.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 4.47,
    width_cm: 26.0,
    height_cm: 16.0,
    depth_cm: 18.5,
    product_link: 'https://www.sonos.com/en-ca/shop/era-300-black',
    category_path: ['Audio', 'Speakers', 'Smart Speakers'],
  },

  // ── SONY 65" BRAVIA XR OLED ───────────────────────────────
  {
    sku: 'XR65A95L',
    upc: '027242927605',
    primary_image: productImg('XR65A95L'),
    images: [
      { url: productImg('XR65A95L'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Sony', 'XR65A95L', 'Slim Profile'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Sony', 'XR65A95L', 'Living Room'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Sony', 'XR65A95L', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Screen Size': '65 inches',
      'Resolution': '4K UHD (3840 x 2160)',
      'Panel Type': 'QD-OLED',
      'HDR': 'Dolby Vision, HDR10, HLG',
      'Refresh Rate': '120Hz',
      'Processor': 'Cognitive Processor XR',
      'Smart Platform': 'Google TV',
      'HDMI Ports': '4 (2x HDMI 2.1, 48Gbps)',
      'Gaming': 'VRR, ALLM, Auto HDR Tone Mapping',
      'Acoustic Surface Audio+': '60W 2.2 Channel (screen is the speaker)',
      'BRAVIA CAM': 'Compatible (sold separately)',
      'PlayStation 5': 'Perfect for PS5 with Auto HDR Tone Mapping',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      panel: '2 Years (QD-OLED panel)',
      description: 'Sony limited warranty. QD-OLED panel covered for 2 years. Register at sony.ca for extended options.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 3099.99, last_updated: '2026-02-18' },
      { retailer: 'Costco', price: 2999.99, last_updated: '2026-02-17' },
      { retailer: 'Amazon', price: 3049.99, last_updated: '2026-02-16' },
      { retailer: 'Visions Electronics', price: 3199.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 21.8,
    width_cm: 144.7,
    height_cm: 83.6,
    depth_cm: 5.3,
    product_link: 'https://www.sony.ca/en/tvs/bravia-xr-oled/XR65A95L',
    category_path: ['TVs', 'QD-OLED', '65 Inch'],
  },

  // ── WHIRLPOOL SIDE-BY-SIDE FRIDGE ─────────────────────────
  {
    sku: 'WRS325SDHZ',
    upc: '883049445571',
    primary_image: productImg('WRS325SDHZ'),
    images: [
      { url: productImg('WRS325SDHZ'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Whirlpool', 'WRS325SDHZ', 'Open'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Whirlpool', 'WRS325SDHZ', 'Kitchen'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Whirlpool', 'WRS325SDHZ', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Capacity': '25 cu. ft.',
      'Configuration': 'Side-by-Side',
      'Ice Maker': 'In-Door Ice Storage',
      'Fingerprint Resistant': 'Yes (Stainless Steel)',
      'Interior LED': 'LED Lighting',
      'Shelves': '3 Adjustable Full-Width',
      'Gallon Door Storage': 'Yes',
      'Energy Star': 'Yes',
      'Humidity-Controlled Crispers': '2',
      'External Dispenser': 'Water and Ice',
      'Width': '36 inches',
      'Adaptive Defrost': 'Yes (reduces energy use)',
    },
    warranty: {
      parts: '1 Year',
      labor: '1 Year',
      sealed_system: '5 Years (sealed refrigeration)',
      compressor: '10 Years (limited parts only)',
      description: 'Whirlpool limited warranty. 5-year sealed system parts and labor. 10-year compressor parts only.',
    },
    competitor_pricing: [
      { retailer: 'Best Buy', price: 1599.99, last_updated: '2026-02-18' },
      { retailer: 'Home Depot', price: 1649.99, last_updated: '2026-02-17' },
      { retailer: 'Lowes', price: 1629.99, last_updated: '2026-02-16' },
      { retailer: 'AJ Madison', price: 1549.00, last_updated: '2026-02-14' },
    ],
    weight_kg: 104.3,
    width_cm: 91.4,
    height_cm: 174.6,
    depth_cm: 83.8,
    product_link: 'https://www.whirlpool.ca/refrigerators/side-by-side/WRS325SDHZ',
    category_path: ['Refrigeration', 'Refrigerators', 'Side-by-Side'],
  },

  // ═══════════════════════════════════════════════════════════
  // ── FURNITURE ──────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════

  // ── ASHLEY RAWCLIFFE SECTIONAL ─────────────────────────────
  {
    sku: 'ASH-3160168',
    upc: '024052603040',
    primary_image: placeholderImg('Ashley', 'Rawcliffe Sectional', 'Primary'),
    images: [
      { url: placeholderImg('Ashley', 'Rawcliffe Sectional', 'Primary'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Ashley', 'Rawcliffe Sectional', 'Detail'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Ashley', 'Rawcliffe Sectional', 'Living Room'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Ashley', 'Rawcliffe Sectional', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Configuration': '3-Piece Sectional (LAF Sofa, Wedge, RAF Sofa)',
      'Upholstery': '100% Polyester Chenille',
      'Color': 'Parchment',
      'Frame': 'Corner-blocked hardwood & plywood',
      'Cushions': 'High-resiliency foam wrapped in thick poly fibre',
      'Seat Height': '48 cm (19 in)',
      'Seat Depth': '56 cm (22 in)',
      'Arm Style': 'Flared rolled arms',
      'Pillows Included': '7 accent pillows',
      'Assembly Required': 'Yes — sectional connector hardware included',
      'Weight Capacity': '450 kg (990 lbs) total',
      'Overall Dimensions': '287 W x 287 D x 97 H cm',
    },
    warranty: {
      frame: '5 Years (structural frame)',
      cushions: '1 Year (foam and fibre)',
      fabric: '1 Year (pilling and seam separation)',
      description: 'Ashley limited warranty. Frame warranted 5 years against structural defects. Fabric and cushions 1 year.',
    },
    competitor_pricing: [
      { retailer: "Leon's", price: 2799.99, last_updated: '2026-02-18' },
      { retailer: 'The Brick', price: 2899.99, last_updated: '2026-02-17' },
      { retailer: 'Ashley HomeStore', price: 2899.99, last_updated: '2026-02-16' },
      { retailer: 'Wayfair', price: 2749.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 118.0,
    width_cm: 287.0,
    height_cm: 97.0,
    depth_cm: 287.0,
    product_link: 'https://www.ashleyfurniture.com/p/rawcliffe-3-piece-sectional/APK-3160168.html',
    category_path: ['Furniture', 'Living Room', 'Sectional'],
  },

  // ── PALLISER REED RECLINING SOFA ──────────────────────────
  {
    sku: 'PLR-77023-46',
    upc: '068124770236',
    primary_image: placeholderImg('Palliser', 'Reed Reclining Sofa', 'Primary'),
    images: [
      { url: placeholderImg('Palliser', 'Reed Reclining Sofa', 'Primary'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Palliser', 'Reed Reclining Sofa', 'Reclined'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Palliser', 'Reed Reclining Sofa', 'Living Room'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Palliser', 'Reed Reclining Sofa', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Upholstery': 'Top-Grain Leather (Valencia Bark)',
      'Reclining Mechanism': 'Power with Power Headrest',
      'Frame': 'Kiln-dried hardwood, double-dowelled joints',
      'Cushions': 'High-density foam seat, fibre-filled back',
      'Seat Height': '51 cm (20 in)',
      'Seat Depth': '54 cm (21 in)',
      'USB Charging': 'Integrated USB-A and USB-C in each arm',
      'Wall Clearance': '10 cm (wall-hugger design)',
      'Made In': 'Winnipeg, Manitoba, Canada',
      'Assembly Required': 'No — delivered fully assembled',
      'Weight Capacity': '340 kg (750 lbs) per seat',
      'Overall Dimensions': '213 W x 100 D x 104 H cm',
    },
    warranty: {
      frame: '10 Years (structural)',
      mechanism: '5 Years (reclining mechanism and motors)',
      leather: '3 Years (colour fastness, peeling)',
      foam: '3 Years (loss of resiliency)',
      description: 'Palliser limited warranty. Made in Canada. Frame 10 years, mechanism 5 years, leather and foam 3 years.',
    },
    competitor_pricing: [
      { retailer: "Leon's", price: 2399.99, last_updated: '2026-02-18' },
      { retailer: 'The Brick', price: 2499.99, last_updated: '2026-02-17' },
      { retailer: 'EQ3', price: 2549.99, last_updated: '2026-02-16' },
    ],
    weight_kg: 95.0,
    width_cm: 213.0,
    height_cm: 104.0,
    depth_cm: 100.0,
    product_link: 'https://www.palliser.com/product/reed-sofa-recliner-77023-46',
    category_path: ['Furniture', 'Living Room', 'Sofa'],
  },

  // ── SOUTH SHORE AGORA TV STAND ────────────────────────────
  {
    sku: 'SS-10680',
    upc: '066311106800',
    primary_image: placeholderImg('South Shore', 'Agora TV Stand', 'Primary'),
    images: [
      { url: placeholderImg('South Shore', 'Agora TV Stand', 'Primary'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('South Shore', 'Agora TV Stand', 'Open'), type: 'product', sort_order: 1 },
      { url: placeholderImg('South Shore', 'Agora TV Stand', 'Room Setting'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('South Shore', 'Agora TV Stand', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Material': 'Laminated Particle Board (non-toxic)',
      'Finish': 'Weathered Oak & Matte Charcoal',
      'TV Compatibility': 'Holds TVs up to 60 inches / 34 kg (75 lbs)',
      'Storage': '2 open shelves, 2 closed compartments',
      'Cable Management': 'Rear access holes in each section',
      'Adjustable Shelves': 'Yes (2 positions)',
      'Leg Style': 'Metal legs, matte black',
      'Wall Anchor': 'Included (tip-over prevention)',
      'Made In': 'Sainte-Croix, Quebec, Canada',
      'Assembly Required': 'Yes (tools included)',
      'Weight Capacity': '34 kg top, 11 kg per shelf',
      'Overall Dimensions': '142 W x 48 D x 57 H cm',
    },
    warranty: {
      manufacturer: '5 Years (limited)',
      description: 'South Shore 5-year limited warranty against manufacturing defects. Made in Canada.',
    },
    competitor_pricing: [
      { retailer: 'Wayfair', price: 329.99, last_updated: '2026-02-18' },
      { retailer: 'The Brick', price: 349.99, last_updated: '2026-02-17' },
      { retailer: 'Structube', price: 359.99, last_updated: '2026-02-16' },
      { retailer: 'Amazon', price: 319.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 36.3,
    width_cm: 142.0,
    height_cm: 57.0,
    depth_cm: 48.0,
    product_link: 'https://www.southshorefurniture.com/agora-56-wide-tv-stand-10680',
    category_path: ['Furniture', 'Living Room', 'TV Stand'],
  },

  // ── ASHLEY JOHNELLE QUEEN PANEL BED ───────────────────────
  {
    sku: 'ASH-B553-QBD',
    upc: '024052855302',
    primary_image: placeholderImg('Ashley', 'Johnelle Queen Bed', 'Primary'),
    images: [
      { url: placeholderImg('Ashley', 'Johnelle Queen Bed', 'Primary'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Ashley', 'Johnelle Queen Bed', 'Headboard'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Ashley', 'Johnelle Queen Bed', 'Bedroom'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Ashley', 'Johnelle Queen Bed', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Size': 'Queen (fits 152 x 203 cm mattress)',
      'Material': 'Solid hardwood & veneers',
      'Finish': 'Bisque (wire-brushed distressed)',
      'Headboard Height': '150 cm (59 in)',
      'Footboard Height': '76 cm (30 in)',
      'Slat System': 'Included (no box spring required)',
      'Under-Bed Clearance': '18 cm (7 in)',
      'Panel Style': 'Raised panel with crown moulding',
      'Assembly Required': 'Yes (hardware included, 2 persons recommended)',
      'Weight Capacity': '340 kg (750 lbs)',
      'Mattress': 'Sold separately',
      'Overall Dimensions': '170 W x 218 D x 150 H cm',
    },
    warranty: {
      frame: '5 Years (structural frame)',
      finish: '1 Year (finish defects)',
      description: 'Ashley limited warranty. Frame warranted 5 years. Finish and hardware 1 year.',
    },
    competitor_pricing: [
      { retailer: 'Ashley HomeStore', price: 1249.99, last_updated: '2026-02-18' },
      { retailer: "Leon's", price: 1199.99, last_updated: '2026-02-17' },
      { retailer: 'The Brick', price: 1279.99, last_updated: '2026-02-16' },
      { retailer: 'Wayfair', price: 1149.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 72.0,
    width_cm: 170.0,
    height_cm: 150.0,
    depth_cm: 218.0,
    product_link: 'https://www.ashleyfurniture.com/p/johnelle-queen-panel-bed/APK-B553-QBD.html',
    category_path: ['Furniture', 'Bedroom', 'Bed Frame'],
  },

  // ── SEALY POSTUREPEDIC PLUS ALBANY QUEEN MATTRESS ─────────
  {
    sku: 'SLY-M725-Q',
    upc: '013838017257',
    primary_image: placeholderImg('Sealy', 'Posturepedic Plus Albany', 'Primary'),
    images: [
      { url: placeholderImg('Sealy', 'Posturepedic Plus Albany', 'Primary'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Sealy', 'Posturepedic Plus Albany', 'Cutaway'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Sealy', 'Posturepedic Plus Albany', 'Bedroom'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Sealy', 'Posturepedic Plus Albany', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Size': 'Queen (152 x 203 cm)',
      'Type': 'Hybrid (innerspring + memory foam)',
      'Comfort Level': 'Medium',
      'Height': '36 cm (14 in)',
      'Coil System': 'Encased Posturepedic coils (1000+)',
      'Comfort Layers': '3 cm gel memory foam + 2.5 cm adaptive foam',
      'Edge Support': 'Posturepedic DuraFlex Edge System',
      'Cover': 'Moisture-wicking stretch knit',
      'Motion Isolation': 'Individually wrapped coils',
      'CertiPUR-US': 'Certified foams',
      'Made In': 'Canada',
      'Trial Period': '100-night comfort guarantee (retailer dependent)',
    },
    warranty: {
      mattress: '10 Years (non-prorated)',
      description: 'Sealy 10-year non-prorated limited warranty against manufacturing defects and sagging > 3.8 cm (1.5 in).',
    },
    competitor_pricing: [
      { retailer: 'Sleep Country', price: 1699.99, last_updated: '2026-02-18' },
      { retailer: "Leon's", price: 1649.99, last_updated: '2026-02-17' },
      { retailer: 'The Brick', price: 1699.99, last_updated: '2026-02-16' },
      { retailer: 'Wayfair', price: 1599.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 45.0,
    width_cm: 152.0,
    height_cm: 36.0,
    depth_cm: 203.0,
    product_link: 'https://www.sealy.ca/posturepedic-plus-albany-queen',
    category_path: ['Furniture', 'Bedroom', 'Mattress'],
  },

  // ── SOUTH SHORE GRAVITY DRESSER ───────────────────────────
  {
    sku: 'SS-9059',
    upc: '066311090590',
    primary_image: placeholderImg('South Shore', 'Gravity Dresser', 'Primary'),
    images: [
      { url: placeholderImg('South Shore', 'Gravity Dresser', 'Primary'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('South Shore', 'Gravity Dresser', 'Drawers Open'), type: 'product', sort_order: 1 },
      { url: placeholderImg('South Shore', 'Gravity Dresser', 'Bedroom'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('South Shore', 'Gravity Dresser', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Material': 'Laminated Particle Board (non-toxic, CARB Phase 2)',
      'Finish': 'Ebony',
      'Drawers': '6 (2 small top + 4 large bottom)',
      'Drawer Slides': 'Polymer slides with safety stops',
      'Drawer Interior': '39 L x 33 D x 12.5 H cm each (large)',
      'Top Surface': 'Supports up to 39 kg (85 lbs)',
      'Anti-Tip Kit': 'Included (wall anchor)',
      'Handles': 'Integrated cut-out pulls',
      'Made In': 'Sainte-Croix, Quebec, Canada',
      'Assembly Required': 'Yes (tools included)',
      'Overall Dimensions': '153 W x 47 D x 78 H cm',
    },
    warranty: {
      manufacturer: '5 Years (limited)',
      description: 'South Shore 5-year limited warranty against manufacturing defects. Made in Canada.',
    },
    competitor_pricing: [
      { retailer: 'Wayfair', price: 479.99, last_updated: '2026-02-18' },
      { retailer: 'Amazon', price: 459.99, last_updated: '2026-02-17' },
      { retailer: 'The Brick', price: 499.99, last_updated: '2026-02-16' },
      { retailer: 'Structube', price: 519.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 52.0,
    width_cm: 153.0,
    height_cm: 78.0,
    depth_cm: 47.0,
    product_link: 'https://www.southshorefurniture.com/gravity-6-drawer-double-dresser-9059',
    category_path: ['Furniture', 'Bedroom', 'Dresser'],
  },

  // ── DECOR-REST CUSTOM DINING TABLE ────────────────────────
  {
    sku: 'DR-2600-TB',
    upc: '068700260015',
    primary_image: placeholderImg('Decor-Rest', 'Dining Table 42x72', 'Primary'),
    images: [
      { url: placeholderImg('Decor-Rest', 'Dining Table 42x72', 'Primary'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Decor-Rest', 'Dining Table 42x72', 'Detail'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Decor-Rest', 'Dining Table 42x72', 'Dining Room'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Decor-Rest', 'Dining Table 42x72', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Material': 'Solid birch top with cathedral veneer',
      'Finish': 'Driftwood Grey (multi-step catalyzed)',
      'Table Top': '42 x 72 inches (107 x 183 cm)',
      'Extension Leaf': '1 x 18 in leaf (extends to 90 in / 229 cm)',
      'Seating Capacity': '6 standard, 8 with leaf',
      'Base Style': 'Double pedestal, decorative turned legs',
      'Edge Profile': 'Bevelled with soft curve',
      'Levelling Glides': 'Adjustable felt-pad glides',
      'Made In': 'Toronto, Ontario, Canada',
      'Assembly Required': 'Partial (attach base to top)',
      'Weight Capacity': '113 kg (250 lbs) distributed',
      'Overall Dimensions': '183 W x 107 D x 76 H cm',
    },
    warranty: {
      frame: '10 Years (structural, solid wood)',
      finish: '2 Years (catalyzed finish)',
      description: 'Decor-Rest 10-year structural warranty. Custom made in Toronto, ON. Finish defects covered 2 years.',
    },
    competitor_pricing: [
      { retailer: "Leon's", price: 2099.99, last_updated: '2026-02-18' },
      { retailer: 'The Brick', price: 2199.99, last_updated: '2026-02-17' },
      { retailer: 'EQ3', price: 2299.99, last_updated: '2026-02-16' },
    ],
    weight_kg: 68.0,
    width_cm: 183.0,
    height_cm: 76.0,
    depth_cm: 107.0,
    product_link: 'https://www.decor-rest.com/dining/tables/2600-custom-dining-table',
    category_path: ['Furniture', 'Dining', 'Table'],
  },

  // ── ASHLEY BOLANBURG DINING CHAIR SET ─────────────────────
  {
    sku: 'ASH-D677-02A',
    upc: '024052867702',
    primary_image: placeholderImg('Ashley', 'Bolanburg Chair Set', 'Primary'),
    images: [
      { url: placeholderImg('Ashley', 'Bolanburg Chair Set', 'Primary'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Ashley', 'Bolanburg Chair Set', 'Side View'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Ashley', 'Bolanburg Chair Set', 'Dining Room'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Ashley', 'Bolanburg Chair Set', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Set Quantity': '2 chairs per set',
      'Material': 'Solid wood with upholstered seat',
      'Seat Fabric': 'Textured linen-weave polyester',
      'Seat Color': 'Oatmeal',
      'Frame Finish': 'Two-tone — weathered oak over antique white',
      'Back Style': 'Lattice cross-back',
      'Seat Height': '46 cm (18 in)',
      'Seat Depth': '43 cm (17 in)',
      'Floor Protectors': 'Felt glides included',
      'Assembly Required': 'No — fully assembled',
      'Weight Capacity': '136 kg (300 lbs) per chair',
      'Per Chair Dimensions': '46 W x 56 D x 97 H cm',
    },
    warranty: {
      frame: '5 Years (structural)',
      fabric: '1 Year (stain, pilling)',
      description: 'Ashley limited warranty. Frame 5 years, fabric 1 year. Set of 2 chairs.',
    },
    competitor_pricing: [
      { retailer: 'Ashley HomeStore', price: 549.99, last_updated: '2026-02-18' },
      { retailer: "Leon's", price: 529.99, last_updated: '2026-02-17' },
      { retailer: 'The Brick', price: 559.99, last_updated: '2026-02-16' },
      { retailer: 'Wayfair', price: 499.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 18.0,
    width_cm: 46.0,
    height_cm: 97.0,
    depth_cm: 56.0,
    product_link: 'https://www.ashleyfurniture.com/p/bolanburg-dining-chair-set-of-2/APK-D677-02A.html',
    category_path: ['Furniture', 'Dining', 'Chair Set'],
  },

  // ── BDI SEQUEL 20 DESK ────────────────────────────────────
  {
    sku: 'BDI-6001-CWL',
    upc: '042993600116',
    primary_image: placeholderImg('BDI', 'Sequel 20 6001 Desk', 'Primary'),
    images: [
      { url: placeholderImg('BDI', 'Sequel 20 6001 Desk', 'Primary'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('BDI', 'Sequel 20 6001 Desk', 'Open Drawer'), type: 'product', sort_order: 1 },
      { url: placeholderImg('BDI', 'Sequel 20 6001 Desk', 'Home Office'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('BDI', 'Sequel 20 6001 Desk', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Material': 'Satin-etched tempered glass top, powder-coated steel base',
      'Finish': 'Chocolate Walnut (stained oak veneer on sides)',
      'Desktop Size': '152 x 61 cm (60 x 24 in)',
      'Storage': 'Centre drawer + lateral file drawer (letter/legal)',
      'Cable Management': 'Integrated wire management with rear access',
      'Power Outlet': 'Concealed power strip with 3 outlets + 2 USB',
      'Keyboard Tray': 'Full-width flip-down micro-etched glass',
      'Levelling Feet': 'Adjustable',
      'Assembly Required': 'Partial (attach legs to desktop)',
      'Weight Capacity': '91 kg (200 lbs) on desktop',
      'Overall Dimensions': '152 W x 61 D x 75 H cm',
    },
    warranty: {
      manufacturer: '5 Years (structural and finish)',
      glass: '2 Years (tempered glass)',
      description: 'BDI 5-year limited warranty covering structural integrity and finish. Glass panels 2 years.',
    },
    competitor_pricing: [
      { retailer: 'Wayfair', price: 1749.99, last_updated: '2026-02-18' },
      { retailer: 'EQ3', price: 1799.99, last_updated: '2026-02-17' },
      { retailer: 'Structube', price: 1849.99, last_updated: '2026-02-16' },
    ],
    weight_kg: 52.0,
    width_cm: 152.0,
    height_cm: 75.0,
    depth_cm: 61.0,
    product_link: 'https://www.bdiusa.com/products/sequel-20-6001-desk-chocolate-walnut',
    category_path: ['Furniture', 'Home Office', 'Desk'],
  },

  // ── HERMAN MILLER AERON CHAIR ─────────────────────────────
  {
    sku: 'HMN-462011',
    upc: '042054620114',
    primary_image: placeholderImg('Herman Miller', 'Aeron Chair', 'Primary'),
    images: [
      { url: placeholderImg('Herman Miller', 'Aeron Chair', 'Primary'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Herman Miller', 'Aeron Chair', 'Side View'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Herman Miller', 'Aeron Chair', 'Home Office'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Herman Miller', 'Aeron Chair', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Size': 'B (Medium) — fits 170-185 cm / 64-127 kg',
      'Material': '8Z Pellicle elastomeric suspension (seat and back)',
      'Frame': 'Graphite (fibre-reinforced nylon)',
      'Lumbar Support': 'PostureFit SL (adjustable sacral & lumbar pads)',
      'Armrests': 'Fully adjustable 4D arms (height, angle, depth, width)',
      'Tilt': 'Harmonic 2 tilt with forward seat angle',
      'Seat Height Range': '40 – 52 cm',
      'Casters': 'Quiet-roll (hard floor) or carpet casters',
      'Recycle Content': '53% recycled content, 91% recyclable',
      'Made In': 'USA (Zeeland, Michigan)',
      'Assembly Required': 'No — ships fully assembled',
      'Weight Capacity': '150 kg (330 lbs)',
      'Overall Dimensions': '69 W x 43 D x 104 H cm',
    },
    warranty: {
      manufacturer: '12 Years (comprehensive)',
      description: 'Herman Miller 12-year full warranty covering everything — frame, mechanism, pneumatic cylinder, Pellicle material, and casters.',
    },
    competitor_pricing: [
      { retailer: 'EQ3', price: 1949.99, last_updated: '2026-02-18' },
      { retailer: 'Wayfair', price: 1899.99, last_updated: '2026-02-17' },
      { retailer: 'Structube', price: 1999.99, last_updated: '2026-02-16' },
    ],
    weight_kg: 13.6,
    width_cm: 69.0,
    height_cm: 104.0,
    depth_cm: 43.0,
    product_link: 'https://www.hermanmiller.com/products/seating/office-chairs/aeron-chair/',
    category_path: ['Furniture', 'Home Office', 'Office Chair'],
  },

  // ── ASHLEY LANEY ACCENT TABLE SET ─────────────────────────
  {
    sku: 'ASH-T138-13',
    upc: '024052138138',
    primary_image: placeholderImg('Ashley', 'Laney Table Set', 'Primary'),
    images: [
      { url: placeholderImg('Ashley', 'Laney Table Set', 'Primary'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Ashley', 'Laney Table Set', 'Individual'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Ashley', 'Laney Table Set', 'Living Room'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Ashley', 'Laney Table Set', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Set Contents': '1 coffee table + 2 end tables',
      'Material': 'Metal frame with tempered glass tops',
      'Finish': 'Black powder-coat with clear glass',
      'Coffee Table': '91 x 46 x 47 H cm',
      'End Tables': '56 x 56 x 56 H cm each',
      'Glass Thickness': '5 mm tempered',
      'Lower Shelf': 'Fixed open shelf on coffee table',
      'Floor Protectors': 'Adjustable levelling glides',
      'Assembly Required': 'Yes (hardware included)',
      'Weight Capacity': '23 kg coffee table, 11 kg per end table',
      'Overall Style': 'Contemporary transitional',
    },
    warranty: {
      frame: '1 Year (structural)',
      glass: '1 Year (tempered glass)',
      description: 'Ashley limited warranty. Frame and glass warranted 1 year against defects. Set of 3 tables.',
    },
    competitor_pricing: [
      { retailer: 'Ashley HomeStore', price: 349.99, last_updated: '2026-02-18' },
      { retailer: "Leon's", price: 329.99, last_updated: '2026-02-17' },
      { retailer: 'The Brick', price: 349.99, last_updated: '2026-02-16' },
      { retailer: 'Wayfair', price: 299.99, last_updated: '2026-02-14' },
    ],
    weight_kg: 28.0,
    width_cm: 91.0,
    height_cm: 56.0,
    depth_cm: 56.0,
    product_link: 'https://www.ashleyfurniture.com/p/laney-table-set-of-3/APK-T138-13.html',
    category_path: ['Furniture', 'Accent', 'Occasional Table'],
  },

  // ── DECOR-REST MAXWELL ACCENT CHAIR ───────────────────────
  {
    sku: 'DR-6300-AC',
    upc: '068700630012',
    primary_image: placeholderImg('Decor-Rest', 'Maxwell Accent Chair', 'Primary'),
    images: [
      { url: placeholderImg('Decor-Rest', 'Maxwell Accent Chair', 'Primary'), type: 'primary', sort_order: 0 },
      { url: placeholderImg('Decor-Rest', 'Maxwell Accent Chair', 'Detail'), type: 'product', sort_order: 1 },
      { url: placeholderImg('Decor-Rest', 'Maxwell Accent Chair', 'Living Room'), type: 'lifestyle', sort_order: 2 },
      { url: placeholderImg('Decor-Rest', 'Maxwell Accent Chair', 'Dimensions'), type: 'dimension', sort_order: 3 },
    ],
    specs: {
      'Upholstery': 'Performance fabric (200,000+ double rubs)',
      'Color': 'Slate Blue',
      'Frame': 'Kiln-dried hardwood, corner-blocked joints',
      'Cushion': 'High-resiliency foam seat with Dacron wrap',
      'Seat Height': '48 cm (19 in)',
      'Seat Depth': '53 cm (21 in)',
      'Arm Style': 'Sloped track arms',
      'Leg Style': 'Tapered solid walnut, 15 cm (6 in)',
      'Pillow': '1 matching lumbar pillow included',
      'Made In': 'Toronto, Ontario, Canada',
      'Assembly Required': 'No — legs pre-attached',
      'Weight Capacity': '159 kg (350 lbs)',
      'Overall Dimensions': '81 W x 86 D x 84 H cm',
    },
    warranty: {
      frame: '10 Years (structural, kiln-dried hardwood)',
      fabric: '3 Years (performance fabric)',
      cushion: '3 Years (foam resiliency)',
      description: 'Decor-Rest 10-year frame warranty. Custom made in Toronto, ON. Fabric and cushions 3 years.',
    },
    competitor_pricing: [
      { retailer: "Leon's", price: 1249.99, last_updated: '2026-02-18' },
      { retailer: 'The Brick', price: 1299.99, last_updated: '2026-02-17' },
      { retailer: 'EQ3', price: 1349.99, last_updated: '2026-02-16' },
    ],
    weight_kg: 24.0,
    width_cm: 81.0,
    height_cm: 84.0,
    depth_cm: 86.0,
    product_link: 'https://www.decor-rest.com/accent/chairs/6300-maxwell-accent-chair',
    category_path: ['Furniture', 'Accent', 'Accent Chair'],
  },
];

// ── Main ────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`\nEnriching global_skulytics_products seed data${dryRun ? ' (DRY RUN)' : ''}...\n`);

  // ── Phase 1: Insert furniture base records ────────────────
  console.log('Phase 1: Inserting furniture base products...');
  let inserted = 0;
  for (const p of FURNITURE_BASE_PRODUCTS) {
    if (dryRun) {
      console.log(`  [dry-run] Would insert: ${p.brand} ${p.sku}`);
      inserted++;
      continue;
    }
    const { rowCount } = await pool.query(
      `INSERT INTO global_skulytics_products
         (skulytics_id, sku, brand, brand_slug, model_number, model_name,
          category_slug, msrp, currency, api_schema_version,
          is_discontinued, is_stale, last_synced_at, raw_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'CAD','v1',false,false,NOW(),$9)
       ON CONFLICT (skulytics_id) DO NOTHING`,
      [
        p.skulytics_id,
        p.sku,
        p.brand,
        p.brand_slug,
        p.model_number,
        p.model_name,
        p.category_slug,
        p.msrp,
        JSON.stringify({ source: 'seed', sku: p.sku, brand: p.brand }),
      ]
    );
    if (rowCount > 0) {
      console.log(`  INSERT: ${p.brand} ${p.sku} — ${p.model_name}`);
      inserted++;
    } else {
      console.log(`  EXISTS: ${p.brand} ${p.sku} (skipped)`);
    }
  }
  console.log(`  ${inserted} furniture base records processed\n`);

  // ── Phase 2: Enrich all products ──────────────────────────
  console.log('Phase 2: Enriching product data...');

  // Fetch existing products
  const { rows } = await pool.query(
    'SELECT skulytics_id, sku, brand, model_name FROM global_skulytics_products ORDER BY brand, sku'
  );
  console.log(`Found ${rows.length} products in global catalogue\n`);

  let updated = 0;
  let skipped = 0;

  for (const e of ENRICHMENTS) {
    const match = rows.find(r => r.sku === e.sku);
    if (!match) {
      console.log(`  SKIP: No product found with SKU "${e.sku}"`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [dry-run] Would update: ${match.brand} ${match.sku} (${match.skulytics_id})`);
      updated++;
      continue;
    }

    await pool.query(
      `UPDATE global_skulytics_products SET
         primary_image = $2,
         images = $3,
         specs = $4,
         warranty = $5,
         competitor_pricing = $6,
         weight_kg = $7,
         width_cm = $8,
         height_cm = $9,
         depth_cm = $10,
         product_link = $11,
         category_path = $12,
         upc = $13,
         updated_at = NOW()
       WHERE skulytics_id = $1`,
      [
        match.skulytics_id,        // $1
        e.primary_image,           // $2
        JSON.stringify(e.images),  // $3
        JSON.stringify(e.specs),   // $4
        JSON.stringify(e.warranty),// $5
        JSON.stringify(e.competitor_pricing), // $6
        e.weight_kg,               // $7
        e.width_cm,                // $8
        e.height_cm,               // $9
        e.depth_cm,                // $10
        e.product_link,            // $11
        e.category_path,           // $12 (pg driver handles TEXT[] from JS array)
        e.upc,                     // $13
      ]
    );

    console.log(`  OK: ${match.brand} ${match.sku} — ${match.model_name}`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped\n`);
}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error('FAILED:', err.message);
    pool.end().then(() => process.exit(1));
  });
