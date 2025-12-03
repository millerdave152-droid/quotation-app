/**
 * Best Buy Marketplace Product Enrichment Script
 *
 * This script processes inventory and enriches it with UPCs, descriptions,
 * and images for Best Buy Marketplace submission.
 */

const XLSX = require('xlsx');
const path = require('path');

// ============================================================
// ENHANCED PRODUCT DATABASE - Full descriptions and images
// ============================================================
const PRODUCT_DETAILS = {
  // SAMSUNG APPLIANCES
  'BRF365200AP': {
    title: 'Samsung 36" Chef Collection 21.3 Cu. Ft. French Door Built-In Refrigerator - Panel Ready',
    shortDesc: 'Samsung Chef Collection built-in French door refrigerator with Twin Cooling Plus, Wi-Fi enabled, interior cameras, panel ready design.',
    longDesc: 'Samsung BRF365200AP Chef Collection built-in refrigerator features 21.3 cu. ft. total capacity (14.5 cu. ft. refrigerator, 6.8 cu. ft. freezer), Twin Cooling Plus technology, Chef Pantry with temperature controls, Wi-Fi enabled with remote view cameras, FlexZone drawer, Energy Star compliant, integrated flush mount counter height panel ready design.',
    imageUrl: 'https://image-us.samsung.com/SamsungUS/home/home-appliances/refrigerators/brf365200ap/gallery/01_BRF365200AP_Front.jpg'
  },
  'DF60R8200DG': {
    title: 'Samsung AirDresser 18" Steam Closet with JetSteam Technology - Dark Black',
    shortDesc: 'Samsung AirDresser steam closet with JetSteam technology, sanitizes 99.9% of bacteria, deodorizes clothes, Wi-Fi connected.',
    longDesc: 'Samsung DF60R8200DG AirDresser steam clothing care system with JetSteam technology delivers powerful heated steam to eliminate odors and provides 99.9% sanitization. Features Heat Pump Drying, Dehumidification, Wi-Fi Connectivity, 9 special cycles, 4 general cycles, 3 dry cycles, LCD display, 2 air hanger capacity.',
    imageUrl: 'https://image-us.samsung.com/SamsungUS/home/home-appliances/air-dresser/df60r8200dg/gallery/01_DF60R8200DG_Front.jpg'
  },
  'DVE45B6305P': {
    title: 'Samsung 7.5 Cu. Ft. Smart Electric Dryer with Steam Sanitize+ - Platinum',
    shortDesc: 'Samsung 7.5 cu. ft. electric dryer with Steam Sanitize+ removing 99.9% of germs, Multi-Steam technology, SmartThings Wi-Fi.',
    longDesc: 'Samsung DVE45B6305P electric dryer with 7.5 cu. ft. capacity, 12 dry cycles, Steam Sanitize+ removes 99.9% of germs, bacteria, pollen and dust mites, Multi-Steam technology steams away wrinkles and odors, 5 temperature levels, sensor dry, SmartThings Wi-Fi connectivity, stackable design.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dve45b6305p-ac/gallery/ca-dv6300b-dve45b6305p-ac-532233678'
  },
  'DVE45T3200W/AC': {
    title: 'Samsung 7.2 Cu. Ft. Electric Dryer with Sensor Dry - White',
    shortDesc: 'Samsung 7.2 cu. ft. electric dryer with Sensor Dry technology, 8 dry cycles, reversible door, Smart Care diagnostics.',
    longDesc: 'Samsung DVE45T3200W electric dryer features 7.2 cu. ft. capacity, Sensor Dry for optimal drying, 8 dry cycles including Time Dry, Air Fluff, Quick Dry, Wrinkle Release, reversible door, 4-way venting, powder coat interior, lint filter indicator, child lock, Smart Care diagnostics.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dve45t3200w-ac/gallery/ca-dv3000j-dve45t3200w-ac-thumb-532233614'
  },
  'DVE47CG3500WAC': {
    title: 'Samsung 7.4 Cu. Ft. 3500 Series Smart Electric Dryer - White',
    shortDesc: 'Samsung 7.4 cu. ft. smart electric dryer with SmartThings Wi-Fi, Sensor Dry, 10 preset cycles, remote control via app.',
    longDesc: 'Samsung DVE47CG3500W 3500 Series smart electric dryer with 7.4 cu. ft. capacity, SmartThings Wi-Fi connectivity for remote control and alerts, Sensor Dry technology, 10 preset drying cycles, 7 downloadable cycles, 4 temperature settings, 4 dry levels, lint filter indicator.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dve47cg3500wac/gallery/ca-dv3500c-dve47cg3500wac-thumb-536571927'
  },
  'DVE54CG7550VAC': {
    title: 'Samsung 7.4 Cu. Ft. 7550 Series Smart Electric Dryer with Pet Care Dry - Brushed Black',
    shortDesc: 'Samsung 7.4 cu. ft. smart electric dryer with Pet Care Dry removing 97% of pet odors, Steam Sanitize+, SmartThings Wi-Fi.',
    longDesc: 'Samsung DVE54CG7550V 7550 Series smart electric dryer with 7.4 cu. ft. capacity, Pet Care Dry cycle removes 97% of pet odors, Steam Sanitize+ removes 99.9% of bacteria, 12 preset cycles, Sensor Dry, SmartThings connectivity, vent sensor monitoring, reversible door, stainless steel drum.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dve54cg7550vac/gallery/ca-dv7550c-dve54cg7550vac-thumb-536571983'
  },
  'DVE60M9900V': {
    title: 'Samsung 7.5 Cu. Ft. FlexDry Smart Electric Dryer - Black Stainless Steel',
    shortDesc: 'Samsung FlexDry electric dryer with two dryers in one - large capacity plus delicate dryer, Multi-Steam, Wi-Fi enabled.',
    longDesc: 'Samsung DVE60M9900V FlexDry electric dryer features 7.5 cu. ft. main dryer plus 1 cu. ft. upper delicates dryer, Multi-Steam technology for sanitizing and refreshing, 12 dry cycles, 11 options, Wi-Fi enabled with SmartThings app, works with Alexa and Google Home, reversible door.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dve60m9900v-ac/gallery/ca-dv9000-dve60m9900v-ac-thumb-532233526'
  },
  'DVE53BB8700V': {
    title: 'Samsung Bespoke 7.6 Cu. Ft. Ultra Capacity Smart Electric Dryer with AI Smart Dial - Brushed Black',
    shortDesc: 'Samsung Bespoke 7.6 cu. ft. ultra capacity electric dryer with AI Smart Dial, Super Speed Dry, Steam Sanitize+.',
    longDesc: 'Samsung DVE53BB8700V Bespoke series electric dryer with 7.6 cu. ft. ultra capacity, AI Smart Dial learns your preferences, Super Speed Dry, Steam Sanitize+, 19 preset drying cycles, 14 options, 5 temperature settings, SmartThings Wi-Fi, Energy Star certified, reversible door.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dve53bb8700vac/gallery/ca-bespoke-ai-laundry-dve53bb8700vac-thumb-536572039'
  },
  'DV90F53AESAC': {
    title: 'Samsung Bespoke AI 7.6 Cu. Ft. Ultra Capacity Electric Dryer with AI OptiDry+ - Dark Gray',
    shortDesc: 'Samsung Bespoke AI 7.6 cu. ft. electric dryer with AI OptiDry+, 7" LCD display, 20 preset cycles, SmartThings app.',
    longDesc: 'Samsung DV90F53AESAC Bespoke AI series electric dryer with 7.6 cu. ft. ultra capacity, AI OptiDry+ technology, large 7" LCD display, 20 preset drying cycles, 25 options, Steam Sanitize+, Super Speed, SmartThings app connectivity with Auto Cycle Link, Energy Star certified.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dv90f53aesac/gallery/ca-f90-series-bespoke-ai-electric-dryer-dv90f53aesac-thumb-544027579'
  },
  'DW80B6060UG': {
    title: 'Samsung 24" Smart Built-In Dishwasher with StormWash+ and AutoRelease Door - Black Stainless',
    shortDesc: 'Samsung 24" smart dishwasher with StormWash+ powerful cleaning, AutoRelease door, 3rd rack, 44 dBA quiet operation.',
    longDesc: 'Samsung DW80B6060UG 24" smart built-in dishwasher with StormWash+ dual wash arms and rotating spray jet, AutoRelease door dry, 15 place settings, 3rd rack, 7 wash cycles with 7 options, 44 dBA quiet operation, stainless steel tub, FlexLoad rack system, SmartThings Wi-Fi.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/dw80b6060ug-ac/gallery/ca-dishwasher-dw80b6060ug-ac-thumb-534063315'
  },
  'RF22M9581SR': {
    title: 'Samsung 22 Cu. Ft. Family Hub 4-Door French Door Counter Depth Refrigerator - Stainless Steel',
    shortDesc: 'Samsung Family Hub smart refrigerator with 21.5" touchscreen, interior cameras, Bixby voice control, Twin Cooling Plus.',
    longDesc: 'Samsung RF22M9581SR Family Hub refrigerator features 22 cu. ft. capacity, 21.5" touchscreen for meal planning, streaming and smart home control, interior cameras to view contents remotely, Twin Cooling Plus, FlexZone drawer, Wi-Fi connectivity, fingerprint resistant stainless steel.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/rf22m9581sr-ac/gallery/ca-french-door-rf22m9581sr-ac-thumb-532233270'
  },
  'RF23A9071SR': {
    title: 'Samsung Bespoke 23 Cu. Ft. 4-Door French Door Counter Depth Refrigerator with Beverage Center',
    shortDesc: 'Samsung Bespoke 4-Door French Door refrigerator with Beverage Center, AutoFill Water Pitcher, Dual Ice Maker.',
    longDesc: 'Samsung RF23A9071SR Bespoke 4-Door French Door refrigerator with 23 cu. ft. capacity, Beverage Center with water dispenser and AutoFill pitcher, Dual Ice Maker with cubed ice and Ice Bites, FlexZone drawer, Wi-Fi connectivity, counter depth design, fingerprint resistant stainless steel.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/rf23a9071sr-ac/gallery/ca-bespoke-4door-french-door-refrigerator-rf23a9071sr-ac-thumb-536571847'
  },
  'NE63A6511SS': {
    title: 'Samsung 6.3 Cu. Ft. Smart Freestanding Electric Range with No-Preheat Air Fry - Stainless Steel',
    shortDesc: 'Samsung 6.3 cu. ft. smart electric range with No-Preheat Air Fry, Wi-Fi connectivity, large capacity oven.',
    longDesc: 'Samsung NE63A6511SS electric range with 6.3 cu. ft. oven capacity, No-Preheat Air Fry for healthier cooking, 5 burner smooth cooktop including dual ring burner, convection, self-clean, Wi-Fi connectivity with SmartThings app, fingerprint resistant stainless steel finish.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/ne63a6511ss-ac/gallery/ca-electric-range-ne63a6511ss-ac-thumb-534063427'
  },
  'WA44A3205AW': {
    title: 'Samsung 4.4 Cu. Ft. High-Efficiency Top-Load Washer with ActiveWave Agitator - White',
    shortDesc: 'Samsung 4.4 cu. ft. top-load washer with ActiveWave Agitator, Deep Fill, Soft-Close Lid, 8 wash cycles.',
    longDesc: 'Samsung WA44A3205AW top-load washer with 4.4 cu. ft. capacity, ActiveWave Agitator for thorough cleaning, Deep Fill option for extra water when needed, Soft-Close Lid, 8 wash cycles, Self Clean technology, Diamond Drum interior, vibration reduction.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/wa44a3205aw-a4/gallery/ca-top-load-washer-wa44a3205aw-a4-thumb-536571767'
  },
  'NK30K7000WG': {
    title: 'Samsung 30" Wall Mount Range Hood with WiFi and Bluetooth - Black Stainless Steel',
    shortDesc: 'Samsung 30" wall mount range hood with 600 CFM, WiFi and Bluetooth connectivity, LED lighting.',
    longDesc: 'Samsung NK30K7000WG 30" wall mount range hood with 600 CFM ventilation power, WiFi and Bluetooth connectivity for smart control, 3 speed settings plus boost, LED task lighting, dishwasher-safe aluminum mesh filters, fingerprint resistant black stainless steel.',
    imageUrl: 'https://images.samsung.com/is/image/samsung/p6pim/ca/nk30k7000wg-aa/gallery/ca-range-hood-nk30k7000wg-aa-thumb-532233398'
  },
  // LG APPLIANCES
  'LRMNC1803S': {
    title: 'LG 33" 18.3 Cu. Ft. Counter Depth 4-Door French Door Refrigerator - Stainless Steel',
    shortDesc: 'LG 18.3 cu. ft. counter depth French door refrigerator with Smart Cooling, Door Cooling+, Multi-Air Flow.',
    longDesc: 'LG LRMNC1803S counter depth 4-door French door refrigerator with 18.3 cu. ft. capacity, Smart Cooling system maintains optimal temperature, Door Cooling+ for even cooling, Multi-Air Flow vents, Smart Diagnosis, LED interior lighting, fingerprint resistant stainless steel.',
    imageUrl: 'https://www.lg.com/us/images/refrigerators/md07500153/gallery/desktop-01.jpg'
  },
  'WM4000HWA': {
    title: 'LG 4.5 Cu. Ft. Ultra Large Capacity Smart Wi-Fi Enabled Front Load Washer with TurboWash 360 - White',
    shortDesc: 'LG 4.5 cu. ft. front load washer with TurboWash 360, AI DD, Smart Pairing, Steam technology.',
    longDesc: 'LG WM4000HWA front load washer with 4.5 cu. ft. ultra large capacity, TurboWash 360 cleans large loads in under 30 minutes, AI DD detects fabric and optimizes wash, Steam technology for allergen removal, Smart Pairing with compatible dryer, Wi-Fi connectivity with ThinQ app.',
    imageUrl: 'https://www.lg.com/us/images/washers/md07500171/gallery/desktop-01.jpg'
  },
  'WM4000HBA': {
    title: 'LG 4.5 Cu. Ft. Ultra Large Capacity Smart Wi-Fi Enabled Front Load Washer with TurboWash 360 - Black Steel',
    shortDesc: 'LG 4.5 cu. ft. front load washer with TurboWash 360, AI DD, Smart Pairing, Steam - Black Steel finish.',
    longDesc: 'LG WM4000HBA front load washer with 4.5 cu. ft. ultra large capacity, TurboWash 360 technology, AI DD fabric detection, Steam technology, Smart Pairing, Wi-Fi connectivity with ThinQ app, premium black steel finish, ENERGY STAR certified.',
    imageUrl: 'https://www.lg.com/us/images/washers/md07500170/gallery/desktop-01.jpg'
  },
  // KITCHENAID APPLIANCES
  'KRMF706ESS': {
    title: 'KitchenAid 25.8 Cu. Ft. 36" Multi-Door French Door Refrigerator with Platinum Interior - Stainless Steel',
    shortDesc: 'KitchenAid 25.8 cu. ft. 5-door French door refrigerator with Preserva Food Care System, soft-close drawers.',
    longDesc: 'KitchenAid KRMF706ESS 5-door French door refrigerator with 25.8 cu. ft. capacity, Preserva Food Care System with two independent cooling systems, platinum interior design, soft-close drawers with customizable temperatures, SatinGlide crispers, LED lighting, external ice and water dispenser.',
    imageUrl: 'https://kitchenaid.com/content/dam/global/products/refrigerators/images/hero-krmf706ess.jpg'
  },
  'KDTM404KPS': {
    title: 'KitchenAid 24" Top Control Dishwasher with FreeFlex Third Rack - PrintShield Stainless Steel',
    shortDesc: 'KitchenAid 24" dishwasher with FreeFlex Third Rack, 44 dBA, ProWash Cycle, PrintShield finish.',
    longDesc: 'KitchenAid KDTM404KPS 24" top control dishwasher with FreeFlex Third Rack (largest available), 44 dBA quiet operation, ProWash Cycle, PrintShield fingerprint resistant finish, 16 place settings, 5 wash cycles, Express Wash, stainless steel tub.',
    imageUrl: 'https://kitchenaid.com/content/dam/global/products/dishwashers/images/hero-kdtm404kps.jpg'
  },
  'KOSE500ESS': {
    title: 'KitchenAid 30" Single Wall Oven with Even-Heat True Convection - Stainless Steel',
    shortDesc: 'KitchenAid 30" single wall oven with Even-Heat True Convection, 5.0 cu. ft. capacity, self-cleaning.',
    longDesc: 'KitchenAid KOSE500ESS 30" single wall oven with 5.0 cu. ft. capacity, Even-Heat True Convection with bow-tie design element, EasyConvect Conversion System, self-cleaning, temperature probe, SatinGlide roll-out extension rack, glass touch display.',
    imageUrl: 'https://kitchenaid.com/content/dam/global/products/wall-ovens/images/hero-kose500ess.jpg'
  },
  // BOSCH APPLIANCES
  'SHPM88Z75N': {
    title: 'Bosch 800 Series 24" Top Control Dishwasher with CrystalDry - Stainless Steel',
    shortDesc: 'Bosch 800 Series dishwasher with CrystalDry technology, MyWay 3rd Rack, 40 dBA ultra quiet operation.',
    longDesc: 'Bosch SHPM88Z75N 800 Series 24" top control dishwasher with CrystalDry technology for 60% better drying, MyWay 3rd Rack, 40 dBA ultra quiet operation, PrecisionWash system, 16 place settings, 6 wash cycles, stainless steel tub, AquaStop leak protection.',
    imageUrl: 'https://media3.bosch-home.com/Product_Shots/900x506/SHPM88Z75N_def.jpg'
  },
  'B36CT80SNS': {
    title: 'Bosch 800 Series 36" Counter Depth 4-Door French Door Refrigerator - Stainless Steel',
    shortDesc: 'Bosch 800 Series counter depth French door refrigerator with FarmFresh System, VitaFreshPro drawer.',
    longDesc: 'Bosch B36CT80SNS 800 Series 36" counter depth 4-door French door refrigerator with 21 cu. ft. capacity, FarmFresh System preserves food 3x longer, VitaFreshPro drawer with humidity control, dual evaporators, MultiAirFlow, LED lighting, fingerprint resistant stainless steel.',
    imageUrl: 'https://media3.bosch-home.com/Product_Shots/900x506/B36CT80SNS_def.jpg'
  },
  'B36CL80SNS': {
    title: 'Bosch 800 Series 36" Counter Depth 4-Door French Door Refrigerator with VitaFresh - Stainless Steel',
    shortDesc: 'Bosch 800 Series counter depth French door refrigerator with FarmFresh System, VitaFreshPro, 21 cu. ft. capacity.',
    longDesc: 'Bosch B36CL80SNS 800 Series 36" counter depth 4-door French door refrigerator with 21 cu. ft. capacity, FarmFresh System preserves food 3x longer, VitaFreshPro drawer, dual evaporators, MultiAirFlow, LED lighting, Home Connect Wi-Fi, fingerprint resistant stainless steel, ENERGY STAR certified.',
    imageUrl: 'https://media3.bosch-home.com/Product_Shots/900x506/B36CL80SNS_def.jpg'
  },
  'HBL8451UC': {
    title: 'Bosch 800 Series 30" Single Electric Wall Oven with True Convection - Stainless Steel',
    shortDesc: 'Bosch 800 Series 30" single wall oven with True European Convection, EcoClean, 4.6 cu. ft. capacity.',
    longDesc: 'Bosch HBL8451UC 800 Series 30" single electric wall oven with 4.6 cu. ft. capacity, Genuine European True Convection for even baking, EcoClean self-clean, QuietClose door, 12 cooking modes, telescopic rack, temperature probe, SteelTouch controls.',
    imageUrl: 'https://media3.bosch-home.com/Product_Shots/900x506/HBL8451UC_def.jpg'
  },
  // JENN-AIR APPLIANCES
  'JJW2830DS': {
    title: 'JennAir 30" Single Wall Oven with V2 Vertical Dual-Fan Convection - Stainless Steel',
    shortDesc: 'JennAir 30" single wall oven with V2 Vertical Dual-Fan Convection, 5.0 cu. ft. capacity, Culinary Center.',
    longDesc: 'JennAir JJW2830DS 30" single wall oven with 5.0 cu. ft. capacity, V2 Vertical Dual-Fan Convection for even baking on any rack, Culinary Center guided cooking, 7" full color touch display, telescoping glide rack, self-clean, Wi-Fi connectivity.',
    imageUrl: 'https://jennair.com/content/dam/global/products/wall-ovens/images/hero-jjw2830ds.jpg'
  },
  'JJW3430DS': {
    title: 'JennAir 30" Double Wall Oven with V2 Vertical Dual-Fan Convection - Stainless Steel',
    shortDesc: 'JennAir 30" double wall oven with V2 Vertical Dual-Fan Convection in both ovens, 10.0 cu. ft. total capacity.',
    longDesc: 'JennAir JJW3430DS 30" double wall oven with 10.0 cu. ft. total capacity (5.0 cu. ft. each), V2 Vertical Dual-Fan Convection in both ovens, Culinary Center, 7" touch displays, telescoping glide racks, self-clean, Wi-Fi connectivity, stainless steel finish.',
    imageUrl: 'https://jennair.com/content/dam/global/products/wall-ovens/images/hero-jjw3430ds.jpg'
  },
  'JJW2430DS': {
    title: 'JennAir 24" Single Wall Oven with V2 Vertical Dual-Fan Convection - Stainless Steel',
    shortDesc: 'JennAir 24" single wall oven with V2 Vertical Dual-Fan Convection, 3.4 cu. ft. capacity, Culinary Center.',
    longDesc: 'JennAir JJW2430DS 24" single wall oven with 3.4 cu. ft. capacity, V2 Vertical Dual-Fan Convection, Culinary Center guided cooking, 7" full color touch display, telescoping glide rack, self-clean, Wi-Fi connectivity, stainless steel finish.',
    imageUrl: 'https://jennair.com/content/dam/global/products/wall-ovens/images/hero-jjw2430ds.jpg'
  },
  // WHIRLPOOL APPLIANCES
  'WDT750SAKZ': {
    title: 'Whirlpool 24" Top Control Dishwasher with Third Level Rack - Fingerprint Resistant Stainless Steel',
    shortDesc: 'Whirlpool 24" dishwasher with third level rack, Sensor Cycle, 47 dBA, fingerprint resistant finish.',
    longDesc: 'Whirlpool WDT750SAKZ 24" top control dishwasher with third level rack for additional loading space, Sensor Cycle automatically adjusts cleaning, 47 dBA quiet operation, 13 place settings, 5 wash cycles, stainless steel tub, ENERGY STAR certified.',
    imageUrl: 'https://whirlpool.com/content/dam/global/products/dishwashers/images/hero-wdt750sakz.jpg'
  },
  'WRF535SWHZ': {
    title: 'Whirlpool 25.2 Cu. Ft. French Door Refrigerator with Internal Water Dispenser - Stainless Steel',
    shortDesc: 'Whirlpool 25.2 cu. ft. French door refrigerator with internal water dispenser, Accu-Chill temperature management.',
    longDesc: 'Whirlpool WRF535SWHZ 36" French door refrigerator with 25.2 cu. ft. capacity, internal water dispenser with EveryDrop filtration, Accu-Chill temperature management, humidity-controlled crispers, LED interior lighting, fingerprint resistant stainless steel.',
    imageUrl: 'https://whirlpool.com/content/dam/global/products/refrigerators/images/hero-wrf535swhz.jpg'
  },
  'WRS588FIHZ': {
    title: 'Whirlpool 28.4 Cu. Ft. Side-by-Side Refrigerator with In-Door-Ice Storage - Stainless Steel',
    shortDesc: 'Whirlpool 28.4 cu. ft. side-by-side refrigerator with In-Door-Ice storage, LED lighting, fingerprint resistant.',
    longDesc: 'Whirlpool WRS588FIHZ 36" side-by-side refrigerator with 28.4 cu. ft. capacity, In-Door-Ice Plus system for more freezer space, external filtered water and ice dispenser, LED interior lighting, humidity-controlled crispers, fingerprint resistant stainless steel.',
    imageUrl: 'https://whirlpool.com/content/dam/global/products/refrigerators/images/hero-wrs588fihz.jpg'
  },
  'WFW5605MW': {
    title: 'Whirlpool 4.5 Cu. Ft. Front Load Washer with Quick Wash Cycle - White',
    shortDesc: 'Whirlpool 4.5 cu. ft. front load washer with Quick Wash cycle, Intuitive Controls, steam clean option.',
    longDesc: 'Whirlpool WFW5605MW 27" front load washer with 4.5 cu. ft. capacity, Quick Wash cycle cleans in as little as 28 minutes, Intuitive Controls, Steam Clean option, Pretreat Station, Load & Go dispenser, ENERGY STAR certified.',
    imageUrl: 'https://whirlpool.com/content/dam/global/products/washers/images/hero-wfw5605mw.jpg'
  },
  // MAYTAG APPLIANCES
  'MHW6630HW': {
    title: 'Maytag 4.8 Cu. Ft. Front Load Washer with Extra Power and 16-Hr Fresh Hold - White',
    shortDesc: 'Maytag 4.8 cu. ft. front load washer with Extra Power button, 16-Hr Fresh Hold, Steam for Stains.',
    longDesc: 'Maytag MHW6630HW front load washer with 4.8 cu. ft. capacity, Extra Power button boosts cleaning on any cycle, 16-Hr Fresh Hold keeps clothes fresh, Steam for Stains option, Advanced Vibration Control, 10-year limited parts warranty on motor and basket.',
    imageUrl: 'https://maytag.com/content/dam/global/products/washers/images/hero-mhw6630hw.jpg'
  },
  'MFI2570FEZ': {
    title: 'Maytag 25 Cu. Ft. French Door Refrigerator with PowerCold - Fingerprint Resistant Stainless Steel',
    shortDesc: 'Maytag 25 cu. ft. French door refrigerator with PowerCold feature, Wide-N-Fresh deli drawer.',
    longDesc: 'Maytag MFI2570FEZ 36" French door refrigerator with 25 cu. ft. capacity, PowerCold feature quickly chills, Wide-N-Fresh deli drawer for party platters, BrightSeries LED lighting, external water and ice dispenser, 10-year compressor warranty, fingerprint resistant finish.',
    imageUrl: 'https://maytag.com/content/dam/global/products/refrigerators/images/hero-mfi2570fez.jpg'
  },
  // NAPOLEON GRILLS
  'P500RSIBPSS-3': {
    title: 'Napoleon Prestige 500 RSIB Propane Gas Grill with Infrared Side and Rear Burners - Stainless Steel',
    shortDesc: 'Napoleon Prestige 500 propane grill with infrared side and rear burners, 760 sq. in. cooking area, rotisserie kit.',
    longDesc: 'Napoleon P500RSIBPSS-3 Prestige 500 freestanding propane gas grill with 4 stainless steel burners (48,000 BTU), infrared side burner (14,000 BTU), infrared rear burner (18,000 BTU), 500 sq. in. main cooking area plus 260 sq. in. warming rack, rotisserie kit included, illuminated control knobs.',
    imageUrl: 'https://napoleon.com/sites/default/files/styles/product_image/public/products/prestige-500-rsib-stainless-steel.jpg'
  },
  'PRO665RSIBPSS-3': {
    title: 'Napoleon Prestige PRO 665 RSIB Propane Gas Grill with Infrared Side and Rear Burners - Stainless Steel',
    shortDesc: 'Napoleon Prestige PRO 665 propane grill with 6 burners, infrared side and rear burners, 1000 sq. in. cooking area.',
    longDesc: 'Napoleon PRO665RSIBPSS-3 Prestige PRO 665 freestanding propane gas grill with 6 stainless steel main burners (80,000 BTU), infrared side burner, infrared rear rotisserie burner, 665 sq. in. main cooking area plus 335 sq. in. warming rack, rotisserie kit, illuminated knobs, night light.',
    imageUrl: 'https://napoleon.com/sites/default/files/styles/product_image/public/products/prestige-pro-665-rsib-stainless-steel.jpg'
  },
  'R425SIBPSS': {
    title: 'Napoleon Rogue 425 SIB Propane Gas Grill with Infrared Side Burner - Stainless Steel',
    shortDesc: 'Napoleon Rogue 425 propane grill with infrared side burner, 625 sq. in. total cooking area.',
    longDesc: 'Napoleon R425SIBPSS Rogue 425 SIB freestanding propane gas grill with 3 stainless steel main burners (36,000 BTU), infrared side burner (10,000 BTU), 425 sq. in. main cooking area plus 200 sq. in. warming rack, jetfire ignition system, folding side shelves.',
    imageUrl: 'https://napoleon.com/sites/default/files/styles/product_image/public/products/rogue-425-sib-stainless-steel.jpg'
  },
  // FRIGIDAIRE APPLIANCES
  'FFSS2615TS': {
    title: 'Frigidaire 25.5 Cu. Ft. Side-by-Side Refrigerator - Stainless Steel',
    shortDesc: 'Frigidaire 25.5 cu. ft. side-by-side refrigerator with external ice and water dispenser, adjustable shelves.',
    longDesc: 'Frigidaire FFSS2615TS 36" side-by-side refrigerator with 25.5 cu. ft. capacity, external ice and water dispenser with PureSource 3 filtration, adjustable interior storage, humidity-controlled crisper, ready-select controls, LED interior lighting, stainless steel finish.',
    imageUrl: 'https://frigidaire.com/content/dam/global/products/refrigerators/images/hero-ffss2615ts.jpg'
  },
  // ELECTROLUX APPLIANCES
  'EFLS627UTT': {
    title: 'Electrolux 4.4 Cu. Ft. Front Load Washer with LuxCare Wash System - Titanium',
    shortDesc: 'Electrolux 4.4 cu. ft. front load washer with LuxCare Wash, Perfect Steam, SmartBoost technology.',
    longDesc: 'Electrolux EFLS627UTT front load washer with 4.4 cu. ft. capacity, LuxCare Wash System with adaptive dispenser, Perfect Steam removes stains and allergens, SmartBoost premixes detergent and water, 15 Minute Fast Wash, Sanitize cycle, ENERGY STAR certified, titanium finish.',
    imageUrl: 'https://electrolux.com/content/dam/global/products/washers/images/hero-efls627utt.jpg'
  }
};

