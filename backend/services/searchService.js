'use strict';

/**
 * SearchService — Hybrid FTS + Vector Semantic Search
 *
 * Executes parallel full-text and vector searches across customers,
 * products, quotations, and customer_notes. Merges results using
 * weighted scoring (FTS 0.6 + vector 0.4) and deduplicates by entity.
 */

const pool = require('../db');
const { generateEmbedding } = require('./embeddingService');

// ── Entity search config ────────────────────────────────────────

const ENTITY_CONFIG = {
  customers: {
    table: 'customers',
    idCol: 'id',
    ftsColumns: "coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(company,'') || ' ' || coalesce(city,'') || ' ' || coalesce(notes,'')",
    selectFields: `id, name, email, phone, company, city, province`,
    titleField: 'name',
    subtitleField: 'company',
    entityType: 'customer',
  },
  products: {
    table: 'products',
    idCol: 'id',
    ftsColumns: "coalesce(sku,'') || ' ' || coalesce(name,'') || ' ' || coalesce(manufacturer,'') || ' ' || coalesce(model,'') || ' ' || coalesce(description,'') || ' ' || coalesce(category,'')",
    selectFields: `id, name, sku, manufacturer, model, category, is_active`,
    titleField: 'name',
    subtitleField: 'sku',
    entityType: 'product',
    extraWhere: 'AND is_active = true',
  },
  quotations: {
    table: 'quotations',
    idCol: 'id',
    ftsColumns: "coalesce(quote_number,'') || ' ' || coalesce(quotation_number,'') || ' ' || coalesce(customer_name,'') || ' ' || coalesce(status,'') || ' ' || coalesce(notes,'') || ' ' || coalesce(internal_notes,'')",
    selectFields: `id, coalesce(quote_number, quotation_number) as quote_number, customer_name, status, total_cents, created_at`,
    titleField: "coalesce(quote_number, quotation_number)",
    subtitleField: 'customer_name',
    entityType: 'quotation',
  },
  customer_notes: {
    table: 'customer_notes',
    idCol: 'id',
    ftsColumns: "coalesce(content,'') || ' ' || coalesce(note_type,'')",
    selectFields: `cn.id, cn.content, cn.note_type, cn.customer_id, cn.created_at, c.name as customer_name`,
    titleField: 'content',
    subtitleField: 'note_type',
    entityType: 'note',
    fromClause: 'customer_notes cn LEFT JOIN customers c ON c.id = cn.customer_id',
    tableAlias: 'cn',
  },
};

// ── FTS search ──────────────────────────────────────────────────

async function ftsSearch(query, entities, limit) {
  const results = [];

  for (const entityKey of entities) {
    const cfg = ENTITY_CONFIG[entityKey];
    if (!cfg) continue;

    const alias = cfg.tableAlias || cfg.table.charAt(0);
    const from = cfg.fromClause || `${cfg.table} ${alias}`;
    const extra = cfg.extraWhere || '';

    const sql = `
      SELECT ${cfg.selectFields},
             ts_rank(
               to_tsvector('english', ${cfg.ftsColumns.replace(/\b(name|email|phone|company|city|province|notes|sku|manufacturer|model|description|category|quote_number|quotation_number|customer_name|status|internal_notes|content|note_type)\b/g, `${alias}.$1`)}),
               plainto_tsquery('english', $1)
             ) as fts_score,
             '${cfg.entityType}' as entity_type
        FROM ${from}
       WHERE to_tsvector('english', ${cfg.ftsColumns.replace(/\b(name|email|phone|company|city|province|notes|sku|manufacturer|model|description|category|quote_number|quotation_number|customer_name|status|internal_notes|content|note_type)\b/g, `${alias}.$1`)})
             @@ plainto_tsquery('english', $1)
             ${extra}
       ORDER BY fts_score DESC
       LIMIT $2
    `;

    try {
      const { rows } = await pool.query(sql, [query, limit]);
      results.push(...rows);
    } catch (err) {
      console.error(`[SearchService] FTS error for ${entityKey}:`, err.message);
    }
  }

  return results;
}

// ── Vector search ───────────────────────────────────────────────

