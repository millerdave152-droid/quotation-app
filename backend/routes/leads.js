/**
 * Lead Routes Module
 * Handles all lead/inquiry capture API endpoints
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const LeadService = require('../services/LeadService');
const { authenticate } = require('../middleware/auth');
const { validateJoi, leadSchemas } = require('../middleware/validation');

// Module-level service instance
let leadService = null;
let cache = null;

/**
 * Initialize the router with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 * @param {object} deps.cache - Cache module
 */
const init = (deps) => {
  cache = deps.cache;
  leadService = new LeadService(deps.pool, deps.cache);
  return router;
};

// ============================================
// LEAD ROUTES
// ============================================

/**
 * GET /api/leads
 * Get all leads with filtering, sorting, and pagination
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const result = await leadService.getLeads(req.query);
  res.json(result);
}));

/**
 * GET /api/leads/stats
 * Get lead statistics for dashboard
 */
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const stats = await cache.cacheQuery('leads:stats', 'short', async () => {
    return leadService.getStats();
  });
  res.success(stats);
}));

/**
 * GET /api/leads/follow-ups
 * Get leads due for follow-up
 */
router.get('/follow-ups', authenticate, asyncHandler(async (req, res) => {
  const { days = 7 } = req.query;
  const leads = await leadService.getFollowUpsDue(parseInt(days));
  res.success(leads);
}));

/**
 * GET /api/leads/:id
 * Get a single lead with full details
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const lead = await leadService.getLeadById(id);

  if (!lead) {
    throw ApiError.notFound('Lead');
  }

  res.success(lead);
}));

/**
 * POST /api/leads
 * Create a new lead
 */
router.post('/', authenticate, validateJoi(leadSchemas.create), asyncHandler(async (req, res) => {
  const lead = await leadService.createLead(req.body, req.user?.id);

  // Invalidate stats cache
  cache.invalidatePattern('leads:stats');

  res.created(lead);
}));

/**
 * PUT /api/leads/:id
 * Update a lead
 */
router.put('/:id', authenticate, validateJoi(leadSchemas.update), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const lead = await leadService.updateLead(id, req.body, req.user?.id);

  if (!lead) {
    throw ApiError.notFound('Lead');
  }

  // Invalidate stats cache
  cache.invalidatePattern('leads:stats');

  res.success(lead);
}));

/**
 * PUT /api/leads/:id/status
 * Update lead status
 */
router.put('/:id/status', authenticate, validateJoi(leadSchemas.status), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, lost_reason } = req.body;

  try {
    const lead = await leadService.updateStatus(id, status, lost_reason, req.user?.id);

    if (!lead) {
      throw ApiError.notFound('Lead');
    }

    // Invalidate stats cache
    cache.invalidatePattern('leads:stats');

    res.success(lead);
  } catch (error) {
    if (error.message.includes('Invalid status transition')) {
      throw ApiError.badRequest(error.message);
    }
    throw error;
  }
}));

/**
 * POST /api/leads/:id/convert-to-quote
 * Convert a lead to a quotation
 */
router.post('/:id/convert-to-quote', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const result = await leadService.convertToQuote(id, req.body, req.user?.id);

    // Invalidate caches
    cache.invalidatePattern('leads:stats');
    cache.invalidatePattern('quotations:');

    res.success(result);
  } catch (error) {
    if (error.message === 'Lead not found') {
      throw ApiError.notFound('Lead');
    }
    if (error.message === 'Lead already converted') {
      throw ApiError.badRequest('Lead has already been converted to a quote');
    }
    throw error;
  }
}));

/**
 * POST /api/leads/:id/activities
 * Add an activity/note to a lead
 */
router.post('/:id/activities', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { activity_type, description, metadata } = req.body;

  if (!activity_type || !description) {
    throw ApiError.validation('Activity type and description are required');
  }

  const activity = await leadService.addActivity(
    id,
    activity_type,
    description,
    metadata,
    req.user?.id
  );

  res.created(activity);
}));

/**
 * DELETE /api/leads/:id
 * Delete a lead
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await leadService.deleteLead(id);

  if (!deleted) {
    throw ApiError.notFound('Lead');
  }

  // Invalidate stats cache
  cache.invalidatePattern('leads:stats');

  res.success(null, { message: 'Lead deleted successfully' });
}));

// ============================================
// AI HELPER ROUTES
// ============================================

/**
 * POST /api/leads/:id/ai/summarize
 * Generate AI summary of requirements
 */
router.post('/:id/ai/summarize', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const lead = await leadService.getLeadById(id);

  if (!lead) {
    throw ApiError.notFound('Lead');
  }

  // Generate summary from requirements notes and structured requirements
  const summary = generateSummary(lead);

  // Save the summary
  await leadService.saveAIContent(id, 'ai_summary', summary);

  res.success({ summary });
}));

/**
 * POST /api/leads/:id/ai/suggest-products
 * Generate AI product suggestions based on requirements
 */
router.post('/:id/ai/suggest-products', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const lead = await leadService.getLeadById(id);

  if (!lead) {
    throw ApiError.notFound('Lead');
  }

  // Generate product suggestions (this would be enhanced with actual AI)
  const LeadAIService = require('../services/LeadAIService');
  const suggestions = await LeadAIService.suggestProducts(lead, leadService.pool);

  // Save the suggestions
  await leadService.saveAIContent(id, 'ai_suggested_products', suggestions);

  res.success({ suggestions });
}));

/**
 * POST /api/leads/:id/ai/draft-followup
 * Generate AI follow-up message draft
 */
