/**
 * Counter-Offer Routes
 * API endpoints for quote negotiation
 */

const express = require('express');
const router = express.Router();
const CounterOfferService = require('../services/CounterOfferService');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { SendEmailCommand } = require('@aws-sdk/client-ses');

// Initialize service
const counterOfferService = new CounterOfferService(db);

// Get SES client from server (will be set when routes are mounted)
let sesClient = null;
router.setSesClient = (client) => {
  sesClient = client;
};

/**
 * @route   POST /api/quotes/:id/counter-offers
 * @desc    Submit a counter-offer (salesperson or supervisor)
 * @access  Private
 */
router.post('/quotes/:id/counter-offers', authenticate, asyncHandler(async (req, res) => {
  const quotationId = parseInt(req.params.id);
  const { counterOfferTotalCents, message } = req.body;

  if (!counterOfferTotalCents || counterOfferTotalCents <= 0) {
    throw ApiError.badRequest('Counter-offer amount is required');
  }

  const submittedByType = ['admin', 'manager', 'supervisor'].includes(req.user.role?.toLowerCase())
    ? 'supervisor'
    : 'salesperson';

  const counterOffer = await counterOfferService.createCounterOffer({
    quotationId,
    submittedByType,
    submittedByUserId: req.user.id,
    submittedByName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
    submittedByEmail: req.user.email,
    counterOfferTotalCents,
    message
  });

  // Send email notification if supervisor submitted (customer needs to respond)
  if (submittedByType === 'supervisor' && counterOffer.access_url && sesClient) {
    try {
      await sendCounterOfferEmail(counterOffer, 'customer');
    } catch (emailErr) {
      console.error('Failed to send counter-offer email:', emailErr);
    }
  }

  res.status(201).json({
    success: true,
    message: 'Counter-offer submitted',
    data: { counterOffer }
  });
}));

/**
 * @route   GET /api/quotes/:id/counter-offers
 * @desc    Get negotiation history for a quote
 * @access  Private
 */
router.get('/quotes/:id/counter-offers', authenticate, asyncHandler(async (req, res) => {
  const quotationId = parseInt(req.params.id);
  const counterOffers = await counterOfferService.getCounterOffersForQuote(quotationId);

  res.json({
    success: true,
    data: { counterOffers }
  });
}));

/**
 * @route   POST /api/counter-offers/:id/accept
 * @desc    Accept a counter-offer
 * @access  Private (supervisor/admin)
 */
router.post('/counter-offers/:id/accept', authenticate, requireRole('admin', 'manager', 'supervisor'), asyncHandler(async (req, res) => {
  const counterOfferId = parseInt(req.params.id);
  const { message } = req.body;

  const result = await counterOfferService.acceptCounterOffer(
    counterOfferId,
    {
      id: req.user.id,
      name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email
    },
    message
  );

  res.json({
    success: true,
    message: 'Counter-offer accepted',
    data: result
  });
}));

/**
 * @route   POST /api/counter-offers/:id/reject
 * @desc    Reject a counter-offer
 * @access  Private (supervisor/admin)
 */
router.post('/counter-offers/:id/reject', authenticate, requireRole('admin', 'manager', 'supervisor'), asyncHandler(async (req, res) => {
  const counterOfferId = parseInt(req.params.id);
  const { message } = req.body;

  if (!message) {
    throw ApiError.badRequest('Rejection reason is required');
  }

  const result = await counterOfferService.rejectCounterOffer(
    counterOfferId,
    {
      id: req.user.id,
      name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email
    },
    message
  );

  res.json({
    success: true,
    message: 'Counter-offer rejected',
    data: result
  });
}));

/**
 * @route   POST /api/counter-offers/:id/counter
 * @desc    Supervisor sends counter-proposal
 * @access  Private (supervisor/admin)
 */
router.post('/counter-offers/:id/counter', authenticate, requireRole('admin', 'manager', 'supervisor'), asyncHandler(async (req, res) => {
  const counterOfferId = parseInt(req.params.id);
  const { newOfferTotalCents, message } = req.body;

  if (!newOfferTotalCents || newOfferTotalCents <= 0) {
    throw ApiError.badRequest('Counter-offer amount is required');
  }

  const result = await counterOfferService.sendSupervisorCounter(
    counterOfferId,
    {
      id: req.user.id,
      name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
      email: req.user.email
    },
    newOfferTotalCents,
    message
  );

  // Send email to customer with magic link
  if (result.success && sesClient) {
    try {
      await sendCounterOfferEmail(result.counterOffer, 'customer');
    } catch (emailErr) {
      console.error('Failed to send counter-offer email:', emailErr);
    }
  }

  res.json({
    success: true,
    message: 'Counter-offer sent to customer',
    data: result
  });
}));