async function vectorSearch(embedding, entities, limit) {
  if (!embedding) return [];
  const results = [];
  const vecStr = `[${embedding.join(',')}]`;

  for (const entityKey of entities) {
    const cfg = ENTITY_CONFIG[entityKey];
    if (!cfg) continue;

    const alias = cfg.tableAlias || cfg.table.charAt(0);
    const from = cfg.fromClause || `${cfg.table} ${alias}`;
    const extra = cfg.extraWhere || '';

    const sql = `
      SELECT ${cfg.selectFields},
             1 - (${alias}.search_embedding <=> $1::vector) as vec_score,
             '${cfg.entityType}' as entity_type
        FROM ${from}
       WHERE ${alias}.search_embedding IS NOT NULL
             ${extra}
       ORDER BY ${alias}.search_embedding <=> $1::vector
       LIMIT $2
    `;

    try {
      const { rows } = await pool.query(sql, [vecStr, limit]);
      results.push(...rows);
    } catch (err) {
      console.error(`[SearchService] Vector error for ${entityKey}:`, err.message);
    }
  }

  return results;
}

// ── Merge + re-rank ─────────────────────────────────────────────

const FTS_WEIGHT = 0.6;
const VEC_WEIGHT = 0.4;

function mergeResults(ftsResults, vecResults, limit) {
  const map = new Map(); // key: "entityType:id"

  // Normalize FTS scores
  const maxFts = Math.max(...ftsResults.map(r => r.fts_score || 0), 0.001);
  for (const r of ftsResults) {
    const key = `${r.entity_type}:${r.id}`;
    map.set(key, {
      ...r,
      fts_norm: (r.fts_score || 0) / maxFts,
      vec_norm: 0,
    });
  }

  // Normalize vector scores (already 0–1 range from cosine similarity)
  for (const r of vecResults) {
    const key = `${r.entity_type}:${r.id}`;
    const existing = map.get(key);
    if (existing) {
      existing.vec_norm = r.vec_score || 0;
    } else {
      map.set(key, {
        ...r,
        fts_norm: 0,
        vec_norm: r.vec_score || 0,
      });
    }
  }

  // Compute combined score and sort
  const merged = Array.from(map.values()).map(r => ({
    ...r,
    score: r.fts_norm * FTS_WEIGHT + r.vec_norm * VEC_WEIGHT,
  }));

  merged.sort((a, b) => b.score - a.score);

  // Clean up internal fields
  return merged.slice(0, limit).map(r => {
    const { fts_score, vec_score, fts_norm, vec_norm, ...rest } = r;
    return rest;
  });
}

// ── Main search function ────────────────────────────────────────

/**
 * Hybrid search across multiple entity types.
 *
 * @param {object} params
 * @param {string} params.query - user search string
 * @param {string[]} [params.entities] - subset of entity keys to search
 * @param {number} [params.limit=20] - max results to return
 * @param {number} [params.userId] - for search_log
 * @param {string} [params.surface='global'] - where the search originated
 * @returns {object} { results, meta }
 */
async function search({ query, entities, limit = 20, userId, surface = 'global' }) {
  const start = Date.now();

  if (!query || !query.trim()) {
    return { results: [], meta: { query, resultCount: 0, latencyMs: 0 } };
  }

  // Default: search all entities
  const searchEntities = entities && entities.length
    ? entities.filter(e => ENTITY_CONFIG[e])
    : Object.keys(ENTITY_CONFIG);

  const perEntityLimit = Math.max(limit, 10); // fetch more per-entity, trim after merge

  // Run FTS + vector in parallel
  const embeddingPromise = generateEmbedding(query);
  const ftsPromise = ftsSearch(query, searchEntities, perEntityLimit);

  const [embedding, ftsResults] = await Promise.all([embeddingPromise, ftsPromise]);
  const vecResults = await vectorSearch(embedding, searchEntities, perEntityLimit);

  // Merge
  const results = mergeResults(ftsResults, vecResults, limit);
  const latencyMs = Date.now() - start;

  // Log search (fire-and-forget)
  const topEntity = results.length > 0 ? results[0].entity_type : null;
  _logSearch(userId, surface, query, results.length, topEntity, latencyMs).catch((err) => { console.error('[SearchService] Search logging failed:', err.message); });

  return {
    results,
    meta: {
      query,
      resultCount: results.length,
      latencyMs,
      entities: searchEntities,
    },
  };
}

// ── Search log ──────────────────────────────────────────────────

async function _logSearch(userId, surface, query, resultCount, topEntity, latencyMs) {
  await pool.query(
    `INSERT INTO search_log (user_id, surface, query, result_count, top_entity, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId || null, surface, query.slice(0, 500), resultCount, topEntity, latencyMs]
  );
}

module.exports = {
  search,
  // Exposed for testing
  ftsSearch,
  vectorSearch,
  mergeResults,
};
