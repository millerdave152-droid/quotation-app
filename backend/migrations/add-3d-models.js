/**
 * Migration: Add 3D Product Models
 *
 * Creates tables for storing 3D model information and product configurations
 * Supports GLB/USDZ formats for web and AR viewing
 */

const pool = require('../db');

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Creating product_3d_models table...');

    // Main table for 3D model metadata
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_3d_models (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,

        -- Model files
        model_url VARCHAR(500) NOT NULL,
        usdz_url VARCHAR(500),
        poster_url VARCHAR(500),
        thumbnail_url VARCHAR(500),

        -- Model settings
        model_scale DECIMAL(10, 4) DEFAULT 1.0,
        camera_orbit VARCHAR(100) DEFAULT '0deg 75deg 105%',
        camera_target VARCHAR(100) DEFAULT '0m 0m 0m',
        min_camera_orbit VARCHAR(100),
        max_camera_orbit VARCHAR(100),
        field_of_view VARCHAR(20) DEFAULT '30deg',

        -- AR settings
        ar_placement VARCHAR(50) DEFAULT 'floor',
        ar_scale VARCHAR(20) DEFAULT 'auto',

        -- Environment
        environment_image VARCHAR(500),
        skybox_image VARCHAR(500),
        exposure DECIMAL(4, 2) DEFAULT 1.0,
        shadow_intensity DECIMAL(4, 2) DEFAULT 1.0,
        shadow_softness DECIMAL(4, 2) DEFAULT 1.0,

        -- Metadata
        file_size_bytes INTEGER,
        polygon_count INTEGER,
        has_animations BOOLEAN DEFAULT false,
        animation_names TEXT[],

        -- Status
        is_active BOOLEAN DEFAULT true,
        processing_status VARCHAR(50) DEFAULT 'ready',

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(product_id)
      )
    `);

    console.log('Creating product_3d_materials table...');

    // Materials/variants for 3D models
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_3d_materials (
        id SERIAL PRIMARY KEY,
        model_id INTEGER REFERENCES product_3d_models(id) ON DELETE CASCADE,

        -- Material identification
        material_name VARCHAR(100) NOT NULL,
        material_slot VARCHAR(100),
        display_name VARCHAR(255),

        -- Category for grouping (e.g., 'color', 'finish', 'fabric')
        category VARCHAR(50) DEFAULT 'color',

        -- Visual properties
        base_color_hex VARCHAR(7),
        base_color_texture_url VARCHAR(500),
        metalness DECIMAL(4, 3) DEFAULT 0.0,
        roughness DECIMAL(4, 3) DEFAULT 0.5,
        normal_map_url VARCHAR(500),

        -- Swatch for UI
        swatch_url VARCHAR(500),

        -- Pricing impact
        price_adjustment_cents INTEGER DEFAULT 0,
        price_multiplier DECIMAL(6, 4) DEFAULT 1.0,

        -- Availability
        is_default BOOLEAN DEFAULT false,
        is_available BOOLEAN DEFAULT true,
        lead_time_days INTEGER DEFAULT 0,

        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating product_3d_hotspots table...');

    // Hotspots for interactive 3D annotations
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_3d_hotspots (
        id SERIAL PRIMARY KEY,
        model_id INTEGER REFERENCES product_3d_models(id) ON DELETE CASCADE,

        -- Position in 3D space
        position_x DECIMAL(10, 6) NOT NULL,
        position_y DECIMAL(10, 6) NOT NULL,
        position_z DECIMAL(10, 6) NOT NULL,

        -- Normal direction for annotation placement
        normal_x DECIMAL(10, 6) DEFAULT 0,
        normal_y DECIMAL(10, 6) DEFAULT 1,
        normal_z DECIMAL(10, 6) DEFAULT 0,

        -- Content
        label VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(50) DEFAULT 'info',

        -- Interaction
        action_type VARCHAR(50) DEFAULT 'tooltip',
        action_data JSONB,

        is_active BOOLEAN DEFAULT true,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating product_configurations table...');

    // Store saved configurations for quotes
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_configurations (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        quotation_item_id INTEGER,

        -- Configuration data
        configuration_name VARCHAR(255),
        selected_materials JSONB DEFAULT '[]',
        custom_dimensions JSONB,
        selected_options JSONB DEFAULT '{}',

        -- Visual reference
        snapshot_url VARCHAR(500),

        -- Pricing
        base_price_cents INTEGER,
        configuration_adjustment_cents INTEGER DEFAULT 0,
        total_price_cents INTEGER,

        -- Metadata
        is_template BOOLEAN DEFAULT false,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Adding 3D model reference to quotation_items...');

    // Add configuration column to quotation_items if not exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'quotation_items' AND column_name = 'configuration_id'
        ) THEN
          ALTER TABLE quotation_items ADD COLUMN configuration_id INTEGER REFERENCES product_configurations(id);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'quotation_items' AND column_name = 'configuration_snapshot'
        ) THEN
          ALTER TABLE quotation_items ADD COLUMN configuration_snapshot JSONB;
        END IF;
      END $$;
    `);

    console.log('Creating indexes...');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_3d_models_product ON product_3d_models(product_id);
      CREATE INDEX IF NOT EXISTS idx_3d_materials_model ON product_3d_materials(model_id);
      CREATE INDEX IF NOT EXISTS idx_3d_materials_category ON product_3d_materials(category);
      CREATE INDEX IF NOT EXISTS idx_3d_hotspots_model ON product_3d_hotspots(model_id);
      CREATE INDEX IF NOT EXISTS idx_configurations_product ON product_configurations(product_id);
      CREATE INDEX IF NOT EXISTS idx_configurations_quote_item ON product_configurations(quotation_item_id);
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('3D models migration complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
  });
