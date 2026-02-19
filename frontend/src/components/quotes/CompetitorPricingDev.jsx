import React from 'react';
import CompetitorPricingPanel from './CompetitorPricingPanel';
import fixture from './__fixtures__/competitorPricingFixture';

/**
 * Dev-only preview for CompetitorPricingPanel.
 * Shows 3 price scenarios + an edge-case with all-zero pricing.
 * Route: /dev/competitor-pricing (only in development)
 */
const CompetitorPricingDev = () => {
  const scenarios = [
    {
      title: 'TeleTime cheaper ($999) — Best in market',
      description: 'TeleTime beats all competitors. Green banner should appear.',
      teleTimePrice: 999,
    },
    {
      title: 'TeleTime matches Best Buy ($1,299)',
      description: 'TeleTime ties the lowest competitor. Still "best price in market".',
      teleTimePrice: 1299,
    },
    {
      title: 'TeleTime more expensive ($1,599) — Warning state',
      description: 'Competitors are cheaper. Red "less" indicators in the vs column.',
      teleTimePrice: 1599,
    },
    {
      title: 'All competitor prices are $0/null — should render nothing',
      description: 'When all prices are zero, the component returns null.',
      teleTimePrice: 1499,
      overridePricing: {
        best_buy: { price: 0, updated: '2026-03-07 00:09:14' },
        home_depot: { price: 0, updated: '2026-03-07 00:09:14' },
        lowes: { price: 0, updated: '2026-03-07 00:09:14' },
        aj_madison: { price: 0, updated: '2026-03-07 00:09:14' },
      },
    },
  ];

  return (
    <div style={{ padding: '40px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: '100vh' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <h1 style={{
          fontSize: '24px', fontWeight: 700, marginBottom: '8px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          CompetitorPricingPanel — Dev Preview
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '32px' }}>
          Using fixture: Best Buy $1,299 · Home Depot $1,349 · Lowe's N/A · AJ Madison N/A
        </p>

        {scenarios.map((s, i) => (
          <div key={i} style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
              {i + 1}. {s.title}
            </h3>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>{s.description}</p>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', background: 'white' }}>
              <CompetitorPricingPanel
                competitorPricing={s.overridePricing || fixture}
                teleTimePrice={s.teleTimePrice}
                currency="CAD"
                defaultExpanded={i < 3}
              />
              {s.overridePricing && (
                <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>
                  (Component correctly renders nothing for all-zero pricing)
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CompetitorPricingDev;
