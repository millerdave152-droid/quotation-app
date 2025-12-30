/**
 * Deep analysis of unknown patterns for better detection
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
  const products = await fetchProducts();

  // Filter for ranges
  const ranges = products.filter(p => {
    const cat = (p.category || '').toLowerCase();
    return (cat.includes('range') || cat.includes('slide') || cat.includes('cooking') ||
            cat.includes('stove') || cat.includes('freestanding') || cat.includes('cooker')) &&
           !cat.includes('hood') && !cat.includes('cooktop') && !cat.includes('oven') &&
           !cat.includes('microwave') && !cat.includes('grill') && !cat.includes('grate');
  });

  console.log('=== RANGE FUEL TYPE ANALYSIS ===\n');

  // Group ranges by category to understand patterns
  const rangesByCategory = {};
  ranges.forEach(p => {
    const cat = p.category || 'Unknown';
    if (!rangesByCategory[cat]) rangesByCategory[cat] = [];
    rangesByCategory[cat].push(p);
  });

  // Show categories that contain fuel indicators
  console.log('Categories with clear fuel type:');
  const fuelKeywords = ['gas', 'electric', 'induction', 'dual fuel', 'natural gas'];
  Object.keys(rangesByCategory).sort().forEach(cat => {
    const catLower = cat.toLowerCase();
    fuelKeywords.forEach(fuel => {
      if (catLower.includes(fuel)) {
        console.log(`  "${cat}" (${rangesByCategory[cat].length}) -> ${fuel}`);
      }
    });
  });

  console.log('\nCategories without clear fuel type (need name/model detection):');
  const unclearCategories = [];
  Object.keys(rangesByCategory).sort().forEach(cat => {
    const catLower = cat.toLowerCase();
    const hasFuel = fuelKeywords.some(fuel => catLower.includes(fuel));
    if (!hasFuel) {
      unclearCategories.push(cat);
      console.log(`  "${cat}": ${rangesByCategory[cat].length} products`);
    }
  });

  // Analyze model patterns for unclear categories
  console.log('\nModel patterns in unclear categories:');
  unclearCategories.forEach(cat => {
    const prods = rangesByCategory[cat].slice(0, 5);
    console.log(`\n  ${cat}:`);
    prods.forEach(p => {
      const fuel = detectFuelFromName(p.name || '');
      console.log(`    ${p.manufacturer} ${p.model} - ${fuel} (name: ${(p.name || '').substring(0, 50)})`);
    });
  });

  // REFRIGERATOR ANALYSIS
  console.log('\n\n=== REFRIGERATOR STYLE/ICE ANALYSIS ===\n');

  const fridges = products.filter(p => {
    const cat = (p.category || '').toLowerCase();
    return (cat.includes('ref') || cat.includes('fdr') || cat.includes('sxs') ||
            cat.includes('tmf') || cat.includes('bmf') || cat.includes('french') ||
            cat.includes('side by side') || cat.includes('top mount') || cat.includes('bottom mount') ||
            cat.includes('refrigerator')) &&
           !cat.includes('wine') && !cat.includes('beverage') && !cat.includes('freezer') &&
           !cat.includes('filter') && !cat.includes('ice maker');
  });

  // Group by category
  const fridgesByCategory = {};
  fridges.forEach(p => {
    const cat = p.category || 'Unknown';
    if (!fridgesByCategory[cat]) fridgesByCategory[cat] = [];
    fridgesByCategory[cat].push(p);
  });

  console.log('Refrigerator categories:');
  Object.keys(fridgesByCategory).sort().forEach(cat => {
    const style = detectStyleFromCategory(cat);
    console.log(`  "${cat}" (${fridgesByCategory[cat].length}) -> style: ${style}`);
  });

  // Show samples from categories without clear style
  console.log('\nCategories needing model-based detection:');
  const genericCategories = Object.keys(fridgesByCategory).filter(cat => {
    const style = detectStyleFromCategory(cat);
    return style === 'unknown';
  });

  genericCategories.forEach(cat => {
    const prods = fridgesByCategory[cat].slice(0, 3);
    console.log(`\n  ${cat}:`);
    prods.forEach(p => {
      console.log(`    ${p.manufacturer} ${p.model} - ${(p.name || '').substring(0, 60)}`);
    });
  });

  // Brand-specific model patterns
  console.log('\n\n=== BRAND-SPECIFIC MODEL PATTERNS ===\n');

  const brandPatterns = {};
  products.forEach(p => {
    const brand = (p.manufacturer || 'Unknown').toUpperCase();
    if (!brandPatterns[brand]) brandPatterns[brand] = new Set();
    const prefix = (p.model || '').substring(0, 4).toUpperCase();
    if (prefix.length >= 2) brandPatterns[brand].add(prefix);
  });

  ['BERTAZZONI', 'FULGOR MILANO', 'JENN-AIR', 'THOR KITCHEN', 'ELECTROLUX', 'BOSCH'].forEach(brand => {
    if (brandPatterns[brand]) {
      const prefixes = Array.from(brandPatterns[brand]).sort().slice(0, 20);
      console.log(`${brand} prefixes: ${prefixes.join(', ')}`);
    }
  });
}

function detectFuelFromName(name) {
  const n = name.toLowerCase();
  if (n.includes('induction')) return 'induction';
  if (n.includes('dual fuel')) return 'dual_fuel';
  if (n.includes('gas') || n.includes('propane')) return 'gas';
  if (n.includes('electric') || n.includes('radiant')) return 'electric';
  return 'unknown';
}

function detectStyleFromCategory(cat) {
  const c = cat.toLowerCase();
  if (c.includes('french') || c.includes('fdr')) return 'french_door';
  if (c.includes('side') || c.includes('sxs')) return 'side_by_side';
  if (c.includes('top') || c.includes('tmf')) return 'top_freezer';
  if (c.includes('bottom') || c.includes('bmf')) return 'bottom_freezer';
  return 'unknown';
}

analyze().catch(console.error);
