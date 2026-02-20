#!/usr/bin/env node
'use strict';

/**
 * Enrich Skulytics Seed Data
 *
 * Updates all 15 global_skulytics_products with rich product data:
 * images, detailed specs, warranty, competitor pricing, dimensions,
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
];

// ── Main ────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`\nEnriching global_skulytics_products seed data${dryRun ? ' (DRY RUN)' : ''}...\n`);

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
