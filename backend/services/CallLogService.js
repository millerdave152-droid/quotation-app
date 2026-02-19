let pool;

function init(deps) {
  pool = deps.pool;
}

async function createCall(customerId, data, loggedBy) {
  const { rows: [call] } = await pool.query(
    `INSERT INTO customer_calls
       (customer_id, call_direction, phone_number, call_start, call_end, duration_seconds,
        call_type, outcome, order_id, summary, notes,
        follow_up_required, follow_up_date, follow_up_assigned_to, logged_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      customerId,
      data.call_direction,
      data.phone_number || null,
      data.call_start || new Date(),
      data.call_end || null,
      data.duration_seconds || null,
      data.call_type || null,
      data.outcome || null,
      data.order_id || null,
      data.summary || null,
      data.notes || null,
      data.follow_up_required || false,
      data.follow_up_date || null,
      data.follow_up_assigned_to || null,
      loggedBy,
    ]
  );
  return call;
}

async function updateCall(callId, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  const allowed = [
    'call_direction', 'phone_number', 'call_start', 'call_end', 'duration_seconds',
    'call_type', 'outcome', 'order_id', 'summary', 'notes',
    'follow_up_required', 'follow_up_date', 'follow_up_assigned_to',
  ];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(data[key]);
    }
  }
  if (fields.length === 0) return null;

  values.push(callId);
  const { rows: [call] } = await pool.query(
    `UPDATE customer_calls SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return call || null;
}

async function getCustomerCalls(customerId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT cc.*, u.name AS logged_by_name, fu.name AS follow_up_assigned_name
     FROM customer_calls cc
     LEFT JOIN users u ON u.id = cc.logged_by
     LEFT JOIN users fu ON fu.id = cc.follow_up_assigned_to
     WHERE cc.customer_id = $1
     ORDER BY cc.call_start DESC
     LIMIT $2 OFFSET $3`,
    [customerId, limit, offset]
  );
  const { rows: [{ total }] } = await pool.query(
    'SELECT COUNT(*) AS total FROM customer_calls WHERE customer_id = $1',
    [customerId]
  );
  return { calls: rows, total: parseInt(total) };
}

async function completeFollowUp(callId) {
  const { rows: [call] } = await pool.query(
    `UPDATE customer_calls
     SET follow_up_completed = true, follow_up_completed_at = NOW()
     WHERE id = $1 AND follow_up_required = true
     RETURNING *`,
    [callId]
  );
  return call || null;
}

async function getFollowUps({ assigned_to, date, overdue, limit = 50, offset = 0 } = {}) {
  const conditions = ['cc.follow_up_required = true', 'cc.follow_up_completed = false'];
  const params = [];
  let idx = 1;

  if (assigned_to) {
    conditions.push(`cc.follow_up_assigned_to = $${idx++}`);
    params.push(assigned_to);
  }
  if (date) {
    conditions.push(`cc.follow_up_date = $${idx++}`);
    params.push(date);
  }
  if (overdue === true || overdue === 'true') {
    conditions.push(`cc.follow_up_date < CURRENT_DATE`);
  }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT cc.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
            CONCAT(u.first_name, ' ', u.last_name) AS logged_by_name, CONCAT(fu.first_name, ' ', fu.last_name) AS assigned_to_name
     FROM customer_calls cc
     JOIN customers c ON c.id = cc.customer_id
     LEFT JOIN users u ON u.id = cc.logged_by
     LEFT JOIN users fu ON fu.id = cc.follow_up_assigned_to
     WHERE ${conditions.join(' AND ')}
     ORDER BY cc.follow_up_date ASC NULLS LAST
     LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );
  return rows;
}

async function getRecentCalls({ limit = 20, user_id } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (user_id) {
    conditions.push(`cc.logged_by = $${idx++}`);
    params.push(user_id);
  }

  params.push(limit);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT cc.*, c.name AS customer_name, c.phone AS customer_phone,
            CONCAT(u.first_name, ' ', u.last_name) AS logged_by_name
     FROM customer_calls cc
     JOIN customers c ON c.id = cc.customer_id
     LEFT JOIN users u ON u.id = cc.logged_by
     ${where}
     ORDER BY cc.call_start DESC
     LIMIT $${idx}`,
    params
  );
  return rows;
}

async function getStats({ date_from, date_to } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (date_from) {
    conditions.push(`call_start >= $${idx++}`);
    params.push(date_from);
  }
  if (date_to) {
    conditions.push(`call_start <= $${idx++}`);
    params.push(date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: [totals] } = await pool.query(
    `SELECT COUNT(*) AS total_calls,
            ROUND(AVG(duration_seconds)) AS avg_duration,
            COUNT(*) FILTER (WHERE follow_up_required = true) AS with_follow_up
     FROM customer_calls ${where}`,
    params
  );

  const { rows: byDirection } = await pool.query(
    `SELECT call_direction, COUNT(*) AS count FROM customer_calls ${where} GROUP BY call_direction`,
    params
  );

  const { rows: byType } = await pool.query(
    `SELECT call_type, COUNT(*) AS count FROM customer_calls ${where} GROUP BY call_type ORDER BY count DESC`,
    params
  );

  const { rows: byOutcome } = await pool.query(
    `SELECT outcome, COUNT(*) AS count FROM customer_calls ${where} GROUP BY outcome ORDER BY count DESC`,
    params
  );

  return {
    total_calls: parseInt(totals.total_calls),
    avg_duration: parseInt(totals.avg_duration) || 0,
    with_follow_up: parseInt(totals.with_follow_up),
    by_direction: byDirection.reduce((acc, r) => { acc[r.call_direction] = parseInt(r.count); return acc; }, {}),
    by_type: byType.map(r => ({ type: r.call_type, count: parseInt(r.count) })),
    by_outcome: byOutcome.map(r => ({ outcome: r.outcome, count: parseInt(r.count) })),
  };
}

async function quickLog(data, loggedBy) {
  // Look up customer by phone number
  let customerId = null;
  if (data.phone_number) {
    const normalized = data.phone_number.replace(/\D/g, '');
    const { rows } = await pool.query(
      `SELECT id FROM customers
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone, '-', ''), '(', ''), ')', ''), ' ', '') LIKE '%' || $1
       LIMIT 1`,
      [normalized.slice(-10)]
    );
    if (rows.length > 0) customerId = rows[0].id;
  }

  if (!customerId) {
    return { error: 'customer_not_found', phone: data.phone_number };
  }

  const call = await createCall(customerId, data, loggedBy);
  return { call, customer_id: customerId };
}

module.exports = { init, createCall, updateCall, getCustomerCalls, completeFollowUp, getFollowUps, getRecentCalls, getStats, quickLog };
