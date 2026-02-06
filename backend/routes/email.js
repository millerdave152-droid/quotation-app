/**
 * Email Routes for TeleTime POS
 * Handles email notifications including receipts
 */

const express = require('express');
const router = express.Router();
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const Joi = require('joi');
const { authenticate } = require('../middleware/auth');

// Apply authentication to all email routes
router.use(authenticate);

// Initialize SES client
const sesClient = new SESv2Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const fromEmail = process.env.EMAIL_FROM || 'noreply@teletime.ca';

// Validation schemas
const receiptEmailSchema = Joi.object({
  to: Joi.string().email().required(),
  subject: Joi.string().max(200).required(),
  html: Joi.string().required(),
  transactionId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
});

/**
 * POST /api/email/receipt
 * Send a receipt email to customer
 */
router.post('/receipt', async (req, res) => {
  try {
    // Validate input
    const { error, value } = receiptEmailSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message,
      });
    }

    const { to, subject, transactionId } = value;
    // Sanitize HTML: strip script tags, iframes, event handlers
    const html = value.html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/\s*on\w+\s*=\s*(['"])[^'"]*\1/gi, '');

    // Generate plain text version
    const textBody = html
      .replace(/<style[^>]*>.*?<\/style>/gs, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Send email via SES
    const command = new SendEmailCommand({
      FromEmailAddress: fromEmail,
      Destination: {
        ToAddresses: [to],
      },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: {
            Html: { Data: html },
            Text: { Data: textBody },
          },
        },
      },
    });

    await sesClient.send(command);

    // Log to database if pool is available
    if (req.app.locals.pool) {
      try {
        await req.app.locals.pool.query(`
          INSERT INTO email_log (
            email_type, recipient_email, subject, transaction_id, status, sent_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, ['receipt', to, subject, transactionId || null, 'sent']);
      } catch (logError) {
        console.warn('[Email] Failed to log email:', logError.message);
      }
    }

    res.json({
      success: true,
      message: 'Receipt email sent successfully',
    });
  } catch (err) {
    console.error('[Email] Send receipt error:', err);

    // Log failed attempt
    if (req.app.locals.pool) {
      try {
        await req.app.locals.pool.query(`
          INSERT INTO email_log (
            email_type, recipient_email, subject, transaction_id, status, error_message, sent_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, ['receipt', req.body.to, req.body.subject, req.body.transactionId || null, 'failed', err.message]);
      } catch (logError) {
        // Ignore logging errors
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to send email',
    });
  }
});

/**
 * POST /api/email/test
 * Send a test email (development only)
 */
router.post('/test', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Test endpoint not available in production',
    });
  }

  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Recipient email required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    const command = new SendEmailCommand({
      FromEmailAddress: fromEmail,
      Destination: {
        ToAddresses: [to],
      },
      Content: {
        Simple: {
          Subject: { Data: 'TeleTime POS - Test Email' },
          Body: {
            Html: {
              Data: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                  <h1>Test Email</h1>
                  <p>This is a test email from TeleTime POS.</p>
                  <p>If you received this, email is configured correctly!</p>
                  <p>Sent at: ${new Date().toISOString()}</p>
                </div>
              `,
            },
            Text: { Data: 'This is a test email from TeleTime POS.' },
          },
        },
      },
    });

    await sesClient.send(command);

    res.json({
      success: true,
      message: 'Test email sent',
    });
  } catch (err) {
    console.error('[Email] Test email error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
