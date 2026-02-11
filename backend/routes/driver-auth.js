const express = require('express');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateAccessToken } = require('../utils/jwt');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

const MAX_FAILED_ATTEMPTS = 10;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

function init({ pool }) {
  const router = express.Router();

  // ---- POST / — driver login with employee_id + PIN ----
  router.post('/', asyncHandler(async (req, res) => {
    const { employee_id, pin, remember } = req.body;

    if (!employee_id || !pin) {
      throw ApiError.badRequest('employee_id and pin are required');
    }

    // Look up driver by employee_id
    const { rows } = await pool.query(
      `SELECT d.*, u.email as user_email, u.role as user_role
       FROM drivers d
       LEFT JOIN users u ON d.user_id = u.id
       WHERE d.employee_id = $1 AND d.is_active = true`,
      [employee_id.toUpperCase()]
    );

    if (!rows.length) {
      throw ApiError.unauthorized('Invalid Employee ID or PIN');
    }

    const driver = rows[0];

    // Check account lock
    if (driver.locked_until && new Date(driver.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(driver.locked_until) - Date.now()) / 60000);
      throw new ApiError('ACCOUNT_LOCKED', `Account locked. Try again in ${mins} minute(s).`, { statusCode: 423 });
    }

    // Verify PIN
    if (!driver.pin_hash) {
      throw ApiError.unauthorized('PIN not set. Contact your manager to set up your PIN.');
    }

    const valid = await comparePassword(pin, driver.pin_hash);
    if (!valid) {
      const attempts = (driver.failed_login_attempts || 0) + 1;
      const locked = attempts >= MAX_FAILED_ATTEMPTS;
      const lockUntil = locked ? new Date(Date.now() + LOCK_TIME_MS) : null;

      await pool.query(
        `UPDATE drivers SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
        [attempts, lockUntil, driver.id]
      );

      if (locked) {
        throw new ApiError('ACCOUNT_LOCKED', 'Too many failed attempts. Account locked for 15 minutes.', { statusCode: 423 });
      }
      throw ApiError.unauthorized('Invalid Employee ID or PIN');
    }

    // Success — reset failed attempts, set last_login
    await pool.query(
      `UPDATE drivers SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1`,
      [driver.id]
    );

    // Generate JWT — use the linked user_id if available, otherwise driver.id
    const tokenUser = {
      id: driver.user_id || driver.id,
      email: driver.user_email || driver.email,
      role: driver.user_role || 'driver',
    };

    // For "remember" devices, override expiry to 30 days via env
    const token = generateAccessToken(tokenUser);

    res.json({
      token,
      driver: {
        id: driver.id,
        user_id: driver.user_id,
        name: driver.name,
        employee_id: driver.employee_id,
        phone: driver.phone,
        email: driver.email,
        photo_url: driver.photo_url,
        status: driver.status,
      },
    });
  }));

  // ---- GET /me — get current driver profile ----
  router.get('/me', authenticate, asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { rows } = await pool.query(
      `SELECT d.id, d.user_id, d.name, d.employee_id, d.phone, d.email,
              d.photo_url, d.status, d.license_number, d.vehicle_id
       FROM drivers d
       WHERE d.user_id = $1 AND d.is_active = true`,
      [userId]
    );

    if (!rows.length) {
      // Maybe the JWT userId IS the driver.id (no linked user)
      const fallback = await pool.query(
        `SELECT id, user_id, name, employee_id, phone, email,
                photo_url, status, license_number, vehicle_id
         FROM drivers WHERE id = $1 AND is_active = true`,
        [userId]
      );
      if (!fallback.rows.length) {
        throw ApiError.notFound('Driver profile');
      }
      return res.json({ driver: fallback.rows[0] });
    }

    res.json({ driver: rows[0] });
  }));

  // ---- POST /logout — (optional) server-side cleanup ----
  router.post('/logout', authenticate, async (req, res) => {
    // No refresh tokens for driver app currently — just acknowledge
    res.json({ success: true });
  });

  // ---- POST /set-pin — admin or driver sets/resets PIN ----
  router.post('/set-pin', authenticate, asyncHandler(async (req, res) => {
    const { driver_id, pin } = req.body;

    if (!pin || pin.length < 4 || pin.length > 8) {
      throw ApiError.badRequest('PIN must be 4-8 characters');
    }

    // Either the driver is setting their own, or admin is setting for them
    const targetDriverId = driver_id || null;
    let driverId;

    if (targetDriverId) {
      // Check if the caller is admin/manager
      if (!['admin', 'manager'].includes(req.user.role)) {
        throw ApiError.forbidden('Only managers can set PINs for other drivers');
      }
      driverId = targetDriverId;
    } else {
      // Driver setting own PIN — find by user_id
      const { rows } = await pool.query(
        'SELECT id FROM drivers WHERE user_id = $1',
        [req.user.id]
      );
      if (!rows.length) throw ApiError.notFound('Driver profile');
      driverId = rows[0].id;
    }

    const pinHash = await hashPassword(pin);
    await pool.query(
      'UPDATE drivers SET pin_hash = $1 WHERE id = $2',
      [pinHash, driverId]
    );

    res.json({ success: true, message: 'PIN updated' });
  }));

  return router;
}

module.exports = { init };
