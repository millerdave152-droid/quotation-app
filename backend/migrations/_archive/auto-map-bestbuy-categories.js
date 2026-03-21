/**
 * Auto-Map Products to Best Buy Categories
 *
 * This script analyzes product model numbers and names to automatically
 * assign Best Buy marketplace category codes.
 *
 * Run with: node migrations/auto-map-bestbuy-categories.js
 *
 * Options:
 *   --dry-run    Preview changes without applying (default)
 *   --apply      Apply the changes to the database
 */

const pool = require('../db');

// Best Buy category mappings with model patterns
const CATEGORY_MAPPINGS = {
  // ============================================
  // APPLIANCES
  // ============================================

  'CAT_1953': {
    name: 'Refrigerators',
    patterns: [
      // Samsung
      /^RF/i, /^RS[0-9]/i, /^SRF/i, /^RB[0-9]/i, /^RT[0-9]/i,
      // Whirlpool/Maytag
      /^WRS/i, /^WRF/i, /^WRX/i, /^WRFC/i, /^WRFF/i, /^WRSC/i, /^WRSF/i, /^MFI/i, /^MRT/i, /^MRQ/i,
      /^WRT/i, /^WRM/i, /^WRB/i,
      // GE/GE Profile/Cafe patterns
      /^GFE/i, /^GNE/i, /^GSE/i, /^GSS/i, /^GTE/i, /^GTH/i, /^PFE/i, /^PNE/i, /^PSE/i, /^PWE/i, /^PYE/i, /^GZS/i,
      /^CYE/i, /^CWE/i, /^CSB/i, /^CXE/i,  // Cafe refrigerators
      // LG patterns
      /^LRMVS/i, /^LRFXS/i, /^LRFVS/i, /^LRMXS/i, /^LRFXC/i, /^LRFX/i, /^LRMV/i, /^LFX/i, /^LFXS/i, /^LFXC/i,
      // KitchenAid patterns
      /^KRFC/i, /^KRMF/i, /^KRFF/i, /^KBSD/i, /^KBFN/i,
      /^KBS[DN]/i, /^KRB[LR]/i,
      // Amana patterns
      /^ART/i, /^ABB/i, /^ASI/i,
      // SubZero (premium)
      /^BI-/i, /^BI[0-9]/i, /^CL-/i, /^CL[0-9]/i, /^IC-/i, /^IC[0-9]/i, /^PRO48/i, /^PRO36/i,
      // Thermador
      /^T18/i, /^T24/i, /^T30/i, /^T36/i,
      // Miele
      /^K[0-9]{4}/i, /^KF[0-9]/i,
      // Gaggenau
      /^RB[0-9]/i, /^RC[0-9]/i, /^RY[0-9]/i,
      // Bosch
      /^B[0-9]{2}[A-Z]/i, /^B36/i,
      // Generic
      /fridge/i, /refrigerat/i
    ]
  },

  'CAT_1949': {
    name: 'Washers',
    patterns: [
      // Samsung
      /^WF[0-9]/i, /^WF4/i, /^WF5/i, /^WA[0-9]/i, /^WW[0-9]/i, /^WH[0-9]/i,
      // Whirlpool/Maytag
      /^WTW/i, /^NFW/i, /^MVW/i, /^MHW/i, /^WFW/i, /^NTW/i,
      /^MTW/i,
      // GE patterns
      /^GTW/i, /^PTW/i, /^GFW/i, /^PFW/i,
      // LG patterns
      /^WM[0-9]/i,
      // Miele
      /^W[0-9]{4}/i,
      // Bosch
      /^WAT/i, /^WTG/i, /^WAW/i,
      // Generic
      /washer/i
    ]
  },

  'CAT_1950': {
    name: 'Dryers',
    patterns: [
      // Samsung
      /^DVE/i, /^DVG/i, /^DV[0-9]/i, /^DV[2-9][0-9]/i, /^DV4/i, /^DV5/i,
      // Whirlpool/Maytag
      /^NED/i, /^MED/i, /^MGD/i, /^WED/i, /^WGD/i, /^YMED/i, /^NGD/i, /^YWED/i,
      /^YNED/i,
      // GE patterns
      /^GTD/i, /^PTD/i, /^GFD/i, /^PFD/i,
      // LG patterns
      /^DLE/i, /^DLG/i, /^DLX/i,
      // Miele
      /^T[0-9]{4}/i,
      // Bosch
      /^WTW/i, /^WTZ/i,
      // Generic
      /dryer/i
    ]
  },

  'CAT_1951': {
    name: 'Dishwashers',
    patterns: [
      // Samsung
      /^DW[0-9]/i, /^DW-/i, /^DW8/i, /^DW9/i, /^DW[A-Z]/i,
      // Bosch
      /^SH[EPVX]/i, /^SHP/i, /^SHE/i, /^SHV/i, /^SHX/i,
      // Whirlpool/Maytag
      /^WDT/i, /^WDTA/i, /^WDTS/i, /^MDB/i,
      /^WDP/i, /^WDF/i,
      // KitchenAid patterns
      /^KDTE/i, /^KDTM/i, /^KDPM/i, /^KDFE/i, /^KDFM/i,
      /^KDT[A-Z]/i, /^KDF[A-Z]/i,
      // Amana patterns
      /^ADF/i, /^ADFS/i,
      // GE/GE Profile/Cafe patterns
      /^GDT/i, /^GDF/i, /^GDP/i, /^PDT/i, /^PDF/i,
      /^CDT/i, /^PWD/i,  // Cafe and Profile dishwashers
      // LG patterns
      /^LDF/i, /^LDT/i, /^LDP/i,
      // Miele
      /^G[0-9]{4}/i,
      // Thermador
      /^DWHD/i,
      // Gaggenau
      /^DF[0-9]/i,
      // Generic
      /dishwash/i
    ]
  },

  'CAT_1952': {
    name: 'Electric Ranges',
    patterns: [
      // Samsung
      /^NE[0-9]/i, /^NE6[0-9]/i, /^NE5[0-9]/i, /^NS[E]/i,
      /^NSI/i,  // Samsung Induction Slide-in
      // Whirlpool/Maytag/Amana
      /^AER/i, /^WFE/i, /^MER[0-9]/i, /^YWFE/i, /^YAER/i, /^YACR/i, /^ACR/i,
      /^YAES/i,
      /^YKS[DE]/i,
      // KitchenAid
      /^KFED/i, /^KSEG/i,
      /^KFI[D]/i, /^KSI[G]/i,
      // GE/GE Profile/Cafe patterns
      /^JB[0-9]/i, /^JS[0-9]/i, /^PB[0-9]/i, /^PS[0-9]/i,
      /^CES/i, /^CEH/i, /^CHS/i,  // Cafe electric ranges
      // LG patterns
      /^LSE/i, /^LRE/i,
      // Wolf
      /^IR[0-9]/i, /^DF[0-9]/i,  // Induction and Dual fuel ranges
      // Thermador
      /^MED/i, /^MES/i,  // Masterpiece electric
      // Miele
      /^HR[0-9]/i,  // Miele Home Range models
      // Generic
      /electric.?range/i
    ]
  },

  'CAT_37205': {
    name: 'Dual Fuel Ranges',
    patterns: [
      // KitchenAid
      /^KFDC/i, /^KSDB/i,
      // Whirlpool
      /^WFD/i,
      // Thermador
      /^PRD/i,  // Pro Dual Fuel
      // Generic
      /dual.?fuel/i
    ]
  },

  'CAT_10744': {
    name: 'Gas Ranges',
    patterns: [
      // Samsung (including hyphenated models like NX-A*, NX-AB*, NX-AF*)
      /^NX[0-9]/i, /^NX6[0]/i, /^NX5[8]/i, /^NX3[0]/i,
      /^NX-/i,  // Samsung hyphenated gas range models
      /^NSG/i,  // Samsung Gas Slide-in
      /^NSY/i,  // Samsung NSY variant gas range
      // Whirlpool/Maytag/Amana
      /^AGR/i, /^WFG/i, /^MGR/i, /^YWFG/i,
      // KitchenAid
      /^KFGG/i, /^KSGG/i,
      /^KFG[C]/i, /^KSG[BS]/i,
      // GE/GE Profile/Cafe patterns
      /^JGB/i, /^JGS/i, /^PGB/i, /^PGS/i,
      /^CGS/i, /^CGB/i,  // Cafe gas ranges
      // LG patterns
      /^LRG/i,
      // Wolf
      /^GR[0-9]/i,
      // Thermador
      /^PRL/i, /^PRG/i,  // Pro Gas ranges
      // Generic
      /gas.?range/i
    ]
  },

  'CAT_27136': {
    name: 'Microwaves',
    patterns: [
      // Samsung
      /^MC[0-9]/i, /^ME[0-9]/i, /^MS[0-9]/i,
      // Whirlpool/Maytag
      /^MW/i, /^WMH/i, /^MMV/i, /^YWMH/i, /^UMV/i,
      /^YWM[BT]/i, /^YKM[BM]/i, /^YWMT/i,
      // KitchenAid
      /^KMHC/i, /^KMHS/i, /^KMMF/i,
      /^KMB[DPST]/i, /^KMC[SU]/i, /^YKMB/i, /^YKMM/i,
      // Amana
      /^YAMV/i,
      // GE/GE Profile patterns
      /^JVM/i, /^PVM/i, /^JES/i, /^PEB/i, /^PEM/i,
      // LG patterns
      /^LMV/i, /^LMC/i,
      // Miele
      /^M[0-9]{4}/i,
      // Wolf
      /^DD[0-9]/i,  // Microwave drawers
      // Gaggenau
      /^BM[0-9]/i, /^BL[0-9]/i,
      // Bosch
      /^HMB/i, /^HMD/i,
      // Generic
      /microwave/i
    ]
  },

  'CAT_19561': {
    name: 'Range Hoods',
    patterns: [
      // Samsung
      /^NK[0-9]/i,
      // Whirlpool
      /^WV[UVW]/i, /^UXT/i,
      // GE/GE Profile/Cafe
      /^JV/i, /^PV/i, /^UVW/i, /^CVW/i, /^PVD/i,
      // KitchenAid
      /^KVWB/i, /^KVUB/i, /^KVWC/i, /^KXW/i,
      // Miele
      /^DA[0-9]{4}/i,
      // Wolf
      /^VW[0-9]/i,
      // Gaggenau
      /^AW[0-9]/i, /^AL[0-9]/i,
      // Generic
      /hood/i, /^vent/i
    ],
    excludePatterns: [/^NK-A/i]  // Exclude hood accessories
  },

  'CAT_10735': {
    name: 'Wall Ovens',
    patterns: [
      // Samsung (including hyphenated models like NV-A*, NQ-*)
      /^NV[0-9]/i, /^NQ[0-9]/i,
      /^NV-/i,  // Samsung hyphenated wall oven models
      /^NQ-/i,  // Samsung hyphenated combo wall oven models
      // Bosch
      /^HBL/i, /^HBN/i, /^HMC/i,
      // Whirlpool
      /^WOS/i, /^WOD/i, /^WOC/i, /^WOCA/i,
      /^WOE/i, /^WOES/i,
      // KitchenAid
      /^KOSE/i, /^KOCE/i, /^KODE/i, /^KOSC/i,
      /^KOE[CS]/i, /^KOD[CE]/i, /^YKOSC/i, /^YKOCE/i, /^YKOSE/i,
      // GE/GE Profile/Cafe patterns
      /^JT[SD][0-9]/i, /^PT[SD][0-9]/i, /^JK[SD][0-9]/i, /^PK[SD][0-9]/i,
      /^CTS/i, /^CTD/i,  // Cafe wall ovens
      // LG patterns
      /^LW[SDCE]/i,
      // Miele
      /^H[0-9]{4}/i,
      // Wolf (premium)
      /^SO[0-9]/i, /^DO[0-9]/i, /^CSO[0-9]/i,  // Single, Double, Steam ovens
      // Thermador
      /^POD/i, /^ME[DS]/i,  // Professional and Masterpiece ovens
      // Gaggenau
      /^BS[0-9]/i, /^BO[0-9]/i,
      // Generic
      /wall.?oven/i
    ]
  },

  'CAT_10872': {
    name: 'Cooktops',
    patterns: [
      // Samsung
      /^NZ[0-9]/i, /^NA[0-9]/i,
      /^CC[0-9]/i,  // Samsung CC70F etc
      // Whirlpool
      /^WCE/i, /^WCG/i, /^WCC/i,
      /^WCI/i,
      // KitchenAid
      /^KCES/i, /^KCGS/i, /^KCED/i, /^KCGD/i,
      /^KC[GI][CGIS]/i, /^KCE[DGIS]/i,
      // GE/GE Profile/Cafe
      /^JP[0-9]/i, /^PP[0-9]/i, /^JGP/i, /^PGP/i,
      /^CHS/i, /^CHW/i, /^PHP/i,  // Cafe and Profile cooktops
      // LG
      /^LCE/i, /^LCG/i,
      // Bosch
      /^NGM/i, /^NIT/i, /^NET/i,
      // Wolf
      /^CG[0-9]/i, /^CT[0-9]/i, /^CI[0-9]/i,
      // Thermador
      /^CIT/i, /^CET/i, /^SGS/i,
      // Gaggenau
      /^CX[0-9]/i, /^CI[0-9]/i, /^VI[0-9]/i,
      // Miele
      /^KM[0-9]{4}/i,
      // Generic
      /^CTT/i, /cooktop/i
    ]
  },

  'CAT_1954': {
    name: 'Freezers',
    patterns: [
      // Whirlpool/Maytag
      /^WZF/i, /^MZF/i, /^WZC/i,
      // Amana (added)
      /^AZC/i, /^AZF/i,
      // GE
      /^GUF/i, /^FUF/i,
      // Miele (premium)
      /^F[0-9]{4}/i,  // F#### freezers
      // Generic
      /^UF/i, /freezer/i
    ]
  },

  'CAT_10742': {
    name: 'Laundry Centres',
    patterns: [
      // Whirlpool
      /^WET[0-9]/i, /^WETLV/i, /^WGT[0-9]/i,
      /^YWET/i,  // Added: Canada models
      // GE
      /^GUD/i, /^GUV/i,
      // Samsung Washer/Dryer Combo (All-in-One)
      /^WD[0-9]{2}/i,  // WD53DBA etc - combo units
      // Generic
      /laundry.?cent/i, /stacked/i
    ]
  },

  'CAT_17131': {
    name: 'Bar Fridges & Beverage Centres',
    patterns: [
      // KitchenAid Under-counter units
      /^KUR[LSU]/i,  // Under-counter refrigerators
      /^KUW[LRS]/i,  // Wine coolers
      /^KUB[LSU]/i,  // Beverage centers
      /^KUC/i,       // Compact units
      /^KUD/i,       // Ice makers
      // Whirlpool
      /^WUB/i, /^WUW/i,
      // SubZero
      /^UC-/i, /^UC[0-9]/i,  // Under-counter refrigerators
      // Generic
      /beverage/i, /wine.?cool/i, /bar.?fridge/i
    ]
  },

  // ============================================
  // VACUUM CLEANERS
  // ============================================

  'CAT_20366': {
    name: 'Vacuum Cleaners',
    patterns: [
      // Samsung Jet/Stick Vacuums
      /^VS[0-9]/i,  // VS15A, VS20A, VS28C, VS90F etc
      // Dyson
      /^V[0-9]{1,2}/i,  // V10, V11, V15
      // Generic
      /vacuum/i, /stick.?vac/i
    ]
  },

  // ============================================
  // APPLIANCE ACCESSORIES
  // ============================================

  'CAT_19542': {
    name: 'Appliance Accessories',
    patterns: [
      // Samsung Refrigerator Accessories
      /^RA-/i,
      // Samsung Range Hood Accessories
      /^NK-A/i,
      // Samsung Washer/Dryer Pedestals
      /^WE[0-9]{3}/i, /^WE[P]/i,
      // Samsung Stacking Kits
      /^SK-/i, /^SKK/i,
      // Whirlpool/KitchenAid Water Filters
      /^EDR[0-9]/i, /^EDRA/i,
      // Samsung Water Filters
      /^HAF/i,
      // Trim Kits
      /^MA-TK/i, /^TK[0-9]/i,
      // LP/NG Conversion Kits
      /LPKIT/i, /NGKIT/i,
      // Misc Filters
      /^EVFILTER/i, /^F2WC/i,
      // Samsung Vacuum Accessories (VCA-*)
      /^VCA-/i,
      // Samsung Dryer Accessories (DV-2A, etc.)
      /^DV-[0-9A]/i,
      // Generic
      /\bfilter\b/i, /\btrim.?kit\b/i, /\bpedestal\b/i, /\bstacking.?kit\b/i
    ],
    excludePatterns: [
      /^WET/i,  // Laundry centres, not pedestals
      /^WEG/i, /^WEE/i  // Ranges, not pedestals
    ]
  },

  // ============================================
  // TELEVISIONS
  // ============================================

  'CAT_29879': {
    name: 'Televisions',
    patterns: [/^UN[0-9]/i, /^QN[0-9]/i, /^OLED/i, /^XR[0-9]/i, /^KD[0-9]/i, /^QE[0-9]/i, /^TU[0-9]/i, /^CU[0-9]/i, /^BU[0-9]/i, /television/i, /^TV/i]
  },

  // ============================================
  // AUDIO
  // ============================================

  'CAT_12207827': {
    name: 'Soundbars',
    patterns: [/^HW-/i, /^SL[0-9]/i, /^SP[0-9]/i, /^YAS/i, /soundbar/i]
  },
  'CAT_10551': {
    name: 'Home Theatre Receivers',
    patterns: [/^AVR/i, /^STR-/i, /^NR[0-9]/i, /^SR[0-9]/i, /receiver/i]
  },
  'CAT_315694': {
    name: 'Home Speakers',
    patterns: [/speaker/i, /subwoofer/i]
  },
  'CAT_321023': {
    name: 'Headphones',
    patterns: [/^WH-/i, /^WF-/i, /headphone/i, /earbuds/i]
  },

  // ============================================
  // GAMING
  // ============================================

  'CAT_29103': {
    name: 'Video Game Consoles',
    patterns: [/playstation/i, /^xbox/i, /nintendo/i, /switch/i, /\bps5\b/i, /\bps4\b/i],
    excludePatterns: [/^WD[A-Z]{2}[0-9]/i] // Exclude Whirlpool models like WDPS5118
  },
  'CAT_26378': {
    name: 'Video Game Accessories',
    patterns: [/\bcontroller\b/i, /\bgamepad\b/i, /gaming.?charging/i]
  },

  // ============================================
  // PROJECTORS
  // ============================================

  'CAT_1544': {
    name: 'Projectors',
    patterns: [/^PRO/i, /^VPL/i, /^HT[0-9]/i, /^TW[0-9]/i, /^EH[0-9]/i, /projector/i]
  },

  // ============================================
  // BBQ
  // ============================================

  'CAT_7687': {
    name: 'BBQs & Grills',
    patterns: [/\bbbq\b/i, /\bgrill\b/i, /\bsmoker\b/i, /\bweber\b/i, /\bnapoleon\b/i],
    excludePatterns: [/^RA-F/i] // Exclude Samsung fridge accessories
  }
};

