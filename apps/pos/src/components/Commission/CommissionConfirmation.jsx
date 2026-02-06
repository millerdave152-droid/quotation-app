/**
 * Commission Confirmation Component
 * Post-sale celebration showing commission earned
 * Subtle but motivating for sales rep
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircleIcon,
  CurrencyDollarIcon,
  SparklesIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

/**
 * Confetti particle for celebration effect
 */
function ConfettiParticle({ delay, color }) {
  const randomX = Math.random() * 100;
  const randomDuration = 2 + Math.random() * 2;
  const randomSize = 4 + Math.random() * 4;

  return (
    <div
      className="absolute animate-confetti"
      style={{
        left: `${randomX}%`,
        top: '-10px',
        width: `${randomSize}px`,
        height: `${randomSize}px`,
        backgroundColor: color,
        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
        animationDelay: `${delay}ms`,
        animationDuration: `${randomDuration}s`,
      }}
    />
  );
}

/**
 * Subtle confetti effect
 */
function SubtleConfetti({ show }) {
  if (!show) return null;

  const colors = ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#FCD34D', '#FBBF24'];
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    delay: i * 50,
    color: colors[i % colors.length],
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <ConfettiParticle key={p.id} delay={p.delay} color={p.color} />
      ))}
    </div>
  );
}

/**
 * Commission Confirmation Toast
 * Brief, subtle notification after sale
 */
export function CommissionToast({
  show,
  commission,
  onClose,
  duration = 4000,
}) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      setExiting(false);

      const timer = setTimeout(() => {
        setExiting(true);
        setTimeout(() => {
          setVisible(false);
          onClose?.();
        }, 300);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [show, duration, onClose]);

  if (!visible || !commission) return null;

  const hasBonus = commission.summary?.bonusCommission > 0;

  return createPortal(
    <div
      className={`
        fixed bottom-6 right-6 z-50
        transform transition-all duration-300
        ${exiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
      `}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl shadow-lg border border-green-200">
        <div className="p-2 bg-green-100 rounded-full">
          <CheckCircleSolid className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <div className="text-sm font-medium text-slate-900">Commission Earned</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-green-600">
              {formatCurrency(commission.totalCommission)}
            </span>
            {hasBonus && (
              <span className="flex items-center gap-0.5 text-xs text-amber-600">
                <SparklesIcon className="w-3 h-3" />
                includes bonus
              </span>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Commission Confirmation Modal
 * More detailed celebration shown after significant sales
 */
export default function CommissionConfirmation({
  isOpen,
  onClose,
  commission,
  saleTotal,
  orderNumber,
  showConfetti = true,
  autoClose = true,
  autoCloseDelay = 5000,
}) {
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Delay confetti slightly for better effect
      const timer = setTimeout(() => setShowCelebration(true), 200);
      return () => clearTimeout(timer);
    } else {
      setShowCelebration(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && autoClose) {
      const timer = setTimeout(onClose, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoClose, autoCloseDelay, onClose]);

  if (!isOpen) return null;

  const hasBonus = commission?.summary?.bonusCommission > 0;
  const bonusAmount = commission?.summary?.bonusCommission || 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm">
        {/* Confetti */}
        {showConfetti && <SubtleConfetti show={showCelebration} />}

        {/* Card */}
        <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
          {/* Success header */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
              <CheckCircleIcon className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Sale Complete!</h2>
            {orderNumber && (
              <p className="text-green-100 text-sm mt-1">Order #{orderNumber}</p>
            )}
          </div>

          {/* Commission details */}
          <div className="px-6 py-6">
            {/* Sale total */}
            {saleTotal && (
              <div className="flex items-center justify-between py-3 border-b border-slate-100">
                <span className="text-slate-500">Sale Total</span>
                <span className="font-semibold text-slate-900">{formatCurrency(saleTotal)}</span>
              </div>
            )}

            {/* Commission earned */}
            <div className="py-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CurrencyDollarIcon className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">
                  Commission Earned
                </span>
              </div>
              <div className="text-4xl font-bold text-green-600 mb-2">
                {formatCurrency(commission?.totalCommission || 0)}
              </div>

              {/* Bonus indicator */}
              {hasBonus && (
                <div className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-sm">
                  <SparklesIcon className="w-4 h-4" />
                  <span>+{formatCurrency(bonusAmount)} bonus included</span>
                </div>
              )}
            </div>

            {/* Quick stats */}
            {commission?.summary && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-700">
                    {commission.summary.itemCount || 0}
                  </div>
                  <div className="text-xs text-slate-500">Items Sold</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {commission.summary.bonusItems || 0}
                  </div>
                  <div className="text-xs text-slate-500">Bonus Items</div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-6">
            <button
              onClick={onClose}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors"
            >
              Continue
            </button>
            {autoClose && (
              <p className="text-center text-xs text-slate-400 mt-2">
                Auto-closing in a few seconds...
              </p>
            )}
          </div>
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes confetti {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(400px) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti linear forwards;
        }
        @keyframes scale-in {
          0% {
            transform: scale(0.9);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>,
    document.body
  );
}
