/**
 * MessagingHub
 *
 * Centralised messaging for marketplace channels.
 * Polls inbound messages from channel adapters, supports manual/auto replies,
 * template-driven triggered messages, and response-time analytics.
 *
 * Tables: marketplace_messages, message_templates
 *
 * Public methods:
 *   pollMessages(channelId)                       — poll + upsert inbound messages
 *   sendReply(messageId, body)                    — reply to a specific message
 *   sendTriggeredMessage(triggerEvent, orderData)  — auto-send from template
 *   getInbox(channelId, options)                  — unread/all inbound messages
 *   getThread(channelId, threadId)                — full conversation thread
 *   markRead(messageId)                           — mark message as read
 *   getResponseStats(channelId, days)             — response-time analytics
 *   getTemplates()                                — list templates
 *   createTemplate(data)                          — create template
 *   updateTemplate(id, updates)                   — update template
 */

const pool = require('../db');
const { getInstance: getChannelManager } = require('../services/ChannelManager');

const PREFIX = '[MessagingHub]';

class MessagingHub {
  constructor(pool) {
    this.pool = pool;
  }

  // ─── POLL MESSAGES ──────────────────────────────────────────────

  /**
   * Poll new messages from a channel adapter and upsert them locally.
   * @param {number} channelId
   * @returns {{ newMessages: number, totalPolled: number }}
   */
  async pollMessages(channelId) {
    const manager = await getChannelManager();
    const adapter = manager.getAdapter(channelId);

    const threads = await adapter.pollMessages({ max: 100 });

    let newMessages = 0;
    let totalPolled = 0;

    // Look up local order_id mapping for the channel
    for (const thread of threads) {
      totalPolled++;

      // Resolve local order_id from channel entity_id / orderId
      let localOrderId = null;
      if (thread.orderId) {
        const orderResult = await this.pool.query(
          `SELECT id FROM marketplace_orders
           WHERE (mirakl_order_id = $1 OR id = $2) AND channel_id = $3
           LIMIT 1`,
          [String(thread.orderId), parseInt(thread.orderId) || 0, channelId]
        );
        if (orderResult.rows.length > 0) localOrderId = orderResult.rows[0].id;
      }

      // Upsert the latest inbound message from this thread
      if (thread.lastMessage) {
        const upsertResult = await this.pool.query(`
          INSERT INTO marketplace_messages (
            channel_id, order_id, thread_id, direction, sender_type,
            sender_name, subject, body, created_at
          ) VALUES ($1, $2::INTEGER, $3, 'INBOUND', 'CUSTOMER', $4, $5, $6, COALESCE($7::TIMESTAMP, NOW()))
          ON CONFLICT DO NOTHING
          RETURNING id
        `, [
          channelId,
          localOrderId,
          thread.threadId,
          null, // sender_name — not provided by adapter
          thread.subject || null,
          thread.lastMessage,
          thread.lastMessageDate || null
        ]);

        // Check if this was actually a new insert vs existing
        if (upsertResult.rows.length > 0) {
          newMessages++;
        }
      }
    }

    console.log(`${PREFIX} Channel ${adapter.channelCode}: polled ${totalPolled} threads, ${newMessages} new messages`);
    return { newMessages, totalPolled };
  }

  // ─── SEND REPLY ─────────────────────────────────────────────────

  /**
   * Reply to a specific inbound message.
   * @param {number} messageId - ID of the inbound message to reply to
   * @param {string} body - reply text
   * @returns {{ outboundId: number, channelResponse: object }}
   */
  async sendReply(messageId, body) {
    // Load original message
    const { rows } = await this.pool.query(
      `SELECT * FROM marketplace_messages WHERE id = $1`, [messageId]
    );
    if (rows.length === 0) throw new Error(`Message #${messageId} not found`);

    const original = rows[0];
    if (!original.thread_id) throw new Error(`Message #${messageId} has no thread_id — cannot reply`);

    // Send via channel adapter
    let channelResponse = null;
    try {
      const manager = await getChannelManager();
      const adapter = manager.getAdapter(original.channel_id);
      channelResponse = await adapter.sendMessage(original.thread_id, body);
    } catch (err) {
      console.error(`${PREFIX} Failed to send reply via adapter: ${err.message}`);
      // Still store locally even if channel send fails
    }

    // Store outbound message
    const insertResult = await this.pool.query(`
      INSERT INTO marketplace_messages (
        channel_id, order_id, thread_id, direction, sender_type,
        subject, body, created_at
      ) VALUES ($1, $2, $3, 'OUTBOUND', 'SELLER', $4, $5, NOW())
      RETURNING id
    `, [
      original.channel_id,
      original.order_id,
      original.thread_id,
      original.subject ? `Re: ${original.subject}` : null,
      body
    ]);

    const outboundId = insertResult.rows[0].id;

    // Mark original as replied
    await this.pool.query(
      `UPDATE marketplace_messages SET replied_at = NOW() WHERE id = $1`,
      [messageId]
    );

    console.log(`${PREFIX} Reply sent to thread ${original.thread_id} (message #${outboundId})`);
    return { outboundId, channelResponse };
  }

