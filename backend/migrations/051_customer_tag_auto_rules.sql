-- Auto-assign rules for customer tags
ALTER TABLE customer_tags ADD COLUMN IF NOT EXISTS slug VARCHAR(100);
ALTER TABLE customer_tags ADD COLUMN IF NOT EXISTS auto_assign_rules JSONB;
-- Example: { "conditions": [{ "field": "lifetime_spend", "operator": "gte", "value": 500000 }], "logic": "AND" }

-- Populate slugs from existing names
UPDATE customer_tags SET slug = LOWER(REPLACE(REPLACE(name, ' ', '-'), '''', ''))
WHERE slug IS NULL;

-- Add unique index on slug (partial, only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_tags_slug ON customer_tags(slug) WHERE slug IS NOT NULL;
