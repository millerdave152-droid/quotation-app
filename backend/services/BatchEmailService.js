/**
 * TeleTime POS - Batch Email Service
 * Handles batch sending of receipts, retry logic, and email queue management
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

class BatchEmailService {
  constructor(pool, config = {}) {
    this.pool = pool;
    this.config = {
      maxBatchSize: config.maxBatchSize || 50,
      sendDelayMs: config.sendDelayMs || 1000, // 1 second between emails
      maxRetries: config.maxRetries || 3,
      retryDelayMinutes: config.retryDelayMinutes || 15,
      fromEmail: config.fromEmail || process.env.SES_FROM_EMAIL || 'noreply@teletime.ca',
      fromName: config.fromName || process.env.SES_FROM_NAME || 'TeleTime POS',
      ...config,
    };

    // Initialize SES client
    this.sesClient = new SESClient({
      region: process.env.AWS_REGION || 'ca-central-1',
      credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      } : undefined,
      requestHandler: {
        requestTimeout: 15_000, // 15 second timeout for batch SES calls
      },
    });

    // Processing state
    this.isProcessing = false;
    this.currentBatchId = null;
  }

  // ============================================================================
  // UNSENT RECEIPTS QUERIES
  // ============================================================================

  /**
   * Get unsent receipts for a shift
   * @param {number} shiftId - Shift ID
   * @returns {Promise<Array>} Unsent receipts
   */
  async getUnsentReceiptsForShift(shiftId) {
    const result = await this.pool.query(
      'SELECT * FROM get_unsent_shift_receipts($1)',
      [shiftId]
    );
    return result.rows;
  }

  /**
   * Get unsent receipts for a date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Unsent receipts
   */
  async getUnsentReceiptsByDateRange(startDate, endDate) {
    const result = await this.pool.query(
      'SELECT * FROM get_unsent_receipts_by_date($1, $2)',
      [startDate, endDate]
    );
    return result.rows;
  }

  /**
   * Get unsent receipts for specific transactions
   * @param {Array<number>} transactionIds - Transaction IDs
   * @returns {Promise<Array>} Unsent receipts
   */
  async getUnsentReceiptsForTransactions(transactionIds) {
    if (!transactionIds || transactionIds.length === 0) return [];

    const result = await this.pool.query(
      `SELECT
        t.transaction_id,
        t.transaction_number,
        c.email AS customer_email,
        c.name AS customer_name,
        t.total_amount,
        t.created_at
      FROM transactions t
      JOIN customers c ON t.customer_id = c.customer_id
      WHERE t.transaction_id = ANY($1)
        AND t.status = 'completed'
        AND c.email IS NOT NULL
        AND c.email != ''
        AND NOT EXISTS (
          SELECT 1 FROM receipt_email_tracking ret
          WHERE ret.transaction_id = t.transaction_id
        )
      ORDER BY t.created_at`,
      [transactionIds]
    );
    return result.rows;
  }

  // ============================================================================
  // BATCH CREATION
  // ============================================================================

  /**
   * Create a batch for shift receipts
   * @param {number} shiftId - Shift ID
   * @param {number} userId - User creating the batch
   * @returns {Promise<object>} Created batch with queued items
   */
  async createShiftReceiptBatch(shiftId, userId) {
    const unsent = await this.getUnsentReceiptsForShift(shiftId);

    if (unsent.length === 0) {
      return { batch: null, message: 'No unsent receipts found for this shift' };
    }

    // Enforce max batch size
    const toQueue = unsent.slice(0, this.config.maxBatchSize);
    const skipped = unsent.length - toQueue.length;

    return this._createBatchWithItems(toQueue, {
      batchType: 'shift_receipts',
      shiftId,
      userId,
      skipped,
    });
  }

  /**
   * Create a batch from manual selection
   * @param {Array<number>} transactionIds - Transaction IDs to email
   * @param {number} userId - User creating the batch
   * @returns {Promise<object>} Created batch with queued items
   */
  async createManualBatch(transactionIds, userId) {
    if (!transactionIds || transactionIds.length === 0) {
      throw new Error('No transaction IDs provided');
    }

    if (transactionIds.length > this.config.maxBatchSize) {
      throw new Error(`Maximum batch size is ${this.config.maxBatchSize} emails`);
    }

    const unsent = await this.getUnsentReceiptsForTransactions(transactionIds);

    if (unsent.length === 0) {
      return { batch: null, message: 'All selected transactions have already been emailed' };
    }

    return this._createBatchWithItems(unsent, {
      batchType: 'manual_selection',
      userId,
    });
  }

  /**
   * Create a retry batch for failed emails
   * @param {number} originalBatchId - Original batch to retry (optional)
   * @param {number} userId - User creating the retry batch
   * @returns {Promise<object>} Created batch with queued items
   */
  async createRetryBatch(originalBatchId, userId) {
    let failedQuery;
    let params;

    if (originalBatchId) {
      failedQuery = `
        SELECT eq.*, t.transaction_number, c.name as customer_name
        FROM email_queue eq
        JOIN transactions t ON eq.transaction_id = t.transaction_id
        LEFT JOIN customers c ON t.customer_id = c.customer_id
        WHERE eq.batch_id = $1
          AND eq.status = 'failed'
          AND eq.retry_count < eq.max_retries
        ORDER BY eq.queued_at
        LIMIT $2
      `;
      params = [originalBatchId, this.config.maxBatchSize];
    } else {
      // Retry all failed emails that haven't exceeded max retries
      failedQuery = `
        SELECT eq.*, t.transaction_number, c.name as customer_name
        FROM email_queue eq
        JOIN transactions t ON eq.transaction_id = t.transaction_id
        LEFT JOIN customers c ON t.customer_id = c.customer_id
        WHERE eq.status = 'failed'
          AND eq.retry_count < eq.max_retries
          AND (eq.next_retry_at IS NULL OR eq.next_retry_at <= NOW())
        ORDER BY eq.queued_at
        LIMIT $1
      `;
      params = [this.config.maxBatchSize];
    }

    const result = await this.pool.query(failedQuery, params);

    if (result.rows.length === 0) {
      return { batch: null, message: 'No failed emails eligible for retry' };
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create new batch
      const batchResult = await client.query(
        `INSERT INTO email_batches (batch_type, created_by, total_count, status, notes)
         VALUES ('retry_failed', $1, $2, 'pending', $3)
         RETURNING *`,
        [userId, result.rows.length, originalBatchId ? `Retry of batch ${originalBatchId}` : 'Retry all failed']
      );
      const batch = batchResult.rows[0];

      // Update existing queue items to point to new batch and reset status
      const queueIds = result.rows.map(r => r.id);
      await client.query(
        `UPDATE email_queue
         SET batch_id = $1,
             status = 'pending',
             retry_count = retry_count + 1,
             error_message = NULL,
             next_retry_at = NULL
         WHERE id = ANY($2)`,
        [batch.id, queueIds]
      );

      await client.query('COMMIT');

      return {
        batch,
        queuedCount: result.rows.length,
        items: result.rows,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Internal: Create batch and queue items
   */
  async _createBatchWithItems(items, options) {
    const { batchType, shiftId, userId, skipped = 0 } = options;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Create batch
      const batchResult = await client.query(
        `INSERT INTO email_batches (batch_type, created_by, shift_id, total_count, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING *`,
        [batchType, userId, shiftId || null, items.length]
      );
      const batch = batchResult.rows[0];

      // Queue individual emails
      const queuedItems = [];
      for (const item of items) {
        const queueResult = await client.query(
          `INSERT INTO email_queue (
            batch_id, transaction_id, email_type, recipient_email, recipient_name,
            subject, status, created_by, max_retries
          ) VALUES ($1, $2, 'receipt', $3, $4, $5, 'pending', $6, $7)
          RETURNING *`,
          [
            batch.id,
            item.transaction_id,
            item.customer_email,
            item.customer_name,
            `Your Receipt from TeleTime - ${item.transaction_number}`,
            userId,
            this.config.maxRetries,
          ]
        );
        queuedItems.push(queueResult.rows[0]);
      }

      await client.query('COMMIT');

      return {
        batch,
        queuedCount: queuedItems.length,
        skippedCount: skipped,
        items: queuedItems,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // BATCH PROCESSING
  // ============================================================================

  /**
   * Process a batch (send queued emails)
   * @param {number} batchId - Batch ID to process
   * @param {object} options - Processing options
   * @returns {Promise<object>} Processing result
   */
  async processBatch(batchId, options = {}) {
    const { receiptService } = options;

    if (this.isProcessing) {
      throw new Error('Another batch is currently being processed');
    }

    // Get batch
    const batchResult = await this.pool.query(
      'SELECT * FROM email_batches WHERE id = $1',
      [batchId]
    );

    if (batchResult.rows.length === 0) {
      throw new Error('Batch not found');
    }

    const batch = batchResult.rows[0];

    if (batch.status === 'completed') {
      throw new Error('Batch has already been processed');
    }

    if (batch.status === 'cancelled') {
      throw new Error('Batch has been cancelled');
    }

    this.isProcessing = true;
    this.currentBatchId = batchId;

    try {
      // Update batch status
      await this.pool.query(
        `UPDATE email_batches SET status = 'processing', started_at = NOW() WHERE id = $1`,
        [batchId]
      );

      // Get pending queue items
      const queueResult = await this.pool.query(
        `SELECT eq.*, t.transaction_number
         FROM email_queue eq
         JOIN transactions t ON eq.transaction_id = t.transaction_id
         WHERE eq.batch_id = $1 AND eq.status = 'pending'
         ORDER BY eq.priority ASC, eq.queued_at ASC`,
        [batchId]
      );

      const results = {
        sent: 0,
        failed: 0,
        skipped: 0,
        errors: [],
      };

      // Process each email with throttling
      for (const item of queueResult.rows) {
        // Check if batch was cancelled
        if (!this.isProcessing) {
          break;
        }

        try {
          // Mark as processing
          await this.pool.query(
            `UPDATE email_queue SET status = 'processing', processing_started_at = NOW() WHERE id = $1`,
            [item.id]
          );

          // Send the email
          const sendResult = await this._sendReceiptEmail(item, receiptService);

          if (sendResult.success) {
            // Mark as sent
            await this.pool.query(
              `UPDATE email_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
              [item.id]
            );

            // Track that this receipt was emailed
            await this.pool.query(
              `INSERT INTO receipt_email_tracking (transaction_id, email, queue_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (transaction_id, email) DO NOTHING`,
              [item.transaction_id, item.recipient_email, item.id]
            );

            // Log success
            await this._logSendAttempt(item.id, batchId, item.retry_count + 1, 'sent', sendResult);

            results.sent++;
          } else {
            throw new Error(sendResult.error || 'Unknown send error');
          }
        } catch (error) {
          console.error(`[BatchEmailService] Failed to send email ${item.id}:`, error.message);

          // Calculate next retry time
          const nextRetry = new Date();
          nextRetry.setMinutes(nextRetry.getMinutes() + this.config.retryDelayMinutes * (item.retry_count + 1));

          // Mark as failed
          await this.pool.query(
            `UPDATE email_queue
             SET status = 'failed',
                 error_message = $1,
                 next_retry_at = $2
             WHERE id = $3`,
            [error.message, nextRetry, item.id]
          );

          // Log failure
          await this._logSendAttempt(item.id, batchId, item.retry_count + 1, 'failed', {
            error: error.message,
          });

          results.failed++;
          results.errors.push({
            queueId: item.id,
            transactionNumber: item.transaction_number,
            email: item.recipient_email,
            error: error.message,
          });
        }

        // Throttle: wait before next send
        if (this.config.sendDelayMs > 0) {
          await this._delay(this.config.sendDelayMs);
        }
      }

      // Update batch counters and status
      await this.pool.query('SELECT update_batch_counters($1)', [batchId]);
      await this.pool.query(
        `UPDATE email_batches SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [batchId]
      );

      return results;
    } finally {
      this.isProcessing = false;
      this.currentBatchId = null;
    }
  }

  /**
   * Cancel a processing batch
   * @param {number} batchId - Batch ID to cancel
   */
  async cancelBatch(batchId) {
    if (this.currentBatchId === batchId) {
      this.isProcessing = false;
    }

    await this.pool.query(
      `UPDATE email_batches SET status = 'cancelled' WHERE id = $1 AND status IN ('pending', 'processing')`,
      [batchId]
    );

    await this.pool.query(
      `UPDATE email_queue SET status = 'cancelled' WHERE batch_id = $1 AND status = 'pending'`,
      [batchId]
    );
  }

  /**
   * Send a single receipt email
   */
  async _sendReceiptEmail(queueItem, receiptService) {
    // If we have a receipt service, use it to generate and send
    if (receiptService) {
      try {
        await receiptService.emailReceipt(queueItem.transaction_id, queueItem.recipient_email);
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    // Fallback: Send basic email via SES
    try {
      const command = new SendEmailCommand({
        Source: `${this.config.fromName} <${this.config.fromEmail}>`,
        Destination: {
          ToAddresses: [queueItem.recipient_email],
        },
        Message: {
          Subject: {
            Data: queueItem.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Text: {
              Data: `Thank you for your purchase!\n\nTransaction: ${queueItem.transaction_number}\n\nPlease visit our store or contact us for a detailed receipt.`,
              Charset: 'UTF-8',
            },
          },
        },
      });

      const response = await this.sesClient.send(command);

      return {
        success: true,
        messageId: response.MessageId,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.Code,
      };
    }
  }

  /**
   * Log send attempt
   */
  async _logSendAttempt(queueId, batchId, attemptNumber, status, data = {}) {
    await this.pool.query(
      `INSERT INTO email_send_log (queue_id, batch_id, attempt_number, status, provider_message_id, error_code, error_message, response_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        queueId,
        batchId,
        attemptNumber,
        status,
        data.messageId || null,
        data.code || null,
        data.error || null,
        data.responseData ? JSON.stringify(data.responseData) : null,
      ]
    );
  }

  // ============================================================================
  // STATUS & QUERIES
  // ============================================================================

  /**
   * Get batch status with details
   * @param {number} batchId - Batch ID
   * @returns {Promise<object>} Batch status
   */
  async getBatchStatus(batchId) {
    const batchResult = await this.pool.query(
      `SELECT eb.*,
        u.first_name || ' ' || u.last_name as created_by_name
       FROM email_batches eb
       LEFT JOIN users u ON eb.created_by = u.user_id
       WHERE eb.id = $1`,
      [batchId]
    );

    if (batchResult.rows.length === 0) {
      return null;
    }

    const batch = batchResult.rows[0];

    // Get queue items summary
    const queueResult = await this.pool.query(
      `SELECT
        status,
        COUNT(*) as count
       FROM email_queue
       WHERE batch_id = $1
       GROUP BY status`,
      [batchId]
    );

    const statusBreakdown = {};
    queueResult.rows.forEach(row => {
      statusBreakdown[row.status] = parseInt(row.count, 10);
    });

    // Get failed items
    const failedResult = await this.pool.query(
      `SELECT eq.id, eq.recipient_email, eq.error_message, eq.retry_count,
              t.transaction_number
       FROM email_queue eq
       JOIN transactions t ON eq.transaction_id = t.transaction_id
       WHERE eq.batch_id = $1 AND eq.status = 'failed'
       ORDER BY eq.queued_at`,
      [batchId]
    );

    return {
      ...batch,
      statusBreakdown,
      failedItems: failedResult.rows,
      progress: batch.total_count > 0
        ? Math.round(((batch.sent_count + batch.failed_count + batch.skipped_count) / batch.total_count) * 100)
        : 0,
    };
  }

  /**
   * Get recent batches
   * @param {object} options - Query options
   * @returns {Promise<Array>} Recent batches
   */
  async getRecentBatches(options = {}) {
    const { limit = 20, status } = options;

    let query = `
      SELECT eb.*,
        u.first_name || ' ' || u.last_name as created_by_name
      FROM email_batches eb
      LEFT JOIN users u ON eb.created_by = u.user_id
    `;

    const params = [];
    if (status) {
      query += ' WHERE eb.status = $1';
      params.push(status);
    }

    query += ' ORDER BY eb.created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get queue items for a batch
   * @param {number} batchId - Batch ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} Queue items
   */
  async getBatchQueueItems(batchId, options = {}) {
    const { status, limit = 100 } = options;

    let query = `
      SELECT eq.*, t.transaction_number, c.name as customer_name
      FROM email_queue eq
      JOIN transactions t ON eq.transaction_id = t.transaction_id
      LEFT JOIN customers c ON t.customer_id = c.customer_id
      WHERE eq.batch_id = $1
    `;

    const params = [batchId];
    if (status) {
      query += ' AND eq.status = $2';
      params.push(status);
    }

    query += ' ORDER BY eq.queued_at LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Check if a transaction receipt has been emailed
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<boolean>}
   */
  async hasReceiptBeenEmailed(transactionId) {
    const result = await this.pool.query(
      'SELECT 1 FROM receipt_email_tracking WHERE transaction_id = $1 LIMIT 1',
      [transactionId]
    );
    return result.rows.length > 0;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BatchEmailService;