// ============================================================
// UPC DATABASE - Verified UPCs from research
// ============================================================
const UPC_DATABASE = {
  // SAMSUNG APPLIANCES
  'BRF365200AP': { upc: '887276192406', category: 'Appliances/Refrigerators', price: '8999.99' },
  'DF60R8200DG': { upc: '887276369044', category: 'Appliances/Other Appliances', price: '1499.99' },
  'DVE45B6305P/AC': { upc: '887276652146', category: 'Appliances/Dryers', price: '1099.99' },
  'DVE45B6305P': { upc: '887276652153', category: 'Appliances/Dryers', price: '1099.99' },
  'DVE45T3200W/AC': { upc: '887276429618', category: 'Appliances/Dryers', price: '699.99' },
  'DVE47CG3500WAC': { upc: '887276750187', category: 'Appliances/Dryers', price: '899.99' },
  'DVE47CG3500W': { upc: '887276750187', category: 'Appliances/Dryers', price: '899.99' },
  'DVE54CG7550VAC': { upc: '887276759920', category: 'Appliances/Dryers', price: '1299.99' },
  'DVE54CG7550V': { upc: '887276759920', category: 'Appliances/Dryers', price: '1299.99' },
  'DVE60M9900V': { upc: '887276197562', category: 'Appliances/Dryers', price: '1799.99' },
  'DVE53BB8700V': { upc: '887276657240', category: 'Appliances/Dryers', price: '1499.99' },
  'DV90F53AESAC': { upc: '198957074189', category: 'Appliances/Dryers', price: '1699.99' },
  'DW80B6060UG': { upc: '887276616384', category: 'Appliances/Dishwashers', price: '1099.99' },
  'RF22M9581SR': { upc: '887276197999', category: 'Appliances/Refrigerators', price: '4499.99' },
  'RF22M9581SG': { upc: '887276197982', category: 'Appliances/Refrigerators', price: '4699.99' },
  'RF23A9071SR': { upc: '887276525594', category: 'Appliances/Refrigerators', price: '3999.99' },
  'RF23A9071SR/AC': { upc: '887276525594', category: 'Appliances/Refrigerators', price: '3999.99' },
  'NE63A6511SS': { upc: '887276509433', category: 'Appliances/Electric Ranges', price: '1199.99' },
  'NE63A6511SS/AC': { upc: '887276509433', category: 'Appliances/Electric Ranges', price: '1199.99' },
  'WA44A3205AW': { upc: '887276475820', category: 'Appliances/Washers', price: '799.99' },
  'NK30K7000WG': { upc: '887276245256', category: 'Appliances/Range Hoods', price: '699.99' },
  'NK30K7000WS': { upc: '887276183787', category: 'Appliances/Range Hoods', price: '649.99' },
  'NV51CG700SSR': { upc: '887276757728', category: 'Appliances/Wall Ovens', price: '2499.99' },
  'NV51CG700SR': { upc: '887276757728', category: 'Appliances/Wall Ovens', price: '2499.99' },

  // SAMSUNG TVs
  'QN65QN90DAFXZC': { upc: 'UPC_NEEDED', category: 'Home Theatre/TVs', price: '2799.99' },
  'QN55Q80DAFXZC': { upc: 'UPC_NEEDED', category: 'Home Theatre/TVs', price: '1499.99' },
  'UN43CU8000FXZC': { upc: 'UPC_NEEDED', category: 'Home Theatre/TVs', price: '499.99' },

  // SAMSUNG SOUNDBARS
  'HW-B650': { upc: '887276636276', category: 'Home Theatre/Soundbars', price: '399.99' },
  'HW-B650/ZC': { upc: '887276636276', category: 'Home Theatre/Soundbars', price: '399.99' },
  'HW-Q700A': { upc: '887276509099', category: 'Home Theatre/Soundbars', price: '699.99' },
  'HW-Q700A/ZC': { upc: '887276509099', category: 'Home Theatre/Soundbars', price: '699.99' },

  // LG APPLIANCES
  'LRMNC1803S': { upc: '772454071676', category: 'Appliances/Refrigerators', price: '2499.99' },

  // KITCHENAID APPLIANCES
  'KRMF706ESS': { upc: '883049347059', category: 'Appliances/Refrigerators', price: '3499.99' },

  // BOSCH APPLIANCES
  'SHPM88Z75N': { upc: '825225958666', category: 'Appliances/Dishwashers', price: '1299.99' },

  // JENN-AIR APPLIANCES
  'JJW2830DS': { upc: '883049335087', category: 'Appliances/Wall Ovens', price: '4499.99' },

  // FRIGIDAIRE APPLIANCES
  'FFSS2615TS': { upc: '012505645952', category: 'Appliances/Refrigerators', price: '1299.99' },

  // ELECTROLUX APPLIANCES
  'EFLS627UTT': { upc: '012505387296', category: 'Appliances/Washers', price: '1099.99' },

  // MORE SAMSUNG
  'RF23BB8200AP': { upc: '887276624181', category: 'Appliances/Refrigerators', price: '3299.99' },
  'RF22A4111SR': { upc: '887276545981', category: 'Appliances/Refrigerators', price: '1799.99' },
  'NE63T8711SS': { upc: '887276409085', category: 'Appliances/Electric Ranges', price: '1599.99' },
  'NE63T8711SS/AC': { upc: '887276409085', category: 'Appliances/Electric Ranges', price: '1599.99' },

  // MORE LG
  'LRFXS2503S': { upc: '772454071928', category: 'Appliances/Refrigerators', price: '1999.99' },
  'WM4000HWA': { upc: '048231028288', category: 'Appliances/Washers', price: '1099.99' },
  'WM4000HBA': { upc: '048231028271', category: 'Appliances/Washers', price: '1199.99' },

  // MORE KITCHENAID
  'KDTM404KPS': { upc: '883049532646', category: 'Appliances/Dishwashers', price: '1299.99' },

  // MORE WHIRLPOOL
  'WDT750SAKZ': { upc: '883049540788', category: 'Appliances/Dishwashers', price: '849.99' },

  // MORE BOSCH
  'SHPM78Z55N': { upc: '825225958642', category: 'Appliances/Dishwashers', price: '1199.99' },

  // MAYTAG
  'MHW6630HW': { upc: '883049456966', category: 'Appliances/Washers', price: '1099.99' },

  // MORE SAMSUNG DISHWASHERS
  'DW80CG4021SR': { upc: '887276772882', category: 'Appliances/Dishwashers', price: '649.99' },
  'DW80CG4021SRAA': { upc: '887276772882', category: 'Appliances/Dishwashers', price: '649.99' },

  // MORE LG DISHWASHERS
  'LDTS5552S': { upc: '048231342346', category: 'Appliances/Dishwashers', price: '949.99' },

  // MORE SAMSUNG MICROWAVES
  'ME21DG6500SR': { upc: '887276827346', category: 'Appliances/Other Appliances', price: '549.99' },
  'ME21DG6500SRAC': { upc: '887276827346', category: 'Appliances/Other Appliances', price: '549.99' },

  // MORE LG RANGES
  'LREL6325F': { upc: '048231341455', category: 'Appliances/Electric Ranges', price: '1199.99' },

  // MORE WHIRLPOOL WASHERS
  'WFW5605MW': { upc: '883049625812', category: 'Appliances/Washers', price: '899.99' },

  // MORE KITCHENAID WALL OVENS
  'KOSE500ESS': { upc: '883049327143', category: 'Appliances/Wall Ovens', price: '2199.99' },

  // MORE SAMSUNG WASHERS
  'WF53BB8700AT': { upc: '887276652238', category: 'Appliances/Washers', price: '1299.99' },

  // MORE LG DRYERS
  'DLEX4000W': { upc: '048231028370', category: 'Appliances/Dryers', price: '1099.99' },
  'DLEX4000B': { upc: '048231028356', category: 'Appliances/Dryers', price: '1199.99' },

  // MORE BOSCH REFRIGERATORS
  'B36CT80SNS': { upc: '825225953678', category: 'Appliances/Refrigerators', price: '2999.99' },

  // MORE SAMSUNG RANGES
  'NE63A6711SS': { upc: '887276509488', category: 'Appliances/Electric Ranges', price: '1399.99' },
  'NE63A6711SS/AC': { upc: '887276509488', category: 'Appliances/Electric Ranges', price: '1399.99' },

  // MORE SAMSUNG REFRIGERATORS
  'RF28R7551SR': { upc: '887276345321', category: 'Appliances/Refrigerators', price: '3799.99' },
  'RF28R7551SR/AA': { upc: '887276345321', category: 'Appliances/Refrigerators', price: '3799.99' },

  // MORE LG REFRIGERATORS
  'LRFXS2503S': { upc: '772454071928', category: 'Appliances/Refrigerators', price: '1999.99' },

  // MORE KITCHENAID REFRIGERATORS
  'KRFC704FPS': { upc: '883049396118', category: 'Appliances/Refrigerators', price: '3299.99' },

  // MORE WHIRLPOOL REFRIGERATORS
  'WRS325SDHZ': { upc: '883049435879', category: 'Appliances/Refrigerators', price: '1299.99' },

  // MORE JENN-AIR WALL OVENS
  'JJW3430DS': { upc: '883049335001', category: 'Appliances/Wall Ovens', price: '3499.99' },

  // NAPOLEON GRILLS
  'P500RSIBPSS-3': { upc: '629162131331', category: 'Outdoor Living/BBQs & Grills', price: '1699.99' },
  'P500RSIBPSS3': { upc: '629162131331', category: 'Outdoor Living/BBQs & Grills', price: '1699.99' },
  'P500RSIBNSS-3': { upc: '629162131317', category: 'Outdoor Living/BBQs & Grills', price: '1699.99' },
  'P500RSIBNSS3': { upc: '629162131317', category: 'Outdoor Living/BBQs & Grills', price: '1699.99' },
  'PRO665RSIBPSS-3': { upc: '629162131904', category: 'Outdoor Living/BBQs & Grills', price: '2499.99' },
  'PRO665RSIBPSS3': { upc: '629162131904', category: 'Outdoor Living/BBQs & Grills', price: '2499.99' },
  'PRO665RSIBNSS-3': { upc: '629162131911', category: 'Outdoor Living/BBQs & Grills', price: '2499.99' },
  'PRO665RSIBNSS3': { upc: '629162131911', category: 'Outdoor Living/BBQs & Grills', price: '2499.99' },

  // MORE KITCHENAID DISHWASHERS
  'KDTE204KPS': { upc: '883049540627', category: 'Appliances/Dishwashers', price: '1099.99' },

  // MORE NAPOLEON GRILLS
  'R425SIBPSS': { upc: '629162122056', category: 'Outdoor Living/BBQs & Grills', price: '999.99' },
  'R425SIBNSS': { upc: '629162122049', category: 'Outdoor Living/BBQs & Grills', price: '999.99' },

  // MORE SAMSUNG REFRIGERATORS
  'RF28T5001SR': { upc: '887276429380', category: 'Appliances/Refrigerators', price: '1999.99' },
  'RF28T5001SR/AA': { upc: '887276429380', category: 'Appliances/Refrigerators', price: '1999.99' },
  'RF28T5001SG': { upc: '887276429373', category: 'Appliances/Refrigerators', price: '2099.99' },

  // MORE LG REFRIGERATORS
  'LRMVS3006S': { upc: '048231806145', category: 'Appliances/Refrigerators', price: '3499.99' },

  // MORE KITCHENAID RANGES
  'KFEG500ESS': { upc: '883049354774', category: 'Appliances/Electric Ranges', price: '1299.99' },

  // MORE LG WASHERS
  'WM4200HWA': { upc: '048231028301', category: 'Appliances/Washers', price: '999.99' },
  'WM4200HBA': { upc: '048231028295', category: 'Appliances/Washers', price: '1099.99' },

  // MORE SAMSUNG DISHWASHERS
  'DW80R5060US': { upc: '887276338705', category: 'Appliances/Dishwashers', price: '749.99' },
  'DW80R5060US/AA': { upc: '887276338705', category: 'Appliances/Dishwashers', price: '749.99' },

  // MORE BOSCH REFRIGERATORS
  'B36CL80SNS': { upc: '825225953630', category: 'Appliances/Refrigerators', price: '2999.99' },

  // MORE SAMSUNG REFRIGERATORS
  'RF27T5201SR': { upc: '887276408729', category: 'Appliances/Refrigerators', price: '1899.99' },
  'RF27T5201SR/AA': { upc: '887276408729', category: 'Appliances/Refrigerators', price: '1899.99' },

  // MORE LG DISHWASHERS
  'LDFC2423V': { upc: '048231345354', category: 'Appliances/Dishwashers', price: '649.99' },

  // MORE KITCHENAID REFRIGERATORS
  'KRFF507HPS': { upc: '883049463193', category: 'Appliances/Refrigerators', price: '2499.99' },

  // MORE WHIRLPOOL REFRIGERATORS
  'WRF555SDFZ': { upc: '883049409238', category: 'Appliances/Refrigerators', price: '1599.99' },

  // MORE SAMSUNG WASHERS
  'WF45T6000AW': { upc: '887276394794', category: 'Appliances/Washers', price: '799.99' },
  'WF45T6000AW/A5': { upc: '887276394794', category: 'Appliances/Washers', price: '799.99' },

  // MORE BOSCH RANGES
  'HGI8056UC': { upc: '825225959724', category: 'Appliances/Gas Ranges', price: '2299.99' },

  // MORE SAMSUNG DRYERS
  'DVE45R6100W': { upc: '887276300450', category: 'Appliances/Dryers', price: '799.99' },
  'DVE45R6100W/A3': { upc: '887276300450', category: 'Appliances/Dryers', price: '799.99' },
  'DVE45R6100P': { upc: '887276300443', category: 'Appliances/Dryers', price: '849.99' },
  'DVE45R6100C': { upc: '887276305943', category: 'Appliances/Dryers', price: '899.99' },

  // MORE KITCHENAID COOKTOPS
  'KCES556HSS': { upc: '883049472973', category: 'Appliances/Electric & Gas Cooktops', price: '1499.99' },

  // MORE WHIRLPOOL DRYERS
  'WED5000DW': { upc: '883049332222', category: 'Appliances/Dryers', price: '699.99' },

  // MORE LG REFRIGERATORS
  'LSXS26336S': { upc: '048231796361', category: 'Appliances/Refrigerators', price: '1499.99' },
  'LSXS26386S': { upc: '048231786713', category: 'Appliances/Refrigerators', price: '1899.99' },

  // MORE LG DRYERS
  'DLEX3700W': { upc: '048231024969', category: 'Appliances/Dryers', price: '999.99' },
  'DLEX3700V': { upc: '048231024921', category: 'Appliances/Dryers', price: '1099.99' },
  'DLGX3701W': { upc: '048231024976', category: 'Appliances/Dryers', price: '1099.99' },

  // MORE LG WASHERS
  'WM3700HWA': { upc: '048231024624', category: 'Appliances/Washers', price: '899.99' },

  // MORE SAMSUNG RANGES
  'NE59T7511SS': { upc: '887276428420', category: 'Appliances/Electric Ranges', price: '1199.99' },
  'NE59T7511SS/AA': { upc: '887276428420', category: 'Appliances/Electric Ranges', price: '1199.99' },

  // MORE BOSCH DISHWASHERS
  'SHPM65Z55N': { upc: '825225957751', category: 'Appliances/Dishwashers', price: '999.99' },

  // MORE KITCHENAID REFRIGERATORS
  'KRMF706EBS': { upc: '883049347042', category: 'Appliances/Refrigerators', price: '3699.99' },

  // MORE JENN-AIR WALL OVENS
  'JJW2830IL': { upc: '883049516103', category: 'Appliances/Wall Ovens', price: '4499.99' },

  // MORE SAMSUNG REFRIGERATORS
  'RF260BEAESR': { upc: '036725590175', category: 'Appliances/Refrigerators', price: '1499.99' },
  'RF260BEAESR/AA': { upc: '036725590175', category: 'Appliances/Refrigerators', price: '1499.99' },

  // MORE LG DISHWASHERS
  'LDT5678SS': { upc: '048231341301', category: 'Appliances/Dishwashers', price: '899.99' },

  // MORE KITCHENAID WALL OVENS
  'KODE500ESS': { upc: '883049327327', category: 'Appliances/Wall Ovens', price: '3299.99' },

  // MORE WHIRLPOOL REFRIGERATORS
  'WRX735SDHZ': { upc: '883049445533', category: 'Appliances/Refrigerators', price: '1999.99' },

  // MORE BOSCH WALL OVENS
  'HBL8451UC': { upc: '825225906513', category: 'Appliances/Wall Ovens', price: '2199.99' },

  // MORE SAMSUNG DRYERS
  'DVE50R8500V': { upc: '887276348803', category: 'Appliances/Dryers', price: '999.99' },
  'DVE50R8500V/A3': { upc: '887276348803', category: 'Appliances/Dryers', price: '999.99' },

  // MORE KITCHENAID GAS RANGES
  'KSGB900ESS': { upc: '883049343587', category: 'Appliances/Gas Ranges', price: '2499.99' },

  // MORE WHIRLPOOL MICROWAVES
  'WMH31017HZ': { upc: '883049452722', category: 'Appliances/Other Appliances', price: '329.99' },

  // ============================================================
  // WHIRLPOOL GROUP PRICELIST - NEW ADDITIONS
  // ============================================================

  // MAYTAG - from Whirlpool Group pricelist
  'MHW6630HW': { upc: '883049456966', category: 'Appliances/Washers', price: '1649.99' },
  'MDB8959SKZ': { upc: '883049532950', category: 'Appliances/Dishwashers', price: '1199.99' },

  // KITCHENAID - from Whirlpool Group pricelist
  'KDFE104KPS': { upc: '883049540559', category: 'Appliances/Dishwashers', price: '1249.99' },
  'KRMF706ESS': { upc: '883049347059', category: 'Appliances/Refrigerators', price: '3499.99' },

  // WHIRLPOOL - from Whirlpool Group pricelist
  'WRF535SWHZ': { upc: '883049442068', category: 'Appliances/Refrigerators', price: '1699.99' },

  // AMANA - from Whirlpool Group pricelist
  'NTW4519JW': { upc: '883049530437', category: 'Appliances/Washers', price: '949.99' },

  // MORE WHIRLPOOL - continued research
  'WFW5605MC': { upc: '883049632919', category: 'Appliances/Washers', price: '1099.99' },
  'WDT750SAKZ': { upc: '883049540788', category: 'Appliances/Dishwashers', price: '799.99' },
  'WRS321SDHZ': { upc: '883049435039', category: 'Appliances/Refrigerators', price: '1299.99' },

  // MORE MAYTAG - continued research
  'MVW6230HC': { upc: '883049463407', category: 'Appliances/Washers', price: '1324.99' },
  'MED6630HW': { upc: '883049457659', category: 'Appliances/Dryers', price: '1099.99' },
  'MFI2570FEZ': { upc: '883049412245', category: 'Appliances/Refrigerators', price: '1999.99' },

  // MORE KITCHENAID - continued research
  'KRFC300ESS': { upc: '883049360881', category: 'Appliances/Refrigerators', price: '2799.99' },
  'KDTM404KPS': { upc: '883049532646', category: 'Appliances/Dishwashers', price: '1299.99' },
  'KOSE500ESS': { upc: '883049327143', category: 'Appliances/Wall Ovens', price: '2199.99' },

  // MORE MAYTAG - continued research batch 2
  'MHW8630HC': { upc: '883049457000', category: 'Appliances/Washers', price: '1974.99' },
  'MDB7959SKZ': { upc: '883049532912', category: 'Appliances/Dishwashers', price: '899.99' },

  // MORE WHIRLPOOL - continued research batch 2
  'WRF757SDHZ': { upc: '883049464329', category: 'Appliances/Refrigerators', price: '2499.99' },
  'WFW6620HW': { upc: '883049456867', category: 'Appliances/Washers', price: '1099.99' },
  'WFE505W0JZ': { upc: '883049538556', category: 'Appliances/Electric Ranges', price: '899.99' },

  // MORE MAYTAG - continued research batch 3
  'MGD6630HW': { upc: '883049458298', category: 'Appliances/Dryers', price: '1199.99' },

  // MORE KITCHENAID - continued research batch 2
  'KSEG950ESS': { upc: '883049343655', category: 'Appliances/Electric Ranges', price: '3699.99' },

  // MORE WHIRLPOOL - continued research batch 3
  'WED6605MW': { upc: '883049626581', category: 'Appliances/Dryers', price: '999.99' },

  // MORE MAYTAG - continued research batch 4
  'MRT118FFFZ': { upc: '883049410517', category: 'Appliances/Refrigerators', price: '999.99' },
  'MVW7232HW': { upc: '883049514888', category: 'Appliances/Washers', price: '1099.99' },

  // MORE WHIRLPOOL - continued research batch 4
  'WRS588FIHZ': { upc: '883049450469', category: 'Appliances/Refrigerators', price: '1799.99' },

  // MORE KITCHENAID - continued research batch 5
  'KFGC500JSS': { upc: '883049528120', category: 'Appliances/Gas Ranges', price: '3999.99' },

  // MORE MAYTAG - continued research batch 5
  'MED5630HW': { upc: '883049457642', category: 'Appliances/Dryers', price: '899.99' },
  'MHW5630HW': { upc: '883049456959', category: 'Appliances/Washers', price: '899.99' },

  // MORE WHIRLPOOL - continued research batch 5
  'WED5000DW': { upc: '883049332222', category: 'Appliances/Dryers', price: '599.99' },
  'WTW5000DW': { upc: '883049330839', category: 'Appliances/Washers', price: '599.99' },

  // MORE KITCHENAID - continued research batch 6
  'KFDC500JSS': { upc: '883049528212', category: 'Appliances/Dual Fuel Ranges', price: '5129.99' },

  // MORE MAYTAG - continued research batch 6
  'MVW6230HW': { upc: '883049462295', category: 'Appliances/Washers', price: '899.99' },

  // MORE WHIRLPOOL - continued research batch 6
  'WRX735SDHZ': { upc: '883049445533', category: 'Appliances/Refrigerators', price: '2199.99' },

  // MORE KITCHENAID - continued research batch 7
  'KRFF305ESS': { upc: '883049360942', category: 'Appliances/Refrigerators', price: '2299.99' },
  'KOCE500ESS': { upc: '883049327389', category: 'Appliances/Wall Ovens', price: '3799.99' },

  // MORE WHIRLPOOL - continued research batch 7
  'WRF757SDHZ': { upc: '883049464329', category: 'Appliances/Refrigerators', price: '2499.99' },

  // MORE MAYTAG - continued research batch 7
  'MFT2772HEZ': { upc: '883049473499', category: 'Appliances/Refrigerators', price: '2399.99' },

  // MORE JENN-AIR - continued research batch 8
  'JJW2430DS': { upc: '883049334974', category: 'Appliances/Wall Ovens', price: '2999.99' },

  // MORE BOSCH - continued research batch 8
  'HBL8451UC': { upc: '825225906513', category: 'Appliances/Wall Ovens', price: '2399.99' },

  // MORE NAPOLEON - continued research batch 8
  'PRO500RSIBPSS-3': { upc: '629162132123', category: 'Outdoor Living/BBQs & Grills', price: '2499.99' },
  'PRO500RSIBPSS3': { upc: '629162132123', category: 'Outdoor Living/BBQs & Grills', price: '2499.99' },

  // MORE SAMSUNG - continued research batch 9
  'RF29A9071SR': { upc: '887276525716', category: 'Appliances/Refrigerators', price: '3499.99' },
  'RF29A9071SR/AA': { upc: '887276525716', category: 'Appliances/Refrigerators', price: '3499.99' },

  // MORE KITCHENAID - continued research batch 9
  'KOSE507ESS': { upc: '883049327174', category: 'Appliances/Wall Ovens', price: '2199.99' },

  // MORE WHIRLPOOL - continued research batch 9
  'WDT730PAHZ': { upc: '883049451374', category: 'Appliances/Dishwashers', price: '649.99' },

  // MORE MAYTAG - continued research batch 9
  'MDB8959SKZ': { upc: '883049532950', category: 'Appliances/Dishwashers', price: '1049.99' },

  // MORE SAMSUNG - continued research batch 10
  'NE63T8511SS': { upc: '887276409054', category: 'Appliances/Electric Ranges', price: '1499.99' },
  'NE63T8511SS/AA': { upc: '887276409054', category: 'Appliances/Electric Ranges', price: '1499.99' },
  'NE63T8511SG': { upc: '887276409047', category: 'Appliances/Electric Ranges', price: '1599.99' },

  // MORE KITCHENAID - continued research batch 10
  'KRMF706EBS': { upc: '883049347042', category: 'Appliances/Refrigerators', price: '3499.99' },

  // MORE NAPOLEON - continued research batch 10
  'R525SIBPSS': { upc: '629162128737', category: 'Outdoor Living/BBQs & Grills', price: '1199.99' },
  'R525SBNSS': { upc: '629162130488', category: 'Outdoor Living/BBQs & Grills', price: '1199.99' },

  // MORE LG - continued research batch 11
  'WM3600HWA': { upc: '048231028264', category: 'Appliances/Washers', price: '899.99' },
  'WM3600HVA': { upc: '048231028257', category: 'Appliances/Washers', price: '949.99' },

  // MORE SAMSUNG - continued research batch 11
  'DW80R9950US': { upc: '887276296647', category: 'Appliances/Dishwashers', price: '1099.99' },
  'DW80R9950US/AA': { upc: '887276296647', category: 'Appliances/Dishwashers', price: '1099.99' },
  'RF28R7201SR': { upc: '887276304922', category: 'Appliances/Refrigerators', price: '2499.99' },
  'RF28R7201SR/AA': { upc: '887276304922', category: 'Appliances/Refrigerators', price: '2499.99' },
  'RF28R7201SG': { upc: '887276304915', category: 'Appliances/Refrigerators', price: '2599.99' },

  // MORE KITCHENAID - continued research batch 12
  'KFGC506JSS': { upc: '883049528151', category: 'Appliances/Gas Ranges', price: '4999.99' },

  // MORE WHIRLPOOL - continued research batch 12
  'WFE535S0JS': { upc: '883049537962', category: 'Appliances/Electric Ranges', price: '899.99' },

  // MORE LG - continued research batch 12
  'DLEX3900W': { upc: '048231025195', category: 'Appliances/Dryers', price: '999.99' },
  'DLEX3900B': { upc: '048231026437', category: 'Appliances/Dryers', price: '1049.99' },
  'DLGX3901W': { upc: '048231025201', category: 'Appliances/Dryers', price: '1099.99' },

  // MORE SAMSUNG - continued research batch 13
  'RF28T5021SR': { upc: '887276429410', category: 'Appliances/Refrigerators', price: '2159.99' },
  'RF28T5021SR/AA': { upc: '887276429410', category: 'Appliances/Refrigerators', price: '2159.99' },
  'RF28T5021SG': { upc: '887276429403', category: 'Appliances/Refrigerators', price: '2259.99' },

  // MORE MAYTAG - continued research batch 13
  'MVW6200KW': { upc: '883049583211', category: 'Appliances/Washers', price: '799.99' },
};

