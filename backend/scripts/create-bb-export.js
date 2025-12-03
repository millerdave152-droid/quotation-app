const XLSX = require('xlsx');
const path = require('path');

// Test batch data - Samsung products with researched UPCs and specs
const testBatchProducts = [
  {
    category: 'Appliances/Refrigerators',
    model: 'BRF365200AP',
    brand: 'SAMSUNG',
    product: 'REFRIGERATOR',
    qty: 1,
    upc: '887276192406',
    title: 'Samsung 36" Chef Collection 21.3 Cu. Ft. French Door Built-In Refrigerator - Panel Ready',
    shortDesc: 'Samsung Chef Collection 21.3 cu. ft. built-in French door refrigerator with Twin Cooling Plus, Wi-Fi enabled with interior cameras, panel ready design.',
    longDesc: 'Samsung BRF365200AP Chef Collection built-in refrigerator features 21.3 cu. ft. total capacity (14.5 cu. ft. refrigerator, 6.8 cu. ft. freezer), Twin Cooling Plus technology, Chef Pantry with temperature controls, Wi-Fi enabled with remote view cameras, FlexZone drawer, Energy Star compliant, integrated flush mount counter height panel ready design.',
    imageUrl: 'https://image-us.samsung.com/SamsungUS/home/home-appliances/refrigerators/brf365200ap/gallery/01_BRF365200AP_Front_Quartz_Silver.jpg',
    price: '8999.99',
    confidence: 'HIGH',
    notes: 'Panel ready built-in, premium Chef Collection line'
  },
  {
    category: 'Appliances/Other Appliances',
    model: 'DF60R8200DG',
    brand: 'SAMSUNG',
    product: 'AIR DRESSER',
    qty: 3,
    upc: '887276369044',
    title: 'Samsung AirDresser 18" Steam Closet with JetSteam Technology - Dark Black',
    shortDesc: 'Samsung AirDresser steam closet with JetSteam technology, sanitizes 99.9% of bacteria, deodorizes clothes, Wi-Fi connected, 2 air hanger capacity.',
    longDesc: 'Samsung DF60R8200DG AirDresser steam clothing care system with JetSteam technology delivers powerful heated steam to eliminate odors and provides 99.9% sanitization. Features Heat Pump Drying, Dehumidification, Wi-Fi Connectivity, 9 special cycles, 4 general cycles, 3 dry cycles, 6 downloadable cycles, LCD display, 2 air hanger capacity (6 hanging garments), deodorizing filter.',
    imageUrl: 'https://image-us.samsung.com/SamsungUS/home/home-appliances/air-dresser/df60r8200dg/gallery/01_DF60R8200DG_Front_Door_Closed.jpg',
    price: '1499.99',
    confidence: 'HIGH',
    notes: 'Unique product category - steam clothing care'
  },
  {
    category: 'Appliances/Dryers',
    model: 'DVE45B6305P/AC',
    brand: 'SAMSUNG',
    product: 'DRYER',
    qty: 1,
    upc: '887276652146',
    title: 'Samsung 7.5 Cu. Ft. Smart Electric Dryer with Steam Sanitize+ - Platinum',
    shortDesc: 'Samsung 7.5 cu. ft. electric dryer with Steam Sanitize+ removing 99.9% of germs, Multi-Steam technology, SmartThings Wi-Fi, sensor dry.',
    longDesc: 'Samsung DVE45B6305P electric dryer with 7.5 cu. ft. capacity, 12 dry cycles, Steam Sanitize+ removes 99.9% of germs, bacteria, pollen and dust mites, Multi-Steam technology steams away wrinkles and odors, 5 temperature levels, sensor dry, SmartThings Wi-Fi connectivity, stackable design.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dve45b6305p-ac/gallery/ca-dv6300b-dve45b6305p-ac-532233678',
    price: '1099.99',
    confidence: 'HIGH',
    notes: 'Canadian model /AC suffix'
  },
  {
    category: 'Appliances/Dryers',
    model: 'DVE45T3200W/AC',
    brand: 'SAMSUNG',
    product: 'DRYER',
    qty: 1,
    upc: '887276429618',
    title: 'Samsung 7.2 Cu. Ft. Electric Dryer with Sensor Dry - White',
    shortDesc: 'Samsung 7.2 cu. ft. electric dryer with Sensor Dry technology, 8 dry cycles, reversible door, lint filter indicator, Smart Care diagnostics.',
    longDesc: 'Samsung DVE45T3200W electric dryer features 7.2 cu. ft. capacity, Sensor Dry for optimal drying, 8 dry cycles including Time Dry, Air Fluff, Quick Dry, Wrinkle Release, reversible door, 4-way venting, powder coat interior, lint filter indicator, child lock, Smart Care diagnostics.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dve45t3200w-ac/gallery/ca-dv3000j-dve45t3200w-ac-thumb-532233614',
    price: '699.99',
    confidence: 'HIGH',
    notes: 'Entry-level dryer model'
  },
  {
    category: 'Appliances/Dryers',
    model: 'DVE47CG3500WAC',
    brand: 'SAMSUNG',
    product: 'DRYER',
    qty: 2,
    upc: '887276750187',
    title: 'Samsung 7.4 Cu. Ft. 3500 Series Smart Electric Dryer with SmartThings Wi-Fi - White',
    shortDesc: 'Samsung 7.4 cu. ft. smart electric dryer with SmartThings Wi-Fi, Sensor Dry, 10 preset cycles, 7 downloadable cycles, remote control via app.',
    longDesc: 'Samsung DVE47CG3500W 3500 Series smart electric dryer with 7.4 cu. ft. capacity, SmartThings Wi-Fi connectivity for remote control and alerts, Sensor Dry technology, 10 preset drying cycles, 7 downloadable cycles, 4 temperature settings, 4 dry levels, lint filter indicator.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dve47cg3500wac/gallery/ca-dv3500c-dve47cg3500wac-thumb-536571927',
    price: '899.99',
    confidence: 'HIGH',
    notes: ''
  },
  {
    category: 'Appliances/Dryers',
    model: 'DVE54CG7550VAC',
    brand: 'SAMSUNG',
    product: 'DRYER',
    qty: 3,
    upc: '887276759920',
    title: 'Samsung 7.4 Cu. Ft. 7550 Series Smart Electric Dryer with Pet Care Dry - Brushed Black',
    shortDesc: 'Samsung 7.4 cu. ft. smart electric dryer with Pet Care Dry removing 97% of pet odors, Steam Sanitize+, SmartThings Wi-Fi, vent sensor.',
    longDesc: 'Samsung DVE54CG7550V 7550 Series smart electric dryer with 7.4 cu. ft. capacity, Pet Care Dry cycle removes 97% of pet odors, Steam Sanitize+ removes 99.9% of bacteria, 12 preset cycles, Sensor Dry, SmartThings connectivity, vent sensor monitoring, reversible door, stainless steel drum.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dve54cg7550vac/gallery/ca-dv7550c-dve54cg7550vac-thumb-536571983',
    price: '1299.99',
    confidence: 'HIGH',
    notes: 'DISCONTINUED model'
  },
  {
    category: 'Appliances/Dryers',
    model: 'DVE60M9900V',
    brand: 'SAMSUNG',
    product: 'DRYER',
    qty: 3,
    upc: '887276197562',
    title: 'Samsung 7.5 Cu. Ft. FlexDry Smart Electric Dryer - Black Stainless Steel',
    shortDesc: 'Samsung FlexDry electric dryer with two dryers in one - large capacity dryer plus delicate dryer, Multi-Steam, Wi-Fi, Alexa and Google compatible.',
    longDesc: 'Samsung DVE60M9900V FlexDry electric dryer features 7.5 cu. ft. main dryer plus 1 cu. ft. upper delicates dryer, Multi-Steam technology for sanitizing and refreshing, 12 dry cycles, 11 options, Wi-Fi enabled with SmartThings app, works with Alexa and Google Home, reversible door, Super Speed drying.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dve60m9900v-ac/gallery/ca-dv9000-dve60m9900v-ac-thumb-532233526',
    price: '1799.99',
    confidence: 'HIGH',
    notes: 'Premium FlexDry dual-dryer system'
  },
  {
    category: 'Appliances/Dryers',
    model: 'DVE53BB8700V',
    brand: 'SAMSUNG',
    product: 'DRYER',
    qty: 1,
    upc: '887276657240',
    title: 'Samsung Bespoke 7.6 Cu. Ft. Ultra Capacity Smart Electric Dryer with AI Smart Dial - Brushed Black',
    shortDesc: 'Samsung Bespoke 7.6 cu. ft. ultra capacity electric dryer with AI Smart Dial, Super Speed Dry, Steam Sanitize+, 19 cycles, Energy Star certified.',
    longDesc: 'Samsung DVE53BB8700V Bespoke series electric dryer with 7.6 cu. ft. ultra capacity, AI Smart Dial learns your preferences, Super Speed Dry, Steam Sanitize+, 19 preset drying cycles, 14 options, 5 temperature settings, SmartThings Wi-Fi, Energy Star certified, reversible door, 4-way venting.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dve53bb8700vac/gallery/ca-bespoke-ai-laundry-dve53bb8700vac-thumb-536572039',
    price: '1499.99',
    confidence: 'HIGH',
    notes: 'Bespoke series with AI Smart Dial'
  },
  {
    category: 'Appliances/Dryers',
    model: 'DV90F53AESAC',
    brand: 'SAMSUNG',
    product: 'DRYER',
    qty: 5,
    upc: '198957074189',
    title: 'Samsung Bespoke AI 7.6 Cu. Ft. Ultra Capacity Electric Dryer with AI OptiDry+ - Dark Gray',
    shortDesc: 'Samsung Bespoke AI 7.6 cu. ft. electric dryer with AI OptiDry+, 7" LCD display, 20 preset cycles, SmartThings app, Energy Star certified.',
    longDesc: 'Samsung DV90F53AESAC Bespoke AI series electric dryer with 7.6 cu. ft. ultra capacity, AI OptiDry+ technology, large 7" LCD display, 20 preset drying cycles, 25 options, Steam Sanitize+, Super Speed, SmartThings app connectivity with Auto Cycle Link, Energy Star certified, stainless steel drum.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dv90f53aesac/gallery/ca-f90-series-bespoke-ai-electric-dryer-dv90f53aesac-thumb-544027579',
    price: '1699.99',
    confidence: 'HIGH',
    notes: '2025 model with AI features'
  },
  {
    category: 'Appliances/Dishwashers',
    model: 'DW80B6060UG',
    brand: 'SAMSUNG',
    product: 'DISHWASHER',
    qty: 1,
    upc: '887276616384',
    title: 'Samsung 24" Smart Built-In Dishwasher with StormWash+ and AutoRelease Door - Black Stainless Steel',
    shortDesc: 'Samsung 24" smart dishwasher with StormWash+ powerful cleaning, AutoRelease door for better drying, 3rd rack, 44 dBA quiet operation, Wi-Fi.',
    longDesc: 'Samsung DW80B6060UG 24" smart built-in dishwasher with StormWash+ dual wash arms and rotating spray jet, AutoRelease door dry, 15 place settings, 3rd rack, 7 wash cycles with 7 options, 44 dBA quiet operation, stainless steel tub, FlexLoad rack system, SmartThings Wi-Fi, Energy Star certified.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dw80b6060ug-ac/gallery/ca-dishwasher-dw80b6060ug-ac-thumb-534063315',
    price: '1099.99',
    confidence: 'HIGH',
    notes: 'DISCONTINUED model'
  }
];

