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
router.post('/', authenticate, asyncHandler(async (req, res) => {
  // Validate with Joi and log errors
  const Joi = require('joi');
  const { leadSchemas } = require('../middleware/validation');
  const { error, value } = leadSchemas.create.validate(req.body, { abortEarly: false, stripUnknown: true });

  if (error) {
    console.error('Lead creation validation error:', error.details);
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details.map(d => ({ field: d.path.join('.'), message: d.message }))
    });
  }

  const lead = await leadService.createLead(value, req.user?.id);

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

  // Generate product suggestions based on lead requirements
  const LeadAIService = require('../services/LeadAIService');
  const suggestions = await LeadAIService.suggestProducts(lead, leadService.pool);

  // Save the suggestions to the lead record
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

// ============================================
// LEAD SCORING ROUTES
// ============================================

const LeadScoringService = require('../services/LeadScoringService');
let leadScoringService = null;

// Initialize scoring service (called after pool is available)
const initScoringService = () => {
  if (!leadScoringService && leadService && leadService.pool) {
    leadScoringService = new LeadScoringService(leadService.pool, cache);
  }
  return leadScoringService;
};

/**
 * POST /api/leads/:id/score
 * Calculate and save lead score
 */
router.post('/:id/score', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const scoringService = initScoringService();

  if (!scoringService) {
    throw ApiError.internal('Scoring service not initialized');
  }

  const score = await scoringService.scoreAndSave(id);
  res.success(score);
}));

/**
 * GET /api/leads/:id/score
 * Get lead score (calculate if not exists)
 */
router.get('/:id/score', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const lead = await leadService.getLeadById(id);
  if (!lead) {
    throw ApiError.notFound('Lead');
  }

  // If score exists and is recent, return it
  if (lead.lead_score !== null && lead.lead_score_breakdown) {
    res.success({
      score: lead.lead_score,
      breakdown: lead.lead_score_breakdown,
      calculatedAt: lead.lead_score_updated_at,
      cached: true
    });
    return;
  }

  // Otherwise calculate fresh score
  const scoringService = initScoringService();
  const scoreData = await scoringService.calculateScore(lead, lead.requirements, lead.activities);
  res.success(scoreData);
}));

/**
 * POST /api/leads/score-all
 * Batch score all active leads
 */
router.post('/score-all', authenticate, asyncHandler(async (req, res) => {
  const scoringService = initScoringService();

  if (!scoringService) {
    throw ApiError.internal('Scoring service not initialized');
  }

  const result = await scoringService.scoreAllLeads();

  // Invalidate stats cache
  cache.invalidatePattern('leads:');

  res.success(result);
}));

/**
 * GET /api/leads/by-score
 * Get leads ranked by score
 */
router.get('/by-score', authenticate, asyncHandler(async (req, res) => {
  const { limit = 20, minScore = 0 } = req.query;
  const scoringService = initScoringService();

  if (!scoringService) {
    throw ApiError.internal('Scoring service not initialized');
  }

  const leads = await scoringService.getLeadsByScore({
    limit: parseInt(limit),
    minScore: parseInt(minScore)
  });

  res.success(leads);
}));

/**
 * GET /api/leads/score-distribution
 * Get lead score distribution for analytics
 */
router.get('/score-distribution', authenticate, asyncHandler(async (req, res) => {
  const scoringService = initScoringService();

  if (!scoringService) {
    throw ApiError.internal('Scoring service not initialized');
  }

  const distribution = await scoringService.getScoreDistribution();
  res.success(distribution);
}));

// ============================================
// LEAD IMPORT ROUTES
// ============================================

const LeadImportService = require('../services/LeadImportService');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

let leadImportService = null;

const initImportService = () => {
  if (!leadImportService && leadService && leadService.pool) {
    leadImportService = new LeadImportService(leadService.pool, cache);
  }
  return leadImportService;
};

/**
 * GET /api/leads/import/template
 * Get CSV import template
 */
router.get('/import/template', authenticate, asyncHandler(async (req, res) => {
  const importService = initImportService();
  if (!importService) {
    throw ApiError.internal('Import service not initialized');
  }

  const template = importService.getImportTemplate();
  res.success(template);
}));

