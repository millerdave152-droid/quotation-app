/**
 * TeleTime POS - WebSocket Service
 *
 * Real-time notification layer for the price-override approval workflow.
 * Attaches to the existing HTTP server (upgrade handling) so it shares
 * the same port as Express.
 *
 * Authentication uses the same JWT tokens as the REST API — the client
 * connects with  ws://host:port/ws?token=<accessToken>
 *
 * Events emitted to clients:
 *   approval:request          – new request assigned to a manager
 *   approval:approved         – manager approved a request
 *   approval:denied           – manager denied a request
 *   approval:countered        – manager counter-offered
 *   approval:counter-accepted – salesperson accepted counter
 *   approval:counter-declined – salesperson declined counter
 *   approval:timed-out        – request expired
 *   manager:status-change     – a manager went online/offline/away
 */

const { WebSocketServer } = require('ws');
const { verifyAccessToken } = require('../utils/jwt');
const pool = require('../db');
const pushService = require('./pushNotificationService');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const HEARTBEAT_INTERVAL_MS = 30_000;   // ping every 30 s
const PONG_TIMEOUT_MS       = 10_000;   // terminate if no pong within 10 s
const TIMEOUT_CHECK_MS      = 30_000;   // sweep for timed-out requests every 30 s

class WebSocketService {
  constructor() {
    /** @type {WebSocketServer|null} */
    this.wss = null;

    /** userId -> Set<WebSocket> */
    this.connections = new Map();

    /** ws -> { userId, role, alive } */
    this.metadata = new WeakMap();

    this._heartbeatTimer = null;
    this._timeoutTimer = null;
  }

  // =========================================================================
  // 1. SETUP — attach to existing HTTP server
  // =========================================================================

