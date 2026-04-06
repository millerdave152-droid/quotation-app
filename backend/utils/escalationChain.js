/**
 * Shared Escalation Chain
 *
 * Canonical role hierarchy used by both POS discount escalations
 * and CRM quote approvals. Must NOT diverge between systems.
 *
 * Salesperson → Supervisor → Store Manager → Operations Manager → CEO/Owner
 * Mapped to DB roles: user/salesperson → supervisor → manager → senior_manager → admin
 */

const logger = require('./logger');

// Ordered low → high.  Index = authority level.
const ROLE_CHAIN = [
  'salesperson',   // 0 — also matches 'user'
  'supervisor',    // 1
  'manager',       // 2 — Store Manager
  'senior_manager',// 3 — Operations Manager
  'admin',         // 4 — CEO / Owner
];

// Display labels for audit log / UI
const ROLE_LABELS = {
  salesperson: 'Salesperson',
  user: 'Salesperson',
  supervisor: 'Supervisor',
  manager: 'Store Manager',
  senior_manager: 'Operations Manager',
  admin: 'CEO/Owner',
};

// Roles whose denial is final (no further escalation)
const FINAL_ROLES = ['senior_manager', 'admin'];

// Default timeout for escalation (10 minutes)
const ESCALATION_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Normalise a role string to the canonical chain name.
 * 'user' is treated as 'salesperson'.
 */
function normaliseRole(role) {
  const r = (role || '').toLowerCase().trim();
  return r === 'user' ? 'salesperson' : r;
}

/**
 * Get the index of a role in the chain.  Returns -1 if unknown.
 */
function roleIndex(role) {
  return ROLE_CHAIN.indexOf(normaliseRole(role));
}

/**
 * Return the next role in the chain above the given role.
 * Returns null if the role is already at the top or unknown.
 */
function nextRoleUp(role) {
  const idx = roleIndex(role);
  if (idx < 0 || idx >= ROLE_CHAIN.length - 1) return null;
  return ROLE_CHAIN[idx + 1];
}

/**
 * Is the denier's role at or above the "final denial" level?
 */
function isDenialFinal(denierRole) {
  return FINAL_ROLES.includes(normaliseRole(denierRole));
}

/**
 * Find the next approver in the chain above `currentRole`.
 * Walks the role hierarchy upward until an active user with the
 * required role (or higher) is found, skipping the excludeUserId.
 *
 * @param {Pool}   pool            DB pool
 * @param {string} currentRole     Role that just denied / timed out
 * @param {number} excludeUserId   User to skip (the denier or original requester)
 * @param {number} [totalCents]    Optional quote amount for max_approval_amount check
 * @returns {Promise<{user: object, role: string}|null>}
 */
async function findNextApprover(pool, currentRole, excludeUserId, totalCents = null) {
  const target = nextRoleUp(currentRole);
  if (!target) return null;

  // Build candidate list: target role and above, ordered by hierarchy
  const targetIdx = roleIndex(target);
  const candidateRoles = ROLE_CHAIN.slice(targetIdx);

  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email, role
     FROM users
     WHERE is_active = true
       AND LOWER(role) = ANY($1)
       AND id != $2
       AND ($3::bigint IS NULL OR max_approval_amount_cents IS NULL OR max_approval_amount_cents >= $3)
     ORDER BY
       CASE LOWER(role)
         ${candidateRoles.map((r, i) => `WHEN '${r}' THEN ${i}`).join(' ')}
         ELSE 99
       END,
       first_name
     LIMIT 1`,
    [candidateRoles, excludeUserId, totalCents]
  );

  if (rows.length === 0) return null;
  return { user: rows[0], role: normaliseRole(rows[0].role) };
}

/**
 * Log an escalation step to the audit_log via AuditLogService.
 */
function logEscalationStep(auditLogService, {
  userId,
  entityType,
  entityId,
  fromRole,
  toRole,
  reason,
  originalRequestId,
  locationId,
  req,
}) {
  if (!auditLogService) return;

  auditLogService.log(
    userId,
    'escalation_auto_step',
    entityType,
    entityId,
    {
      event_category: 'escalation',
      severity: 'info',
      original_request_id: originalRequestId,
      from_role: fromRole,
      from_role_label: ROLE_LABELS[normaliseRole(fromRole)] || fromRole,
      to_role: toRole,
      to_role_label: ROLE_LABELS[normaliseRole(toRole)] || toRole,
      reason,
      location_id: locationId || null,
    },
    req || null
  );

  logger.info(
    { entityType, entityId, fromRole, toRole, reason },
    '[Escalation] Auto-escalation step logged'
  );
}

module.exports = {
  ROLE_CHAIN,
  ROLE_LABELS,
  FINAL_ROLES,
  ESCALATION_TIMEOUT_MS,
  normaliseRole,
  roleIndex,
  nextRoleUp,
  isDenialFinal,
  findNextApprover,
  logEscalationStep,
};
