/**
 * Product3DService - Manages 3D product models and configurations
 *
 * Handles:
 * - 3D model CRUD operations
 * - Material/variant management
 * - Product configurations for quotes
 * - Hotspot annotations
 */

const pool = require('../db');
const path = require('path');
const fs = require('fs').promises;

class Product3DService {
  /**
   * Get 3D model for a product
   */
  async getProductModel(productId) {
    const result = await pool.query(`
      SELECT
        m.*,
        p.model AS product_model,
        p.manufacturer,
        p.category
      FROM product_3d_models m
      JOIN products p ON p.id = m.product_id
      WHERE m.product_id = $1 AND m.is_active = true
    `, [productId]);

    if (result.rows.length === 0) {
      return null;
    }

    const model = result.rows[0];

    // Get materials
    const materialsResult = await pool.query(`
      SELECT * FROM product_3d_materials
      WHERE model_id = $1 AND is_available = true
      ORDER BY category, display_order
    `, [model.id]);

    // Get hotspots
    const hotspotsResult = await pool.query(`
      SELECT * FROM product_3d_hotspots
      WHERE model_id = $1 AND is_active = true
      ORDER BY display_order
    `, [model.id]);

    return {
      ...model,
      materials: materialsResult.rows,
      hotspots: hotspotsResult.rows
    };
  }

