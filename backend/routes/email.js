/**
 * Email Routes for TeleTime POS
 * Handles email notifications including receipts
 */

const express = require('express');
const router = express.Router();
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const Joi = require('joi');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

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
router.post('/receipt', asyncHandler(async (req, res) => {
  // Validate input
  const { error, value } = receiptEmailSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
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

  try {
    await sesClient.send(command);
  } catch (sendErr) {
    // Log failed attempt
    if (req.app.locals.pool) {
      try {
        await req.app.locals.pool.query(`
          INSERT INTO email_log (
            email_type, recipient_email, subject, transaction_id, status, error_message, sent_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, ['receipt', to, subject, transactionId || null, 'failed', sendErr.message]);
      } catch (logError) {
        // Ignore logging errors
      }
    }
    throw sendErr;
  }

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
}));

/**
 * POST /api/email/test
 * Send a test email (development only)
 */
router.post('/test', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    throw ApiError.forbidden('Test endpoint not available in production');
  }

  const { to } = req.body;
  if (!to) {
    throw ApiError.badRequest('Recipient email required');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    throw ApiError.badRequest('Invalid email format');
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
}));

module.exports = router;
