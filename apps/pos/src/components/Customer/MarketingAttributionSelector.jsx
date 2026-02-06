/**
 * TeleTime POS - Marketing Attribution Selector
 * "How did you hear about us?" dropdown with "Other" text input
 */

import { useState, useEffect } from 'react';
import { getMarketingSources } from '../../api/customers';

const FALLBACK_SOURCES = [
  'Google Search',
  'Facebook / Instagram',
  'TikTok',
  'YouTube',
  'Kijiji / Marketplace',
  'Walk-in / Drive-by',
  'Referral from Friend/Family',
  'Returning Customer',
  'Flyer / Print Ad',
  'Other',
];

/**
 * Marketing attribution selector
 * @param {object} props
 * @param {string} props.value - Selected source
 * @param {string} props.detail - "Other" detail text
 * @param {function} props.onChange - Callback({ source, detail })
 * @param {string} props.className - Additional classes
 */
export function MarketingAttributionSelector({ value, detail, onChange, className = '' }) {
  const [sources, setSources] = useState(FALLBACK_SOURCES);

  useEffect(() => {
    getMarketingSources().then((result) => {
      if (result.length > 0) {
        setSources(result);
      }
    }).catch(() => {
      // Use fallback
    });
  }, []);

  const isOther = value === 'Other';

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        How did you hear about us? <span className="text-gray-400 font-normal">(optional)</span>
      </label>
      <select
        value={value || ''}
        onChange={(e) => {
          const newVal = e.target.value || null;
          onChange({ source: newVal, detail: newVal === 'Other' ? detail : null });
        }}
        className="
          w-full h-12 px-4
          text-base
          border-2 border-gray-200 rounded-xl
          focus:border-blue-500 focus:ring-2 focus:ring-blue-100
          transition-colors duration-150
          bg-white
        "
      >
        <option value="">— Select —</option>
        {sources.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {isOther && (
        <input
          type="text"
          value={detail || ''}
          onChange={(e) => onChange({ source: 'Other', detail: e.target.value })}
          placeholder="Please specify..."
          className="
            w-full h-10 px-4 mt-2
            text-sm
            border-2 border-gray-200 rounded-xl
            focus:border-blue-500 focus:ring-2 focus:ring-blue-100
            transition-colors duration-150
          "
          maxLength={255}
        />
      )}
    </div>
  );
}

export default MarketingAttributionSelector;