  // ─── TRIGGERED MESSAGES ─────────────────────────────────────────

  /**
   * Send an auto-triggered message based on an event (e.g. ORDER_SHIPPED).
   * @param {string} triggerEvent - e.g. 'ORDER_SHIPPED', 'RETURN_APPROVED'
   * @param {object} orderData - { orderId, miraklOrderId, channelId, customerName, trackingUrl, deliveryDate, subject, returnAddress, body }
   * @returns {{ sent: boolean, outboundId: number|null, templateName: string|null }}
   */
  async sendTriggeredMessage(triggerEvent, orderData) {
    // Find matching active template
    const { rows: templates } = await this.pool.query(
      `SELECT * FROM message_templates WHERE trigger_event = $1 AND active = true ORDER BY id LIMIT 1`,
      [triggerEvent]
    );

    if (templates.length === 0) {
      console.log(`${PREFIX} No active template for event "${triggerEvent}", skipping`);
      return { sent: false, outboundId: null, templateName: null };
    }

    const template = templates[0];

    // Fill template variables
    const subject = this._fillTemplate(template.subject_template, orderData);
    const body = this._fillTemplate(template.body_template, orderData);

    // Resolve thread_id — look for an existing thread for this order
    let threadId = null;
    if (orderData.orderId || orderData.miraklOrderId) {
      const threadResult = await this.pool.query(`
        SELECT thread_id FROM marketplace_messages
        WHERE channel_id = $1
          AND (order_id = $2 OR thread_id = $3)
          AND thread_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
      `, [
        orderData.channelId,
        orderData.orderId || 0,
        orderData.miraklOrderId || ''
      ]);
      if (threadResult.rows.length > 0) threadId = threadResult.rows[0].thread_id;
    }

    // Send via channel adapter if we have a thread
    let channelResponse = null;
    if (threadId) {
      try {
        const manager = await getChannelManager();
        const adapter = manager.getAdapter(orderData.channelId);
        channelResponse = await adapter.sendMessage(threadId, body);
      } catch (err) {
        console.error(`${PREFIX} Failed to send triggered message via adapter: ${err.message}`);
      }
    }

    // Store outbound message
    const insertResult = await this.pool.query(`
      INSERT INTO marketplace_messages (
        channel_id, order_id, thread_id, direction, sender_type,
        subject, body, auto_replied, created_at
      ) VALUES ($1, $2::INTEGER, $3, 'OUTBOUND', 'SELLER', $4, $5, true, NOW())
      RETURNING id
    `, [
      orderData.channelId,
      orderData.orderId || null,
      threadId,
      subject,
      body
    ]);

    const outboundId = insertResult.rows[0].id;
    console.log(`${PREFIX} Triggered message "${template.template_name}" sent (message #${outboundId})`);

    return { sent: true, outboundId, templateName: template.template_name };
  }

  /**
   * Fill template placeholders with data values.
   */
  _fillTemplate(templateStr, data) {
    if (!templateStr) return '';
    return templateStr
      .replace(/\{order_id\}/g, data.miraklOrderId || data.orderId || '')
      .replace(/\{customer_name\}/g, data.customerName || 'Customer')
      .replace(/\{tracking_url\}/g, data.trackingUrl || '')
      .replace(/\{delivery_date\}/g, data.deliveryDate || 'TBD')
      .replace(/\{return_address\}/g, data.returnAddress || 'See return instructions')
      .replace(/\{subject\}/g, data.subject || '')
      .replace(/\{body\}/g, data.body || '');
  }

  // ─── INBOX / THREADS ───────────────────────────────────────────