router.post('/:id/ai/draft-followup', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tone = 'professional' } = req.body;

  const lead = await leadService.getLeadById(id);

  if (!lead) {
    throw ApiError.notFound('Lead');
  }

  // Generate follow-up draft
  const draft = generateFollowUpDraft(lead, tone);

  // Save the draft
  await leadService.saveAIContent(id, 'ai_draft_message', draft);

  res.success({ draft });
}));

// ============================================
// AI HELPER FUNCTIONS
// ============================================

/**
 * Generate a structured summary from lead data
 */
function generateSummary(lead) {
  const parts = [];

  // Contact info
  parts.push(`Contact: ${lead.contact_name}`);
  if (lead.contact_email) parts.push(`Email: ${lead.contact_email}`);
  if (lead.contact_phone) parts.push(`Phone: ${lead.contact_phone}`);

  // Context
  if (lead.inquiry_reason) {
    const reasons = {
      browsing: 'Browsing/exploring options',
      researching: 'Researching for future purchase',
      moving: 'Moving to new home',
      renovation: 'Kitchen/home renovation',
      replacement: 'Replacing existing appliances',
      upgrade: 'Upgrading current appliances',
      builder_project: 'Builder/contractor project',
      other: 'Other reason'
    };
    parts.push(`Reason: ${reasons[lead.inquiry_reason] || lead.inquiry_reason}`);
  }

  if (lead.timeline) {
    const timelines = {
      asap: 'Needs ASAP',
      '1_2_weeks': 'Within 1-2 weeks',
      '1_3_months': 'Within 1-3 months',
      '3_6_months': 'Within 3-6 months',
      just_researching: 'Just researching (no timeline)'
    };
    parts.push(`Timeline: ${timelines[lead.timeline] || lead.timeline}`);
  }

  // Requirements
  if (lead.requirements && lead.requirements.length > 0) {
    parts.push('\nProduct Requirements:');
    for (const req of lead.requirements) {
      let reqLine = `- ${req.category}`;
      if (req.subcategory) reqLine += ` (${req.subcategory})`;
      if (req.quantity > 1) reqLine += ` x${req.quantity}`;

      if (req.budget_min_cents || req.budget_max_cents) {
        const min = req.budget_min_cents ? `$${(req.budget_min_cents / 100).toFixed(0)}` : '';
        const max = req.budget_max_cents ? `$${(req.budget_max_cents / 100).toFixed(0)}` : '';
        if (min && max) reqLine += ` Budget: ${min}-${max}`;
        else if (max) reqLine += ` Budget: up to ${max}`;
        else if (min) reqLine += ` Budget: ${min}+`;
      }

      if (req.brand_preferences && req.brand_preferences.length > 0) {
        reqLine += ` | Brands: ${req.brand_preferences.join(', ')}`;
      }

      parts.push(reqLine);

      if (req.notes) {
        parts.push(`  Notes: ${req.notes}`);
      }
    }
  }

  // Free-form notes
  if (lead.requirements_notes) {
    parts.push('\nAdditional Notes:');
    parts.push(lead.requirements_notes);
  }

  return parts.join('\n');
}

/**
 * Generate a follow-up message draft
 */
function generateFollowUpDraft(lead, tone = 'professional') {
  const firstName = lead.contact_name.split(' ')[0];

  const greetings = {
    professional: `Dear ${lead.contact_name},`,
    friendly: `Hi ${firstName}!`,
    casual: `Hey ${firstName},`
  };

  const openings = {
    professional: `Thank you for visiting us and discussing your appliance needs.`,
    friendly: `It was great meeting you and learning about what you're looking for!`,
    casual: `Thanks for stopping by - loved chatting about your project!`
  };

  let body = '';

  // Add context based on inquiry reason
  if (lead.inquiry_reason === 'moving') {
    body += ` Congratulations on your upcoming move!`;
  } else if (lead.inquiry_reason === 'renovation') {
    body += ` Your renovation project sounds exciting!`;
  } else if (lead.inquiry_reason === 'builder_project') {
    body += ` We appreciate you considering us for your builder project.`;
  }

  // Mention requirements if any
  if (lead.requirements && lead.requirements.length > 0) {
    const categories = [...new Set(lead.requirements.map(r => r.category))];
    body += ` We've noted your interest in ${categories.join(', ').toLowerCase()}.`;
  }

  // Timeline-based closing
  let closing = '';
  if (lead.timeline === 'asap') {
    closing = `I understand you need these items soon, so I'm ready to help you finalize your selection and arrange delivery at your earliest convenience.`;
  } else if (lead.timeline === '1_2_weeks') {
    closing = `Since you're looking to make a decision within the next couple of weeks, I'd love to schedule a time to go over some options that fit your needs perfectly.`;
  } else if (lead.timeline === 'just_researching') {
    closing = `Take your time researching - I'm here whenever you have questions or want to see any products in person.`;
  } else {
    closing = `Please don't hesitate to reach out if you have any questions or would like to discuss your options further.`;
  }

  const signatures = {
    professional: `\n\nBest regards,\n[Your Name]\nTeletime Electronics`,
    friendly: `\n\nLooking forward to helping you!\n[Your Name]`,
    casual: `\n\nCheers,\n[Your Name]`
  };

  return `${greetings[tone] || greetings.professional}\n\n${openings[tone] || openings.professional}${body}\n\n${closing}${signatures[tone] || signatures.professional}`;
}

module.exports = { router, init };
