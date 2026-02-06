const express = require('express');
const multer = require('multer');
const ProductImageService = require('../services/ProductImageService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(req, file, cb) {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
  },
});

function init({ pool }) {
  ProductImageService.init({ pool });

  const router = express.Router();

  // GET /api/products/:id/images
  router.get('/:id/images', async (req, res) => {
    try {
      const images = await ProductImageService.getImages(req.params.id);
      res.json({ images });
    } catch (err) {
      console.error('Get product images error:', err);
      res.status(500).json({ error: 'Failed to load images' });
    }
  });

  // POST /api/products/:id/images
  router.post('/:id/images', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      const image = await ProductImageService.addImage(req.params.id, req.file, {
        image_type: req.body.image_type || 'product',
        alt_text: req.body.alt_text || null,
        is_primary: req.body.is_primary === 'true' || req.body.is_primary === true,
        uploaded_by: req.user?.id || null,
      });

      res.status(201).json({ image });
    } catch (err) {
      console.error('Upload product image error:', err);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  });

  // PUT /api/products/:id/images/:imageId
  router.put('/:id/images/:imageId', async (req, res) => {
    try {
      const image = await ProductImageService.updateImage(
        req.params.id,
        req.params.imageId,
        req.body
      );
      if (!image) return res.status(404).json({ error: 'Image not found' });
      res.json({ image });
    } catch (err) {
      console.error('Update product image error:', err);
      res.status(500).json({ error: 'Failed to update image' });
    }
  });

  // DELETE /api/products/:id/images/:imageId
  router.delete('/:id/images/:imageId', async (req, res) => {
    try {
      const deleted = await ProductImageService.deleteImage(req.params.id, req.params.imageId);
      if (!deleted) return res.status(404).json({ error: 'Image not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('Delete product image error:', err);
      res.status(500).json({ error: 'Failed to delete image' });
    }
  });

  // PUT /api/products/:id/images/reorder
  router.put('/:id/images/reorder', async (req, res) => {
    try {
      const { image_ids } = req.body;
      if (!Array.isArray(image_ids) || image_ids.length === 0) {
        return res.status(400).json({ error: 'image_ids array required' });
      }
      await ProductImageService.reorderImages(req.params.id, image_ids);
      res.json({ success: true });
    } catch (err) {
      console.error('Reorder product images error:', err);
      res.status(500).json({ error: 'Failed to reorder images' });
    }
  });

  return router;
}

module.exports = { init };