/**
 * @route   GET /api/counter-offers/magic/:token
 * @desc    Validate magic link and get counter-offer details
 * @access  Public
 */
router.get('/counter-offers/magic/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const offer = await counterOfferService.getCounterOfferByToken(token);

  if (!offer) {
    throw ApiError.notFound('Invalid or expired link');
  }

  // Get quote items for display
  const items = await db.query(
    'SELECT * FROM quotation_items WHERE quotation_id = $1',
    [offer.quotation_id]
  );

  res.json({
    success: true,
    data: {
      counterOffer: offer,
      quoteItems: items.rows
    }
  });
}));

/**
 * @route   POST /api/counter-offers/magic/:token
 * @desc    Customer responds via magic link
 * @access  Public
 */
router.post('/counter-offers/magic/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { action, name, email, newOfferCents, message } = req.body;

  if (!action || !['accept', 'counter'].includes(action)) {
    throw ApiError.badRequest('Invalid action. Must be "accept" or "counter"');
  }

  if (action === 'counter' && (!newOfferCents || newOfferCents <= 0)) {
    throw ApiError.badRequest('Counter-offer amount is required');
  }

  const result = await counterOfferService.customerResponse(
    token,
    action,
    { name, email },
    newOfferCents,
    message
  );

  // Notify supervisor about customer's response
  if (sesClient && result.counterOffer?.submitted_by_email) {
    try {
      await sendSupervisorNotificationEmail(result.counterOffer, action, name, newOfferCents);
    } catch (emailErr) {
      console.error('Failed to send supervisor notification email:', emailErr);
    }
  }

  res.json({
    success: true,
    message: action === 'accept' ? 'Offer accepted!' : 'Counter-offer submitted',
    data: result
  });
}));

/**
 * @route   GET /api/counter-offers/pending
 * @desc    Get all pending counter-offers for supervisors
 * @access  Private (supervisor/admin)
 */
router.get('/counter-offers/pending', authenticate, requireRole('admin', 'manager', 'supervisor'), asyncHandler(async (req, res) => {
  const pendingOffers = await counterOfferService.getPendingCounterOffers(req.user.id);

  res.json({
    success: true,
    data: { counterOffers: pendingOffers }
  });
}));

/**
 * @route   POST /api/quotes/:id/portal-link
 * @desc    Generate customer portal link
 * @access  Private
 */
router.post('/quotes/:id/portal-link', authenticate, asyncHandler(async (req, res) => {
  const quotationId = parseInt(req.params.id);
  const portalUrl = await counterOfferService.generateCustomerPortalLink(quotationId);

  res.json({
    success: true,
    data: { portalUrl }
  });
}));

/**
 * @route   GET /api/quote/view/:token
 * @desc    Public quote view via portal token
 * @access  Public
 */
router.get('/quote/view/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const quote = await counterOfferService.getQuoteByPortalToken(token);

  if (!quote) {
    throw ApiError.notFound('Quote not found or link expired');
  }

  res.json({
    success: true,
    data: { quote }
  });
}));

/**
 * Helper function to send counter-offer email
 */