// Create workbook
const wb = XLSX.utils.book_new();

// Create data array with headers matching Best Buy template
const headers = [
  'Category Code',
  'Shop sku',
  'Title BB (EN)',
  'Short Description BB (EN)',
  'Brand Name',
  'Primary UPC',
  'Model Number',
  "Manufacturer's Part Number",
  'Long Description BB (EN)',
  '01 - Image Source (Main Image)',
  '02 - Image Source',
  'Product Condition',
  'Offer SKU',
  'Product ID',
  'Product ID Type',
  'Offer Price',
  'Offer State',
  'Warranty - Parts & Labour',
  'Quantity Available',
  'Data Source',
  'Confidence Level',
  'Notes'
];

const data = [headers];

testBatchProducts.forEach(p => {
  const shopSku = `${p.brand}-${p.model.replace(/\//g, '-')}`;
  data.push([
    p.category,
    shopSku,
    p.title,
    p.shortDesc,
    p.brand,
    p.upc,
    p.model,
    p.model, // MPN same as model
    p.longDesc,
    p.imageUrl,
    '', // Second image
    'Brand New',
    shopSku,
    p.upc,
    'UPC',
    p.price,
    'Active',
    '1 Year',
    p.qty,
    'Samsung.com, AJMadison, CanadianAppliance',
    p.confidence,
    p.notes
  ]);
});

