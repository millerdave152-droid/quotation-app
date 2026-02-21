const pool = require('./db');

(async () => {
  try {
    // 1. Tier settings
    const { rows: tiers } = await pool.query('SELECT * FROM approval_tier_settings ORDER BY tier');
    console.log('=== APPROVAL TIER SETTINGS ===');
    if (tiers.length === 0) {
      console.log('!! NO TIERS CONFIGURED — this is the problem!');
    } else {
      tiers.forEach(r => {
        console.log(
          `Tier ${r.tier} "${r.name}": ${r.required_role} | ${r.min_discount_percent}-${r.max_discount_percent}% | min_margin=${r.min_margin_percent}% | below_cost=${r.allows_below_cost} | timeout=${r.timeout_seconds}s | reason_req=${r.requires_reason_code}`
        );
      });
    }

    // 2. Manager pins
    const { rows: pins } = await pool.query(
      `SELECT mp.user_id, u.first_name, u.last_name, u.role, mp.pin_hash IS NOT NULL as has_pin, mp.max_daily_overrides, mp.override_count_today, mp.is_active
       FROM manager_pins mp JOIN users u ON u.id = mp.user_id ORDER BY u.role, u.last_name`
    );
    console.log('\n=== MANAGER PINS ===');
    if (pins.length === 0) {
      console.log('!! NO MANAGER PINS — managers need PINs to approve requests');
    } else {
      pins.forEach(p => {
        console.log(
          `${p.first_name} ${p.last_name} (${p.role}) id=${p.user_id} | has_pin=${p.has_pin} | max_daily=${p.max_daily_overrides} | used_today=${p.override_count_today} | active=${p.is_active}`
        );
      });
    }

    // 3. Manager availability
    const { rows: avail } = await pool.query(
      `SELECT ma.user_id, u.first_name, u.last_name, u.role, ma.status
       FROM manager_availability ma JOIN users u ON u.id = ma.user_id ORDER BY u.last_name`
    );
    console.log('\n=== MANAGER AVAILABILITY ===');
    if (avail.length === 0) {
      console.log('!! NO MANAGER AVAILABILITY SET — managers won\'t appear in selection modal');
    } else {
      avail.forEach(a => {
        console.log(`${a.first_name} ${a.last_name} (${a.role}) id=${a.user_id} | status=${a.status}`);
      });
    }

    // 4. Users with manager+ roles
    const { rows: mgrs } = await pool.query(
      `SELECT id, first_name, last_name, email, role FROM users WHERE role IN ('manager', 'senior_manager', 'admin') AND is_active = true ORDER BY role, last_name`
    );
    console.log('\n=== USERS WITH MANAGER+ ROLES ===');
    mgrs.forEach(m => {
      const hasPin = pins.some(p => p.user_id === m.id);
      const availStatus = avail.find(a => a.user_id === m.id);
      console.log(
        `${m.first_name} ${m.last_name} (${m.role}) id=${m.id} | ${m.email} | pin=${hasPin ? 'YES' : 'MISSING'} | availability=${availStatus ? availStatus.status : 'NOT SET'}`
      );
    });

    // 5. Active delegations
    const { rows: deleg } = await pool.query(
      `SELECT md.*, d.first_name || ' ' || d.last_name as delegator_name, dl.first_name || ' ' || dl.last_name as delegate_name
       FROM manager_delegations md
       JOIN users d ON d.id = md.delegator_id
       JOIN users dl ON dl.id = md.delegate_id
       WHERE md.active = true ORDER BY md.created_at DESC`
    );
    console.log('\n=== ACTIVE DELEGATIONS ===');
    if (deleg.length === 0) {
      console.log('No active delegations (OK)');
    } else {
      deleg.forEach(d => {
        console.log(`${d.delegator_name} -> ${d.delegate_name} | max_tier=${d.max_tier} | expires=${d.expires_at}`);
      });
    }

    // 6. Recent approval requests
    const { rows: recent } = await pool.query(
      `SELECT ar.id, ar.status, ar.tier, ar.original_price, ar.requested_price, ar.approved_price,
              u.first_name || ' ' || u.last_name as salesperson,
              m.first_name || ' ' || m.last_name as manager,
              ar.created_at
       FROM approval_requests ar
       JOIN users u ON u.id = ar.salesperson_id
       LEFT JOIN users m ON m.id = ar.manager_id
       ORDER BY ar.created_at DESC LIMIT 10`
    );
    console.log('\n=== RECENT APPROVAL REQUESTS (last 10) ===');
    if (recent.length === 0) {
      console.log('No approval requests yet');
    } else {
      recent.forEach(r => {
        console.log(
          `#${r.id} ${r.status} T${r.tier} | $${r.original_price} -> $${r.requested_price} (approved: $${r.approved_price || 'n/a'}) | by ${r.salesperson} | mgr: ${r.manager || 'n/a'}`
        );
      });
    }

    // 7. Summary / Issues
    console.log('\n=== CONFIGURATION STATUS ===');
    const issues = [];
    if (tiers.length === 0) issues.push('No tier settings configured');
    if (tiers.length > 0) {
      const hasPcts = tiers.every(t => t.min_discount_percent !== null && t.max_discount_percent !== null);
      if (!hasPcts) issues.push('Tier settings missing discount percentage ranges');
    }
    if (pins.length === 0) issues.push('No manager PINs configured');
    if (avail.length === 0) issues.push('No manager availability set');
    const mgrsWithoutPins = mgrs.filter(m => !pins.some(p => p.user_id === m.id));
    if (mgrsWithoutPins.length > 0) {
      issues.push(`Managers without PINs: ${mgrsWithoutPins.map(m => m.first_name + ' ' + m.last_name).join(', ')}`);
    }
    const mgrsNotAvail = mgrs.filter(m => !avail.some(a => a.user_id === m.id));
    if (mgrsNotAvail.length > 0) {
      issues.push(`Managers without availability: ${mgrsNotAvail.map(m => m.first_name + ' ' + m.last_name).join(', ')}`);
    }

    if (issues.length === 0) {
      console.log('ALL OK - No configuration issues found');
    } else {
      issues.forEach(i => console.log('!! ISSUE: ' + i));
    }

    pool.end();
  } catch (e) {
    console.error('ERROR:', e.message);
    pool.end();
  }
})();
