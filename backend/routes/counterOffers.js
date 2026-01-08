/**
 * Counter-Offer Routes
 * API endpoints for quote negotiation
 */

const express = require('express');
const router = express.Router();
const CounterOfferService = require('../services/CounterOfferService');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
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
router.post('/quotes/:id/counter-offers', authenticate, async (req, res) => {
  try {
    const quotationId = parseInt(req.params.id);
    const { counterOfferTotalCents, message } = req.body;

    if (!counterOfferTotalCents || counterOfferTotalCents <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Counter-offer amount is required'
      });
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

  } catch (error) {
    console.error('Error creating counter-offer:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create counter-offer'
    });
  }
});

/**
 * @route   GET /api/quotes/:id/counter-offers
 * @desc    Get negotiation history for a quote
 * @access  Private
 */
router.get('/quotes/:id/counter-offers', authenticate, async (req, res) => {
  try {
    const quotationId = parseInt(req.params.id);
    const counterOffers = await counterOfferService.getCounterOffersForQuote(quotationId);

    res.json({
      success: true,
      data: { counterOffers }
    });

  } catch (error) {
    console.error('Error fetching counter-offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch counter-offers'
    });
  }
});

/**
 * @route   POST /api/counter-offers/:id/accept
 * @desc    Accept a counter-offer
 * @access  Private (supervisor/admin)
 */
router.post('/counter-offers/:id/accept', authenticate, requireRole('admin', 'manager', 'supervisor'), async (req, res) => {
  try {
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

  } catch (error) {
    console.error('Error accepting counter-offer:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to accept counter-offer'
    });
  }
});

/**
 * @route   POST /api/counter-offers/:id/reject
 * @desc    Reject a counter-offer
 * @access  Private (supervisor/admin)
 */
router.post('/counter-offers/:id/reject', authenticate, requireRole('admin', 'manager', 'supervisor'), async (req, res) => {
  try {
    const counterOfferId = parseInt(req.params.id);
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
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

  } catch (error) {
    console.error('Error rejecting counter-offer:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to reject counter-offer'
    });
  }
});

/**
 * @route   POST /api/counter-offers/:id/counter
 * @desc    Supervisor sends counter-proposal
 * @access  Private (supervisor/admin)
 */
router.post('/counter-offers/:id/counter', authenticate, requireRole('admin', 'manager', 'supervisor'), async (req, res) => {
  try {
    const counterOfferId = parseInt(req.params.id);
    const { newOfferTotalCents, message } = req.body;

    if (!newOfferTotalCents || newOfferTotalCents <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Counter-offer amount is required'
      });
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

  } catch (error) {
    console.error('Error sending supervisor counter:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send counter-offer'
    });
  }
});

/**
 * @route   GET /api/counter-offers/magic/:token
 * @desc    Validate magic link and get counter-offer details
 * @access  Public
 */
router.get('/counter-offers/magic/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const offer = await counterOfferService.getCounterOfferByToken(token);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired link'
      });
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

  } catch (error) {
    console.error('Error validating magic link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate link'
    });
  }
});

/**
 * @route   POST /api/counter-offers/magic/:token
 * @desc    Customer responds via magic link
 * @access  Public
 */
router.post('/counter-offers/magic/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { action, name, email, newOfferCents, message } = req.body;

    if (!action || !['accept', 'counter'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "accept" or "counter"'
      });
    }

    if (action === 'counter' && (!newOfferCents || newOfferCents <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Counter-offer amount is required'
      });
    }

    const result = await counterOfferService.customerResponse(
      token,
      action,
      { name, email },
      newOfferCents,
      message
    );

    // Notify supervisor about customer's response
    if (sesClient) {
      try {
        // TODO: Send email to supervisor
      } catch (emailErr) {
        console.error('Failed to send notification email:', emailErr);
      }
    }

    res.json({
      success: true,
      message: action === 'accept' ? 'Offer accepted!' : 'Counter-offer submitted',
      data: result
    });

  } catch (error) {
    console.error('Error processing customer response:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process response'
    });
  }
});

/**
 * @route   GET /api/counter-offers/pending
 * @desc    Get all pending counter-offers for supervisors
 * @access  Private (supervisor/admin)
 */
router.get('/counter-offers/pending', authenticate, requireRole('admin', 'manager', 'supervisor'), async (req, res) => {
  try {
    const pendingOffers = await counterOfferService.getPendingCounterOffers(req.user.id);

    res.json({
      success: true,
      data: { counterOffers: pendingOffers }
    });

  } catch (error) {
    console.error('Error fetching pending counter-offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending counter-offers'
    });
  }
});

/**
 * @route   POST /api/quotes/:id/portal-link
 * @desc    Generate customer portal link
 * @access  Private
 */
router.post('/quotes/:id/portal-link', authenticate, async (req, res) => {
  try {
    const quotationId = parseInt(req.params.id);
    const portalUrl = await counterOfferService.generateCustomerPortalLink(quotationId);

    res.json({
      success: true,
      data: { portalUrl }
    });

  } catch (error) {
    console.error('Error generating portal link:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate portal link'
    });
  }
});

/**
 * @route   GET /api/quote/view/:token
 * @desc    Public quote view via portal token
 * @access  Public
 */
router.get('/quote/view/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const quote = await counterOfferService.getQuoteByPortalToken(token);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'Quote not found or link expired'
      });
    }

    res.json({
      success: true,
      data: { quote }
    });

  } catch (error) {
    console.error('Error fetching quote by portal token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quote'
    });
  }
});

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
    console.log(`Counter-offer email sent to ${recipientEmail}`);
  } catch (err) {
    console.error('Error sending counter-offer email:', err);
    throw err;
  }
}

module.exports = router;