/**
 * POST /api/leads/import/preview
 * Preview CSV import with auto-detected mappings
 */
router.post('/import/preview', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
  const importService = initImportService();
  if (!importService) {
    throw ApiError.internal('Import service not initialized');
  }

  if (!req.file) {
    throw ApiError.validation('No file uploaded');
  }

  const csvContent = req.file.buffer.toString('utf-8');
  const { columns, records, mappings } = importService.parseCSV(csvContent, {
    delimiter: req.body.delimiter || ',',
    hasHeaders: req.body.hasHeaders !== 'false'
  });

  // Return preview with first 10 rows
  res.success({
    columns,
    mappings,
    sampleRows: records.slice(0, 10),
    totalRows: records.length
  });
}));

/**
 * POST /api/leads/import
 * Import leads from CSV file
 */
router.post('/import', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
  const importService = initImportService();
  if (!importService) {
    throw ApiError.internal('Import service not initialized');
  }

  if (!req.file) {
    throw ApiError.validation('No file uploaded');
  }

  const csvContent = req.file.buffer.toString('utf-8');
  const { records, mappings: autoMappings } = importService.parseCSV(csvContent, {
    delimiter: req.body.delimiter || ',',
    hasHeaders: req.body.hasHeaders !== 'false'
  });

  // Use custom mappings if provided, otherwise use auto-detected
  const mappings = req.body.mappings ? JSON.parse(req.body.mappings) : autoMappings;

  const results = await importService.importLeads(records, mappings, {
    skipDuplicates: req.body.skipDuplicates !== 'false',
    defaultPriority: req.body.defaultPriority || 'warm',
    defaultSource: req.body.defaultSource || 'csv_import',
    userId: req.user?.id
  });

  // Invalidate stats cache
  cache.invalidatePattern('leads:');

  res.success(results);
}));

/**
 * POST /api/leads/import/check-duplicates
 * Check for potential duplicates in uploaded CSV
 */
router.post('/import/check-duplicates', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
  const importService = initImportService();
  if (!importService) {
    throw ApiError.internal('Import service not initialized');
  }

  if (!req.file) {
    throw ApiError.validation('No file uploaded');
  }

  const csvContent = req.file.buffer.toString('utf-8');
  const { records, mappings } = importService.parseCSV(csvContent, {
    delimiter: req.body.delimiter || ',',
    hasHeaders: req.body.hasHeaders !== 'false'
  });

  // Transform and check for duplicates
  const leads = [];
  for (const record of records) {
    const { lead } = importService.transformRow(record, mappings);
    if (lead.contact_name) {
      leads.push(lead);
    }
  }

  const duplicates = await importService.findDuplicates(leads);

  res.success({
    totalRecords: records.length,
    validLeads: leads.length,
    duplicatesFound: duplicates.length,
    duplicates
  });
}));

// ============================================
// QUICK ACTION ROUTES
// ============================================

/**
 * POST /api/leads/:id/quick-actions/call
 * Quick log a phone call
 */
router.post('/:id/quick-actions/call', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { outcome, notes, duration_minutes } = req.body;

  // Validate lead exists
  const lead = await leadService.getLeadById(id);
  if (!lead) {
    throw ApiError.notFound('Lead');
  }

  // Create activity
  const activity = await leadService.addActivity(
    id,
    'call',
    notes || `Phone call - ${outcome || 'completed'}`,
    {
      outcome: outcome || 'completed',
      duration_minutes: duration_minutes || null,
      quick_action: true
    },
    req.user?.id
  );

  // Auto-update status to 'contacted' if still 'new'
  if (lead.status === 'new') {
    await leadService.updateStatus(id, 'contacted', null, req.user?.id);
    cache.invalidatePattern('leads:');
  }

  res.created(activity);
}));

/**
 * POST /api/leads/:id/quick-actions/note
 * Quick add a note
 */
