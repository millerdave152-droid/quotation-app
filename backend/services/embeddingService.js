'use strict';

/**
 * EmbeddingService — Semantic Search Embedding Layer
 *
 * Generates text-embedding-3-small vectors (1536 dim) via OpenAI API
 * and writes them to the inline search_embedding columns on entity tables.
 *
 * Design rules:
 *   • Never throw on embedding failures — log + return null
 *   • embedNewRecord() is fire-and-forget — callers must NOT await
 *   • Nightly job re-embeds records modified in the last 25 h + backfills NULLs
 */

const axios = require('axios');
const pool = require('../db');

// ── Config ───────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMENSIONS = 1536;
const BATCH_SIZE = 100;

// ── Entity text builders ─────────────────────────────────────────

const TEXT_BUILDERS = {
  customers: (r) => [
    r.name, r.email, r.phone, r.company,
    r.city, r.province, r.notes,
  ].filter(Boolean).join(' '),

  products: (r) => [
    r.sku, r.name, r.manufacturer, r.model,
    r.description, r.category,
  ].filter(Boolean).join(' '),

  quotations: (r) => [
    r.quote_number || r.quotation_number,
    r.customer_name, r.status,
    r.notes, r.internal_notes,
  ].filter(Boolean).join(' '),

  customer_notes: (r) => [
    r.content, r.note_type,
    ...(Array.isArray(r.tags) ? r.tags : []),
  ].filter(Boolean).join(' '),
};

// ── Core embedding functions ────────────────────────────────────

/**
 * Generate a single embedding vector via OpenAI.
 * @param {string} text
 * @returns {number[]|null} 1536-dim float array, or null on error
 */