  /**
   * Get all products with 3D models
   */
  async getProductsWithModels(options = {}) {
    const { category, manufacturer, limit = 50, offset = 0 } = options;

    let query = `
      SELECT
        p.id,
        p.model,
        p.manufacturer,
        p.category,
        m.id AS model_id,
        m.model_url,
        m.thumbnail_url,
        m.poster_url,
        m.has_animations
      FROM products p
      JOIN product_3d_models m ON m.product_id = p.id
      WHERE m.is_active = true
    `;

    const params = [];
    let paramIndex = 1;

    if (category) {
      query += ` AND p.category = $${paramIndex++}`;
      params.push(category);
    }

    if (manufacturer) {
      query += ` AND p.manufacturer ILIKE $${paramIndex++}`;
      params.push(`%${manufacturer}%`);
    }

    query += ` ORDER BY p.manufacturer, p.model LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Create or update a 3D model for a product
   */
  async upsertProductModel(productId, modelData) {
    const {
      model_url,
      usdz_url,
      poster_url,
      thumbnail_url,
      model_scale = 1.0,
      camera_orbit = '0deg 75deg 105%',
      camera_target = '0m 0m 0m',
      min_camera_orbit,
      max_camera_orbit,
      field_of_view = '30deg',
      ar_placement = 'floor',
      ar_scale = 'auto',
      environment_image,
      skybox_image,
      exposure = 1.0,
      shadow_intensity = 1.0,
      shadow_softness = 1.0,
      file_size_bytes,
      polygon_count,
      has_animations = false,
      animation_names = []
    } = modelData;

    const result = await pool.query(`
      INSERT INTO product_3d_models (
        product_id, model_url, usdz_url, poster_url, thumbnail_url,
        model_scale, camera_orbit, camera_target, min_camera_orbit, max_camera_orbit,
        field_of_view, ar_placement, ar_scale, environment_image, skybox_image,
        exposure, shadow_intensity, shadow_softness, file_size_bytes, polygon_count,
        has_animations, animation_names, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, CURRENT_TIMESTAMP)
      ON CONFLICT (product_id)
      DO UPDATE SET
        model_url = EXCLUDED.model_url,
        usdz_url = COALESCE(EXCLUDED.usdz_url, product_3d_models.usdz_url),
        poster_url = COALESCE(EXCLUDED.poster_url, product_3d_models.poster_url),
        thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, product_3d_models.thumbnail_url),
        model_scale = EXCLUDED.model_scale,
        camera_orbit = EXCLUDED.camera_orbit,
        camera_target = EXCLUDED.camera_target,
        min_camera_orbit = EXCLUDED.min_camera_orbit,
        max_camera_orbit = EXCLUDED.max_camera_orbit,
        field_of_view = EXCLUDED.field_of_view,
        ar_placement = EXCLUDED.ar_placement,
        ar_scale = EXCLUDED.ar_scale,
        environment_image = EXCLUDED.environment_image,
        skybox_image = EXCLUDED.skybox_image,
        exposure = EXCLUDED.exposure,
        shadow_intensity = EXCLUDED.shadow_intensity,
        shadow_softness = EXCLUDED.shadow_softness,
        file_size_bytes = COALESCE(EXCLUDED.file_size_bytes, product_3d_models.file_size_bytes),
        polygon_count = COALESCE(EXCLUDED.polygon_count, product_3d_models.polygon_count),
        has_animations = EXCLUDED.has_animations,
        animation_names = EXCLUDED.animation_names,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      productId, model_url, usdz_url, poster_url, thumbnail_url,
      model_scale, camera_orbit, camera_target, min_camera_orbit, max_camera_orbit,
      field_of_view, ar_placement, ar_scale, environment_image, skybox_image,
      exposure, shadow_intensity, shadow_softness, file_size_bytes, polygon_count,
      has_animations, animation_names
    ]);

    return result.rows[0];
  }

  /**
   * Delete a 3D model
   */
  async deleteProductModel(productId) {
    const result = await pool.query(
      'DELETE FROM product_3d_models WHERE product_id = $1 RETURNING *',
      [productId]
    );
    return result.rows[0];
  }

  /**
   * Add or update material variant for a 3D model
   */
  async upsertMaterial(modelId, materialData) {
    const {
      id,
      material_name,
      material_slot,
      display_name,
      category = 'color',
      base_color_hex,
      base_color_texture_url,
      metalness = 0,
      roughness = 0.5,
      normal_map_url,
      swatch_url,
      price_adjustment_cents = 0,
      price_multiplier = 1.0,
      is_default = false,
      is_available = true,
      lead_time_days = 0,
      display_order = 0
    } = materialData;

    if (id) {
      // Update existing
      const result = await pool.query(`
        UPDATE product_3d_materials SET
          material_name = $1,
          material_slot = $2,
          display_name = $3,
          category = $4,
          base_color_hex = $5,
          base_color_texture_url = $6,
          metalness = $7,
          roughness = $8,
          normal_map_url = $9,
          swatch_url = $10,
          price_adjustment_cents = $11,
          price_multiplier = $12,
          is_default = $13,
          is_available = $14,
          lead_time_days = $15,
          display_order = $16
        WHERE id = $17
        RETURNING *
      `, [
        material_name, material_slot, display_name, category,
        base_color_hex, base_color_texture_url, metalness, roughness,
        normal_map_url, swatch_url, price_adjustment_cents, price_multiplier,
        is_default, is_available, lead_time_days, display_order, id
      ]);
      return result.rows[0];
    } else {
      // Insert new
      const result = await pool.query(`
        INSERT INTO product_3d_materials (
          model_id, material_name, material_slot, display_name, category,
          base_color_hex, base_color_texture_url, metalness, roughness,
          normal_map_url, swatch_url, price_adjustment_cents, price_multiplier,
          is_default, is_available, lead_time_days, display_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *
      `, [
        modelId, material_name, material_slot, display_name, category,
        base_color_hex, base_color_texture_url, metalness, roughness,
        normal_map_url, swatch_url, price_adjustment_cents, price_multiplier,
        is_default, is_available, lead_time_days, display_order
      ]);
      return result.rows[0];
    }
  }

  /**
   * Get materials for a model
   */
  async getMaterials(modelId, category = null) {
    let query = 'SELECT * FROM product_3d_materials WHERE model_id = $1';
    const params = [modelId];

    if (category) {
      query += ' AND category = $2';
      params.push(category);
    }

    query += ' ORDER BY category, display_order';
    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Delete a material
   */
  async deleteMaterial(materialId) {
    const result = await pool.query(
      'DELETE FROM product_3d_materials WHERE id = $1 RETURNING *',
      [materialId]
    );
    return result.rows[0];
  }

  /**
   * Add hotspot annotation
   */
  async addHotspot(modelId, hotspotData) {
    const {
      position_x,
      position_y,
      position_z,
      normal_x = 0,
      normal_y = 1,
      normal_z = 0,
      label,
      description,
      icon = 'info',
      action_type = 'tooltip',
      action_data,
      display_order = 0
    } = hotspotData;

    const result = await pool.query(`
      INSERT INTO product_3d_hotspots (
        model_id, position_x, position_y, position_z,
        normal_x, normal_y, normal_z, label, description,
        icon, action_type, action_data, display_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      modelId, position_x, position_y, position_z,
      normal_x, normal_y, normal_z, label, description,
      icon, action_type, JSON.stringify(action_data), display_order
    ]);

    return result.rows[0];
  }

  /**
   * Delete hotspot
   */
  async deleteHotspot(hotspotId) {
    const result = await pool.query(
      'DELETE FROM product_3d_hotspots WHERE id = $1 RETURNING *',
      [hotspotId]
    );
    return result.rows[0];
  }

  /**
   * Save product configuration for a quote item
   */
  async saveConfiguration(productId, configData) {
    const {
      quotation_item_id,
      configuration_name,
      selected_materials = [],
      custom_dimensions,
      selected_options = {},
      snapshot_url,
      base_price_cents,
      configuration_adjustment_cents = 0,
      is_template = false,
      created_by
    } = configData;

    const total_price_cents = base_price_cents + configuration_adjustment_cents;

    const result = await pool.query(`
      INSERT INTO product_configurations (
        product_id, quotation_item_id, configuration_name,
        selected_materials, custom_dimensions, selected_options,
        snapshot_url, base_price_cents, configuration_adjustment_cents,
        total_price_cents, is_template, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      productId, quotation_item_id, configuration_name,
      JSON.stringify(selected_materials), JSON.stringify(custom_dimensions),
      JSON.stringify(selected_options), snapshot_url,
      base_price_cents, configuration_adjustment_cents, total_price_cents,
      is_template, created_by
    ]);

    // If linked to a quote item, update the reference
    if (quotation_item_id) {
      await pool.query(`
        UPDATE quotation_items
        SET configuration_id = $1,
            configuration_snapshot = $2
        WHERE id = $3
      `, [
        result.rows[0].id,
        JSON.stringify({
          materials: selected_materials,
          dimensions: custom_dimensions,
          options: selected_options,
          adjustment_cents: configuration_adjustment_cents
        }),
        quotation_item_id
      ]);
    }

    return result.rows[0];
  }

  /**
   * Get configuration by ID
   */
  async getConfiguration(configId) {
    const result = await pool.query(
      'SELECT * FROM product_configurations WHERE id = $1',
      [configId]
    );
    return result.rows[0];
  }

  /**
   * Get configurations for a product (templates)
   */
  async getProductConfigurations(productId, templatesOnly = false) {
    let query = 'SELECT * FROM product_configurations WHERE product_id = $1';
    if (templatesOnly) {
      query += ' AND is_template = true';
    }
    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, [productId]);
    return result.rows;
  }

  /**
   * Calculate configuration price adjustment
   */
  async calculateConfigurationPrice(productId, selectedMaterials = []) {
    if (selectedMaterials.length === 0) {
      return { adjustment_cents: 0, multiplier: 1.0, lead_time_days: 0 };
    }

    // Get material pricing
    const result = await pool.query(`
      SELECT
        SUM(price_adjustment_cents) AS total_adjustment,
        MAX(price_multiplier) AS max_multiplier,
        MAX(lead_time_days) AS max_lead_time
      FROM product_3d_materials
      WHERE id = ANY($1::int[])
    `, [selectedMaterials]);

    const data = result.rows[0];
    return {
      adjustment_cents: parseInt(data.total_adjustment) || 0,
      multiplier: parseFloat(data.max_multiplier) || 1.0,
      lead_time_days: parseInt(data.max_lead_time) || 0
    };
  }

  /**
   * Get sample/demo 3D models (for products without custom models)
   */
  async getSampleModels() {
    // Return placeholder URLs for demo purposes
    return {
      refrigerator: {
        model_url: '/models/samples/refrigerator.glb',
        poster_url: '/models/samples/refrigerator-poster.jpg',
        category: 'Refrigerator'
      },
      washer: {
        model_url: '/models/samples/washer.glb',
        poster_url: '/models/samples/washer-poster.jpg',
        category: 'Washer'
      },
      range: {
        model_url: '/models/samples/range.glb',
        poster_url: '/models/samples/range-poster.jpg',
        category: 'Range'
      },
      dishwasher: {
        model_url: '/models/samples/dishwasher.glb',
        poster_url: '/models/samples/dishwasher-poster.jpg',
        category: 'Dishwasher'
      }
    };
  }

  /**
   * Get model statistics
   */
  async getModelStats() {
    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT m.id) AS total_models,
        COUNT(DISTINCT mat.id) AS total_materials,
        COUNT(DISTINCT h.id) AS total_hotspots,
        COUNT(DISTINCT c.id) AS total_configurations,
        (
          SELECT COUNT(DISTINCT product_id)
          FROM product_3d_models
          WHERE is_active = true
        ) AS products_with_models
      FROM product_3d_models m
      LEFT JOIN product_3d_materials mat ON mat.model_id = m.id
      LEFT JOIN product_3d_hotspots h ON h.model_id = m.id
      LEFT JOIN product_configurations c ON c.product_id = m.product_id
      WHERE m.is_active = true
    `);

    return result.rows[0];
  }
}

module.exports = new Product3DService();
