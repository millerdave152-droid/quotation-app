/**
 * TeleTime - Risk Score Badge
 * Small shield badge showing fraud risk level for transactions and quotes.
 * Green (0-29), Amber (30-59), Red (60+)
 */

import React, { useState } from 'react';

const getScoreConfig = (score) => {
  if (score >= 60) return { bg: '#fee2e2', color: '#dc2626', border: '#fecaca', label: 'High Risk' };
  if (score >= 30) return { bg: '#fef3c7', color: '#d97706', border: '#fcd34d', label: 'Elevated' };
  return { bg: '#d1fae5', color: '#16a34a', border: '#a7f3d0', label: 'Low Risk' };
};

export default function RiskScoreBadge({ score, triggeredRules = [] }) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (score === null || score === undefined) return null;

  const config = getScoreConfig(score);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '2px 8px', borderRadius: '12px',
        background: config.bg, border: `1px solid ${config.border}`,
        cursor: triggeredRules.length > 0 ? 'help' : 'default',
      }}>
        {/* Shield icon inline SVG */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span style={{ fontSize: '11px', fontWeight: 700, color: config.color }}>{score}</span>
      </div>

      {/* Tooltip */}
      {showTooltip && triggeredRules.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: '6px', padding: '8px 12px', borderRadius: '8px',
          background: '#1f2937', color: 'white', fontSize: '12px',
          whiteSpace: 'nowrap', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{config.label} (Score: {score})</p>
          {triggeredRules.map((rule, i) => (
            <p key={i} style={{ margin: '2px 0', color: '#d1d5db' }}>
              &bull; {rule.rule_name || rule.rule_code}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
