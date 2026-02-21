import React, { useState, useMemo, useEffect, useRef } from 'react';
import { authFetch } from '../../services/authFetch';

// ── Retailer display names ──────────────────────────────────

const RETAILER_LABELS = {
  best_buy: 'Best Buy',
  home_depot: 'Home Depot',
  lowes: "Lowe's",
  aj_madison: 'AJ Madison',
  canadian_tire: 'Canadian Tire',
  costco: 'Costco',
  amazon: 'Amazon',
  wayfair: 'Wayfair',
  walmart: 'Walmart',
};

const displayName = (key) => RETAILER_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ── Formatting ──────────────────────────────────────────────

const formatCAD = (val) => {
  if (val == null || val === 0) return null;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num) || num <= 0) return null;
  return `$${num.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatDate = (d) => {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return null; }
};

// ── Parse retailers from pricing object ─────────────────────

function parseRetailers(competitorPricing) {
  if (!competitorPricing || typeof competitorPricing !== 'object') {
    return { retailers: [], lowestRetailer: null, lowestPrice: null, latestUpdate: null, hasAnyPrice: false };
  }

  const entries = [];
  let lowest = null;
  let lowestName = null;
  let latest = null;

  for (const [key, val] of Object.entries(competitorPricing)) {
    // Skip non-retailer keys
    if (key === 'lowest_price' || key === 'currency' || key === 'updated_at') continue;

    const price = typeof val === 'object' && val !== null
      ? (val.price ?? val.amount ?? 0)
      : (typeof val === 'number' ? val : 0);

    const updated = typeof val === 'object' && val !== null
      ? (val.updated || val.last_updated || val.updated_at || null)
      : null;

    const numPrice = typeof price === 'string' ? parseFloat(price) : price;

    entries.push({
      key,
      name: displayName(key),
      price: numPrice > 0 ? numPrice : 0,
      updated,
    });

    if (numPrice > 0 && (lowest === null || numPrice < lowest)) {
      lowest = numPrice;
      lowestName = displayName(key);
    }

    if (updated) {
      const d = new Date(updated);
      if (!isNaN(d.getTime()) && (latest === null || d > latest)) {
        latest = d;
      }
    }
  }

  // Sort: priced retailers first (ascending), then N/A retailers
  entries.sort((a, b) => {
    if (a.price > 0 && b.price > 0) return a.price - b.price;
    if (a.price > 0) return -1;
    if (b.price > 0) return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    retailers: entries,
    lowestRetailer: lowestName,
    lowestPrice: lowest,
    latestUpdate: latest,
    hasAnyPrice: entries.some(e => e.price > 0),
  };
}

// ── CE Spec summary (screen size + resolution) ──────────────

function CeSpecSummary({ ceSpecs }) {
  if (!ceSpecs || typeof ceSpecs !== 'object') return null;

  const specs = [];
  for (const [key, val] of Object.entries(ceSpecs)) {
    const k = key.toLowerCase();
    if (k.includes('screen size') || k.includes('display size') || k.includes('diagonal')) {
      specs.push({ label: 'Screen', value: val });
    }
    if (k.includes('resolution') || k.includes('display resolution')) {
      specs.push({ label: 'Resolution', value: val });
    }
  }

  if (specs.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      flexWrap: 'wrap',
      padding: '6px 0 8px',
      fontSize: '12px',
      color: '#6b7280',
    }}>
      {specs.map((s, i) => (
        <span key={i}>
          <span style={{ fontWeight: 600, color: '#374151' }}>{s.label}:</span>{' '}
          {s.value}
        </span>
      ))}
    </div>
  );
}

// ── Source badge ─────────────────────────────────────────────

function SourceBadge({ dataSource }) {
  const isCe = dataSource === 'icecat' || dataSource === 'ce_api' || dataSource === 'pricesapi';
  const label = isCe ? 'Live Pricing' : 'Appliance Data';

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      background: '#f3f4f6',
      color: '#9ca3af',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: 600,
      letterSpacing: '0.03em',
      textTransform: 'uppercase',
      verticalAlign: 'middle',
      marginLeft: '8px',
    }}>
      {label}
    </span>
  );
}

// ── Loading spinner ─────────────────────────────────────────

function MiniSpinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: '14px',
      height: '14px',
      border: '2px solid #e5e7eb',
      borderTopColor: '#667eea',
      borderRadius: '50%',
      animation: 'cppspin 0.6s linear infinite',
      verticalAlign: 'middle',
    }} />
  );
}

// ── Pricing table (shared between both sources) ─────────────

function PricingTable({ retailers, ttPrice, isBestInMarket, latestUpdate, dataSource, ceSpecs }) {
  return (
    <div style={{ padding: '0 14px 14px' }}>
      {/* CE spec summary */}
      <CeSpecSummary ceSpecs={ceSpecs} />

      {/* Best price banner */}
      {isBestInMarket && (
        <div style={{
          padding: '8px 12px',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 600,
          color: '#065f46',
          marginBottom: '10px',
        }}>
          &#x2705; TeleTime has the lowest market price
        </div>
      )}

      {/* Pricing Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
            <th style={thStyle}>Retailer</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>vs TeleTime</th>
          </tr>
        </thead>
        <tbody>
          {retailers.map((r) => {
            const hasPr = r.price > 0;
            const diff = hasPr && ttPrice > 0 ? ttPrice - r.price : null;
            return (
              <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={tdStyle}>{r.name}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                  {hasPr ? formatCAD(r.price) : <span style={{ color: '#d1d5db' }}>&mdash;</span>}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {diff !== null ? (
                    diff > 0 ? (
                      <span style={{ color: '#dc2626', fontWeight: 500 }}>
                        &#x25BC; ${Math.abs(Math.round(diff)).toLocaleString()} less
                      </span>
                    ) : diff < 0 ? (
                      <span style={{ color: '#059669', fontWeight: 500 }}>
                        &#x25B2; ${Math.abs(Math.round(diff)).toLocaleString()} more
                      </span>
                    ) : (
                      <span style={{ color: '#6b7280' }}>Same price</span>
                    )
                  ) : (
                    <span style={{ color: '#d1d5db' }}>&mdash;</span>
                  )}
                </td>
              </tr>
            );
          })}

          {/* TeleTime row */}
          <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f0f4ff' }}>
            <td style={{ ...tdStyle, fontWeight: 700, color: '#667eea' }}>TeleTime</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#667eea' }}>
              {ttPrice > 0 ? formatCAD(ttPrice) : <span style={{ color: '#d1d5db' }}>&mdash;</span>}
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>
              (your price)
            </td>
          </tr>
        </tbody>
      </table>

      {/* Last Updated */}
      {latestUpdate && (
        <div style={{ marginTop: '8px', fontSize: '11px', color: '#9ca3af', textAlign: 'right' }}>
          Prices last updated: {formatDate(latestUpdate)}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

const CompetitorPricingPanel = ({
  competitorPricing,
  teleTimePrice,
  currency = 'CAD',
  defaultExpanded = false,
  // CE extension props (all optional — existing callers unaffected)
  dataSource,
  upc,
  ceSpecs,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // CE live-fetch state
  const [cePricing, setCePricing] = useState(null);
  const [ceLoading, setCeLoading] = useState(false);
  const [ceError, setCeError] = useState(null);
  const fetchedRef = useRef(false);

  const isCeSource = dataSource === 'icecat' || dataSource === 'ce_api';

  // Fetch CE pricing when panel is expanded (once per mount)
  useEffect(() => {
    if (!isCeSource || !upc || !expanded || fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    setCeLoading(true);
    setCeError(null);

    authFetch(`/api/pricing/ce/${encodeURIComponent(upc)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.success && data.data?.competitor_pricing) {
          setCePricing(data.data.competitor_pricing);
        } else {
          setCeError('No pricing data available');
        }
      })
      .catch(err => {
        if (!cancelled) setCeError(err.message || 'Failed to load pricing');
      })
      .finally(() => {
        if (!cancelled) setCeLoading(false);
      });

    return () => { cancelled = true; };
  }, [isCeSource, upc, expanded]);

  // Determine which pricing data to use
  const activePricing = isCeSource ? cePricing : competitorPricing;

  // Parse retailers from the active pricing data
  const { retailers, lowestRetailer, lowestPrice, latestUpdate, hasAnyPrice } = useMemo(
    () => parseRetailers(activePricing),
    [activePricing]
  );

  // For Skulytics: hide panel entirely if no pricing data
  // For CE: show panel (it will show loading state when expanded)
  if (!isCeSource && !hasAnyPrice) return null;

  const ttPrice = typeof teleTimePrice === 'string' ? parseFloat(teleTimePrice) : (teleTimePrice || 0);
  const isBestInMarket = ttPrice > 0 && lowestPrice !== null && ttPrice <= lowestPrice;

  // Collapsed teaser text
  let teaserText = null;
  if (hasAnyPrice) {
    teaserText = isBestInMarket
      ? 'Best price in market'
      : (lowestRetailer && lowestPrice ? `${lowestRetailer} ${formatCAD(lowestPrice)}` : null);
  } else if (isCeSource && !cePricing && !ceError) {
    teaserText = 'Click to load pricing';
  }

  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      overflow: 'hidden',
      background: '#fafbfc',
      transition: 'all 0.2s ease',
    }}>
      {/* Collapsed / Header Bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '10px 14px',
          border: 'none',
          background: expanded ? '#f3f4f6' : 'transparent',
          cursor: 'pointer',
          fontSize: '13px',
          color: '#374151',
          gap: '8px',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '14px' }}>&#x1F4CA;</span>
        <span style={{ fontWeight: 600 }}>Market Pricing</span>
        <SourceBadge dataSource={isCeSource ? 'pricesapi' : 'skulytics'} />
        {!expanded && teaserText && (
          <>
            <span style={{ color: '#9ca3af', margin: '0 2px' }}>&middot;</span>
            {isBestInMarket ? (
              <span style={{ color: '#059669', fontWeight: 500, fontSize: '12px' }}>&#x2705; {teaserText}</span>
            ) : (
              <span style={{ color: '#6b7280', fontSize: '12px' }}>{teaserText}</span>
            )}
          </>
        )}
        {ceLoading && <MiniSpinner />}
        <span style={{
          marginLeft: 'auto',
          fontSize: '11px',
          color: '#9ca3af',
          transition: 'transform 0.2s ease',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>
          &#x25BC;
        </span>
      </button>

      {/* Expanded Content */}
      <div style={{
        maxHeight: expanded ? '600px' : '0',
        opacity: expanded ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.3s ease, opacity 0.25s ease',
      }}>
        {/* CE loading state */}
        {isCeSource && ceLoading && (
          <div style={{ padding: '20px 14px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
            <MiniSpinner />{' '}
            <span style={{ marginLeft: '8px' }}>Loading competitor prices...</span>
          </div>
        )}

        {/* CE error state */}
        {isCeSource && ceError && !ceLoading && (
          <div style={{ padding: '14px', fontSize: '13px', color: '#9ca3af', textAlign: 'center' }}>
            {ceError}
          </div>
        )}

        {/* Pricing table (shown when data is ready) */}
        {hasAnyPrice && !ceLoading && (
          <PricingTable
            retailers={retailers}
            ttPrice={ttPrice}
            isBestInMarket={isBestInMarket}
            latestUpdate={latestUpdate}
            dataSource={dataSource}
            ceSpecs={isCeSource ? ceSpecs : null}
          />
        )}

        {/* CE: fetched but no retailers had prices */}
        {isCeSource && !ceLoading && !ceError && cePricing && !hasAnyPrice && (
          <div style={{ padding: '14px', fontSize: '13px', color: '#9ca3af', textAlign: 'center' }}>
            No competitor prices found for this product.
          </div>
        )}
      </div>

      <style>{`@keyframes cppspin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ── Table styles ────────────────────────────────────────────

const thStyle = {
  padding: '8px 6px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle = {
  padding: '8px 6px',
  verticalAlign: 'middle',
};

export default CompetitorPricingPanel;
