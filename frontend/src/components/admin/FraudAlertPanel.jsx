/**
 * TeleTime - FraudAlertPanel
 * Real-time WebSocket-connected live feed of fraud alerts across all terminals.
 *
 * Features:
 * - WebSocket subscription for fraud:alert events (raw ws, not Socket.IO)
 * - Severity filtering (all, medium+, high+, critical)
 * - Location dropdown filter
 * - Auto-scroll with pause when user scrolls up
 * - Browser Notification API + audio chime for score > 70
 * - Running severity counts for current day
 * - Click to navigate to transaction review
 * - Max 200 alerts in memory (older ones drop off)
 * - Reconnect with gap-fill (fetch last 20 via API)
 * - Mark reviewed inline
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || '';
const WS_URL = API_URL.replace(/^http/, 'ws');
const MAX_ALERTS = 200;
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

// ============================================================================
// SIGNAL PLAIN-LANGUAGE MAP
// ============================================================================

function getTopSignals(alert, maxCount = 3) {
  const reasons = [];
  const signals = alert.signals || {};
  const triggeredRules = alert.triggeredRules || [];

  // Entry method
  const entry = signals.entry_method;
  if (entry?.riskPoints > 0) {
    const labels = {
      manual: 'Manual card entry',
      keyed: 'Manual card entry',
      moto: 'Phone/mail order',
      swipe: 'Magnetic stripe fallback',
      fallback_swipe: 'Magnetic stripe fallback',
    };
    reasons.push(labels[entry.method] || `${entry.method} entry`);
  }

  // Velocity
  if (signals.velocity) {
    for (const [dim, v] of Object.entries(signals.velocity)) {
      if (v.exceeded) {
        if (dim === 'card') reasons.push(`Card used ${v.count}x in 5min`);
        else if (dim === 'terminal') reasons.push(`${v.count} rapid terminal txns`);
        else if (dim === 'decline') reasons.push(`${v.count} declines in 10min`);
        else reasons.push(`High ${dim} velocity`);
      }
    }
  }

  // BIN risk
  const bin = signals.bin_risk;
  if (bin?.riskPoints > 0) {
    const flags = bin.flags || [];
    if (flags.includes('prepaid_card')) reasons.push('Prepaid card');
    if (flags.includes('foreign_card')) reasons.push('Foreign card');
  }

  // Amount anomaly
  if (signals.amount_anomaly?.riskPoints > 0) reasons.push('Unusual amount');

  // Customer
  const cust = signals.customer_anomaly || signals.customer_history;
  if (cust?.chargebackCount > 0) reasons.push(`${cust.chargebackCount} chargebacks`);
  if (cust?.reason === 'high_value_no_customer') reasons.push('No customer on file');
  if (cust?.flags?.includes('new_customer_high_value')) reasons.push('New customer, high value');

  // Patterns
  if (signals.split_transaction?.riskPoints > 0) reasons.push('Split transaction');
  if (signals.card_testing?.riskPoints > 0) reasons.push('Card testing');
  if (signals.geographic_anomaly?.riskPoints > 0) reasons.push('Geographic anomaly');
  if (signals.decline_pattern?.riskPoints > 0) reasons.push('Decline pattern');
  if (signals.employee_risk?.riskPoints > 0) reasons.push('Employee risk');
  if (signals.time_anomaly?.riskPoints > 0) reasons.push('Off-hours');

  // Fallback to triggered rules
  if (reasons.length === 0) {
    for (const rule of triggeredRules) {
      reasons.push(rule.rule_name || rule.source || rule.rule_code || 'Rule triggered');
    }
  }

  return reasons.length > 0 ? reasons.slice(0, maxCount) : ['Fraud signals detected'];
}

// ============================================================================
// HELPERS
// ============================================================================

function getRiskLevel(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

const SEVERITY_CONFIG = {
  critical: { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', badge: '#dc2626', dot: '#ef4444' },
  high:     { bg: '#ffedd5', border: '#fdba74', text: '#c2410c', badge: '#ea580c', dot: '#f97316' },
  medium:   { bg: '#fef9c3', border: '#fde047', text: '#854d0e', badge: '#ca8a04', dot: '#eab308' },
  low:      { bg: '#f3f4f6', border: '#d1d5db', text: '#374151', badge: '#6b7280', dot: '#9ca3af' },
};

const ACTION_LABELS = {
  block: 'Blocked',
  declined: 'Blocked',
  require_approval: 'Held',
  held: 'Held',
  alert: 'Flagged',
  flagged: 'Flagged',
  allow: 'Approved',
  approved: 'Approved',
  override_approved: 'Override',
};

const ACTION_COLORS = {
  block: { bg: '#fee2e2', text: '#991b1b' },
  declined: { bg: '#fee2e2', text: '#991b1b' },
  require_approval: { bg: '#fef3c7', text: '#92400e' },
  held: { bg: '#fef3c7', text: '#92400e' },
  alert: { bg: '#ffedd5', text: '#c2410c' },
  flagged: { bg: '#ffedd5', text: '#c2410c' },
  allow: { bg: '#d1fae5', text: '#065f46' },
  approved: { bg: '#d1fae5', text: '#065f46' },
  override_approved: { bg: '#ede9fe', text: '#5b21b6' },
};

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ============================================================================
// FILTER BUTTONS
// ============================================================================

const SEVERITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'medium', label: 'Medium+' },
  { key: 'high', label: 'High+' },
  { key: 'critical', label: 'Critical' },
];

function minScoreForFilter(filterKey) {
  if (filterKey === 'critical') return 80;
  if (filterKey === 'high') return 60;
  if (filterKey === 'medium') return 30;
  return 0;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function FraudAlertPanel({ token, onAlertCountChange }) {
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const wsRef = useRef(null);
  const audioRef = useRef(null);
  const listRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  // ---- Severity counts for current day ----
  const severityCounts = useMemo(() => {
    const today = new Date().toDateString();
    const todayAlerts = alerts.filter(a => new Date(a.timestamp || a.created_at).toDateString() === today);
    return {
      critical: todayAlerts.filter(a => (a.score || 0) >= 80).length,
      high: todayAlerts.filter(a => (a.score || 0) >= 60 && (a.score || 0) < 80).length,
      medium: todayAlerts.filter(a => (a.score || 0) >= 30 && (a.score || 0) < 60).length,
      total: todayAlerts.length,
    };
  }, [alerts]);

  // ---- Unreviewed count (for sidebar badge) ----
  const unreviewedCount = useMemo(() => {
    return alerts.filter(a => !a.reviewed && !a.reviewed_by).length;
  }, [alerts]);

  useEffect(() => {
    if (onAlertCountChange) onAlertCountChange(unreviewedCount);
  }, [unreviewedCount, onAlertCountChange]);

  // ---- Extract unique locations ----
  const locations = useMemo(() => {
    const locs = new Set();
    alerts.forEach(a => {
      if (a.locationId || a.location_id) locs.add(String(a.locationId || a.location_id));
    });
    return Array.from(locs).sort();
  }, [alerts]);

  // ---- Filtered alerts ----
  const filteredAlerts = useMemo(() => {
    let filtered = alerts;
    const minScore = minScoreForFilter(severityFilter);
    if (minScore > 0) {
      filtered = filtered.filter(a => (a.score || 0) >= minScore);
    }
    if (locationFilter !== 'all') {
      filtered = filtered.filter(a => String(a.locationId || a.location_id) === locationFilter);
    }
    return filtered;
  }, [alerts, severityFilter, locationFilter]);

  // ---- Notification permission ----
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ---- Auto-scroll management ----
  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop } = listRef.current;
    // If user scrolls up from top, pause auto-scroll; resume when back at top
    setAutoScroll(scrollTop <= 10);
  }, []);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [filteredAlerts.length, autoScroll]);

  // ---- Add alert helper ----
  const addAlert = useCallback((alertData) => {
    const score = alertData.score || alertData.riskScore || 0;
    const riskLevel = alertData.riskLevel || getRiskLevel(score);

    const normalized = {
      _id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      score,
      riskLevel,
      action: alertData.action || alertData.type || 'allow',
      employeeId: alertData.employeeId || alertData.employee_id,
      employeeName: alertData.employeeName || alertData.employee_name || null,
      locationId: alertData.locationId || alertData.location_id || null,
      terminalId: alertData.terminalId || alertData.terminal_id || null,
      amount: alertData.amount || 0,
      entryMethod: alertData.entryMethod || alertData.entry_method || null,
      signals: alertData.signals || {},
      triggeredRules: alertData.triggeredRules || [],
      timestamp: alertData.timestamp || new Date().toISOString(),
      reviewed: false,
      isNew: true,
    };

    setAlerts(prev => [normalized, ...prev].slice(0, MAX_ALERTS));

    // Audio + notification for score > 70
    if (score > 70) {
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio('/alert.mp3');
          audioRef.current.volume = 0.5;
        }
        audioRef.current.play().catch(() => {});
      } catch { /* audio not available */ }

      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Fraud Alert', {
            body: `Score ${score} — ${ACTION_LABELS[normalized.action] || normalized.action}${normalized.employeeName ? ` — ${normalized.employeeName}` : ''} — $${parseFloat(normalized.amount || 0).toFixed(2)}`,
            icon: '/favicon.ico',
            tag: `fraud-${normalized._id}`,
          });
        } catch { /* notifications not available */ }
      }
    }
  }, []);

  // ---- Fetch recent scores (gap-fill on mount and reconnect) ----
  const fetchRecentScores = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/fraud/scores?min_score=30&limit=20&page=1`);
      const data = await res.json();
      if (data.success && data.data?.rows) {
        const apiAlerts = data.data.rows.map(row => ({
          _id: `api-${row.id}`,
          id: row.id,
          score: row.score,
          riskLevel: row.risk_level || getRiskLevel(row.score),
          action: row.action_taken || 'allow',
          employeeId: row.employee_id,
          employeeName: row.employee_name || null,
          locationId: row.location_id,
          terminalId: row.terminal_id,
          amount: parseFloat(row.amount || 0),
          entryMethod: row.entry_method,
          signals: row.signals || {},
          triggeredRules: [],
          timestamp: row.created_at,
          reviewed: !!row.reviewed_by,
          reviewed_by: row.reviewed_by,
          isNew: false,
        }));
        setAlerts(prev => {
          const existingIds = new Set(prev.map(a => a._id));
          const newAlerts = apiAlerts.filter(a => !existingIds.has(a._id));
          if (newAlerts.length === 0) return prev;
          // Merge and sort by timestamp desc
          const merged = [...prev, ...newAlerts]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, MAX_ALERTS);
          return merged;
        });
      }
    } catch (err) {
      console.error('[FraudAlertPanel] Failed to fetch recent scores:', err);
    }
  }, []);

  // ---- WebSocket connection ----
  useEffect(() => {
    const authToken = token || localStorage.getItem('auth_token');
    if (!authToken) return;

    let ws = null;
    let mounted = true;

    const connect = () => {
      if (!mounted) return;

      try {
        ws = new WebSocket(`${WS_URL}/ws?token=${authToken}`);

        ws.onopen = () => {
          if (!mounted) return;
          setConnected(true);
          reconnectAttemptRef.current = 0;
          // Gap-fill: fetch recent scores on reconnect
          fetchRecentScores();
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            // WebSocket message format: { event: 'fraud:alert', data: {...} }
            if (message.event === 'fraud:alert') {
              addAlert(message.data);
            }
          } catch { /* ignore malformed messages */ }
        };

        ws.onclose = () => {
          if (!mounted) return;
          setConnected(false);
          wsRef.current = null;
          // Exponential backoff
          const attempt = reconnectAttemptRef.current;
          const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS);
          reconnectAttemptRef.current = attempt + 1;
          reconnectTimerRef.current = setTimeout(connect, delay);
        };

        ws.onerror = () => {
          ws.close();
        };

        wsRef.current = ws;
      } catch {
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS);
        reconnectAttemptRef.current = attempt + 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    // Fetch initial data, then connect
    fetchRecentScores();
    connect();

    return () => {
      mounted = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (ws) ws.close();
    };
  }, [token, fetchRecentScores, addAlert]);

  // ---- Mark reviewed ----
  const handleMarkReviewed = useCallback(async (alert) => {
    const scoreId = alert.id;
    if (!scoreId) return;
    setReviewingId(alert._id);
    try {
      await authFetch(`${API_URL}/api/fraud/scores/${scoreId}/review`, {
        method: 'PUT',
        body: JSON.stringify({ review_notes: reviewNotes || 'Reviewed from live feed' }),
      });
      setAlerts(prev => prev.map(a =>
        a._id === alert._id ? { ...a, reviewed: true, isNew: false } : a
      ));
      setReviewNotes('');
    } catch (err) {
      console.error('[FraudAlertPanel] Failed to mark reviewed:', err);
    }
    setReviewingId(null);
  }, [reviewNotes]);

  // ---- Render ----
  return (
    <div>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#111827' }}>
            Live Alert Feed
          </h3>
          {/* Connection indicator */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
            background: connected ? '#d1fae5' : '#fee2e2',
            color: connected ? '#065f46' : '#991b1b',
          }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: connected ? '#10b981' : '#ef4444',
              display: 'inline-block',
              animation: connected ? 'none' : undefined,
            }} />
            {connected ? 'Live' : 'Reconnecting...'}
          </span>
        </div>

        {/* Severity counts */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {severityCounts.critical > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: '#fee2e2', color: '#dc2626' }}>
              {severityCounts.critical} critical
            </span>
          )}
          {severityCounts.high > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: '#ffedd5', color: '#ea580c' }}>
              {severityCounts.high} high
            </span>
          )}
          {severityCounts.medium > 0 && (
            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: '#fef9c3', color: '#ca8a04' }}>
              {severityCounts.medium} medium
            </span>
          )}
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {severityCounts.total} today
          </span>
        </div>
      </div>

      {/* Filters Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        {/* Severity filter buttons */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {SEVERITY_FILTERS.map(f => {
            const isActive = severityFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setSeverityFilter(f.key)}
                style={{
                  padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                  border: `1px solid ${isActive ? '#4f46e5' : '#d1d5db'}`,
                  background: isActive ? '#eef2ff' : '#fff',
                  color: isActive ? '#4338ca' : '#6b7280',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Location filter + auto-scroll indicator */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {locations.length > 0 && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              style={{
                padding: '5px 8px', borderRadius: '6px', fontSize: '12px',
                border: '1px solid #d1d5db', color: '#374151', background: '#fff',
                cursor: 'pointer',
              }}
            >
              <option value="all">All locations</option>
              {locations.map(loc => (
                <option key={loc} value={loc}>Location {loc}</option>
              ))}
            </select>
          )}
          {!autoScroll && (
            <button
              onClick={() => { setAutoScroll(true); if (listRef.current) listRef.current.scrollTop = 0; }}
              style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd',
                cursor: 'pointer',
              }}
            >
              Resume auto-scroll
            </button>
          )}
        </div>
      </div>

      {/* Alert List */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{ maxHeight: '600px', overflowY: 'auto', scrollBehavior: 'smooth' }}
      >
        {filteredAlerts.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>&#128737;</div>
            <p style={{ fontSize: '15px', margin: '0 0 4px', fontWeight: 500 }}>No alerts{severityFilter !== 'all' ? ` matching "${SEVERITY_FILTERS.find(f => f.key === severityFilter)?.label}" filter` : ''}</p>
            <p style={{ fontSize: '13px', margin: 0 }}>Real-time fraud events will appear here as they happen</p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const score = alert.score || 0;
            const level = alert.riskLevel || getRiskLevel(score);
            const sev = SEVERITY_CONFIG[level] || SEVERITY_CONFIG.medium;
            const actionKey = alert.action || 'allow';
            const actionLabel = ACTION_LABELS[actionKey] || actionKey;
            const actionColor = ACTION_COLORS[actionKey] || ACTION_COLORS.allow;
            const isExpanded = expandedId === alert._id;
            const topSignals = getTopSignals(alert);

            return (
              <div
                key={alert._id}
                style={{
                  padding: '12px 16px', marginBottom: '6px', borderRadius: '10px',
                  border: `1px solid ${alert.isNew ? sev.border : '#e5e7eb'}`,
                  background: alert.isNew ? sev.bg : (alert.reviewed ? '#fafafa' : '#fff'),
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  opacity: alert.reviewed ? 0.7 : 1,
                }}
                onClick={() => setExpandedId(isExpanded ? null : alert._id)}
              >
                {/* Top row: time, score badge, action, amount */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>
                      {formatTime(alert.timestamp)}
                    </span>
                    {/* Score badge */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: '32px', padding: '2px 8px', borderRadius: '6px',
                      fontSize: '13px', fontWeight: 800,
                      background: sev.badge, color: '#fff',
                    }}>
                      {score}
                    </span>
                    {/* Risk level label */}
                    <span style={{
                      fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                      color: sev.text,
                    }}>
                      {level}
                    </span>
                    {/* Action badge */}
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                      background: actionColor.bg, color: actionColor.text,
                    }}>
                      {actionLabel}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {alert.amount > 0 && (
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                        ${parseFloat(alert.amount).toFixed(2)}
                      </span>
                    )}
                    {alert.reviewed && (
                      <span style={{
                        padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                        background: '#d1fae5', color: '#065f46',
                      }}>
                        Reviewed
                      </span>
                    )}
                  </div>
                </div>

                {/* Middle row: employee, terminal, entry method */}
                <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#374151', marginBottom: '4px', flexWrap: 'wrap' }}>
                  {alert.employeeName && (
                    <span><strong style={{ color: '#6b7280', fontWeight: 500 }}>Employee:</strong> {alert.employeeName}</span>
                  )}
                  {alert.terminalId && (
                    <span><strong style={{ color: '#6b7280', fontWeight: 500 }}>Terminal:</strong> {alert.terminalId}</span>
                  )}
                  {alert.entryMethod && (
                    <span><strong style={{ color: '#6b7280', fontWeight: 500 }}>Entry:</strong> {alert.entryMethod}</span>
                  )}
                  {alert.locationId && (
                    <span><strong style={{ color: '#6b7280', fontWeight: 500 }}>Location:</strong> {alert.locationId}</span>
                  )}
                </div>

                {/* Signals row: top 3 signals */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {topSignals.map((sig, i) => (
                    <span key={i} style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '11px',
                      background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb',
                    }}>
                      {sig}
                    </span>
                  ))}
                </div>

                {/* Expanded detail view */}
                {isExpanded && (
                  <div style={{
                    marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e5e7eb',
                  }}>
                    {/* Full signal breakdown */}
                    {alert.signals && Object.keys(alert.signals).length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                          Signal Breakdown
                        </div>
                        <div style={{
                          background: '#f9fafb', padding: '8px 12px', borderRadius: '6px',
                          fontSize: '12px', color: '#4b5563', fontFamily: 'monospace',
                          maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap',
                        }}>
                          {JSON.stringify(alert.signals, null, 2)}
                        </div>
                      </div>
                    )}

                    {/* Triggered rules */}
                    {alert.triggeredRules?.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                          Triggered Rules ({alert.triggeredRules.length})
                        </div>
                        {alert.triggeredRules.map((rule, i) => (
                          <div key={i} style={{
                            display: 'flex', gap: '8px', alignItems: 'center',
                            padding: '4px 0', fontSize: '12px', color: '#4b5563',
                          }}>
                            <span style={{
                              padding: '1px 6px', borderRadius: '3px', fontSize: '11px', fontWeight: 600,
                              background: '#fee2e2', color: '#991b1b',
                            }}>
                              +{rule.riskPoints || rule.risk_points || 0}
                            </span>
                            <span>{rule.source || rule.rule_name || rule.rule_code}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Mark reviewed button */}
                    {!alert.reviewed && alert.id && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}
                        onClick={(e) => e.stopPropagation()}>
                        {reviewingId === alert._id ? (
                          <>
                            <input
                              type="text"
                              placeholder="Notes (optional)..."
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              style={{
                                flex: 1, padding: '5px 8px', fontSize: '12px',
                                border: '1px solid #d1d5db', borderRadius: '5px',
                              }}
                            />
                            <button
                              onClick={() => handleMarkReviewed(alert)}
                              style={{
                                padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                                background: '#10b981', color: '#fff', border: 'none',
                                borderRadius: '5px', cursor: 'pointer',
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => { setReviewingId(null); setReviewNotes(''); }}
                              style={{
                                padding: '5px 8px', fontSize: '12px',
                                background: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db',
                                borderRadius: '5px', cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setReviewingId(alert._id)}
                            style={{
                              padding: '5px 14px', fontSize: '12px', fontWeight: 600,
                              background: '#fff', color: '#4f46e5', border: '1px solid #818cf8',
                              borderRadius: '5px', cursor: 'pointer',
                            }}
                          >
                            Mark Reviewed
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
