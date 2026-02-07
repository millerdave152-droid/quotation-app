import { useState } from 'react';

const CHECKLIST_ITEMS = [
  { key: 'all_items_delivered', label: 'All items delivered', icon: '📦' },
  { key: 'items_placed_correctly', label: 'Items placed in requested location', icon: '📍' },
  { key: 'packaging_removed', label: 'Packaging removed (if applicable)', icon: '♻️', optional: true },
  { key: 'customer_satisfied', label: 'Customer satisfied', icon: '👍' },
  { key: 'photos_captured', label: 'Photos captured', icon: '📷', auto: true },
  { key: 'signature_obtained', label: 'Signature obtained', icon: '✍️', auto: true },
];

/**
 * Post-delivery completion checklist.
 *
 * Props:
 *   checklist       — current checked state { [key]: boolean }
 *   onChange         — (newChecklist) => void
 *   photosCount     — number of photos taken
 *   hasSignature    — whether signature was captured
 *   completionType  — 'delivered' | 'partial' | 'refused'
 */
export default function CompletionChecklist({ checklist, onChange, photosCount = 0, hasSignature = false, completionType = 'delivered' }) {
  // Auto-set photo and signature items
  const effectiveChecklist = {
    ...checklist,
    photos_captured: photosCount >= 2,
    signature_obtained: hasSignature,
  };

  const items = CHECKLIST_ITEMS.filter(item => {
    // Hide packaging check for refused deliveries
    if (item.key === 'packaging_removed' && completionType === 'refused') return false;
    if (item.key === 'items_placed_correctly' && completionType === 'refused') return false;
    return true;
  });

  const checkedCount = items.filter(i => effectiveChecklist[i.key]).length;
  const requiredCount = items.filter(i => !i.optional).length;
  const requiredMet = items.filter(i => !i.optional && effectiveChecklist[i.key]).length;
  const allRequiredMet = requiredMet >= requiredCount;

  function toggle(key) {
    // Can't toggle auto items
    const item = CHECKLIST_ITEMS.find(i => i.key === key);
    if (item?.auto) return;

    onChange({
      ...checklist,
      [key]: !checklist[key],
    });
  }

  return (
    <div>
      {/* Progress */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase text-slate-400">Completion Checklist</p>
        <span className={`text-xs font-medium ${allRequiredMet ? 'text-green-600' : 'text-amber-600'}`}>
          {checkedCount}/{items.length}
        </span>
      </div>

      <div className="mb-2 flex gap-0.5">
        {items.map(item => (
          <div
            key={item.key}
            className={`h-1 flex-1 rounded-full transition-colors ${
              effectiveChecklist[item.key] ? 'bg-green-500' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      {/* Items */}
      <div className="space-y-1.5">
        {items.map(item => {
          const checked = !!effectiveChecklist[item.key];
          const isAuto = item.auto;
          const missing = isAuto && !checked;

          return (
            <button
              key={item.key}
              onClick={() => toggle(item.key)}
              disabled={isAuto}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                checked
                  ? 'border-green-200 bg-green-50'
                  : missing
                    ? 'border-red-200 bg-red-50'
                    : 'border-slate-200 bg-white'
              } ${isAuto ? 'cursor-default' : ''}`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs ${
                checked
                  ? 'bg-green-500 text-white'
                  : missing
                    ? 'bg-red-100 text-red-400'
                    : 'bg-slate-100 text-slate-400'
              }`}>
                {checked ? '✓' : item.icon}
              </span>
              <span className={`flex-1 text-sm font-medium ${
                checked ? 'text-green-700' : missing ? 'text-red-600' : 'text-slate-700'
              }`}>
                {item.label}
                {item.optional && <span className="ml-1 text-xs text-slate-400">(optional)</span>}
              </span>
              {isAuto && (
                <span className={`text-[10px] ${checked ? 'text-green-500' : 'text-red-400'}`}>
                  {checked ? 'Done' : 'Required'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Returns whether all required (non-optional) checklist items are met.
 */
export function isChecklistComplete(checklist, photosCount, hasSignature, completionType = 'delivered') {
  const effective = {
    ...checklist,
    photos_captured: photosCount >= 2,
    signature_obtained: hasSignature,
  };

  const required = CHECKLIST_ITEMS.filter(i => {
    if (i.optional) return false;
    if (i.key === 'items_placed_correctly' && completionType === 'refused') return false;
    return true;
  });

  return required.every(i => effective[i.key]);
}
