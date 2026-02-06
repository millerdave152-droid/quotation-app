const sharp = require('sharp');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const crypto = require('crypto');

let pool;

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

const BUCKET = process.env.S3_BUCKET || 'teletime-product-images';
const CDN_BASE = process.env.CDN_BASE_URL || `https://${BUCKET}.s3.amazonaws.com`;

function init(deps) {
  pool = deps.pool;
}

// ── S3 helpers ──────────────────────────────────────────────────────

async function uploadToS3(key, body, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  }));
  return `${CDN_BASE}/${key}`;
}

async function deleteFromS3(url) {
  if (!url || !url.includes(CDN_BASE)) return;
  const key = url.replace(`${CDN_BASE}/`, '');
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.error('S3 delete failed:', key, err.message);
  }
}

// ── Image processing ────────────────────────────────────────────────

async function processAndUpload(file, productId) {
  const timestamp = Date.now();
  const hash = crypto.randomBytes(4).toString('hex');
  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  const baseName = `${timestamp}-${hash}`;

  // Get metadata from original
  const metadata = await sharp(file.buffer).metadata();

  // Upload original (optimized)
  const optimized = await sharp(file.buffer)
    .rotate() // auto-rotate from EXIF
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  const imageKey = `products/${productId}/${baseName}${ext === '.png' ? '.png' : '.jpg'}`;
  const imageUrl = await uploadToS3(
    imageKey,
    ext === '.png'
      ? await sharp(file.buffer).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).png({ quality: 90 }).toBuffer()
      : optimized,
    ext === '.png' ? 'image/png' : 'image/jpeg'
  );

  // Generate and upload thumbnail
  const thumbBuffer = await sharp(file.buffer)
    .rotate()
    .resize(400, 400, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  const thumbKey = `products/${productId}/thumbs/${baseName}.jpg`;
  const thumbnailUrl = await uploadToS3(thumbKey, thumbBuffer, 'image/jpeg');

  return {
    image_url: imageUrl,
    thumbnail_url: thumbnailUrl,
    width: metadata.width,
    height: metadata.height,
    file_size: file.size,
  };
}

// ── CRUD ────────────────────────────────────────────────────────────

async function getImages(productId) {
  const { rows } = await pool.query(
    `SELECT id, product_id, image_url, thumbnail_url, image_type,
            alt_text, sort_order, is_primary, width, height, file_size, created_at
     FROM product_images
     WHERE product_id = $1
     ORDER BY sort_order, created_at`,
    [productId]
  );
  return rows;
}

async function addImage(productId, file, { image_type, alt_text, is_primary, uploaded_by }) {
  const uploaded = await processAndUpload(file, productId);

  // If first image for this product, auto-set as primary
  const { rows: existing } = await pool.query(
    'SELECT COUNT(*) AS cnt FROM product_images WHERE product_id = $1',
    [productId]
  );
  const autoSetPrimary = is_primary || parseInt(existing[0].cnt) === 0;

  // Get next sort_order
  const { rows: maxSort } = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM product_images WHERE product_id = $1',
    [productId]
  );

  const { rows } = await pool.query(
    `INSERT INTO product_images
       (product_id, image_url, thumbnail_url, image_type, alt_text, sort_order, is_primary, width, height, file_size, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      productId,
      uploaded.image_url,
      uploaded.thumbnail_url,
      image_type || 'product',
      alt_text || null,
      maxSort[0].next_order,
      autoSetPrimary,
      uploaded.width,
      uploaded.height,
      uploaded.file_size,
      uploaded_by || null,
    ]
  );

  return rows[0];
}

async function updateImage(productId, imageId, updates) {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const key of ['alt_text', 'sort_order', 'is_primary', 'image_type']) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(updates[key]);
    }
  }
  if (fields.length === 0) return null;

  values.push(imageId, productId);
  const { rows } = await pool.query(
    `UPDATE product_images SET ${fields.join(', ')}
     WHERE id = $${idx++} AND product_id = $${idx}
     RETURNING *`,
    values
  );
  return rows[0] || null;
}

async function deleteImage(productId, imageId) {
  const { rows } = await pool.query(
    'DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING *',
    [imageId, productId]
  );
  if (!rows[0]) return false;

  // Delete from S3 in background
  deleteFromS3(rows[0].image_url);
  deleteFromS3(rows[0].thumbnail_url);

  // If deleted image was primary, promote the next one
  if (rows[0].is_primary) {
    await pool.query(
      `UPDATE product_images SET is_primary = true
       WHERE product_id = $1 AND id = (
         SELECT id FROM product_images WHERE product_id = $1 ORDER BY sort_order LIMIT 1
       )`,
      [productId]
    );
  }

  return true;
}

async function reorderImages(productId, imageIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < imageIds.length; i++) {
      await client.query(
        'UPDATE product_images SET sort_order = $1 WHERE id = $2 AND product_id = $3',
        [i, imageIds[i], productId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  init,
  getImages,
  addImage,
  updateImage,
  deleteImage,
  reorderImages,
};
