/**
 * Analyze Unmapped Products
 * Finds patterns in products that weren't auto-mapped
 */

const pool = require('../db');

// Current patterns from auto-map script
const CATEGORY_MAPPINGS = {
  'CAT_1953': { patterns: [/^RF/i, /^RS[0-9]/i, /^SRF/i, /^WRS/i, /^WRF/i, /^WRX/i, /^WRFC/i, /^WRFF/i, /^WRSC/i, /^WRSF/i, /^MFI/i, /^MRT/i, /^MRQ/i, /^GFE/i, /^GNE/i, /^GSE/i, /^GSS/i, /^GTE/i, /^GTH/i, /^PFE/i, /^PNE/i, /^PSE/i, /^PWE/i, /^PYE/i, /^GZS/i, /^LRMVS/i, /^LRFXS/i, /^LRFVS/i, /^LRMXS/i, /^LRFXC/i, /^LRFX/i, /^LRMV/i, /^LFX/i, /^LFXS/i, /^LFXC/i, /^KRFC/i, /^KRMF/i, /^KRFF/i, /^KBSD/i, /^KBFN/i, /^BI-/i, /^CL/i, /fridge/i, /refrigerat/i] },
  'CAT_1949': { patterns: [/^WF[0-9]/i, /^WA[0-9]/i, /^WTW/i, /^NFW/i, /^MVW/i, /^MHW/i, /^WFW/i, /^NTW/i, /^GTW/i, /^PTW/i, /^GFW/i, /^PFW/i, /^WM[0-9]/i, /washer/i] },
  'CAT_1950': { patterns: [/^DVE/i, /^DVG/i, /^DV[0-9]/i, /^DV[2-9][0-9]/i, /^NED/i, /^MED/i, /^MGD/i, /^WED/i, /^WGD/i, /^YMED/i, /^NGD/i, /^YWED/i, /^GTD/i, /^PTD/i, /^GFD/i, /^PFD/i, /^DLE/i, /^DLG/i, /^DLX/i, /dryer/i] },
  'CAT_1951': { patterns: [/^DW[0-9]/i, /^DW-/i, /^DW8/i, /^DW9/i, /^SH[EPVX]/i, /^SHP/i, /^SHE/i, /^SHV/i, /^WDT/i, /^WDTA/i, /^WDTS/i, /^MDB/i, /^KDTE/i, /^KDTM/i, /^KDPM/i, /^KDFE/i, /^KDFM/i, /^GDT/i, /^GDF/i, /^GDP/i, /^PDT/i, /^PDF/i, /^LDF/i, /^LDT/i, /^LDP/i, /^G[0-9]{4}/i, /dishwash/i] },
  'CAT_1952': { patterns: [/^NE[0-9]/i, /^AER/i, /^WFE/i, /^MER[0-9]/i, /^YWFE/i, /^YAER/i, /^YACR/i, /^ACR/i, /^KFED/i, /^KSEG/i, /^JB[0-9]/i, /^JS[0-9]/i, /^PB[0-9]/i, /^PS[0-9]/i, /^LSE/i, /^LRE/i, /electric.?range/i] },
  'CAT_10744': { patterns: [/^NX[0-9]/i, /^AGR/i, /^WFG/i, /^MGR/i, /^YWFG/i, /^KFGG/i, /^KSGG/i, /^JGB/i, /^JGS/i, /^PGB/i, /^PGS/i, /^LRG/i, /gas.?range/i] },
  'CAT_27136': { patterns: [/^MC[0-9]/i, /^ME[0-9]/i, /^MS[0-9]/i, /^MW/i, /^WMH/i, /^MMV/i, /^YWMH/i, /^UMV/i, /^KMHC/i, /^KMHS/i, /^KMMF/i, /^JVM/i, /^PVM/i, /^JES/i, /^PEB/i, /^LMV/i, /^LMC/i, /microwave/i] },
  'CAT_19561': { patterns: [/^NK[0-9A-Z]/i, /^WV[UVW]/i, /^UXT/i, /^JV/i, /^PV/i, /^UVW/i, /^KVWB/i, /^KVUB/i, /^KVWC/i, /hood/i, /^vent/i] },
  'CAT_10735': { patterns: [/^NV[0-9]/i, /^NQ[0-9]/i, /^HBL/i, /^HBN/i, /^WOS/i, /^WOD/i, /^WOC/i, /^WOCA/i, /^KOSE/i, /^KOCE/i, /^KODE/i, /^KOSC/i, /^JT[SD][0-9]/i, /^PT[SD][0-9]/i, /^JK[SD][0-9]/i, /^PK[SD][0-9]/i, /^LW[SDCE]/i, /^H[0-9]{4}/i, /wall.?oven/i] },
  'CAT_10872': { patterns: [/^NZ[0-9]/i, /^NA[0-9]/i, /^WCE/i, /^WCG/i, /^WCC/i, /^KCES/i, /^KCGS/i, /^KCED/i, /^KCGD/i, /^JP[0-9]/i, /^PP[0-9]/i, /^JGP/i, /^PGP/i, /^LCE/i, /^LCG/i, /^CTT/i, /cooktop/i] },
  'CAT_1954': { patterns: [/^WZF/i, /^MZF/i, /^WZC/i, /^GUF/i, /^FUF/i, /^UF/i, /freezer/i] },
  'CAT_10742': { patterns: [/^WET[0-9]/i, /^WETLV/i, /^WGT[0-9]/i, /^GUD/i, /^GUV/i, /laundry.?cent/i, /stacked/i] },
  'CAT_29879': { patterns: [/^UN[0-9]/i, /^QN[0-9]/i, /^OLED/i, /^XR[0-9]/i, /^KD[0-9]/i, /^QE[0-9]/i, /^TU[0-9]/i, /^CU[0-9]/i, /^BU[0-9]/i, /television/i, /^TV/i] },
  'CAT_12207827': { patterns: [/^HW-/i, /^SL[0-9]/i, /^SP[0-9]/i, /^YAS/i, /soundbar/i] },
  'CAT_10551': { patterns: [/^AVR/i, /^STR-/i, /^NR[0-9]/i, /^SR[0-9]/i, /receiver/i] },
  'CAT_315694': { patterns: [/speaker/i, /subwoofer/i] },
  'CAT_321023': { patterns: [/^WH-/i, /^WF-/i, /headphone/i, /earbuds/i] },
  'CAT_29103': { patterns: [/playstation/i, /^xbox/i, /nintendo/i, /switch/i, /\bps5\b/i, /\bps4\b/i], excludePatterns: [/^WD[A-Z]{2}[0-9]/i] },
  'CAT_26378': { patterns: [/\bcontroller\b/i, /\bgamepad\b/i, /gaming.?charging/i] },
  'CAT_1544': { patterns: [/^PRO/i, /^VPL/i, /^HT[0-9]/i, /^TW[0-9]/i, /^EH[0-9]/i, /projector/i] },
  'CAT_7687': { patterns: [/\bbbq\b/i, /\bgrill\b/i, /\bsmoker\b/i, /\bweber\b/i, /\bnapoleon\b/i], excludePatterns: [/^RA-F/i] }
};