async function analyzeAndMap(applyChanges = false) {
  const client = await pool.connect();

  try {
    console.log('='.repeat(70));
    console.log('BEST BUY CATEGORY AUTO-MAPPING');
    console.log('Mode:', applyChanges ? 'APPLY CHANGES' : 'DRY RUN (Preview Only)');
    console.log('='.repeat(70));
    console.log('');

    // First, ensure the bestbuy_category_code column exists
    if (applyChanges) {
      console.log('Ensuring bestbuy_category_code column exists...');
      await client.query(`
        ALTER TABLE products
        ADD COLUMN IF NOT EXISTS bestbuy_category_code VARCHAR(50)
      `);
    }

    // Fetch all products
    const productsResult = await client.query(`
      SELECT id, model, name, manufacturer, bestbuy_category_code
      FROM products
      ORDER BY manufacturer, model
    `);

    const products = productsResult.rows;
    console.log(`Total products found: ${products.length}`);
    console.log('');

    // Analyze and categorize products
    const results = {};
    const mappings = []; // Products to be mapped
    const unmapped = []; // Products that couldn't be auto-detected
    const alreadyMapped = []; // Products already have a mapping

    // Initialize results
    Object.keys(CATEGORY_MAPPINGS).forEach(cat => {
      results[cat] = {
        name: CATEGORY_MAPPINGS[cat].name,
        products: [],
        count: 0
      };
    });

    // Analyze each product
    for (const product of products) {
      // Skip if already mapped
      if (product.bestbuy_category_code) {
        alreadyMapped.push(product);
        continue;
      }

      const model = product.model || '';
      const name = product.name || '';

      let foundCategory = null;

      // Try to match against patterns
      for (const [catId, catInfo] of Object.entries(CATEGORY_MAPPINGS)) {
        // Check exclude patterns first
        if (catInfo.excludePatterns) {
          let excluded = false;
          for (const excludePattern of catInfo.excludePatterns) {
            if (excludePattern.test(model) || excludePattern.test(name)) {
              excluded = true;
              break;
            }
          }
          if (excluded) continue;
        }

        // Check include patterns
        for (const pattern of catInfo.patterns) {
          if (pattern.test(model) || pattern.test(name)) {
            foundCategory = catId;
            break;
          }
        }
        if (foundCategory) break;
      }

      if (foundCategory) {
        results[foundCategory].products.push(product);
        results[foundCategory].count++;
        mappings.push({
          id: product.id,
          model: model,
          name: name,
          manufacturer: product.manufacturer,
          category: foundCategory,
          categoryName: CATEGORY_MAPPINGS[foundCategory].name
        });
      } else {
        unmapped.push(product);
      }
    }

    // Print summary
    console.log('='.repeat(70));
    console.log('MAPPING SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Total Products:        ${products.length}`);
    console.log(`  Already Mapped:        ${alreadyMapped.length}`);
    console.log(`  Will Be Auto-Mapped:   ${mappings.length}`);
    console.log(`  Cannot Auto-Map:       ${unmapped.length}`);
    console.log(`  Auto-Map Rate:         ${((mappings.length / (products.length - alreadyMapped.length)) * 100).toFixed(1)}%`);
    console.log('');

    // Print category breakdown
    console.log('='.repeat(70));
    console.log('CATEGORY BREAKDOWN');
    console.log('='.repeat(70));

    const sortedCategories = Object.entries(results)
      .filter(([_, v]) => v.count > 0)
      .sort((a, b) => b[1].count - a[1].count);

    for (const [catId, catInfo] of sortedCategories) {
      console.log('');
      console.log(`${catId}: ${catInfo.name} (${catInfo.count} products)`);
      console.log('-'.repeat(50));

      // Show first 5 products as samples
      const samples = catInfo.products.slice(0, 5);
      for (const p of samples) {
        console.log(`  [${p.id}] ${p.model || p.name} (${p.manufacturer})`);
      }
      if (catInfo.count > 5) {
        console.log(`  ... and ${catInfo.count - 5} more`);
      }
    }

    // Print unmapped products (first 30)
    console.log('');
    console.log('='.repeat(70));
    console.log('UNMAPPED PRODUCTS (Need Manual Mapping)');
    console.log('='.repeat(70));

    const unmappedSample = unmapped.slice(0, 30);
    for (const p of unmappedSample) {
      console.log(`  [${p.id}] Model: ${p.model || 'N/A'} | Name: ${p.name || 'N/A'} | Mfr: ${p.manufacturer}`);
    }
    if (unmapped.length > 30) {
      console.log(`  ... and ${unmapped.length - 30} more unmapped products`);
    }

    // Apply changes if requested
    if (applyChanges && mappings.length > 0) {
      console.log('');
      console.log('='.repeat(70));
      console.log('APPLYING CHANGES...');
      console.log('='.repeat(70));

      await client.query('BEGIN');

      let updated = 0;
      let failed = 0;

      for (const mapping of mappings) {
        try {
          await client.query(
            `UPDATE products
             SET bestbuy_category_code = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [mapping.category, mapping.id]
          );
          updated++;
        } catch (err) {
          console.error(`  Failed to update product ${mapping.id}: ${err.message}`);
          failed++;
        }
      }

      await client.query('COMMIT');

      console.log('');
      console.log(`Successfully updated: ${updated} products`);
      console.log(`Failed to update: ${failed} products`);

      // Log the mapping operation
      await client.query(`
        INSERT INTO marketplace_sync_log
        (sync_type, sync_direction, entity_type, status, records_processed, records_succeeded, records_failed, sync_start_time, sync_end_time)
        VALUES ('auto_category_mapping', 'internal', 'product', 'SUCCESS', $1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [mappings.length, updated, failed]);

    } else if (!applyChanges) {
      console.log('');
      console.log('='.repeat(70));
      console.log('DRY RUN COMPLETE');
      console.log('='.repeat(70));
      console.log('');
      console.log('To apply these changes, run:');
      console.log('  node migrations/auto-map-bestbuy-categories.js --apply');
      console.log('');
    }

    // Return summary for programmatic use
    return {
      total: products.length,
      alreadyMapped: alreadyMapped.length,
      toMap: mappings.length,
      unmapped: unmapped.length,
      byCategory: sortedCategories.map(([id, info]) => ({
        categoryId: id,
        categoryName: info.name,
        count: info.count
      }))
    };

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run based on command line args
const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');

analyzeAndMap(applyChanges)
  .then((result) => {
    console.log('');
    console.log('Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

module.exports = { analyzeAndMap, CATEGORY_MAPPINGS };