router.post('/:id/quick-actions/note', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  if (!note || note.trim().length === 0) {
    throw ApiError.validation('Note content is required');
  }

  // Validate lead exists
  const lead = await leadService.getLeadById(id);
  if (!lead) {
    throw ApiError.notFound('Lead');
  }

  // Create activity
  const activity = await leadService.addActivity(
    id,
    'note',
    note.trim(),
    { quick_action: true },
    req.user?.id
  );

  res.created(activity);
}));

/**
 * POST /api/leads/:id/quick-actions/email
 * Quick log an email sent
 */
router.post('/:id/quick-actions/email', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { subject, notes } = req.body;

  // Validate lead exists
  const lead = await leadService.getLeadById(id);
  if (!lead) {
    throw ApiError.notFound('Lead');
  }

  // Create activity
  const activity = await leadService.addActivity(
    id,
    'email',
    notes || `Email sent${subject ? `: ${subject}` : ''}`,
    {
      subject: subject || null,
      quick_action: true
    },
    req.user?.id
  );

  // Auto-update status to 'contacted' if still 'new'
  if (lead.status === 'new') {
    await leadService.updateStatus(id, 'contacted', null, req.user?.id);
    cache.invalidatePattern('leads:');
  }

  res.created(activity);
}));

/**
 * PUT /api/leads/:id/quick-actions/status
 * Quick status change with optional note
 */
router.put('/:id/quick-actions/status', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, note, lost_reason } = req.body;

  if (!status) {
    throw ApiError.validation('Status is required');
  }

  const validStatuses = ['new', 'contacted', 'qualified', 'converted', 'lost'];
  if (!validStatuses.includes(status)) {
    throw ApiError.validation(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  try {
    const lead = await leadService.updateStatus(id, status, lost_reason, req.user?.id);

    if (!lead) {
      throw ApiError.notFound('Lead');
    }

    // Add note if provided
    if (note && note.trim().length > 0) {
      await leadService.addActivity(
        id,
        'status_change',
        `Status changed to ${status}${note ? `: ${note}` : ''}`,
        { new_status: status, quick_action: true },
        req.user?.id
      );
    }

    // Invalidate stats cache
    cache.invalidatePattern('leads:');

    res.success(lead);
  } catch (error) {
    if (error.message.includes('Invalid status transition')) {
      throw ApiError.badRequest(error.message);
    }
    throw error;
  }
}));

/**
 * PUT /api/leads/:id/quick-actions/follow-up
 * Quick set follow-up date
 */
router.put('/:id/quick-actions/follow-up', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { follow_up_date, note } = req.body;

  if (!follow_up_date) {
    throw ApiError.validation('Follow-up date is required');
  }

  // Validate date
  const date = new Date(follow_up_date);
  if (isNaN(date.getTime())) {
    throw ApiError.validation('Invalid date format');
  }

  const lead = await leadService.updateLead(id, { follow_up_date }, req.user?.id);

  if (!lead) {
    throw ApiError.notFound('Lead');
  }

  // Add activity log
  await leadService.addActivity(
    id,
    'follow_up_scheduled',
    `Follow-up scheduled for ${date.toLocaleDateString()}${note ? `: ${note}` : ''}`,
    { follow_up_date, quick_action: true },
    req.user?.id
  );

  cache.invalidatePattern('leads:');

  res.success(lead);
}));

/**
 * PUT /api/leads/:id/quick-actions/priority
 * Quick change priority
 */
router.put('/:id/quick-actions/priority', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;

  if (!priority) {
    throw ApiError.validation('Priority is required');
  }

  const validPriorities = ['hot', 'warm', 'cold'];
  if (!validPriorities.includes(priority)) {
    throw ApiError.validation(`Invalid priority. Must be one of: ${validPriorities.join(', ')}`);
  }

  const lead = await leadService.updateLead(id, { priority }, req.user?.id);

  if (!lead) {
    throw ApiError.notFound('Lead');
  }

  // Add activity log
  await leadService.addActivity(
    id,
    'priority_change',
    `Priority changed to ${priority}`,
    { new_priority: priority, quick_action: true },
    req.user?.id
  );

  cache.invalidatePattern('leads:');

  res.success(lead);
}));

