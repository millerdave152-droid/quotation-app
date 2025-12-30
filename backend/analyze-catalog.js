/**
 * Analyze the product catalog for filter coverage
 */
const http = require('http');

function fetchProducts() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3001/api/products?limit=10000', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function analyze() {
  console.log('Fetching products from database...\n');
  const products = await fetchProducts();
  console.log(`Total products: ${products.length}\n`);

  // 1. BRANDS ANALYSIS
  console.log('=' .repeat(60));
  console.log('1. BRANDS IN DATABASE');
  console.log('=' .repeat(60));
  const brands = {};
  products.forEach(p => {
    const brand = (p.manufacturer || 'Unknown').toUpperCase().trim();
    if (!brands[brand]) brands[brand] = { total: 0, categories: new Set() };
    brands[brand].total++;
    if (p.category) brands[brand].categories.add(p.category);
  });

  Object.keys(brands).sort((a, b) => brands[b].total - brands[a].total).forEach(brand => {
    console.log(`  ${brand}: ${brands[brand].total} products`);
  });

  // 2. RANGE CATEGORIES AND FUEL TYPES
  console.log('\n' + '=' .repeat(60));
  console.log('2. RANGE CATEGORIES & FUEL TYPES');
  console.log('=' .repeat(60));

  const ranges = products.filter(p => {
    const cat = (p.category || '').toLowerCase();
    return cat.includes('range') || cat.includes('slide') || cat.includes('cooking') ||
           cat.includes('stove') || cat.includes('freestanding');
  }).filter(p => {
    const cat = (p.category || '').toLowerCase();
    return !cat.includes('hood') && !cat.includes('cooktop') && !cat.includes('oven');
  });

  console.log(`\nTotal ranges: ${ranges.length}`);

  const rangeCategories = {};
  ranges.forEach(p => {
    const cat = p.category || 'Unknown';
    if (!rangeCategories[cat]) rangeCategories[cat] = [];
    rangeCategories[cat].push(p);
  });

  console.log('\nRange categories:');
  Object.keys(rangeCategories).sort().forEach(cat => {
    console.log(`  ${cat}: ${rangeCategories[cat].length} products`);
  });

  // Detect fuel types
  console.log('\nFuel type detection for ranges:');
  const fuelTypes = { gas: [], electric: [], induction: [], dual_fuel: [], unknown: [] };

  ranges.forEach(p => {
    const model = (p.model || '').toUpperCase();
    const name = (p.name || '').toLowerCase();
    const cat = (p.category || '').toLowerCase();

    let fuel = 'unknown';

    // Check category first
    if (cat.includes('induction')) fuel = 'induction';
    else if (cat.includes('dual fuel')) fuel = 'dual_fuel';
    else if (cat.includes('gas')) fuel = 'gas';
    else if (cat.includes('electric')) fuel = 'electric';
    // Check name
    else if (name.includes('induction')) fuel = 'induction';
    else if (name.includes('dual fuel')) fuel = 'dual_fuel';
    else if (name.includes('gas') || name.includes('propane')) fuel = 'gas';
    else if (name.includes('electric')) fuel = 'electric';
    // Check model patterns
    else if (/^NZ\d/.test(model) || /^NSI\d/.test(model)) fuel = 'induction';
    else if (/^N[GX]\d/.test(model) || /G[A-Z]*\d/.test(model)) fuel = 'gas';
    else if (/^NE\d/.test(model) || /E[A-Z]*\d/.test(model)) fuel = 'electric';

    fuelTypes[fuel].push({ brand: p.manufacturer, model: p.model, cat: p.category });
  });

  Object.keys(fuelTypes).forEach(fuel => {
    console.log(`  ${fuel}: ${fuelTypes[fuel].length} ranges`);
    if (fuel === 'unknown' && fuelTypes[fuel].length > 0) {
      console.log('    Sample unknown:');
      fuelTypes[fuel].slice(0, 5).forEach(r => {
        console.log(`      ${r.brand} ${r.model} - ${r.cat}`);
      });
    }
    if (fuel === 'induction') {
      console.log('    Induction ranges by brand:');
      const byBrand = {};
      fuelTypes[fuel].forEach(r => {
        const b = r.brand || 'Unknown';
        if (!byBrand[b]) byBrand[b] = [];
        byBrand[b].push(r.model);
      });
      Object.keys(byBrand).sort().forEach(b => {
        console.log(`      ${b}: ${byBrand[b].length} - ${byBrand[b].slice(0, 3).join(', ')}`);
      });
    }
  });

  // 3. REFRIGERATOR CATEGORIES
  console.log('\n' + '=' .repeat(60));
  console.log('3. REFRIGERATOR CATEGORIES & STYLES');
  console.log('=' .repeat(60));

  const fridges = products.filter(p => {
    const cat = (p.category || '').toLowerCase();
    return cat.includes('ref') || cat.includes('fdr') || cat.includes('sxs') ||
           cat.includes('tmf') || cat.includes('bmf') || cat.includes('french') ||
           cat.includes('side by side') || cat.includes('top mount') || cat.includes('bottom mount');
  }).filter(p => {
    const cat = (p.category || '').toLowerCase();
    return !cat.includes('wine') && !cat.includes('beverage') && !cat.includes('freezer');
  });

  console.log(`\nTotal refrigerators: ${fridges.length}`);

  const fridgeCategories = {};
  fridges.forEach(p => {
    const cat = p.category || 'Unknown';
    if (!fridgeCategories[cat]) fridgeCategories[cat] = [];
    fridgeCategories[cat].push(p);
  });

  console.log('\nRefrigerator categories:');
  Object.keys(fridgeCategories).sort().forEach(cat => {
    console.log(`  ${cat}: ${fridgeCategories[cat].length} products`);
  });

  // Detect styles
  console.log('\nStyle detection for refrigerators:');
  const styles = { french_door: [], side_by_side: [], top_freezer: [], bottom_freezer: [], unknown: [] };

  fridges.forEach(p => {
    const model = (p.model || '').toUpperCase();
    const name = (p.name || '').toLowerCase();
    const cat = (p.category || '').toLowerCase();

    let style = 'unknown';

    if (cat.includes('french') || cat.includes('fdr') || name.includes('french')) style = 'french_door';
    else if (cat.includes('side') || cat.includes('sxs') || name.includes('side by side')) style = 'side_by_side';
    else if (cat.includes('top') || cat.includes('tmf') || name.includes('top mount') || name.includes('top freezer')) style = 'top_freezer';
    else if (cat.includes('bottom') || cat.includes('bmf') || name.includes('bottom mount') || name.includes('bottom freezer')) style = 'bottom_freezer';
    else if (/^RF\d/.test(model) || /^LF\d/.test(model) || /^WRF\d/.test(model) || /^GFE\d/.test(model)) style = 'french_door';
    else if (/^RS\d/.test(model) || /^WRS\d/.test(model) || /^GSS\d/.test(model)) style = 'side_by_side';
    else if (/^RT\d/.test(model) || /^LT\d/.test(model) || /^WRT\d/.test(model)) style = 'top_freezer';

    styles[style].push({ brand: p.manufacturer, model: p.model, cat: p.category });
  });

  Object.keys(styles).forEach(style => {
    console.log(`  ${style}: ${styles[style].length} fridges`);
    if (style === 'unknown' && styles[style].length > 0) {
      console.log('    Sample unknown:');
      styles[style].slice(0, 10).forEach(r => {
        console.log(`      ${r.brand} ${r.model} - ${r.cat}`);
      });
    }
  });

  // 4. ICE/WATER DETECTION
  console.log('\n' + '=' .repeat(60));
  console.log('4. ICE/WATER DISPENSER DETECTION');
  console.log('=' .repeat(60));

  const iceWater = { door: [], inside: [], none: [], unknown: [] };

  fridges.forEach(p => {
    const model = (p.model || '').toUpperCase();
    const name = (p.name || '').toLowerCase();
    const cat = (p.category || '').toLowerCase();

    let iw = 'unknown';

    // Name-based detection
    if (name.includes('dispenser') || name.includes('ice and water') || name.includes('ice & water') ||
        name.includes('external ice') || name.includes('door dispenser')) {
      iw = 'door';
    }
    // Model patterns
    else if (/^RF\d{2}[A-Z]/.test(model) || /^RS\d{2}/.test(model)) iw = 'door'; // Samsung
    else if (/^LR[A-Z]{2}[SV]/.test(model) || /^LF[A-Z]{2}S/.test(model)) iw = 'door'; // LG
    else if (/^GFE\d{2}/.test(model) || /^GSS\d{2}/.test(model)) iw = 'door'; // GE
    else if (/^WRF\d{3}S/.test(model) || /^WRS\d{3}/.test(model)) iw = 'door'; // Whirlpool
    else if (/^KR[SF][CF]\d/.test(model) || /^KRMF\d/.test(model)) iw = 'door'; // KitchenAid
    else if (/^C[WV]E\d/.test(model) || /^CYE\d/.test(model)) iw = 'door'; // Café
    // Category-based
    else if (cat.includes('side') || cat.includes('sxs')) iw = 'door';
    else if (name.includes('french door')) iw = 'door';
    // Top/bottom typically inside
    else if (cat.includes('top') || cat.includes('tmf') || name.includes('top mount')) iw = 'inside';
    else if (cat.includes('bottom') || cat.includes('bmf')) iw = 'inside';

    iceWater[iw].push({ brand: p.manufacturer, model: p.model, cat: p.category, name: (p.name || '').substring(0, 40) });
  });

  Object.keys(iceWater).forEach(iw => {
    console.log(`  ${iw}: ${iceWater[iw].length} fridges`);
    if (iw === 'unknown' && iceWater[iw].length > 0) {
      console.log('    Sample unknown - need pattern detection:');
      iceWater[iw].slice(0, 15).forEach(r => {
        console.log(`      ${r.brand} ${r.model} - ${r.cat}`);
      });
    }
  });

  // 5. DISHWASHER CATEGORIES
  console.log('\n' + '=' .repeat(60));
  console.log('5. DISHWASHER BRANDS');
  console.log('=' .repeat(60));

  const dishwashers = products.filter(p => {
    const cat = (p.category || '').toLowerCase();
    return cat.includes('dishwasher') || cat.includes('dw ');
  });

  console.log(`\nTotal dishwashers: ${dishwashers.length}`);

  const dwBrands = {};
  dishwashers.forEach(p => {
    const brand = (p.manufacturer || 'Unknown').toUpperCase();
    dwBrands[brand] = (dwBrands[brand] || 0) + 1;
  });

  Object.keys(dwBrands).sort((a, b) => dwBrands[b] - dwBrands[a]).forEach(brand => {
    console.log(`  ${brand}: ${dwBrands[brand]}`);
  });

  // 6. LAUNDRY
  console.log('\n' + '=' .repeat(60));
  console.log('6. LAUNDRY APPLIANCES');
  console.log('=' .repeat(60));

  const laundry = products.filter(p => {
    const cat = (p.category || '').toLowerCase();
    return cat.includes('washer') || cat.includes('dryer') || cat.includes('w/m') ||
           cat.includes('laundry');
  });

  console.log(`\nTotal laundry: ${laundry.length}`);

  const laundryTypes = { washer: [], dryer: [], combo: [] };
  laundry.forEach(p => {
    const cat = (p.category || '').toLowerCase();
    const name = (p.name || '').toLowerCase();

    if (cat.includes('dryer') || name.includes('dryer')) laundryTypes.dryer.push(p);
    else if (cat.includes('washer') || name.includes('washer')) laundryTypes.washer.push(p);
    else laundryTypes.combo.push(p);
  });

  console.log(`  Washers: ${laundryTypes.washer.length}`);
  console.log(`  Dryers: ${laundryTypes.dryer.length}`);

  console.log('\n' + '=' .repeat(60));
  console.log('ANALYSIS COMPLETE');
  console.log('=' .repeat(60));
}

analyze().catch(console.error);