async function generateEmbedding(text) {
  if (!OPENAI_API_KEY) {
    console.warn('[EmbeddingService] OPENAI_API_KEY not set — skipping');
    return null;
  }
  if (!text || !text.trim()) return null;

  try {
    const res = await axios.post(
      'https://api.openai.com/v1/embeddings',
      { model: EMBED_MODEL, input: text.slice(0, 8000) },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    return res.data.data[0].embedding;
  } catch (err) {
    console.error('[EmbeddingService] OpenAI error:', err.message);
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in one API call (max 2048 inputs).
 * @param {string[]} texts
 * @returns {(number[]|null)[]} array of embeddings aligned to input
 */
async function generateBatchEmbeddings(texts) {
  if (!OPENAI_API_KEY || !texts.length) return texts.map(() => null);

  try {
    const res = await axios.post(
      'https://api.openai.com/v1/embeddings',
      { model: EMBED_MODEL, input: texts.map(t => (t || '').slice(0, 8000)) },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    // OpenAI returns sorted by index
    const sorted = res.data.data.sort((a, b) => a.index - b.index);
    return sorted.map(d => d.embedding);
  } catch (err) {
    console.error('[EmbeddingService] Batch OpenAI error:', err.message);
    return texts.map(() => null);
  }
}

// ── DB write ────────────────────────────────────────────────────

const ID_COLUMNS = {
  customers: 'id',
  products: 'id',
  quotations: 'id',
  customer_notes: 'id',
};

/**
 * Write an embedding vector to a specific entity row.
 */
async function updateEntityEmbedding(entity, id, embedding) {
  if (!embedding) return;
  const idCol = ID_COLUMNS[entity] || 'id';
  await pool.query(
    `UPDATE ${entity} SET search_embedding = $1::vector WHERE ${idCol} = $2`,
    [`[${embedding.join(',')}]`, id]
  );
}

// ── Queue-based embedding ───────────────────────────────────────

const logger = require('../utils/logger');

/**
 * Enqueue a record for embedding generation.
 * Replaces the old fire-and-forget pattern with a durable queue.
 * Callers can still call this fire-and-forget — the INSERT is fast and safe.
 *
 * @param {string} entity - table name (e.g. 'customers', 'products')
 * @param {object} record - the row returned from RETURNING *
 */
async function embedNewRecord(entity, record) {
  const builder = TEXT_BUILDERS[entity];
  if (!builder) return;

  const idCol = ID_COLUMNS[entity] || 'id';
  const entityId = record[idCol];
  if (!entityId) return;

  try {
    await pool.query(
      `INSERT INTO embedding_queue (entity_type, entity_id)
       VALUES ($1, $2)
       ON CONFLICT (entity_type, entity_id) DO NOTHING`,
      [entity, entityId]
    );
  } catch (err) {
    // Non-fatal: worst case the nightly job picks it up
    logger.warn({ err: err.message, entity, entityId }, '[EmbeddingService] Queue insert failed');
  }
}

/**
 * Process pending embedding queue items.
 * Picks up to 50 rows, generates embeddings, and writes to entity tables.
 * Uses FOR UPDATE SKIP LOCKED for safe concurrent processing.
 *
 * @returns {Promise<{processed: number, failed: number, skipped: number}>}
 */
async function processEmbeddingQueue() {
  if (!OPENAI_API_KEY) return { processed: 0, failed: 0, skipped: 0, reason: 'no_api_key' };

  const stats = { processed: 0, failed: 0, skipped: 0 };

  // Fetch batch with row-level lock (skip rows being processed by another worker)
  const { rows: pending } = await pool.query(`
    SELECT id, entity_type, entity_id, attempts
    FROM embedding_queue
    WHERE attempts < 3 AND scheduled_at <= NOW()
    ORDER BY scheduled_at
    LIMIT 50
    FOR UPDATE SKIP LOCKED
  `);

  for (const item of pending) {
    try {
      const builder = TEXT_BUILDERS[item.entity_type];
      if (!builder) {
        // Unknown entity type — remove from queue
        await pool.query('DELETE FROM embedding_queue WHERE id = $1', [item.id]);
        stats.skipped++;
        continue;
      }

      const idCol = ID_COLUMNS[item.entity_type] || 'id';

      // Load the entity record
      const { rows } = await pool.query(
        `SELECT * FROM ${item.entity_type} WHERE ${idCol} = $1`,
        [item.entity_id]
      );

      if (rows.length === 0) {
        // Entity deleted — remove from queue
        await pool.query('DELETE FROM embedding_queue WHERE id = $1', [item.id]);
        stats.skipped++;
        continue;
      }

      const text = builder(rows[0]);
      if (!text || !text.trim()) {
        await pool.query('DELETE FROM embedding_queue WHERE id = $1', [item.id]);
        stats.skipped++;
        continue;
      }

      const embedding = await generateEmbedding(text);
      if (!embedding) {
        throw new Error('generateEmbedding returned null');
      }

      await updateEntityEmbedding(item.entity_type, item.entity_id, embedding);

      // Success — remove from queue
      await pool.query('DELETE FROM embedding_queue WHERE id = $1', [item.id]);
      stats.processed++;
    } catch (err) {
      const newAttempts = item.attempts + 1;
      const backoffSeconds = newAttempts * 60;

      await pool.query(
        `UPDATE embedding_queue
         SET attempts = $2, last_error = $3,
             scheduled_at = NOW() + ($4 || ' seconds')::interval
         WHERE id = $1`,
        [item.id, newAttempts, err.message, backoffSeconds.toString()]
      );

      if (newAttempts >= 3) {
        logger.warn({ entity_type: item.entity_type, entity_id: item.entity_id, error: err.message },
          'Embedding failed 3 times — manual backfill required');
      }

      stats.failed++;
    }
  }

  return stats;
}

// ── Nightly batch job ───────────────────────────────────────────

/**
 * Re-embed recently modified records + backfill NULLs.
 * Designed to run at 2 AM via cron.
 */
async function runNightlyEmbeddingJob() {
  if (!OPENAI_API_KEY) {
    console.warn('[EmbeddingService] Nightly skip — no OPENAI_API_KEY');
    return { skipped: true };
  }

  const stats = { processed: 0, errors: 0 };
  const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago

  for (const entity of Object.keys(TEXT_BUILDERS)) {
    try {
      await _embedEntityBatch(entity, cutoff, stats);
    } catch (err) {
      console.error(`[EmbeddingService] Nightly error for ${entity}:`, err.message);
      stats.errors++;
    }
  }

  return stats;
}

/**
 * Embed modified + NULL rows for a single entity table.
 */
async function _embedEntityBatch(entity, cutoff, stats) {
  const idCol = ID_COLUMNS[entity] || 'id';
  const builder = TEXT_BUILDERS[entity];

  // 1. Recently modified (updated_at > cutoff)
  const modified = await pool.query(
    `SELECT * FROM ${entity}
     WHERE updated_at > $1
     ORDER BY ${idCol}`,
    [cutoff]
  );

  // 2. NULL embeddings (backfill, capped at 500)
  const nullRows = await pool.query(
    `SELECT * FROM ${entity}
     WHERE search_embedding IS NULL
     ORDER BY ${idCol}
     LIMIT 500`
  );

  // Merge, deduplicate by id
  const seen = new Set();
  const rows = [];
  for (const r of [...modified.rows, ...nullRows.rows]) {
    const rid = r[idCol];
    if (!seen.has(rid)) {
      seen.add(rid);
      rows.push(r);
    }
  }

  if (!rows.length) return;

  // Process in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const texts = batch.map(r => builder(r) || '');

    const embeddings = await generateBatchEmbeddings(texts);

    for (let j = 0; j < batch.length; j++) {
      if (embeddings[j]) {
        try {
          await updateEntityEmbedding(entity, batch[j][idCol], embeddings[j]);
          stats.processed++;
        } catch (err) {
          console.error(`[EmbeddingService] Write error ${entity}#${batch[j][idCol]}:`, err.message);
          stats.errors++;
        }
      }
    }
  }
}

module.exports = {
  generateEmbedding,
  generateBatchEmbeddings,
  updateEntityEmbedding,
  embedNewRecord,
  processEmbeddingQueue,
  runNightlyEmbeddingJob,
  // Exposed for testing / direct use
  TEXT_BUILDERS,
  EMBED_DIMENSIONS,
};
