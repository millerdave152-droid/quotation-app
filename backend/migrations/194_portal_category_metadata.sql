-- Migration 194: Add portal-facing metadata columns to categories
-- For customer portal category landing pages (headline, SEO description, hero image)

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS portal_headline    TEXT,
  ADD COLUMN IF NOT EXISTS portal_description TEXT,
  ADD COLUMN IF NOT EXISTS portal_image_key   TEXT;

-- Seed headline + description for the 15 highest-traffic categories

UPDATE categories SET
  portal_headline    = 'Find the Perfect French Door Refrigerator',
  portal_description = 'Explore our selection of French door refrigerators from Samsung, LG, Whirlpool, and more. With flexible storage, wide shelves, and energy-efficient designs, these fridges are built for modern Canadian families.'
WHERE slug = 'french-door-refrigerators';

UPDATE categories SET
  portal_headline    = 'High-Performance Washers for Every Home',
  portal_description = 'From top-load to front-load, our washers deliver powerful cleaning and water efficiency. Browse trusted brands like LG, Samsung, and Maytag at competitive Canadian prices.'
WHERE slug = 'washers';

UPDATE categories SET
  portal_headline    = 'Efficient Dryers to Complete Your Laundry Setup',
  portal_description = 'Pair your washer with a reliable dryer. Choose from electric, gas, and heat-pump models designed to handle Canadian households with ease and energy savings.'
WHERE slug = 'dryers';

UPDATE categories SET
  portal_headline    = 'Experience Stunning OLED TV Picture Quality',
  portal_description = 'OLED TVs deliver perfect blacks, infinite contrast, and vivid colours. Discover LG, Sony, and Samsung OLED displays for an unmatched home theatre experience.'
WHERE slug = 'oled-tvs';

UPDATE categories SET
  portal_headline    = 'Brilliant Colour with QLED TV Technology',
  portal_description = 'QLED TVs offer bright, vibrant images powered by quantum dot technology. Browse Samsung and TCL QLED models in sizes from 55" to 98" at TeleTime.'
WHERE slug = 'qled-tvs';

UPDATE categories SET
  portal_headline    = 'Upgrade Your Audio with Premium Soundbars',
  portal_description = 'Transform your TV audio with Dolby Atmos soundbars from Samsung, LG, Sonos, and JBL. Easy setup, powerful bass, and immersive surround sound for any room.'
WHERE slug = 'soundbars';

UPDATE categories SET
  portal_headline    = 'Cook Healthier with Top-Rated Air Fryers',
  portal_description = 'Air fryers let you enjoy crispy, golden results with up to 75% less oil. Shop compact and family-size models from Ninja, Philips, and Cuisinart.'
WHERE slug = 'air-fryers';

UPDATE categories SET
  portal_headline    = 'Let a Robot Vacuum Do the Work for You',
  portal_description = 'Smart robot vacuums map your home, avoid obstacles, and empty themselves. Browse iRobot Roomba, Roborock, and Ecovacs models with app control and scheduling.'
WHERE slug = 'robot-vacuums';

UPDATE categories SET
  portal_headline    = 'Fire Up the Season with a Gas BBQ',
  portal_description = 'From backyard cookouts to gourmet grilling, our gas BBQs deliver even heat and reliable performance. Shop Weber, Napoleon, and Broil King models built for Canadian summers.'
WHERE slug = 'gas-bbqs';

UPDATE categories SET
  portal_headline    = 'Stay Cool Anywhere with Portable Air Conditioners',
  portal_description = 'Portable ACs offer flexible cooling for apartments, offices, and rooms without central air. Browse models rated for Canadian summers from Danby, LG, and Honeywell.'
WHERE slug = 'portable-acs';

UPDATE categories SET
  portal_headline    = 'Cool Your Space with Window Air Conditioners',
  portal_description = 'Window ACs are a cost-effective way to beat the heat. Find energy-efficient models sized for bedrooms, living rooms, and offices from trusted brands.'
WHERE slug = 'window-acs';

UPDATE categories SET
  portal_headline    = 'Compact and Powerful Countertop Microwaves',
  portal_description = 'Countertop microwaves offer quick cooking, defrosting, and reheating. Shop Panasonic, LG, and Samsung models with inverter technology and sensor cooking.'
WHERE slug = 'countertop-microwaves';

UPDATE categories SET
  portal_headline    = 'Professional-Grade Stand Mixers for Home Bakers',
  portal_description = 'Stand mixers handle everything from bread dough to meringue. Discover KitchenAid, Cuisinart, and Breville models with powerful motors and versatile attachments.'
WHERE slug = 'stand-mixers';

UPDATE categories SET
  portal_headline    = 'Versatile Freestanding Gas Ranges',
  portal_description = 'Gas ranges deliver precise flame control and even oven heating. Browse 30" and 36" models from Samsung, LG, GE, and Frigidaire with convection and self-clean options.'
WHERE slug = 'freestanding-gas-ranges';

UPDATE categories SET
  portal_headline    = 'Reliable Electric Ranges for Every Kitchen',
  portal_description = 'Electric ranges combine smooth cooktops with spacious ovens. Shop slide-in and freestanding models with induction, radiant, and convection options from top brands.'
WHERE slug = 'electric-ranges';
