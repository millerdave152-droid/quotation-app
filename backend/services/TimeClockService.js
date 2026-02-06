let pool;

function init(deps) {
  pool = deps.pool;
}

function calcHours(clockIn, clockOut, breakMinutes = 0) {
  const ms = new Date(clockOut) - new Date(clockIn);
  const hours = ms / 3600000 - (breakMinutes / 60);
  return Math.round(Math.max(hours, 0) * 100) / 100;
}

// ── Employee actions ────────────────────────────────────────────────

async function clockIn(userId, { location_id, notes } = {}) {
  // Check not already clocked in
  const { rows: open } = await pool.query(
    'SELECT id FROM time_entries WHERE user_id = $1 AND clock_out IS NULL',
    [userId]
  );
  if (open.length > 0) {
    throw new Error('Already clocked in');
  }

  const { rows: [entry] } = await pool.query(
    `INSERT INTO time_entries (user_id, location_id, clock_in, notes)
     VALUES ($1, $2, NOW(), $3) RETURNING *`,
    [userId, location_id || null, notes || null]
  );
  return entry;
}

async function clockOut(userId, { notes } = {}) {
  const { rows: [entry] } = await pool.query(
    'SELECT * FROM time_entries WHERE user_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1',
    [userId]
  );
  if (!entry) throw new Error('No open time entry found');

  const now = new Date();
  const hours = calcHours(entry.clock_in, now, entry.break_minutes);

  const { rows: [updated] } = await pool.query(
    `UPDATE time_entries SET clock_out = $1, hours_worked = $2, notes = COALESCE($3, notes)
     WHERE id = $4 RETURNING *`,
    [now, hours, notes || null, entry.id]
  );
  return updated;
}

async function getStatus(userId) {
  const { rows: [entry] } = await pool.query(
    `SELECT te.*, l.name AS location_name
     FROM time_entries te
     LEFT JOIN locations l ON l.id = te.location_id
     WHERE te.user_id = $1 AND te.clock_out IS NULL
     ORDER BY te.clock_in DESC LIMIT 1`,
    [userId]
  );

  if (!entry) return { clocked_in: false };

  const elapsed = (Date.now() - new Date(entry.clock_in).getTime()) / 3600000;
  return {
    clocked_in: true,
    entry_id: entry.id,
    clock_in: entry.clock_in,
    location_name: entry.location_name,
    elapsed_hours: Math.round(elapsed * 100) / 100,
  };
}

