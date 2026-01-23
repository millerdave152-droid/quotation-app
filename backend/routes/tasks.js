/**
 * Task Routes Module
 * Handles follow-up tasks, reminders, and scheduling
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const TaskService = require('../services/TaskService');
const { authenticate } = require('../middleware/auth');

// Module-level dependencies
let taskService = null;
let cache = null;

/**
 * Initialize the router with dependencies
 */
const init = (deps) => {
  cache = deps.cache;
  taskService = new TaskService(deps.pool, deps.cache);
  return router;
};

// ============================================
// TASK ROUTES
// ============================================

/**
 * GET /api/tasks
 * Get tasks with filters
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const {
    status,
    priority,
    task_type,
    assigned_to,
    related_type,
    related_id,
    due_before,
    due_after,
    include_completed,
    page = 1,
    limit = 20,
    sort_by,
    sort_dir
  } = req.query;

  const result = await taskService.getTasks({
    status,
    priority,
    task_type,
    assigned_to: assigned_to || req.user?.id,
    related_type,
    related_id: related_id ? parseInt(related_id) : undefined,
    due_before,
    due_after,
    include_completed: include_completed === 'true',
    page: parseInt(page),
    limit: parseInt(limit),
    sort_by,
    sort_dir
  });

  res.success(result);
}));

/**
 * GET /api/tasks/stats
 * Get task statistics
 */
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const stats = await taskService.getTaskStats(req.user?.id);
  res.success(stats);
}));

/**
 * GET /api/tasks/today
 * Get tasks due today
 */
router.get('/today', authenticate, asyncHandler(async (req, res) => {
  const tasks = await taskService.getTasksDueToday(req.user?.id);
  res.success(tasks);
}));

/**
 * GET /api/tasks/overdue
 * Get overdue tasks
 */
router.get('/overdue', authenticate, asyncHandler(async (req, res) => {
  const tasks = await taskService.getOverdueTasks(req.user?.id);
  res.success(tasks);
}));

/**
 * GET /api/tasks/upcoming
 * Get upcoming tasks (next 7 days by default)
 */
router.get('/upcoming', authenticate, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const tasks = await taskService.getUpcomingTasks(req.user?.id, days);
  res.success(tasks);
}));

/**
 * GET /api/tasks/:id
 * Get a single task
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const task = await taskService.getTaskById(parseInt(id));

  if (!task) {
    throw ApiError.notFound('Task');
  }

  res.success(task);
}));

/**
 * POST /api/tasks
 * Create a new task
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { title } = req.body;

  if (!title || title.trim().length === 0) {
    throw ApiError.validation('Title is required');
  }

  const task = await taskService.createTask(req.body, req.user?.id);
  res.created(task);
}));

/**
 * POST /api/tasks/from-lead/:leadId
 * Create task from lead follow-up
 */
router.post('/from-lead/:leadId', authenticate, asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { due_date, assigned_to } = req.body;

  if (!due_date) {
    throw ApiError.validation('Due date is required');
  }

  const task = await taskService.createFromLeadFollowUp(
    parseInt(leadId),
    due_date,
    assigned_to || req.user?.id,
    req.user?.id
  );

  if (!task) {
    throw ApiError.notFound('Lead');
  }

  res.created(task);
}));

/**
 * PUT /api/tasks/:id
 * Update a task
 */
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const task = await taskService.updateTask(parseInt(id), req.body, req.user?.id);

  if (!task) {
    throw ApiError.notFound('Task');
  }

  res.success(task);
}));

/**
 * PUT /api/tasks/:id/complete
 * Mark task as completed
 */
router.put('/:id/complete', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  const task = await taskService.completeTask(parseInt(id), req.user?.id, notes);

  if (!task) {
    throw ApiError.notFound('Task');
  }

  res.success(task);
}));

/**
 * DELETE /api/tasks/:id
 * Delete a task
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await taskService.deleteTask(parseInt(id));

  if (!deleted) {
    throw ApiError.notFound('Task');
  }

  res.success(null, { message: 'Task deleted successfully' });
}));

module.exports = { router, init };