async function sendCounterOfferEmail(counterOffer, recipientType) {
  if (!sesClient) {
    console.warn('SES client not configured, skipping email');
    return;
  }

  // Get quote and customer details
  const quoteResult = await db.query(`
    SELECT q.*, c.name as customer_name, c.email as customer_email
    FROM quotations q
    LEFT JOIN customers c ON q.customer_id = c.id
    WHERE q.id = $1
  `, [counterOffer.quotation_id]);

  if (quoteResult.rows.length === 0) return;

  const quote = quoteResult.rows[0];
  const recipientEmail = recipientType === 'customer' ? quote.customer_email : counterOffer.submitted_by_email;

  if (!recipientEmail) {
    console.warn('No recipient email for counter-offer notification');
    return;
  }

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const magicLinkUrl = `${baseUrl}/quote/counter/${counterOffer.access_token}`;

  const emailHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; border-radius: 12px; text-align: center; }
        .content { background: #f9fafb; padding: 24px; border-radius: 12px; margin-top: 20px; }
        .offer-box { background: white; padding: 20px; border-radius: 8px; border: 2px solid #667eea; text-align: center; margin: 20px 0; }
        .offer-amount { font-size: 32px; font-weight: bold; color: #667eea; }
        .button { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 8px; }
        .button-outline { background: white; color: #667eea; border: 2px solid #667eea; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">Counter-Offer Received</h2>
          <p style="margin: 8px 0 0 0;">Quote ${quote.quote_number}</p>
        </div>

        <div class="content">
          <p>Hello ${quote.customer_name || 'Valued Customer'},</p>

          <p>We've reviewed your request and have a counter-offer for you:</p>

          <div class="offer-box">
            <div style="color: #6b7280; margin-bottom: 8px;">Our Offer</div>
            <div class="offer-amount">$${(counterOffer.counter_offer_total_cents / 100).toFixed(2)} CAD</div>
            ${counterOffer.message ? `<div style="margin-top: 12px; color: #374151;">"${counterOffer.message}"</div>` : ''}
          </div>

          <p style="text-align: center;">
            <a href="${magicLinkUrl}" class="button">View & Respond</a>
          </p>

          <p style="color: #6b7280; font-size: 14px; text-align: center;">
            This link is valid for 7 days.
          </p>
        </div>

        <div class="footer">
          <p>This is an automated notification from the Quotation Management System</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const command = new SendEmailCommand({
      Source: process.env.EMAIL_FROM,
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: { Data: `Counter-Offer for Quote ${quote.quote_number}` },
        Body: { Html: { Data: emailHTML } }
      }
    });
    await sesClient.send(command);
  } catch (err) {
    console.error('Error sending counter-offer email:', err);
    throw err;
  }
}

/**
 * Helper function to send notification to supervisor when customer responds
 */
async function sendSupervisorNotificationEmail(counterOffer, action, customerName, newOfferCents) {
  if (!sesClient) {
    return;
  }

  const supervisorEmail = counterOffer.submitted_by_email;
  if (!supervisorEmail) return;

  const quoteResult = await db.query(`
    SELECT quote_number FROM quotations WHERE id = $1
  `, [counterOffer.quotation_id]);

  const quoteNumber = quoteResult.rows[0]?.quote_number || counterOffer.quotation_id;
  const actionText = action === 'accept' ? 'ACCEPTED' : 'submitted a counter-offer';
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  const emailHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${action === 'accept' ? '#10b981' : '#f59e0b'}; color: white; padding: 24px; border-radius: 12px; text-align: center; }
        .content { background: #f9fafb; padding: 24px; border-radius: 12px; margin-top: 20px; }
        .offer-box { background: white; padding: 20px; border-radius: 8px; border: 2px solid #667eea; text-align: center; margin: 20px 0; }
        .offer-amount { font-size: 28px; font-weight: bold; color: #667eea; }
        .button { display: inline-block; padding: 14px 28px; background: #667eea; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin: 0;">Customer ${action === 'accept' ? 'Accepted' : 'Counter-Offered'}</h2>
          <p style="margin: 8px 0 0 0;">Quote ${quoteNumber}</p>
        </div>

        <div class="content">
          <p><strong>${customerName || 'Customer'}</strong> has ${actionText} on Quote ${quoteNumber}.</p>

          ${action === 'counter' && newOfferCents ? `
          <div class="offer-box">
            <div style="color: #6b7280; margin-bottom: 8px;">Customer's Counter-Offer</div>
            <div class="offer-amount">$${(newOfferCents / 100).toFixed(2)} CAD</div>
          </div>
          ` : ''}

          ${action === 'accept' ? `
          <p style="color: #10b981; font-weight: bold;">The customer has accepted your offer. Please proceed with order processing.</p>
          ` : `
          <p>Please review and respond to the customer's counter-offer.</p>
          `}

          <p style="text-align: center; margin-top: 20px;">
            <a href="${baseUrl}/quotes/${counterOffer.quotation_id}" class="button">View Quote</a>
          </p>
        </div>

        <div class="footer">
          <p>Quotation Management System - Counter-Offer Notification</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const command = new SendEmailCommand({
    Source: process.env.EMAIL_FROM,
    Destination: { ToAddresses: [supervisorEmail] },
    Message: {
      Subject: { Data: `Customer ${action === 'accept' ? 'Accepted' : 'Counter-Offered'} - Quote ${quoteNumber}` },
      Body: { Html: { Data: emailHTML } }
    }
  });
  await sesClient.send(command);
}

module.exports = router;