// ============================================
// AI NEXT-BEST-ACTION ROUTES
// ============================================

const NextBestActionService = require('../services/NextBestActionService');
let nextBestActionService = null;

const initNextBestActionService = () => {
  if (!nextBestActionService && leadService && leadService.pool) {
    nextBestActionService = new NextBestActionService(leadService.pool, cache);
  }
  return nextBestActionService;
};

/**
 * GET /api/leads/:id/next-actions
 * Get AI-recommended next best actions for a lead
 */
router.get('/:id/next-actions', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const nbaService = initNextBestActionService();

  if (!nbaService) {
    throw ApiError.internal('Next Best Action service not initialized');
  }

  const actions = await nbaService.getLeadActions(id);
  res.success(actions);
}));

/**
 * GET /api/leads/next-actions/batch
 * Get next best actions for multiple leads
 */
router.get('/next-actions/batch', authenticate, asyncHandler(async (req, res) => {
  const { limit = 20, minScore = 0, status } = req.query;
  const nbaService = initNextBestActionService();

  if (!nbaService) {
    throw ApiError.internal('Next Best Action service not initialized');
  }

  const results = await nbaService.getBatchLeadActions({
    limit: parseInt(limit),
    minScore: parseInt(minScore),
    status: status || null
  });

  res.success(results);
}));

// ============================================
// LEAD ASSIGNMENT AUTOMATION
// ============================================
const LeadAssignmentService = require('../services/LeadAssignmentService');
let leadAssignmentService = null;

function initLeadAssignmentService() {
  if (!leadAssignmentService && pool) {
    leadAssignmentService = new LeadAssignmentService(pool, cache);
  }
  return leadAssignmentService;
}

/**
 * GET /api/leads/assignment/rules
 * Get all assignment rules
 */
router.get('/assignment/rules', authenticate, asyncHandler(async (req, res) => {
  const service = initLeadAssignmentService();
  const rules = await service.getAllRules();
  res.success(rules);
}));

/**
 * POST /api/leads/assignment/rules
 * Create assignment rule
 */
router.post('/assignment/rules', authenticate, asyncHandler(async (req, res) => {
  const service = initLeadAssignmentService();
  const rule = await service.createRule(req.body);
  res.created(rule);
}));

/**
 * PUT /api/leads/assignment/rules/:id
 * Update assignment rule
 */
router.put('/assignment/rules/:id', authenticate, asyncHandler(async (req, res) => {
  const service = initLeadAssignmentService();
  const rule = await service.updateRule(req.params.id, req.body);
  if (!rule) {
    throw ApiError.notFound('Assignment rule');
  }
  res.success(rule);
}));

/**
 * DELETE /api/leads/assignment/rules/:id
 * Delete assignment rule
 */
router.delete('/assignment/rules/:id', authenticate, asyncHandler(async (req, res) => {
  const service = initLeadAssignmentService();
  const deleted = await service.deleteRule(req.params.id);
  if (!deleted) {
    throw ApiError.notFound('Assignment rule');
  }
  res.success(null, { message: 'Rule deleted' });
}));

/**
 * POST /api/leads/:id/auto-assign
 * Auto-assign a specific lead
 */
router.post('/:id/auto-assign', authenticate, asyncHandler(async (req, res) => {
  const service = initLeadAssignmentService();
  const result = await service.assignLead(req.params.id);
  res.success(result);
}));

/**
 * POST /api/leads/assignment/bulk
 * Bulk assign unassigned leads
 */
router.post('/assignment/bulk', authenticate, asyncHandler(async (req, res) => {
  const { limit = 50 } = req.body;
  const service = initLeadAssignmentService();
  const result = await service.assignUnassignedLeads(parseInt(limit));
  res.success(result);
}));

/**
 * GET /api/leads/assignment/stats
 * Get assignment statistics
 */
router.get('/assignment/stats', authenticate, asyncHandler(async (req, res) => {
  const service = initLeadAssignmentService();
  const stats = await service.getStats();
  res.success(stats);
}));

module.exports = { router, init };
