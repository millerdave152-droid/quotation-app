/**
 * TeleTime POS - Discount Slider Component
 * Real-time per-item discount control with margin/commission/budget calculations.
 * Supports three visual states: normal, pending-escalation (locked), and approved-escalation (ready).
 */

import { useState, useMemo, useCallback, memo } from 'react';
import {
  TagIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  ArrowTrendingDownIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowUpCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';
import { applyDiscount as applyDiscountApi, validateDiscount } from '../../api/discountAuthority';

const COMMISSION_RATE = 0.05; // 5% default

/**
 * Discount Slider with real-time margin/commission/budget calculations
 */
export const DiscountSlider = memo(function DiscountSlider({
  item,
  tier,
  budget,
  onApplyDiscount,
  onRequestEscalation,
  onBudgetUpdate,
  pendingEscalation,
  approvedEscalation,
}) {
  const [discountPct, setDiscountPct] = useState(item.discountPercent || 0);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const price = item.unitPrice || 0;
  const cost = item.unitCost || 0;
  const hasCost = cost > 0;

  // Determine max discount allowed by tier + cost floor
  const { maxPct, costFloorPrice, isUnrestricted } = useMemo(() => {
    if (!tier) return { maxPct: 0, costFloorPrice: 0, isUnrestricted: false };
    if (tier.is_unrestricted) return { maxPct: 50, costFloorPrice: 0, isUnrestricted: true };

    const marginBeforePct = price > 0 ? ((price - cost) / price) * 100 : 0;
    const highMarginThreshold = parseFloat(tier.high_margin_threshold) || 30;
    const isHighMargin = marginBeforePct >= highMarginThreshold;

    const tierMax = isHighMargin
      ? parseFloat(tier.max_discount_pct_high_margin) || 10
      : parseFloat(tier.max_discount_pct_standard) || 5;

    const minMarginFloor = parseFloat(tier.min_margin_floor_pct) || 0;
    const floor = cost * (1 + minMarginFloor / 100);

    // Max pct that keeps price above cost floor
    const costFloorMaxPct = price > 0 ? ((price - floor) / price) * 100 : 0;
    const effectiveMax = Math.max(0, Math.min(tierMax, costFloorMaxPct));

    return {
      maxPct: +effectiveMax.toFixed(1),
      costFloorPrice: +floor.toFixed(2),
      isUnrestricted: false,
    };
  }, [tier, price, cost]);

  // Real-time calculations (no API call)
  const calc = useMemo(() => {
    const discountAmount = +(price * discountPct / 100).toFixed(2);
    const priceAfterDiscount = +(price - discountAmount).toFixed(2);
    const marginBeforePct = price > 0 ? ((price - cost) / price) * 100 : 0;
    const marginBeforeDollars = +(price - cost).toFixed(2);
    const marginAfterPct = price > 0 ? ((priceAfterDiscount - cost) / price) * 100 : 0;
    const marginAfterDollars = +(priceAfterDiscount - cost).toFixed(2);

    const commissionBefore = +(price * COMMISSION_RATE).toFixed(2);
    const commissionAfter = +(priceAfterDiscount * COMMISSION_RATE).toFixed(2);
    const commissionImpact = +(commissionAfter - commissionBefore).toFixed(2);

    const budgetRemaining = budget
      ? +(parseFloat(budget.total_budget_dollars) - parseFloat(budget.used_dollars)).toFixed(2)
      : null;
    const budgetAfter = budgetRemaining != null ? +(budgetRemaining - discountAmount).toFixed(2) : null;
    const budgetTotal = budget ? parseFloat(budget.total_budget_dollars) : null;

    return {
      discountAmount,
      priceAfterDiscount,
      marginBeforePct: +marginBeforePct.toFixed(1),
      marginBeforeDollars,
      marginAfterPct: +marginAfterPct.toFixed(1),
      marginAfterDollars,
      commissionBefore,
      commissionAfter,
      commissionImpact,
      budgetRemaining,
      budgetAfter,
      budgetTotal,
    };
  }, [price, cost, discountPct, budget]);

  // Color zone for current discount level
  const zone = useMemo(() => {
    if (discountPct <= 5) return 'green';
    if (discountPct <= 8) return 'yellow';
    return 'red';
  }, [discountPct]);

  const zoneColors = {
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', label: 'Safe' },
    yellow: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', label: 'Caution' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', label: 'High Impact' },
  };
  const zc = zoneColors[zone];

  const handleSliderChange = useCallback((e) => {
    setDiscountPct(parseFloat(e.target.value));
    setError(null);
    setSuccess(false);
  }, []);

  const handleInputChange = useCallback((e) => {
    const val = parseFloat(e.target.value) || 0;
    const clamped = Math.max(0, Math.min(isUnrestricted ? 50 : maxPct, val));
    setDiscountPct(clamped);
    setError(null);
    setSuccess(false);
  }, [maxPct, isUnrestricted]);

  const handleApply = useCallback(async () => {
    if (discountPct <= 0) return;
    setApplying(true);
    setError(null);
    setSuccess(false);

    try {
      // Server-side validation first
      const validation = await validateDiscount(item.productId, discountPct);

      if (!validation.allowed) {
        setError(validation.reason);
        setApplying(false);
        return;
      }

      // Apply to cart locally
      onApplyDiscount?.(item.id, discountPct);

      // Record on server
      await applyDiscountApi({
        productId: item.productId,
        originalPrice: price,
        cost: cost,
        discountPct: discountPct,
      });

      setSuccess(true);
      onBudgetUpdate?.();

      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err?.message || 'Failed to apply discount');
    } finally {
      setApplying(false);
    }
  }, [discountPct, item, price, cost, onApplyDiscount, onBudgetUpdate]);

  const handleApplyApproved = useCallback(() => {
    if (!approvedEscalation) return;
    const approvedPct = parseFloat(approvedEscalation.requested_discount_pct);
    onApplyDiscount?.(item.id, approvedPct, approvedEscalation.id);
    onBudgetUpdate?.();
  }, [approvedEscalation, item, onApplyDiscount, onBudgetUpdate]);

  const handleRequestEscalation = useCallback(() => {
    onRequestEscalation?.(item, discountPct > maxPct ? discountPct : maxPct + 1);
  }, [item, discountPct, maxPct, onRequestEscalation]);

  // Slider gradient for color zones
  const sliderMax = isUnrestricted ? 50 : maxPct;
  const greenEnd = Math.min(5, sliderMax);
  const yellowEnd = Math.min(8, sliderMax);
  const greenPct = sliderMax > 0 ? (greenEnd / sliderMax) * 100 : 100;
  const yellowPct = sliderMax > 0 ? (yellowEnd / sliderMax) * 100 : 100;
  const sliderGradient = `linear-gradient(to right, #22c55e 0%, #22c55e ${greenPct}%, #f59e0b ${greenPct}%, #f59e0b ${yellowPct}%, #ef4444 ${yellowPct}%, #ef4444 100%)`;

  if (!tier) {
    return (
      <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-500">
        Loading discount authority...
      </div>
    );
  }

  // =========================================================================
  // STATE: Pending Escalation — slider locked, awaiting manager approval
  // =========================================================================
  if (pendingEscalation) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">Pending Approval</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
              {parseFloat(pendingEscalation.requested_discount_pct).toFixed(1)}%
            </span>
          </div>
        </div>
        <p className="text-xs text-amber-700">
          Discount of {parseFloat(pendingEscalation.requested_discount_pct).toFixed(1)}% awaiting manager approval.
        </p>
        {/* Disabled slider */}
        <div className="flex items-center gap-3 opacity-50 pointer-events-none">
          <div className="flex-1">
            <input
              type="range"
              min={0}
              max={sliderMax}
              step={0.5}
              value={parseFloat(pendingEscalation.requested_discount_pct)}
              readOnly
              disabled
              className="w-full h-2 rounded-full appearance-none cursor-not-allowed bg-gray-300"
            />
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={parseFloat(pendingEscalation.requested_discount_pct).toFixed(1)}
              readOnly
              disabled
              className="w-16 h-8 text-center text-sm font-bold border border-gray-300 rounded-lg bg-gray-100"
            />
            <span className="text-sm font-medium text-gray-400">%</span>
          </div>
        </div>
        {/* Disabled buttons */}
        <div className="flex gap-2">
          <button
            disabled
            className="flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg bg-gray-200 text-gray-400 cursor-not-allowed"
          >
            <ClockIcon className="w-4 h-4" />
            Awaiting Approval...
          </button>
          <button
            disabled
            className="flex-1 h-9 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
          >
            <ArrowUpCircleIcon className="w-4 h-4" />
            Requested
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STATE: Approved Escalation — show green "Apply Approved Discount" button
  // =========================================================================
  if (approvedEscalation) {
    const approvedPct = parseFloat(approvedEscalation.requested_discount_pct);
    const approvedAmount = +(price * approvedPct / 100).toFixed(2);
    const priceAfter = +(price - approvedAmount).toFixed(2);

    return (
      <div className="rounded-xl border border-green-300 bg-green-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-green-600" />
            <span className="text-sm font-semibold text-green-800">Approved</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
              {approvedPct.toFixed(1)}%
            </span>
          </div>
          <span className="text-sm font-bold text-green-900">
            -{formatCurrency(approvedAmount)}
          </span>
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 bg-white/70 rounded-lg">
          <span className="text-xs text-gray-500">Price After Discount</span>
          <span className="text-sm font-bold text-gray-900">{formatCurrency(priceAfter)}</span>
        </div>
        {approvedEscalation.reviewer_name && (
          <p className="text-xs text-green-600">
            Approved by {approvedEscalation.reviewer_name}
          </p>
        )}
        <button
          onClick={handleApplyApproved}
          className="
            w-full h-10 flex items-center justify-center gap-2
            text-sm font-bold rounded-lg
            bg-green-600 text-white hover:bg-green-700 active:bg-green-800
            transition-all duration-150
          "
        >
          <CheckCircleIcon className="w-5 h-5" />
          Apply Approved Discount
        </button>
      </div>
    );
  }

  // =========================================================================
  // STATE: Normal — full slider controls within tier limits
  // =========================================================================
  return (
    <div className={`rounded-xl border ${zc.border} ${zc.bg} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TagIcon className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-semibold text-gray-800">Discount</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${zc.text} ${zone === 'green' ? 'bg-green-100' : zone === 'yellow' ? 'bg-amber-100' : 'bg-red-100'}`}>
            {zc.label}
          </span>
        </div>
        {discountPct > 0 && (
          <span className="text-sm font-bold text-gray-900">
            -{formatCurrency(calc.discountAmount)}
          </span>
        )}
      </div>

      {/* Slider + Input */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <input
            type="range"
            min={0}
            max={sliderMax}
            step={0.5}
            value={Math.min(discountPct, sliderMax)}
            onChange={handleSliderChange}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: sliderGradient,
              accentColor: zone === 'green' ? '#22c55e' : zone === 'yellow' ? '#f59e0b' : '#ef4444',
            }}
          />
          {/* Zone labels */}
          <div className="flex justify-between mt-0.5 px-0.5">
            <span className="text-[10px] text-gray-400">0%</span>
            <span className="text-[10px] text-gray-400">{sliderMax}%</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={sliderMax}
            step={0.5}
            value={discountPct}
            onChange={handleInputChange}
            className="w-16 h-8 text-center text-sm font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
          <span className="text-sm font-medium text-gray-500">%</span>
        </div>
      </div>

      {/* Price After Discount */}
      {discountPct > 0 && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-white/70 rounded-lg">
          <span className="text-xs text-gray-500">Price After Discount</span>
          <span className="text-sm font-bold text-gray-900">{formatCurrency(calc.priceAfterDiscount)}</span>
        </div>
      )}

      {/* Margin Impact Panel */}
      {discountPct > 0 && hasCost && (
        <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2.5">
          {/* Margin Section */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <ChartBarIcon className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-semibold text-gray-700">Margin Impact</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Original Margin:</span>
                <span className="font-medium text-gray-700">{calc.marginBeforePct}%</span>
              </div>
              <div className="text-right text-gray-500">
                ({formatCurrency(calc.marginBeforeDollars)})
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">After Discount:</span>
                <span className={`font-medium ${calc.marginAfterPct < 15 ? 'text-red-600' : calc.marginAfterPct < 25 ? 'text-amber-600' : 'text-green-600'}`}>
                  {calc.marginAfterPct}%
                </span>
              </div>
              <div className={`text-right ${calc.marginAfterPct < 15 ? 'text-red-500' : 'text-gray-500'}`}>
                ({formatCurrency(calc.marginAfterDollars)})
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Commission Section */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <CurrencyDollarIcon className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-gray-700">Your Commission Impact</span>
            </div>
            <div className="space-y-0.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Without Discount:</span>
                <span className="font-medium text-gray-700">{formatCurrency(calc.commissionBefore)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">With Discount:</span>
                <span className="font-medium text-gray-700">{formatCurrency(calc.commissionAfter)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Impact:</span>
                <span className="font-bold text-red-600">{formatCurrency(calc.commissionImpact)}</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          {calc.budgetRemaining != null && (
            <>
              <div className="border-t border-gray-100" />
              {/* Budget Section */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ArrowTrendingDownIcon className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-xs font-semibold text-gray-700">Weekly Budget</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Remaining:</span>
                  <span className={`font-bold ${calc.budgetAfter < 0 ? 'text-red-600' : calc.budgetAfter < 100 ? 'text-amber-600' : 'text-gray-700'}`}>
                    {formatCurrency(calc.budgetAfter)} / {formatCurrency(calc.budgetTotal)}
                  </span>
                </div>
                {/* Budget bar */}
                <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      calc.budgetAfter < 0 ? 'bg-red-500' : calc.budgetAfter < 100 ? 'bg-amber-500' : 'bg-purple-500'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, ((calc.budgetAfter ?? 0) / (calc.budgetTotal || 1)) * 100))}%` }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Error / Success messages */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <ExclamationTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-xs text-red-700">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
          <span className="text-xs text-green-700">Discount applied successfully</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleApply}
          disabled={discountPct <= 0 || applying}
          className={`
            flex-1 h-9 flex items-center justify-center gap-1.5
            text-xs font-semibold rounded-lg
            transition-all duration-150
            ${discountPct > 0 && !applying
              ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
          `}
        >
          {applying ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <CheckCircleIcon className="w-4 h-4" />
          )}
          {applying ? 'Applying...' : 'Apply Discount'}
        </button>

        {!isUnrestricted && (
          <button
            onClick={handleRequestEscalation}
            className="
              flex-1 h-9 flex items-center justify-center gap-1.5
              text-xs font-semibold rounded-lg
              bg-amber-50 text-amber-700 border border-amber-200
              hover:bg-amber-100 active:bg-amber-200
              transition-all duration-150
            "
          >
            <ArrowUpCircleIcon className="w-4 h-4" />
            Request Higher
          </button>
        )}
      </div>
    </div>
  );
});

export default DiscountSlider;
