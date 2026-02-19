-- Migration 111: Channel feed templates and product listing scores
-- FeedEngine uses these to transform product data per channel requirements.

CREATE TABLE IF NOT EXISTS channel_feed_templates (
  id              SERIAL PRIMARY KEY,
  channel_id      INTEGER REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  field_name      VARCHAR(100) NOT NULL,
  source_field    VARCHAR(100),
  transformation  JSONB DEFAULT '{}',
  required        BOOLEAN DEFAULT false,
  max_length      INTEGER,
  default_value   VARCHAR(500),
  display_order   INTEGER DEFAULT 0,
  UNIQUE(channel_id, field_name)
);

CREATE TABLE IF NOT EXISTS product_listing_scores (
  id                  SERIAL PRIMARY KEY,
  product_id          INTEGER REFERENCES products(id) ON DELETE CASCADE,
  channel_id          INTEGER REFERENCES marketplace_channels(id) ON DELETE CASCADE,
  completeness_score  INTEGER DEFAULT 0,
  missing_fields      JSONB DEFAULT '[]',
  warnings            JSONB DEFAULT '[]',
  last_scored_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_templates_channel ON channel_feed_templates(channel_id);
CREATE INDEX IF NOT EXISTS idx_listing_scores_channel ON product_listing_scores(channel_id);
CREATE INDEX IF NOT EXISTS idx_listing_scores_product ON product_listing_scores(product_id);
CREATE INDEX IF NOT EXISTS idx_listing_scores_score ON product_listing_scores(channel_id, completeness_score);

-- Seed Best Buy Canada feed template
INSERT INTO channel_feed_templates (channel_id, field_name, source_field, transformation, required, max_length, display_order) VALUES
((SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA'), 'title',            'name',                      '{"type": "format", "pattern": "{manufacturer} {name}", "max_length": 126}', true,  126,  1),
((SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA'), 'description',      'description',               '{"type": "strip_html", "max_length": 2000}',                                true,  2000, 2),
((SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA'), 'sku',              'sku',                       '{"type": "truncate", "max_length": 40}',                                    true,  40,   3),
((SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA'), 'product_id',       'upc',                       '{"type": "upc_validate"}',                                                  true,  13,   4),
((SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA'), 'price',            'price',                     '{"type": "number", "min": 0.01}',                                           true,  NULL, 5),
((SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA'), 'quantity',          'stock_quantity',            '{"type": "integer", "min": 0}',                                             true,  NULL, 6),
((SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA'), 'logistic_class',   'bestbuy_logistic_class',    '{"type": "enum", "values": ["XXS","XS","S","M","L","XL","XXL"]}',            false, 3,    7),
((SELECT id FROM marketplace_channels WHERE channel_code = 'BESTBUY_CA'), 'product_tax_code', 'bestbuy_product_tax_code',  '{"type": "string"}',                                                        false, 50,   8)
ON CONFLICT (channel_id, field_name) DO NOTHING;