  /**
   * Get inbound messages (inbox view).
   * @param {number|null} channelId - filter by channel (null = all)
   * @param {object} options - { unreadOnly, limit, offset }
   */
  async getInbox(channelId = null, options = {}) {
    const conditions = [`m.direction = 'INBOUND'`];
    const params = [];
    let idx = 1;

    if (channelId) {
      conditions.push(`m.channel_id = $${idx++}`);
      params.push(channelId);
    }
    if (options.unreadOnly) {
      conditions.push(`m.read_at IS NULL`);
    }

    const limit = parseInt(options.limit) || 50;
    const offset = parseInt(options.offset) || 0;
    const where = conditions.join(' AND ');

    const { rows } = await this.pool.query(`
      SELECT m.*,
             mc.channel_code, mc.channel_name,
             mo.mirakl_order_id, mo.customer_name AS order_customer_name
      FROM marketplace_messages m
      LEFT JOIN marketplace_channels mc ON mc.id = m.channel_id
      LEFT JOIN marketplace_orders mo ON mo.id = m.order_id
      WHERE ${where}
      ORDER BY m.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    // Unread count
    const countResult = await this.pool.query(`
      SELECT COUNT(*) AS unread_count
      FROM marketplace_messages
      WHERE direction = 'INBOUND' AND read_at IS NULL
      ${channelId ? 'AND channel_id = $1' : ''}
    `, channelId ? [channelId] : []);

    return {
      messages: rows.map(r => this._formatMessage(r)),
      unreadCount: parseInt(countResult.rows[0].unread_count),
      total: rows.length
    };
  }

  /**
   * Get a full conversation thread.
   * @param {number} channelId
   * @param {string} threadId
   */
  async getThread(channelId, threadId) {
    const { rows } = await this.pool.query(`
      SELECT m.*,
             mc.channel_code,
             mo.mirakl_order_id, mo.customer_name AS order_customer_name
      FROM marketplace_messages m
      LEFT JOIN marketplace_channels mc ON mc.id = m.channel_id
      LEFT JOIN marketplace_orders mo ON mo.id = m.order_id
      WHERE m.channel_id = $1 AND m.thread_id = $2
      ORDER BY m.created_at ASC
    `, [channelId, threadId]);

    return {
      threadId,
      channelId,
      messageCount: rows.length,
      messages: rows.map(r => this._formatMessage(r))
    };
  }

  // ─── MARK READ ──────────────────────────────────────────────────

  async markRead(messageId) {
    const { rows } = await this.pool.query(
      `UPDATE marketplace_messages SET read_at = NOW()
       WHERE id = $1 AND read_at IS NULL
       RETURNING id`,
      [messageId]
    );
    return { updated: rows.length > 0 };
  }

  // ─── RESPONSE STATS ────────────────────────────────────────────

  /**
   * Response time analytics.
   * @param {number|null} channelId
   * @param {number} days
   */
  async getResponseStats(channelId = null, days = 30) {
    const channelFilter = channelId ? 'AND m.channel_id = $2' : '';
    const params = [days];
    if (channelId) params.push(channelId);

    // Overall counts
    const countsResult = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE direction = 'INBOUND') AS total_inbound,
        COUNT(*) FILTER (WHERE direction = 'OUTBOUND') AS total_outbound,
        COUNT(*) FILTER (WHERE direction = 'INBOUND' AND read_at IS NULL) AS unread,
        COUNT(*) FILTER (WHERE direction = 'INBOUND' AND replied_at IS NOT NULL) AS replied,
        COUNT(*) FILTER (WHERE auto_replied = true) AS auto_replied
      FROM marketplace_messages m
      WHERE m.created_at >= NOW() - ($1 || ' days')::INTERVAL
      ${channelFilter}
    `, params);

    // Average response time (inbound messages that were replied to)
    const responseTimeResult = await this.pool.query(`
      SELECT
        AVG(EXTRACT(EPOCH FROM (replied_at - created_at)) / 60) AS avg_response_minutes,
        MIN(EXTRACT(EPOCH FROM (replied_at - created_at)) / 60) AS min_response_minutes,
        MAX(EXTRACT(EPOCH FROM (replied_at - created_at)) / 60) AS max_response_minutes,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (replied_at - created_at)) / 60)
          AS median_response_minutes
      FROM marketplace_messages m
      WHERE direction = 'INBOUND'
        AND replied_at IS NOT NULL
        AND m.created_at >= NOW() - ($1 || ' days')::INTERVAL
      ${channelFilter}
    `, params);

    // Messages by day (trend)
    const trendResult = await this.pool.query(`
      SELECT
        DATE(created_at) AS day,
        COUNT(*) FILTER (WHERE direction = 'INBOUND') AS inbound,
        COUNT(*) FILTER (WHERE direction = 'OUTBOUND') AS outbound
      FROM marketplace_messages m
      WHERE m.created_at >= NOW() - ($1 || ' days')::INTERVAL
      ${channelFilter}
      GROUP BY DATE(created_at)
      ORDER BY day DESC
    `, params);

    const counts = countsResult.rows[0];
    const rt = responseTimeResult.rows[0];
    const totalInbound = parseInt(counts.total_inbound) || 0;
    const replied = parseInt(counts.replied) || 0;

    return {
      period: `${days} days`,
      totalInbound,
      totalOutbound: parseInt(counts.total_outbound) || 0,
      unread: parseInt(counts.unread) || 0,
      replied,
      autoReplied: parseInt(counts.auto_replied) || 0,
      responseRate: totalInbound > 0 ? ((replied / totalInbound) * 100).toFixed(1) + '%' : '0.0%',
      avgResponseMinutes: rt.avg_response_minutes ? parseFloat(parseFloat(rt.avg_response_minutes).toFixed(1)) : null,
      medianResponseMinutes: rt.median_response_minutes ? parseFloat(parseFloat(rt.median_response_minutes).toFixed(1)) : null,
      minResponseMinutes: rt.min_response_minutes ? parseFloat(parseFloat(rt.min_response_minutes).toFixed(1)) : null,
      maxResponseMinutes: rt.max_response_minutes ? parseFloat(parseFloat(rt.max_response_minutes).toFixed(1)) : null,
      dailyTrend: trendResult.rows.map(r => ({
        day: r.day,
        inbound: parseInt(r.inbound),
        outbound: parseInt(r.outbound)
      }))
    };
  }

