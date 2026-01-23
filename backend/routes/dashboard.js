/**
 * Dashboard Routes Module
 * Unified Sales Pipeline Dashboard API endpoints
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const UnifiedPipelineService = require('../services/UnifiedPipelineService');
const { authenticate } = require('../middleware/auth');

// Module-level service instance
let pipelineService = null;
let cache = null;

/**
 * Initialize the router with dependencies
 * @param {object} deps - Dependencies
 * @param {Pool} deps.pool - PostgreSQL connection pool
 * @param {object} deps.cache - Cache module
 */
const init = (deps) => {
  cache = deps.cache;
  pipelineService = new UnifiedPipelineService(deps.pool, deps.cache);
  return router;
};

// ============================================
// UNIFIED PIPELINE ENDPOINTS
// ============================================

/**
 * GET /api/dashboard/pipeline/overview
 * Get unified sales pipeline overview with all metrics
 */
router.get('/pipeline/overview', authenticate, asyncHandler(async (req, res) => {
  const overview = await pipelineService.getPipelineOverview();
  res.success(overview);
}));

/**
 * GET /api/dashboard/pipeline/stages
 * Get pipeline stage breakdown with counts and values
 */
router.get('/pipeline/stages', authenticate, asyncHandler(async (req, res) => {
  const stages = await pipelineService.getPipelineStages();
  res.success(stages);
}));

/**
 * GET /api/dashboard/pipeline/velocity
 * Get pipeline velocity metrics (how fast deals move)
 * Query params: days (default 30)
 */
router.get('/pipeline/velocity', authenticate, asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const velocity = await pipelineService.getPipelineVelocity(parseInt(days));
  res.success(velocity);
}));

/**
 * GET /api/dashboard/pipeline/opportunities
 * Get top opportunities in the pipeline
 * Query params: limit (default 10)
 */
router.get('/pipeline/opportunities', authenticate, asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const opportunities = await pipelineService.getTopOpportunities(parseInt(limit));
  res.success(opportunities);
}));

/**
 * GET /api/dashboard/pipeline/trends
 * Get pipeline trends over time
 * Query params: days (default 30)
 */
router.get('/pipeline/trends', authenticate, asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const trends = await pipelineService.getPipelineTrends(parseInt(days));
  res.success(trends);
}));

/**
 * GET /api/dashboard/performance/by-source
 * Get performance breakdown by lead source
 */
router.get('/performance/by-source', authenticate, asyncHandler(async (req, res) => {
  const performance = await pipelineService.getPerformanceBySource();
  res.success(performance);
}));

/**
 * GET /api/dashboard/performance/team
 * Get team performance summary
 * Query params: days (default 30)
 */
router.get('/performance/team', authenticate, asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const teamPerformance = await pipelineService.getTeamPerformance(parseInt(days));
  res.success(teamPerformance);
}));

/**
 * GET /api/dashboard/action-items
 * Get action items that need attention
 */
router.get('/action-items', authenticate, asyncHandler(async (req, res) => {
  const actionItems = await pipelineService.getActionItems();
  res.success(actionItems);
}));

/**
 * GET /api/dashboard/summary
 * Get a combined summary for the unified dashboard
 */
router.get('/summary', authenticate, asyncHandler(async (req, res) => {
  const [overview, actionItems, trends] = await Promise.all([
    pipelineService.getPipelineOverview(),
    pipelineService.getActionItems(),
    pipelineService.getPipelineTrends(7)
  ]);

  res.success({
    overview,
    actionItems,
    weeklyTrends: trends
  });
}));

module.exports = { router, init };
