'use strict';

/**
 * Voice-to-Text Interaction Notes Service
 *
 * Handles audio upload → Whisper transcription → Claude structuring → DB persistence.
 * Provides follow-up action-item queries and customer note history.
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const FormData = require('form-data');

// ── S3 ──────────────────────────────────────────────────────────

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

const S3_BUCKET = process.env.S3_BUCKET || 'teletime-product-images';
const CDN_BASE = process.env.CDN_BASE_URL || `https://${S3_BUCKET}.s3.amazonaws.com`;

// ── Mime → extension mapping ────────────────────────────────────

const MIME_TO_EXT = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
};

// ── Claude system prompt ────────────────────────────────────────

const STRUCTURING_SYSTEM_PROMPT = `You are a CRM assistant for TeleTime, an Ontario appliance, electronics, and furniture retailer. Extract structured information from staff interaction notes.

Respond ONLY with valid JSON — no markdown, no explanation.
Schema:
{
  "summary": "string (1-2 sentences, past tense)",
  "tags": ["string (2-6 lowercase tags from: quote, delivery, service, complaint, follow-up, pricing, institutional, payment, warranty, product, installation, exchange, repair, general)"],
  "action_items": ["string (specific next steps, imperative mood, empty array if none)"],
  "follow_up_date": "string|null (ISO date YYYY-MM-DD if explicit date mentioned, null otherwise)",
  "sentiment": "positive|neutral|negative|urgent",
  "key_entities": {
    "products": ["string"],
    "amounts": ["string"],
    "people": ["string"],
    "dates": ["string"]
  }
}`;

// ── Service class ───────────────────────────────────────────────

class VoiceNotesService {
  constructor(pool) {
    this.pool = pool;
    this._anthropic = null;
  }

  /** Lazy-init Anthropic client */
  _getAnthropic() {
    if (!this._anthropic) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw this._error('ANTHROPIC_NOT_CONFIGURED', 'ANTHROPIC_API_KEY not set');
      }
      this._anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this._anthropic;
  }

  _error(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
  }

  // ────────────────────────────────────────────────────────────────
  // processVoiceNote
  // ────────────────────────────────────────────────────────────────

  async processVoiceNote(audioBuffer, mimeType, customerId, userId, context = {}) {
    const { surface = 'quotation', contextNote } = context;

    // 1. Upload audio to S3
    const ext = MIME_TO_EXT[mimeType] || 'webm';
    const key = `voice-notes/${customerId}/${randomUUID()}.${ext}`;
    const retainUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: audioBuffer,
      ContentType: mimeType,
      Metadata: { 'retain-until': retainUntil },
    }));

    const audioUrl = `${CDN_BASE}/${key}`;

    // 2. Transcribe via OpenAI Whisper
    const transcription = await this._transcribe(audioBuffer, mimeType, ext);

    if (!transcription || transcription.trim().length === 0) {
      throw this._error('TRANSCRIPTION_EMPTY', 'No speech detected in recording.');
    }

    // 3. Structure via Claude
    const structured = await this._structureNote(transcription, surface, contextNote);

    // 4. Insert into customer_notes
    const { rows } = await this.pool.query(
      `INSERT INTO customer_notes (
        customer_id, content, note_type, created_by,
        structured_content, action_items, follow_up_date, sentiment,
        tags, transcription_raw, note_source, audio_url,
        processing_status, processed_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, 'voice', $11,
        'complete', NOW()
      ) RETURNING id`,
      [
        customerId,
        structured.summary,
        surface === 'pos' ? 'walk_in' : 'general',
        userId,
        JSON.stringify(structured),
        structured.action_items || [],
        structured.follow_up_date || null,
        structured.sentiment || 'neutral',
        structured.tags || [],
        transcription,
        audioUrl,
      ]
    );

    // 5. Generate search embedding (fire-and-forget)
    const { embedNewRecord } = require('./embeddingService');
    embedNewRecord('customer_notes', {
      id: rows[0].id,
      content: structured.summary,
      note_type: surface === 'pos' ? 'walk_in' : 'general',
      tags: structured.tags || [],
    }).catch(err => {
      console.warn('[VoiceNotesService] Embedding error:', err.message);
    });

    // 6. Return result
    return {
      noteId: rows[0].id,
      summary: structured.summary,
      transcription,
      actionItems: structured.action_items || [],
      followUpDate: structured.follow_up_date || null,
      sentiment: structured.sentiment || 'neutral',
      tags: structured.tags || [],
      keyEntities: structured.key_entities || {},
      audioUrl,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // Whisper transcription
  // ────────────────────────────────────────────────────────────────

  async _transcribe(audioBuffer, mimeType, ext) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw this._error('OPENAI_NOT_CONFIGURED', 'OPENAI_API_KEY not set. Required for Whisper transcription.');
    }

    const form = new FormData();
    form.append('file', audioBuffer, {
      filename: `recording.${ext}`,
      contentType: mimeType,
    });
    form.append('model', 'whisper-1');
    form.append('language', 'en');

    const res = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...form.getHeaders(),
        },
        maxContentLength: 26 * 1024 * 1024,
        timeout: 60_000,
      }
    );

    return res.data?.text || '';
  }

  // ────────────────────────────────────────────────────────────────
  // Claude structuring
  // ────────────────────────────────────────────────────────────────

  async _structureNote(transcription, surface, contextNote) {
    const userMessage = [
      `Surface: ${surface}`,
      contextNote ? `Context: ${contextNote}` : '',
      `Transcription: ${transcription}`,
    ].filter(Boolean).join('\n');

    try {
      const client = this._getAnthropic();
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: STRUCTURING_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });

      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      return JSON.parse(text);
    } catch (parseErr) {
      // Fallback: never fail on Claude parse error
      console.error('[VoiceNotes] Claude structuring failed, using fallback:', parseErr.message);
      return {
        summary: transcription.slice(0, 200),
        tags: ['general'],
        action_items: [],
        follow_up_date: null,
        sentiment: 'neutral',
        key_entities: { products: [], amounts: [], people: [], dates: [] },
      };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // getActionItemsDue
  // ────────────────────────────────────────────────────────────────

  async getActionItemsDue(userId, daysAhead = 7) {
    const { rows } = await this.pool.query(
      `SELECT cn.id, cn.customer_id, cn.content, cn.action_items,
              cn.follow_up_date, cn.tags, cn.sentiment, cn.created_at,
              c.name AS customer_name, c.company AS customer_company
       FROM customer_notes cn
       JOIN customers c ON c.id = cn.customer_id
       WHERE cn.created_by = $1
         AND cn.action_items IS NOT NULL
         AND array_length(cn.action_items, 1) > 0
         AND cn.follow_up_date >= CURRENT_DATE
         AND cn.follow_up_date <= CURRENT_DATE + $2::INTEGER
       ORDER BY cn.follow_up_date ASC`,
      [userId, daysAhead]
    );
    return rows;
  }

  // ────────────────────────────────────────────────────────────────
  // getCustomerNoteHistory
  // ────────────────────────────────────────────────────────────────

  async getCustomerNoteHistory(customerId, filters = {}) {
    const conditions = ['cn.customer_id = $1'];
    const params = [customerId];
    let idx = 2;

    if (filters.source) {
      conditions.push(`cn.note_source = $${idx++}`);
      params.push(filters.source);
    }
    if (filters.tags && filters.tags.length > 0) {
      conditions.push(`cn.tags && $${idx++}::TEXT[]`);
      params.push(filters.tags);
    }
    if (filters.sentiment) {
      conditions.push(`cn.sentiment = $${idx++}`);
      params.push(filters.sentiment);
    }
    if (filters.fromDate) {
      conditions.push(`cn.created_at >= $${idx++}`);
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      conditions.push(`cn.created_at <= $${idx++}`);
      params.push(filters.toDate);
    }

    const { rows } = await this.pool.query(
      `SELECT cn.*, u.name AS created_by_name
       FROM customer_notes cn
       LEFT JOIN users u ON u.id = cn.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY cn.created_at DESC
       LIMIT 50`,
      params
    );
    return rows;
  }
}

module.exports = VoiceNotesService;