  /**
   * @param {import('http').Server} server – the value returned by app.listen()
   */
  init(server) {
    this.wss = new WebSocketServer({ noServer: true });

    // Handle HTTP -> WS upgrade
    server.on('upgrade', (request, socket, head) => {
      // Only upgrade on the /ws path
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }

      const token = url.searchParams.get('token');
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      let decoded;
      try {
        decoded = verifyAccessToken(token);
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request, decoded);
      });
    });

    // Handle new connections
    this.wss.on('connection', (ws, _request, decoded) => {
      this._onConnect(ws, decoded);
    });

    // Start heartbeat pings
    this._heartbeatTimer = setInterval(() => this._heartbeatSweep(), HEARTBEAT_INTERVAL_MS);

    // Start timeout checker for pending approval requests
    this._timeoutTimer = setInterval(() => this._checkTimeouts(), TIMEOUT_CHECK_MS);

    console.log('✅ WebSocket service initialized (path: /ws)');
  }

  // =========================================================================
  // 2. CONNECTION MANAGEMENT
  // =========================================================================

  async _onConnect(ws, decoded) {
    const userId = decoded.userId;
    const role = decoded.role;

    // Store metadata on the socket
    this.metadata.set(ws, { userId, role, alive: true });

    // Add to connections map
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId).add(ws);

    const deviceCount = this.connections.get(userId).size;

    // Update manager_availability (upsert)
    try {
      await pool.query(
        `INSERT INTO manager_availability (user_id, status, last_heartbeat, active_device_count, last_updated)
         VALUES ($1, 'online', NOW(), $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           status              = 'online',
           last_heartbeat      = NOW(),
           active_device_count = $2,
           last_updated        = NOW()`,
        [userId, deviceCount]
      );

      // Broadcast status change to salespersons
      this._broadcastManagerStatus(userId, 'online');
    } catch (err) {
      console.error('[WS] Error updating manager_availability on connect:', err.message);
    }

    // Handle pong
    ws.on('pong', () => {
      const meta = this.metadata.get(ws);
      if (meta) meta.alive = true;
    });

    // Handle disconnect
    ws.on('close', () => this._onDisconnect(ws));
    ws.on('error', () => this._onDisconnect(ws));

    // Send a welcome event so the client knows it's connected
    this._send(ws, 'connected', { userId, role, deviceCount });
  }

  async _onDisconnect(ws) {
    const meta = this.metadata.get(ws);
    if (!meta) return;

    const { userId } = meta;

    // Remove from connections map
    const sockets = this.connections.get(userId);
    if (sockets) {
      sockets.delete(ws);

      if (sockets.size === 0) {
        this.connections.delete(userId);

        // No connections left → mark offline
        try {
          await pool.query(
            `UPDATE manager_availability
             SET status = 'offline', active_device_count = 0, last_updated = NOW()
             WHERE user_id = $1`,
            [userId]
          );
          this._broadcastManagerStatus(userId, 'offline');
        } catch (err) {
          console.error('[WS] Error updating manager_availability on disconnect:', err.message);
        }
      } else {
        // Still has other devices — just decrement count
        try {
          await pool.query(
            `UPDATE manager_availability
             SET active_device_count = $2, last_updated = NOW()
             WHERE user_id = $1`,
            [userId, sockets.size]
          );
        } catch (err) {
          console.error('[WS] Error decrementing device count:', err.message);
        }
      }
    }
  }

  // =========================================================================
  // 3. HEARTBEAT
  // =========================================================================

  _heartbeatSweep() {
    if (!this.wss) return;

    const onlineUserIds = [];

    for (const ws of this.wss.clients) {
      const meta = this.metadata.get(ws);
      if (!meta) { ws.terminate(); continue; }

      if (!meta.alive) {
        // No pong received since last ping → dead connection
        ws.terminate();
        continue;
      }

      meta.alive = false;
      ws.ping();
      onlineUserIds.push(meta.userId);
    }

    // Bulk-update heartbeats for all online users
    const uniqueIds = [...new Set(onlineUserIds)];
    if (uniqueIds.length > 0) {
      pool.query(
        `UPDATE manager_availability
         SET last_heartbeat = NOW(), last_updated = NOW()
         WHERE user_id = ANY($1::int[])`,
        [uniqueIds]
      ).catch(err => {
        console.error('[WS] Heartbeat DB update error:', err.message);
      });
    }
  }

  // =========================================================================
  // 4. SEND HELPERS
  // =========================================================================

  /** Send a JSON event to a single socket. */
  _send(ws, event, data) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ event, data }));
    }
  }

  /**
   * Send an event to ALL connected sessions for a given user.
   * @param {number} userId
   * @param {string} event
   * @param {object} data
   */
  sendToUser(userId, event, data) {
    const sockets = this.connections.get(userId);
    if (!sockets) return;

    const payload = JSON.stringify({ event, data });
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    }
  }

  /**
   * Broadcast to all connected users with a specific role (or set of roles).
   * @param {string[]} roles
   * @param {string} event
   * @param {object} data
   */
  broadcastToRoles(roles, event, data) {
    if (!this.wss) return;

    const payload = JSON.stringify({ event, data });
    for (const ws of this.wss.clients) {
      const meta = this.metadata.get(ws);
      if (meta && roles.includes(meta.role) && ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    }
  }

  // =========================================================================
  // 5. APPROVAL EVENT METHODS
  // =========================================================================

  /** New approval request → notify assigned manager (or all managers if unassigned). */
  notifyNewRequest(request) {
    const data = {
      requestId:      request.id,
      productId:      request.product_id,
      productName:    request.product_name,
      productSku:     request.product_sku,
      salespersonId:  request.salesperson_id,
      salespersonName: request.salesperson_name,
      tier:           request.tier,
      tierName:       request.tier_name,
      originalPrice:  request.original_price,
      requestedPrice: request.requested_price,
      costAtTime:     request.cost_at_time,
      marginAmount:   request.margin_amount,
      marginPercent:  request.margin_percent,
      createdAt:      request.created_at,
    };

    if (request.manager_id) {
      this.sendToUser(request.manager_id, 'approval:request', data);
    } else {
      // No specific manager — broadcast to all manager/admin sessions
      this.broadcastToRoles(['manager', 'senior_manager', 'admin'], 'approval:request', data);
    }

    // Also send a web push notification (fire-and-forget, never blocks WS)
    pushService.sendApprovalOverridePush({
      managerId:      request.manager_id || null,
      salespersonName: request.salesperson_name || 'A salesperson',
      productName:    request.product_name || null,
      requestedPrice: request.requested_price,
      originalPrice:  request.original_price,
      requestId:      request.id,
    }).catch(err => {
      console.error('[WS] Push notification failed (non-fatal):', err.message);
    });
  }

  /** Manager approved → notify the salesperson. */
  notifyApproved(request) {
    this.sendToUser(request.salesperson_id, 'approval:approved', {
      requestId:     request.id,
      approvedPrice: request.approved_price,
      originalPrice: request.original_price,
      marginPercent: request.margin_percent,
      method:        request.method,
      managerId:     request.manager_id,
      managerName:   request.manager_name,
      approvalToken: request.approval_token,
      respondedAt:   request.responded_at,
    });
  }

  /** Manager denied → notify the salesperson. */
  notifyDenied(request) {
    this.sendToUser(request.salesperson_id, 'approval:denied', {
      requestId:  request.id,
      reasonCode: request.reason_code,
      reasonNote: request.reason_note,
      managerId:  request.manager_id,
      managerName: request.manager_name,
      respondedAt: request.responded_at,
    });
  }

  /** Manager countered → notify the salesperson. */
  notifyCountered(request, counterOffer) {
    this.sendToUser(request.salesperson_id, 'approval:countered', {
      requestId:      request.id,
      counterOfferId: counterOffer.id,
      counterPrice:   counterOffer.counter_price,
      originalPrice:  request.original_price,
      requestedPrice: request.requested_price,
      marginPercent:  counterOffer.margin_percent,
      managerId:      counterOffer.manager_id,
      managerName:    counterOffer.manager_name,
      createdAt:      counterOffer.created_at,
    });
  }

  /** Salesperson accepted counter → notify the manager who made the offer. */
  notifyCounterAccepted(request, counterOffer) {
    const managerId = counterOffer.manager_id || request.manager_id;
    if (managerId) {
      this.sendToUser(managerId, 'approval:counter-accepted', {
        requestId:      request.id,
        counterOfferId: counterOffer.id,
        acceptedPrice:  counterOffer.counter_price,
        salespersonId:  request.salesperson_id,
        salespersonName: request.salesperson_name,
      });
    }
  }

  /** Salesperson declined counter → notify the manager who made the offer. */
  notifyCounterDeclined(request, counterOffer) {
    const managerId = counterOffer.manager_id || request.manager_id;
    if (managerId) {
      this.sendToUser(managerId, 'approval:counter-declined', {
        requestId:      request.id,
        counterOfferId: counterOffer.id,
        declinedPrice:  counterOffer.counter_price,
        salespersonId:  request.salesperson_id,
        salespersonName: request.salesperson_name,
      });
    }
  }

  /** Request timed out → notify the salesperson. */
  notifyTimedOut(request) {
    this.sendToUser(request.salesperson_id, 'approval:timed-out', {
      requestId:      request.id,
      tier:           request.tier,
      tierName:       request.tier_name,
      originalPrice:  request.original_price,
      requestedPrice: request.requested_price,
      createdAt:      request.created_at,
      timedOutAt:     new Date().toISOString(),
    });
  }

  // =========================================================================
  // 6. MANAGER STATUS BROADCAST
  // =========================================================================

  /**
   * Broadcast a manager availability change to all connected salesperson sessions.
   * @param {number} managerId
   * @param {string} status – 'online' | 'offline' | 'away'
   */
  async _broadcastManagerStatus(managerId, status) {
    try {
      const { rows } = await pool.query(
        `SELECT id, CONCAT(first_name, ' ', last_name) AS name, role
         FROM users WHERE id = $1`,
        [managerId]
      );
      const manager = rows[0];
      if (!manager) return;

      // Only broadcast if this user is actually a manager-level role
      const managerRoles = ['manager', 'senior_manager', 'admin'];
      if (!managerRoles.includes(manager.role)) return;

      this.broadcastToRoles(
        ['user', 'salesperson'],
        'manager:status-change',
        { managerId, managerName: manager.name, status }
      );
    } catch (err) {
      console.error('[WS] Error broadcasting manager status:', err.message);
    }
  }

  // =========================================================================
  // 7. TIMEOUT CHECKER
  // =========================================================================

  async _checkTimeouts() {
    try {
      // Find pending requests past their tier's timeout_seconds
      // Only tiers where timeout_seconds > 0
      const { rows: timedOut } = await pool.query(
        `SELECT
           ar.id, ar.salesperson_id, ar.manager_id, ar.tier,
           ar.original_price, ar.requested_price, ar.created_at,
           ar.request_type,
           ats.name AS tier_name, ats.timeout_seconds
         FROM approval_requests ar
         JOIN approval_tier_settings ats ON ats.tier = ar.tier
         WHERE ar.status = 'pending'
           AND ats.timeout_seconds > 0
           AND ar.created_at + (ats.timeout_seconds || ' seconds')::interval < NOW()
           AND (ar.request_type IS NULL OR ar.request_type != 'child')`
      );

      for (const req of timedOut) {
        // Update status to timed_out
        await pool.query(
          `UPDATE approval_requests
           SET status = 'timed_out', responded_at = NOW()
           WHERE id = $1 AND status = 'pending'`,
          [req.id]
        );

        // If batch parent timed out, also time out its children
        if (req.request_type === 'batch') {
          await pool.query(
            `UPDATE approval_requests SET status = 'timed_out', responded_at = NOW()
             WHERE parent_request_id = $1 AND status = 'pending'`,
            [req.id]
          );
        }

        // Notify the salesperson
        this.notifyTimedOut(req);
      }

      if (timedOut.length > 0) {
        console.log(`[WS] Timed out ${timedOut.length} pending approval request(s)`);
      }

      // Expire delegations
      try {
        const { rows: expired } = await pool.query(
          `UPDATE manager_delegations SET active = FALSE
           WHERE active = TRUE AND expires_at <= NOW()
           RETURNING id, delegator_id, delegate_id`
        );
        for (const d of expired) {
          this.sendToUser(d.delegator_id, 'delegation:expired', { delegationId: d.id });
          this.sendToUser(d.delegate_id, 'delegation:expired', { delegationId: d.id });
        }
        if (expired.length > 0) {
          console.log(`[WS] Expired ${expired.length} delegation(s)`);
        }
      } catch (delegErr) {
        console.error('[WS] Delegation expiry error:', delegErr.message);
      }
    } catch (err) {
      console.error('[WS] Timeout checker error:', err.message);
    }
  }

  // =========================================================================
  // 8. SHUTDOWN
  // =========================================================================

  shutdown() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this._timeoutTimer) {
      clearInterval(this._timeoutTimer);
      this._timeoutTimer = null;
    }
    if (this.wss) {
      for (const ws of this.wss.clients) {
        ws.close(1001, 'Server shutting down');
      }
      this.wss.close();
      this.wss = null;
    }
  }

  /** Number of connected unique users. */
  get onlineUserCount() {
    return this.connections.size;
  }

  /** Total active socket count across all users. */
  get totalConnectionCount() {
    let count = 0;
    for (const sockets of this.connections.values()) {
      count += sockets.size;
    }
    return count;
  }
}

// Singleton
module.exports = new WebSocketService();