async function getMyEntries(userId, { date_from, date_to, limit = 100, offset = 0 } = {}) {
  const conditions = ['te.user_id = $1'];
  const params = [userId];
  let idx = 2;

  if (date_from) { conditions.push(`te.clock_in >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`te.clock_in <= $${idx++}`); params.push(date_to); }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT te.*, l.name AS location_name
     FROM time_entries te
     LEFT JOIN locations l ON l.id = te.location_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY te.clock_in DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  const { rows: [{ total }] } = await pool.query(
    `SELECT COUNT(*) AS total FROM time_entries te WHERE ${conditions.slice(0, -0).join(' AND ')}`,
    params.slice(0, conditions.length)
  );

  return { entries: rows, total: parseInt(total) };
}

// ── Manager actions ─────────────────────────────────────────────────

async function getEntries({ user_id, location_id, date_from, date_to, is_approved, limit = 100, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (user_id) { conditions.push(`te.user_id = $${idx++}`); params.push(user_id); }
  if (location_id) { conditions.push(`te.location_id = $${idx++}`); params.push(location_id); }
  if (date_from) { conditions.push(`te.clock_in >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`te.clock_in <= $${idx++}`); params.push(date_to); }
  if (is_approved !== undefined) { conditions.push(`te.is_approved = $${idx++}`); params.push(is_approved); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT te.*, u.name AS employee_name, l.name AS location_name,
            ab.name AS adjusted_by_name, ap.name AS approved_by_name
     FROM time_entries te
     JOIN users u ON u.id = te.user_id
     LEFT JOIN locations l ON l.id = te.location_id
     LEFT JOIN users ab ON ab.id = te.adjusted_by
     LEFT JOIN users ap ON ap.id = te.approved_by
     ${where}
     ORDER BY te.clock_in DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  return rows;
}

async function adjustEntry(entryId, { clock_in, clock_out, break_minutes, entry_type, reason }, adjustedBy) {
  const { rows: [entry] } = await pool.query('SELECT * FROM time_entries WHERE id = $1', [entryId]);
  if (!entry) throw new Error('Entry not found');

  const newClockIn = clock_in ? new Date(clock_in) : entry.clock_in;
  const newClockOut = clock_out ? new Date(clock_out) : entry.clock_out;
  const newBreak = break_minutes !== undefined ? break_minutes : entry.break_minutes;
  const hours = newClockOut ? calcHours(newClockIn, newClockOut, newBreak) : null;

  const { rows: [updated] } = await pool.query(
    `UPDATE time_entries SET
       clock_in = $1, clock_out = $2, break_minutes = $3, hours_worked = $4,
       entry_type = COALESCE($5, entry_type),
       is_adjusted = true, adjusted_by = $6, adjustment_reason = $7,
       original_clock_in = CASE WHEN original_clock_in IS NULL THEN $8 ELSE original_clock_in END,
       original_clock_out = CASE WHEN original_clock_out IS NULL THEN $9 ELSE original_clock_out END
     WHERE id = $10 RETURNING *`,
    [newClockIn, newClockOut, newBreak, hours, entry_type || null, adjustedBy, reason,
     entry.clock_in, entry.clock_out, entryId]
  );
  return updated;
}

async function approveEntry(entryId, approvedBy) {
  const { rows: [entry] } = await pool.query(
    `UPDATE time_entries SET is_approved = true, approved_by = $1, approved_at = NOW()
     WHERE id = $2 AND is_approved = false RETURNING *`,
    [approvedBy, entryId]
  );
  return entry || null;
}

async function bulkApprove(entryIds, approvedBy) {
  const { rows } = await pool.query(
    `UPDATE time_entries SET is_approved = true, approved_by = $1, approved_at = NOW()
     WHERE id = ANY($2::int[]) AND is_approved = false RETURNING id`,
    [approvedBy, entryIds]
  );
  return { approved_count: rows.length, approved_ids: rows.map(r => r.id) };
}

async function getSummary({ date_from, date_to, location_id } = {}) {
  const conditions = ['te.clock_out IS NOT NULL'];
  const params = [];
  let idx = 1;

  if (date_from) { conditions.push(`te.clock_in >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`te.clock_in <= $${idx++}`); params.push(date_to); }
  if (location_id) { conditions.push(`te.location_id = $${idx++}`); params.push(location_id); }

  const { rows } = await pool.query(
    `SELECT te.user_id, u.name AS employee_name,
            COUNT(te.id) AS entry_count,
            SUM(te.hours_worked) AS total_hours,
            SUM(te.break_minutes) AS total_break_minutes,
            SUM(CASE WHEN te.entry_type = 'regular' THEN te.hours_worked ELSE 0 END) AS regular_hours,
            SUM(CASE WHEN te.entry_type = 'overtime' THEN te.hours_worked ELSE 0 END) AS overtime_hours,
            SUM(CASE WHEN te.entry_type = 'holiday' THEN te.hours_worked ELSE 0 END) AS holiday_hours,
            SUM(CASE WHEN te.entry_type = 'sick' THEN te.hours_worked ELSE 0 END) AS sick_hours,
            SUM(CASE WHEN te.entry_type = 'vacation' THEN te.hours_worked ELSE 0 END) AS vacation_hours,
            MIN(te.clock_in) AS first_entry,
            MAX(te.clock_out) AS last_entry,
            COUNT(*) FILTER (WHERE te.is_approved = false) AS unapproved_count
     FROM time_entries te
     JOIN users u ON u.id = te.user_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY te.user_id, u.name
     ORDER BY u.name`,
    params
  );

  const byEmployee = rows.map(r => ({
    user_id: r.user_id,
    name: r.employee_name,
    entry_count: parseInt(r.entry_count),
    total_hours: parseFloat(r.total_hours) || 0,
    regular_hours: parseFloat(r.regular_hours) || 0,
    overtime_hours: parseFloat(r.overtime_hours) || 0,
    holiday_hours: parseFloat(r.holiday_hours) || 0,
    sick_hours: parseFloat(r.sick_hours) || 0,
    vacation_hours: parseFloat(r.vacation_hours) || 0,
    total_break_minutes: parseInt(r.total_break_minutes) || 0,
    unapproved_count: parseInt(r.unapproved_count),
  }));

  return {
    by_employee: byEmployee,
    totals: {
      employees: byEmployee.length,
      total_hours: byEmployee.reduce((s, e) => s + e.total_hours, 0),
      regular_hours: byEmployee.reduce((s, e) => s + e.regular_hours, 0),
      overtime_hours: byEmployee.reduce((s, e) => s + e.overtime_hours, 0),
      total_entries: byEmployee.reduce((s, e) => s + e.entry_count, 0),
    },
  };
}

async function exportCSV({ date_from, date_to, location_id } = {}) {
  const conditions = ['te.clock_out IS NOT NULL'];
  const params = [];
  let idx = 1;

  if (date_from) { conditions.push(`te.clock_in >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`te.clock_in <= $${idx++}`); params.push(date_to); }
  if (location_id) { conditions.push(`te.location_id = $${idx++}`); params.push(location_id); }

  const { rows } = await pool.query(
    `SELECT te.*, u.name AS employee_name, l.name AS location_name
     FROM time_entries te
     JOIN users u ON u.id = te.user_id
     LEFT JOIN locations l ON l.id = te.location_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.name, te.clock_in`,
    params
  );

  const lines = [
    'Employee,Date,Clock In,Clock Out,Hours Worked,Break (min),Type,Adjusted,Approved,Location,Notes',
  ];

  for (const r of rows) {
    lines.push([
      `"${r.employee_name}"`,
      new Date(r.clock_in).toLocaleDateString(),
      new Date(r.clock_in).toLocaleTimeString(),
      r.clock_out ? new Date(r.clock_out).toLocaleTimeString() : '',
      r.hours_worked || '',
      r.break_minutes || 0,
      r.entry_type,
      r.is_adjusted ? 'Yes' : 'No',
      r.is_approved ? 'Yes' : 'No',
      r.location_name || '',
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ].join(','));
  }

  return lines.join('\n');
}

module.exports = {
  init, clockIn, clockOut, getStatus, getMyEntries,
  getEntries, adjustEntry, approveEntry, bulkApprove,
  getSummary, exportCSV,
};
