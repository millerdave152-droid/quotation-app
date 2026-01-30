/**
 * 3D Product Model Routes
 *
 * Handles 3D model management, materials, configurations, and file uploads
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const Product3DService = require('../services/Product3DService');
const { authenticate } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../public/models');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `model-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.glb', '.gltf', '.usdz', '.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${ext}. Allowed: ${allowedTypes.join(', ')}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for 3D models
});

/**
 * GET /api/product-3d/products
 * Get all products that have 3D models
 */
router.get('/products', authenticate, async (req, res) => {
  try {
    const { category, manufacturer, limit, offset } = req.query;
    const products = await Product3DService.getProductsWithModels({
      category,
      manufacturer,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    res.json(products);
  } catch (error) {
    console.error('Error fetching products with 3D models:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/product-3d/stats
 * Get 3D model statistics
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const stats = await Product3DService.getModelStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching 3D model stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/product-3d/samples
 * Get sample/demo 3D models
 */
router.get('/samples', authenticate, async (req, res) => {
  try {
    const samples = await Product3DService.getSampleModels();
    res.json(samples);
  } catch (error) {
    console.error('Error fetching sample models:', error);
    res.status(500).json({ error: 'Failed to fetch samples' });
  }
});

/**
 * GET /api/product-3d/:productId
 * Get 3D model for a specific product
 */
router.get('/:productId', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const model = await Product3DService.getProductModel(productId);

    if (!model) {
      return res.status(404).json({ error: 'No 3D model found for this product' });
    }

    res.json(model);
  } catch (error) {
    console.error('Error fetching product 3D model:', error);
    res.status(500).json({ error: 'Failed to fetch 3D model' });
  }
});

/**
 * POST /api/product-3d/:productId
 * Create or update 3D model for a product
 */
router.post('/:productId', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const model = await Product3DService.upsertProductModel(productId, req.body);
    res.json(model);
  } catch (error) {
    console.error('Error saving product 3D model:', error);
    res.status(500).json({ error: 'Failed to save 3D model' });
  }
});

/**
 * POST /api/product-3d/:productId/upload
 * Upload 3D model files for a product
 */
router.post('/:productId/upload', authenticate, upload.fields([
  { name: 'model', maxCount: 1 },
  { name: 'usdz', maxCount: 1 },
  { name: 'poster', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  try {
    const { productId } = req.params;
    const files = req.files;

    const modelData = { ...req.body };

    // Process uploaded files
    if (files.model && files.model[0]) {
      modelData.model_url = `/models/${files.model[0].filename}`;
      modelData.file_size_bytes = files.model[0].size;
    }

    if (files.usdz && files.usdz[0]) {
      modelData.usdz_url = `/models/${files.usdz[0].filename}`;
    }

    if (files.poster && files.poster[0]) {
      modelData.poster_url = `/models/${files.poster[0].filename}`;
    }

    if (files.thumbnail && files.thumbnail[0]) {
      modelData.thumbnail_url = `/models/${files.thumbnail[0].filename}`;
    }

    const model = await Product3DService.upsertProductModel(productId, modelData);
    res.json(model);
  } catch (error) {
    console.error('Error uploading 3D model:', error);
    res.status(500).json({ error: 'Failed to upload 3D model' });
  }
});

/**
 * DELETE /api/product-3d/:productId
 * Delete 3D model for a product
 */
router.delete('/:productId', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const deleted = await Product3DService.deleteProductModel(productId);

    if (!deleted) {
      return res.status(404).json({ error: 'No 3D model found for this product' });
    }

    res.json({ success: true, deleted });
  } catch (error) {
    console.error('Error deleting product 3D model:', error);
    res.status(500).json({ error: 'Failed to delete 3D model' });
  }
});

// ============================================
// Material Routes
// ============================================

/**
 * GET /api/product-3d/:productId/materials
 * Get materials for a product's 3D model
 */
router.get('/:productId/materials', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const { category } = req.query;

    // First get the model
    const model = await Product3DService.getProductModel(productId);
    if (!model) {
      return res.status(404).json({ error: 'No 3D model found for this product' });
    }

    const materials = await Product3DService.getMaterials(model.id, category);
    res.json(materials);
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

/**
 * POST /api/product-3d/:productId/materials
 * Add or update a material for a product's 3D model
 */
router.post('/:productId/materials', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;

    // First get the model
    const model = await Product3DService.getProductModel(productId);
    if (!model) {
      return res.status(404).json({ error: 'No 3D model found for this product' });
    }

    const material = await Product3DService.upsertMaterial(model.id, req.body);
    res.json(material);
  } catch (error) {
    console.error('Error saving material:', error);
    res.status(500).json({ error: 'Failed to save material' });
  }
});

/**
 * DELETE /api/product-3d/:productId/materials/:materialId
 * Delete a material
 */
router.delete('/:productId/materials/:materialId', authenticate, async (req, res) => {
  try {
    const { materialId } = req.params;
    const deleted = await Product3DService.deleteMaterial(materialId);

    if (!deleted) {
      return res.status(404).json({ error: 'Material not found' });
    }

    res.json({ success: true, deleted });
  } catch (error) {
    console.error('Error deleting material:', error);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

// ============================================
// Hotspot Routes
// ============================================

/**
 * POST /api/product-3d/:productId/hotspots
 * Add a hotspot annotation to a product's 3D model
 */
router.post('/:productId/hotspots', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;

    // First get the model
    const model = await Product3DService.getProductModel(productId);
    if (!model) {
      return res.status(404).json({ error: 'No 3D model found for this product' });
    }

    const hotspot = await Product3DService.addHotspot(model.id, req.body);
    res.json(hotspot);
  } catch (error) {
    console.error('Error adding hotspot:', error);
    res.status(500).json({ error: 'Failed to add hotspot' });
  }
});

/**
 * DELETE /api/product-3d/:productId/hotspots/:hotspotId
 * Delete a hotspot
 */
router.delete('/:productId/hotspots/:hotspotId', authenticate, async (req, res) => {
  try {
    const { hotspotId } = req.params;
    const deleted = await Product3DService.deleteHotspot(hotspotId);

    if (!deleted) {
      return res.status(404).json({ error: 'Hotspot not found' });
    }

    res.json({ success: true, deleted });
  } catch (error) {
    console.error('Error deleting hotspot:', error);
    res.status(500).json({ error: 'Failed to delete hotspot' });
  }
});

// ============================================
// Configuration Routes
// ============================================

/**
 * GET /api/product-3d/:productId/configurations
 * Get saved configurations for a product
 */
router.get('/:productId/configurations', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const { templates_only } = req.query;

    const configurations = await Product3DService.getProductConfigurations(
      productId,
      templates_only === 'true'
    );
    res.json(configurations);
  } catch (error) {
    console.error('Error fetching configurations:', error);
    res.status(500).json({ error: 'Failed to fetch configurations' });
  }
});

/**
 * POST /api/product-3d/:productId/configurations
 * Save a product configuration
 */
router.post('/:productId/configurations', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const configuration = await Product3DService.saveConfiguration(productId, req.body);
    res.json(configuration);
  } catch (error) {
    console.error('Error saving configuration:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

/**
 * GET /api/product-3d/configurations/:configId
 * Get a specific configuration
 */
router.get('/configurations/:configId', authenticate, async (req, res) => {
  try {
    const { configId } = req.params;
    const configuration = await Product3DService.getConfiguration(configId);

    if (!configuration) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    res.json(configuration);
  } catch (error) {
    console.error('Error fetching configuration:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

/**
 * POST /api/product-3d/:productId/calculate-price
 * Calculate price for a configuration
 */
router.post('/:productId/calculate-price', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const { selected_materials = [] } = req.body;

    const pricing = await Product3DService.calculateConfigurationPrice(productId, selected_materials);
    res.json(pricing);
  } catch (error) {
    console.error('Error calculating configuration price:', error);
    res.status(500).json({ error: 'Failed to calculate price' });
  }
});

module.exports = router;