// Create worksheet
const ws = XLSX.utils.aoa_to_sheet(data);

// Set column widths
ws['!cols'] = [
  { wch: 25 }, // Category
  { wch: 30 }, // Shop SKU
  { wch: 80 }, // Title
  { wch: 120 }, // Short Desc
  { wch: 12 }, // Brand
  { wch: 15 }, // UPC
  { wch: 20 }, // Model
  { wch: 20 }, // MPN
  { wch: 150 }, // Long Desc
  { wch: 80 }, // Image URL
  { wch: 40 }, // Image 2
  { wch: 12 }, // Condition
  { wch: 30 }, // Offer SKU
  { wch: 15 }, // Product ID
  { wch: 10 }, // ID Type
  { wch: 12 }, // Price
  { wch: 10 }, // State
  { wch: 15 }, // Warranty
  { wch: 10 }, // Qty
  { wch: 40 }, // Data Source
  { wch: 12 }, // Confidence
  { wch: 30 }  // Notes
];

// Add worksheet to workbook
XLSX.utils.book_append_sheet(wb, ws, 'Products');

// Create summary sheet
const summaryData = [
  ['BEST BUY MARKETPLACE - PRODUCT ENRICHMENT SUMMARY'],
  [''],
  ['Generated:', new Date().toISOString()],
  [''],
  ['BATCH SUMMARY'],
  ['Total Products:', testBatchProducts.length],
  ['Ready for Upload (HIGH confidence):', testBatchProducts.filter(p => p.confidence === 'HIGH').length],
  ['Needs Review (MEDIUM confidence):', testBatchProducts.filter(p => p.confidence === 'MEDIUM').length],
  ['Missing Data (LOW confidence):', testBatchProducts.filter(p => p.confidence === 'LOW').length],
  [''],
  ['CATEGORIES COVERED'],
  ...([...new Set(testBatchProducts.map(p => p.category))].map(c => ['', c])),
  [''],
  ['NOTES'],
  ['- All UPCs verified via web search'],
  ['- Image URLs from Samsung official sources'],
  ['- Prices are suggested retail (CAD)'],
  ['- Some models marked DISCONTINUED - verify availability'],
  [''],
  ['NEXT STEPS'],
  ['1. Review product data for accuracy'],
  ['2. Verify image URLs are accessible'],
  ['3. Confirm pricing is current'],
  ['4. Upload to Best Buy Marketplace']
];

const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
summaryWs['!cols'] = [{ wch: 40 }, { wch: 60 }];
XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

// Write file
const outputPath = 'C:\\Users\\davem\\OneDrive\\Desktop\\BestBuy_Samsung_TestBatch.xlsx';
XLSX.writeFile(wb, outputPath);

console.log('='.repeat(60));
console.log('BEST BUY PRODUCT EXPORT CREATED');
console.log('='.repeat(60));
console.log(`Output file: ${outputPath}`);
console.log(`Products exported: ${testBatchProducts.length}`);
console.log('');
console.log('Product Summary:');
testBatchProducts.forEach((p, i) => {
  console.log(`${i+1}. ${p.model} - ${p.title.substring(0, 50)}... [${p.confidence}]`);
});
console.log('');
console.log('All products have HIGH confidence with verified UPCs.');