  // ─── TEMPLATES CRUD ─────────────────────────────────────────────

  async getTemplates() {
    const { rows } = await this.pool.query(
      `SELECT * FROM message_templates ORDER BY COALESCE(trigger_event, 'zzz'), id`
    );
    return rows;
  }

  async createTemplate(data) {
    const { rows } = await this.pool.query(`
      INSERT INTO message_templates (template_name, trigger_event, subject_template, body_template, active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      data.template_name || data.templateName,
      data.trigger_event || data.triggerEvent || null,
      data.subject_template || data.subjectTemplate || null,
      data.body_template || data.bodyTemplate,
      data.active !== false
    ]);
    return rows[0];
  }

  async updateTemplate(id, updates) {
    const fields = [];
    const params = [];
    let idx = 1;

    if (updates.template_name !== undefined) { fields.push(`template_name = $${idx++}`); params.push(updates.template_name); }
    if (updates.trigger_event !== undefined) { fields.push(`trigger_event = $${idx++}`); params.push(updates.trigger_event); }
    if (updates.subject_template !== undefined) { fields.push(`subject_template = $${idx++}`); params.push(updates.subject_template); }
    if (updates.body_template !== undefined) { fields.push(`body_template = $${idx++}`); params.push(updates.body_template); }
    if (updates.active !== undefined) { fields.push(`active = $${idx++}`); params.push(updates.active); }

    if (fields.length === 0) throw new Error('No fields to update');

    params.push(id);
    const { rows } = await this.pool.query(
      `UPDATE message_templates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (rows.length === 0) throw new Error(`Template #${id} not found`);
    return rows[0];
  }

  // ─── HELPERS ────────────────────────────────────────────────────

  _formatMessage(row) {
    return {
      id: row.id,
      channelId: row.channel_id,
      channelCode: row.channel_code || null,
      channelName: row.channel_name || null,
      orderId: row.order_id,
      miraklOrderId: row.mirakl_order_id || null,
      customerName: row.order_customer_name || row.sender_name || null,
      threadId: row.thread_id,
      direction: row.direction,
      senderType: row.sender_type,
      senderName: row.sender_name,
      subject: row.subject,
      body: row.body,
      readAt: row.read_at,
      repliedAt: row.replied_at,
      autoReplied: row.auto_replied,
      createdAt: row.created_at
    };
  }
}

module.exports = new MessagingHub(pool);
