require('dotenv').config();
const pool = require('./db');

(async () => {
  try {
    // Test count query
    const r1 = await pool.query(
      `SELECT COUNT(*) FROM tasks t WHERE 1=1 AND t.status NOT IN ('completed', 'cancelled') AND t.assigned_to = $1`,
      [1]
    );
    console.log('COUNT ok:', r1.rows[0].count);

    // Test full select
    const r2 = await pool.query(
      `SELECT t.*, u1.name as assigned_to_name, u2.name as created_by_name
       FROM tasks t
       LEFT JOIN users u1 ON t.assigned_to = u1.id
       LEFT JOIN users u2 ON t.created_by = u2.id
       WHERE 1=1 AND t.status NOT IN ('completed', 'cancelled') AND t.assigned_to = $1
       ORDER BY t.due_date ASC, t.due_date ASC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [1, 3, 0]
    );
    console.log('SELECT ok:', r2.rows.length, 'rows');

    // Now test through the TaskService
    const TaskService = require('./services/TaskService');
    const ts = new TaskService(pool, null);
    const result = await ts.getTasks({ assigned_to: 1, limit: 3 });
    console.log('TaskService ok:', result.tasks.length, 'tasks');
  } catch (e) {
    console.log('ERROR code:', e.code);
    console.log('ERROR message:', e.message);
    console.log('ERROR detail:', e.detail);
    console.log('ERROR where:', e.where);
    if (e.stack) console.log('STACK:', e.stack.split('\n').slice(0,5).join('\n'));
  }
  process.exit(0);
})();
