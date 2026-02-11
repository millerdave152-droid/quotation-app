const express = require('express');
const multer = require('multer');
const ProductImageService = require('../services/ProductImageService');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

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
  router.get('/:id/images', asyncHandler(async (req, res) => {
    const images = await ProductImageService.getImages(req.params.id);
    res.json({ images });
  }));

  // POST /api/products/:id/images
  router.post('/:id/images', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
      throw ApiError.badRequest('No image file provided');
    }

    const image = await ProductImageService.addImage(req.params.id, req.file, {
      image_type: req.body.image_type || 'product',
      alt_text: req.body.alt_text || null,
      is_primary: req.body.is_primary === 'true' || req.body.is_primary === true,
      uploaded_by: req.user?.id || null,
    });

    res.status(201).json({ image });
  }));

  // PUT /api/products/:id/images/:imageId
  router.put('/:id/images/:imageId', asyncHandler(async (req, res) => {
    const image = await ProductImageService.updateImage(
      req.params.id,
      req.params.imageId,
      req.body
    );
    if (!image) throw ApiError.notFound('Image');
    res.json({ image });
  }));

  // DELETE /api/products/:id/images/:imageId
  router.delete('/:id/images/:imageId', asyncHandler(async (req, res) => {
    const deleted = await ProductImageService.deleteImage(req.params.id, req.params.imageId);
    if (!deleted) throw ApiError.notFound('Image');
    res.json({ success: true });
  }));

  // PUT /api/products/:id/images/reorder
  router.put('/:id/images/reorder', asyncHandler(async (req, res) => {
    const { image_ids } = req.body;
    if (!Array.isArray(image_ids) || image_ids.length === 0) {
      throw ApiError.badRequest('image_ids array required');
    }
    await ProductImageService.reorderImages(req.params.id, image_ids);
    res.json({ success: true });
  }));

  return router;
}

module.exports = { init };