// ============================================================
// BRAND STANDARDIZATION
// ============================================================
const BRAND_STANDARDIZATION = {
  'ASHELY': 'ASHLEY',
  'KITCHEN AID': 'KITCHENAID',
  'KITCEHENAID': 'KITCHENAID',
  'KITCEHNAID': 'KITCHENAID',
  'KICHEN AID': 'KITCHENAID',
  'JENN AIR': 'JENN-AIR',
  'JENNAIR': 'JENN-AIR',
  'JENAIR': 'JENN-AIR',
  'GE CAFÉ': 'GE CAFE',
  'FRIDGIDAIRE': 'FRIGIDAIRE',
  'WHIRLP0OL': 'WHIRLPOOL',
  'NEPOLEON': 'NAPOLEON',
  'NAPOLEAN': 'NAPOLEON',
  'NEPOLON': 'NAPOLEON',
  'BOSH': 'BOSCH',
  'SANSUNG': 'SAMSUNG'
};

// ============================================================
// CATEGORY MAPPING
// ============================================================
const CATEGORY_MAPPING = {
  // Refrigerators
  'REFRIGERATOR': 'Appliances/Refrigerators',
  'REFREGIRATOR': 'Appliances/Refrigerators',
  'REFRIGEATOR': 'Appliances/Refrigerators',
  'FRIDGE': 'Appliances/Refrigerators',

  // Laundry
  'WASHER': 'Appliances/Washers',
  'WASHER ': 'Appliances/Washers',
  'DRYER': 'Appliances/Dryers',

  // Dishwashers
  'DISHWASHER': 'Appliances/Dishwashers',
  'DISHWASHER ': 'Appliances/Dishwashers',
  'DISH WASHER': 'Appliances/Dishwashers',

  // Ranges
  'RANGE': 'Appliances/Electric Ranges',
  'ELECTRIC RANGE': 'Appliances/Electric Ranges',
  'ELECTRC RANGE': 'Appliances/Electric Ranges',
  'GAS RANGE': 'Appliances/Gas Ranges',
  'INDUCTION RANGE': 'Appliances/Electric Ranges',

  // Cooktops
  'COOKTOP': 'Appliances/Electric & Gas Cooktops',
  'GAS COOKTOP': 'Appliances/Electric & Gas Cooktops',

  // Wall Ovens
  'WALL OVEN': 'Appliances/Wall Ovens',
  'BUILT IN WALL OVEN': 'Appliances/Wall Ovens',
  'BUILT-IN WALL OVEN': 'Appliances/Wall Ovens',

  // Range Hoods
  'RANGE HOOD': 'Appliances/Range Hoods',
  'HOOD': 'Appliances/Range Hoods',
  'HOOD ': 'Appliances/Range Hoods',
  'HOOD FAN': 'Appliances/Range Hoods',

  // Microwaves
  'MICROWAVE': 'Appliances/Other Appliances',
  'MICOWAVE': 'Appliances/Other Appliances',
  'OTR MICROWAVE': 'Appliances/Other Appliances',
  'OTR': 'Appliances/Other Appliances',
  'MICOWAVE OVEN': 'Appliances/Other Appliances',

  // TVs
  'TV': 'Home Theatre/TVs',
  'TV 4K UHD': 'Home Theatre/TVs',
  '4K UHD TV': 'Home Theatre/TVs',
  'UHD 4K TV': 'Home Theatre/TVs',
  'UHD 4K': 'Home Theatre/TVs',
  'QLED 4K': 'Home Theatre/TVs',
  'QLED 4K TV': 'Home Theatre/TVs',
  'QLED 8K': 'Home Theatre/TVs',
  'QLED 8K TV': 'Home Theatre/TVs',
  'NEO QLED': 'Home Theatre/TVs',
  'NEO QLED TV': 'Home Theatre/TVs',
  'OLED 4K': 'Home Theatre/TVs',
  'OLED 4 K': 'Home Theatre/TVs',
  'OLED 4 K UHD': 'Home Theatre/TVs',
  'FRAME TV': 'Home Theatre/TVs',
  'FRAME 4K TV': 'Home Theatre/TVs',
  'FRAME QLED 4K': 'Home Theatre/TVs',
  'TV  4K UHD': 'Home Theatre/TVs',
  'TV QLED': 'Home Theatre/TVs',

  // Soundbars
  'SOUNDBAR': 'Home Theatre/Soundbars',
  'SOUND BAR': 'Home Theatre/Soundbars',
  'SOUNBAR': 'Home Theatre/Soundbars',

  // Furniture
  'SOFA': 'Furniture/Living Room Furniture',
  'LOVESEAT': 'Furniture/Living Room Furniture',
  'LOVE SEAT': 'Furniture/Living Room Furniture',
  'SECTIONAL': 'Furniture/Living Room Furniture',
  'OTTOMAN': 'Furniture/Living Room Furniture',
  'RECLINER': 'Furniture/Living Room Furniture',
  'ROCKER RECLINER': 'Furniture/Living Room Furniture',
  'LAF LOVE SEAT': 'Furniture/Living Room Furniture',
  'RAF SOFA': 'Furniture/Living Room Furniture',
  'LAF SOFA': 'Furniture/Living Room Furniture',
  'RAF LOVE SEAT': 'Furniture/Living Room Furniture',
  'CHAISE': 'Furniture/Living Room Furniture',
  'CUDDLER': 'Furniture/Living Room Furniture',
  'BED': 'Furniture/Bedroom Furniture',
  'QUEEN BED': 'Furniture/Bedroom Furniture',
  'KING BED': 'Furniture/Bedroom Furniture',
  'DRESSER': 'Furniture/Bedroom Furniture',
  'NIGHTSTAND': 'Furniture/Bedroom Furniture',

  // BBQs
  'BBQ': 'Appliances/BBQs, Smokers & Outdoor Cooking',
  'GRILL': 'Appliances/BBQs, Smokers & Outdoor Cooking',
  'SMOKER': 'Appliances/BBQs, Smokers & Outdoor Cooking',
  'PELLET GRILL': 'Appliances/BBQs, Smokers & Outdoor Cooking',

  // Other
  'PEDESTAL': 'Appliances/Other Appliances',
  'PEDASTAL': 'Appliances/Other Appliances',
  'PADESTAL': 'Appliances/Other Appliances',
  'AIR DRESSER': 'Appliances/Other Appliances',
  'FILTER': 'Appliances/Water Filters',
  'WATER FILTER': 'Appliances/Water Filters',
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function standardizeBrand(brand) {
  const upper = (brand || '').toString().toUpperCase().trim();
  return BRAND_STANDARDIZATION[upper] || upper;
}

function mapCategory(productType, brand) {
  const upper = (productType || '').toString().toUpperCase().trim();
  return CATEGORY_MAPPING[upper] || 'Appliances/Other Appliances';
}

function generateSKU(brand, model) {
  const cleanBrand = standardizeBrand(brand).replace(/[^A-Z0-9]/g, '');
  const cleanModel = (model || '').toString().replace(/[\/\\]/g, '-').replace(/[^A-Z0-9-]/gi, '');
  return `${cleanBrand}-${cleanModel}`;
}

function lookupUPC(model) {
  // Try exact match first
  if (UPC_DATABASE[model]) {
    return UPC_DATABASE[model];
  }

  // Try without /AC suffix
  const withoutAC = model.replace(/\/AC$/, '');
  if (UPC_DATABASE[withoutAC]) {
    return UPC_DATABASE[withoutAC];
  }

  // Try adding /AC suffix
  const withAC = model + '/AC';
  if (UPC_DATABASE[withAC]) {
    return UPC_DATABASE[withAC];
  }

  return null;
}

function lookupProductDetails(model) {
  // Try exact match first
  if (PRODUCT_DETAILS[model]) {
    return PRODUCT_DETAILS[model];
  }

  // Try without /AC suffix
  const withoutAC = model.replace(/\/AC$/, '');
  if (PRODUCT_DETAILS[withoutAC]) {
    return PRODUCT_DETAILS[withoutAC];
  }

  // Try adding /AC suffix
  const withAC = model + '/AC';
  if (PRODUCT_DETAILS[withAC]) {
    return PRODUCT_DETAILS[withAC];
  }

  return null;
}

function generateTitle(brand, model, productType) {
  // Check for enhanced details first
  const details = lookupProductDetails(model);
  if (details && details.title) {
    return details.title;
  }
  const stdBrand = standardizeBrand(brand);
  return `${stdBrand} ${model} ${productType}`;
}

function generateShortDescription(brand, model, productType) {
  // Check for enhanced details first
  const details = lookupProductDetails(model);
  if (details && details.shortDesc) {
    return details.shortDesc;
  }
  const stdBrand = standardizeBrand(brand);
  return `${stdBrand} ${productType} - Model ${model}. Contact retailer for full specifications.`;
}

function generateLongDescription(brand, model, productType) {
  // Check for enhanced details first
  const details = lookupProductDetails(model);
  if (details && details.longDesc) {
    return details.longDesc;
  }
  const stdBrand = standardizeBrand(brand);
  return `${stdBrand} ${productType} Model ${model}. This product comes with full manufacturer warranty. Contact retailer for complete specifications and availability.`;
}

function getImageUrl(model) {
  // Check for enhanced details first
  const details = lookupProductDetails(model);
  if (details && details.imageUrl) {
    return details.imageUrl;
  }
  return 'IMAGE_NEEDED';
}

// ============================================================
// MAIN PROCESSING
// ============================================================

function processInventory() {
  console.log('='.repeat(60));
  console.log('BEST BUY MARKETPLACE PRODUCT ENRICHMENT');
  console.log('='.repeat(60));
  console.log('Started:', new Date().toISOString());

  // Read stock file
  const stockPath = 'C:\\Users\\davem\\OneDrive\\Desktop\\stock for bb.xlsx';
  const stockWb = XLSX.readFile(stockPath);
  const stockSheet = stockWb.Sheets[stockWb.SheetNames[0]];
  const stockData = XLSX.utils.sheet_to_json(stockSheet, { header: 1 });

  console.log(`\nLoaded ${stockData.length - 1} products from inventory`);

  // Process products
  const products = [];
  const stats = {
    total: 0,
    withUPC: 0,
    needsUPC: 0,
    byBrand: {},
    byCategory: {}
  };

  for (let i = 1; i < stockData.length; i++) {
    const row = stockData[i];
    if (!row || !row[2]) continue; // Skip if no model

    const brand = standardizeBrand(row[0]);
    const productType = (row[1] || '').toString().toUpperCase().trim();
    const model = (row[2] || '').toString().trim();
    const qty = row[3] || 0;

    const lookup = lookupUPC(model);
    const category = lookup?.category || mapCategory(productType, brand);
    const upc = lookup?.upc || 'UPC_NEEDED';
    const price = lookup?.price || 'PRICE_NEEDED';

    const product = {
      category: category,
      shopSku: generateSKU(brand, model),
      title: generateTitle(brand, model, productType),
      shortDesc: generateShortDescription(brand, model, productType),
      brand: brand,
      upc: upc,
      model: model,
      mpn: model,
      longDesc: generateLongDescription(brand, model, productType),
      imageUrl: getImageUrl(model),
      condition: 'Brand New',
      price: price,
      qty: qty,
      confidence: upc !== 'UPC_NEEDED' ? 'HIGH' : 'LOW',
      notes: upc === 'UPC_NEEDED' ? 'Needs UPC research' : ''
    };

    products.push(product);
    stats.total++;

    if (upc !== 'UPC_NEEDED') {
      stats.withUPC++;
    } else {
      stats.needsUPC++;
    }

    stats.byBrand[brand] = (stats.byBrand[brand] || 0) + 1;
    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
  }

  // Create output workbook
  const wb = XLSX.utils.book_new();

  // Main data sheet
  const headers = [
    'Category Code', 'Shop sku', 'Title BB (EN)', 'Short Description BB (EN)',
    'Brand Name', 'Primary UPC', 'Model Number', "Manufacturer's Part Number",
    'Long Description BB (EN)', '01 - Image Source (Main Image)',
    'Product Condition', 'Offer SKU', 'Product ID', 'Product ID Type',
    'Offer Price', 'Offer State', 'Warranty - Parts & Labour',
    'Quantity Available', 'Confidence Level', 'Notes'
  ];

  const data = [headers];
  products.forEach(p => {
    data.push([
      p.category, p.shopSku, p.title, p.shortDesc,
      p.brand, p.upc, p.model, p.mpn,
      p.longDesc, p.imageUrl,
      p.condition, p.shopSku, p.upc, 'UPC',
      p.price, 'Active', '1 Year',
      p.qty, p.confidence, p.notes
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 35 }, { wch: 35 }, { wch: 60 }, { wch: 80 },
    { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 25 },
    { wch: 100 }, { wch: 60 },
    { wch: 12 }, { wch: 35 }, { wch: 15 }, { wch: 10 },
    { wch: 12 }, { wch: 10 }, { wch: 20 },
    { wch: 10 }, { wch: 12 }, { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'All Products');

  // High confidence sheet (ready for upload)
  const readyProducts = products.filter(p => p.confidence === 'HIGH');
  if (readyProducts.length > 0) {
    const readyData = [headers];
    readyProducts.forEach(p => {
      readyData.push([
        p.category, p.shopSku, p.title, p.shortDesc,
        p.brand, p.upc, p.model, p.mpn,
        p.longDesc, p.imageUrl,
        p.condition, p.shopSku, p.upc, 'UPC',
        p.price, 'Active', '1 Year',
        p.qty, p.confidence, p.notes
      ]);
    });
    const readyWs = XLSX.utils.aoa_to_sheet(readyData);
    XLSX.utils.book_append_sheet(wb, readyWs, 'Ready for Upload');
  }

  // Needs research sheet
  const needsResearch = products.filter(p => p.confidence === 'LOW');
  if (needsResearch.length > 0) {
    const researchData = [['Brand', 'Model', 'Product Type', 'Category', 'Qty']];
    needsResearch.forEach(p => {
      researchData.push([p.brand, p.model, p.title.split(' ').slice(-1)[0], p.category, p.qty]);
    });
    const researchWs = XLSX.utils.aoa_to_sheet(researchData);
    XLSX.utils.book_append_sheet(wb, researchWs, 'Needs Research');
  }

  // Summary sheet
  const summaryData = [
    ['BEST BUY MARKETPLACE - PRODUCT ENRICHMENT SUMMARY'],
    [''],
    ['Generated:', new Date().toISOString()],
    [''],
    ['OVERALL STATISTICS'],
    ['Total Products:', stats.total],
    ['Ready for Upload (with UPC):', stats.withUPC],
    ['Needs Research (missing UPC):', stats.needsUPC],
    ['Completion Rate:', `${Math.round(stats.withUPC / stats.total * 100)}%`],
    [''],
    ['PRODUCTS BY BRAND (Top 20)'],
    ...Object.entries(stats.byBrand)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([brand, count]) => ['', `${brand}: ${count}`]),
    [''],
    ['PRODUCTS BY CATEGORY'],
    ...Object.entries(stats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ['', `${cat}: ${count}`])
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
  summaryWs['!cols'] = [{ wch: 40 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

  // Write output
  const outputPath = 'C:\\Users\\davem\\OneDrive\\Desktop\\BestBuy_Enhanced_Export.xlsx';
  XLSX.writeFile(wb, outputPath);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('EXPORT COMPLETE');
  console.log('='.repeat(60));
  console.log(`Output file: ${outputPath}`);
  console.log(`Total products: ${stats.total}`);
  console.log(`Ready for upload: ${stats.withUPC} (${Math.round(stats.withUPC / stats.total * 100)}%)`);
  console.log(`Needs research: ${stats.needsUPC}`);
  console.log('\nTop brands:');
  Object.entries(stats.byBrand)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([brand, count]) => console.log(`  ${brand}: ${count}`));
}

processInventory();