function isMatched(product) {
  const model = product.model || '';
  const name = product.name || '';

  for (const [catId, catInfo] of Object.entries(CATEGORY_MAPPINGS)) {
    if (catInfo.excludePatterns) {
      let excluded = false;
      for (const p of catInfo.excludePatterns) {
        if (p.test(model) || p.test(name)) { excluded = true; break; }
      }
      if (excluded) continue;
    }
    for (const p of catInfo.patterns) {
      if (p.test(model) || p.test(name)) return true;
    }
  }
  return false;
}

async function analyze() {
  const client = await pool.connect();

  try {
    const result = await client.query('SELECT id, model, name, manufacturer FROM products');
    const products = result.rows;

    const unmapped = products.filter(p => !isMatched(p));

    console.log('='.repeat(70));
    console.log('UNMAPPED PRODUCTS ANALYSIS');
    console.log('='.repeat(70));
    console.log('Total Products:', products.length);
    console.log('Total Unmapped:', unmapped.length);
    console.log('');

    // 1. By Manufacturer
    console.log('='.repeat(70));
    console.log('TOP MANUFACTURERS WITH UNMAPPED PRODUCTS');
    console.log('='.repeat(70));
    const byMfr = {};
    unmapped.forEach(p => {
      const mfr = p.manufacturer || 'Unknown';
      byMfr[mfr] = (byMfr[mfr] || 0) + 1;
    });
    Object.entries(byMfr)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([mfr, count]) => console.log('  ' + mfr + ': ' + count));

    // 2. Model Prefixes
    console.log('');
    console.log('='.repeat(70));
    console.log('TOP MODEL PREFIXES (appearing 5+ times)');
    console.log('='.repeat(70));
    const prefixes = {};
    unmapped.forEach(p => {
      const model = (p.model || p.name || '').toUpperCase();
      if (model.length >= 2) {
        const p2 = model.substring(0, 2);
        const p3 = model.length >= 3 ? model.substring(0, 3) : null;

        prefixes[p2] = prefixes[p2] || { count: 0, samples: [] };
        prefixes[p2].count++;
        if (prefixes[p2].samples.length < 3) prefixes[p2].samples.push(model.substring(0, 20));

        if (p3) {
          prefixes[p3] = prefixes[p3] || { count: 0, samples: [] };
          prefixes[p3].count++;
          if (prefixes[p3].samples.length < 3) prefixes[p3].samples.push(model.substring(0, 20));
        }
      }
    });

    Object.entries(prefixes)
      .filter(([_, v]) => v.count >= 5)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 30)
      .forEach(([prefix, info]) => {
        console.log('  ' + prefix + ': ' + info.count + ' products');
        console.log('    Samples: ' + info.samples.join(', '));
      });

    // 3. Samsung Analysis
    console.log('');
    console.log('='.repeat(70));
    console.log('SAMSUNG UNMAPPED PRODUCTS BREAKDOWN');
    console.log('='.repeat(70));
    const samsungUnmapped = unmapped.filter(p =>
      (p.manufacturer || '').toUpperCase().includes('SAMSUNG')
    );
    console.log('Total Samsung Unmapped:', samsungUnmapped.length);

    const samsungPrefixes = {};
    samsungUnmapped.forEach(p => {
      const model = (p.model || p.name || '').toUpperCase();
      if (model.length >= 2) {
        const prefix = model.substring(0, 2);
        samsungPrefixes[prefix] = samsungPrefixes[prefix] || { count: 0, samples: [] };
        samsungPrefixes[prefix].count++;
        if (samsungPrefixes[prefix].samples.length < 5) {
          samsungPrefixes[prefix].samples.push(model.substring(0, 25));
        }
      }
    });

    Object.entries(samsungPrefixes)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .forEach(([prefix, info]) => {
        console.log('  ' + prefix + ': ' + info.count + ' products');
        console.log('    ' + info.samples.slice(0, 3).join(', '));
      });

    // 4. Whirlpool Analysis
    console.log('');
    console.log('='.repeat(70));
    console.log('WHIRLPOOL UNMAPPED PRODUCTS BREAKDOWN');
    console.log('='.repeat(70));
    const whirlpoolUnmapped = unmapped.filter(p =>
      (p.manufacturer || '').toUpperCase().includes('WHIRLPOOL')
    );
    console.log('Total Whirlpool Unmapped:', whirlpoolUnmapped.length);

    const wpPrefixes = {};
    whirlpoolUnmapped.forEach(p => {
      const model = (p.model || p.name || '').toUpperCase();
      if (model.length >= 3) {
        const prefix = model.substring(0, 3);
        wpPrefixes[prefix] = wpPrefixes[prefix] || { count: 0, samples: [] };
        wpPrefixes[prefix].count++;
        if (wpPrefixes[prefix].samples.length < 5) {
          wpPrefixes[prefix].samples.push(model.substring(0, 25));
        }
      }
    });

    Object.entries(wpPrefixes)
      .filter(([_, v]) => v.count >= 3)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 25)
      .forEach(([prefix, info]) => {
        console.log('  ' + prefix + ': ' + info.count + ' products');
        console.log('    ' + info.samples.slice(0, 3).join(', '));
      });

    // 5. Accessory Patterns
    console.log('');
    console.log('='.repeat(70));
    console.log('LIKELY ACCESSORIES (patterns to categorize separately)');
    console.log('='.repeat(70));
    const accessoryPatterns = [
      { name: 'HAF (Water Filters)', pattern: /^HAF/i },
      { name: 'RA- (Refrigerator Accessories)', pattern: /^RA-/i },
      { name: 'NK-A (Hood Accessories)', pattern: /^NK-A/i },
      { name: 'SK- (Stacking Kits)', pattern: /^SK-/i },
      { name: 'LP/NG Conversion Kits', pattern: /LPKIT|NGKIT|LP-|NG-/i },
      { name: 'Trim Kits MA-TK', pattern: /^MA-TK/i },
      { name: 'WEP/WED Pedestals', pattern: /^WEP|^WED[0-9]{3}P/i },
      { name: 'DV- Accessories', pattern: /^DV-[A-Z]/i },
      { name: 'CC (Cooktop Covers?)', pattern: /^CC[0-9]/i },
      { name: 'DF (Drawer Freezers?)', pattern: /^DF[0-9]/i },
      { name: 'SM- (Samsung Misc)', pattern: /^SM-/i }
    ];

    accessoryPatterns.forEach(ap => {
      const matches = unmapped.filter(p => {
        const model = p.model || p.name || '';
        return ap.pattern.test(model);
      });
      if (matches.length > 0) {
        console.log('  ' + ap.name + ': ' + matches.length + ' products');
        console.log('    ' + matches.slice(0, 4).map(m => m.model || m.name).join(', '));
      }
    });

    // 6. Potential Appliances we're missing
    console.log('');
    console.log('='.repeat(70));
    console.log('POTENTIAL APPLIANCES WE ARE MISSING');
    console.log('='.repeat(70));

    // Look for patterns that might be appliances
    const potentialAppliances = [
      { name: 'KR (KitchenAid Refrigerators?)', pattern: /^KR[A-Z]{2}/i },
      { name: 'KF (KitchenAid Freezers?)', pattern: /^KF[0-9A-Z]{2}/i },
      { name: 'KS (KitchenAid?)', pattern: /^KS[A-Z]{2}/i },
      { name: 'KC (KitchenAid Cooktops?)', pattern: /^KC[A-Z]{2}/i },
      { name: 'W10 (Parts/Accessories)', pattern: /^W10/i },
      { name: 'WP (Whirlpool Parts?)', pattern: /^WP[0-9]/i },
      { name: 'MS (Microwaves?)', pattern: /^MS[0-9]/i },
      { name: 'OT (Over-the-Range?)', pattern: /^OT[A-Z]/i }
    ];

    potentialAppliances.forEach(ap => {
      const matches = unmapped.filter(p => {
        const model = p.model || p.name || '';
        return ap.pattern.test(model);
      });
      if (matches.length > 0) {
        console.log('  ' + ap.name + ': ' + matches.length + ' products');
        console.log('    ' + matches.slice(0, 5).map(m => (m.model || m.name) + ' (' + m.manufacturer + ')').join(', '));
      }
    });

    // 7. Random sample of remaining
    console.log('');
    console.log('='.repeat(70));
    console.log('SAMPLE OF OTHER UNMAPPED (excluding obvious accessories)');
    console.log('='.repeat(70));
    const accessoryRegex = /^HAF|^RA-|^NK-A|^SK-|LPKIT|^DV-[A-Z]|^MA-TK|^WEP|^WED[0-9]{3}P|^W10|^WP[0-9]|^SM-/i;
    const nonAccessories = unmapped.filter(p => {
      const model = p.model || p.name || '';
      return !accessoryRegex.test(model);
    }).slice(0, 40);

    nonAccessories.forEach(p => {
      console.log('  [' + p.id + '] ' + (p.model || 'N/A') + ' | ' + (p.name || 'N/A') + ' (' + p.manufacturer + ')');
    });

  } finally {
    client.release();
    await pool.end();
  }
}

analyze().catch(console.error);
