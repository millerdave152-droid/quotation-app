/**
 * Commission Settings Component
 * Allows users to toggle commission visibility preferences
 */

import React from 'react';
import {
  CurrencyDollarIcon,
  EyeIcon,
  EyeSlashIcon,
  TableCellsIcon,
  SparklesIcon,
  ChartBarIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { useCommissionContext } from '../../context/CommissionContext';

/**
 * Toggle switch component
 */
function ToggleSwitch({ enabled, onChange, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full
        border-2 border-transparent transition-colors duration-200 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
        ${enabled ? 'bg-green-500' : 'bg-gray-200'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 transform rounded-full
          bg-white shadow ring-0 transition duration-200 ease-in-out
          ${enabled ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
  );
}

/**
 * Setting row component
 */
function SettingRow({ icon: Icon, title, description, enabled, onChange, disabled = false }) {
  return (
    <div className={`
      flex items-center justify-between py-4 px-4
      ${disabled ? 'opacity-50' : ''}
    `}>
      <div className="flex items-start gap-3">
        <div className="p-2 bg-slate-100 rounded-lg mt-0.5">
          <Icon className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <div className="font-medium text-slate-900">{title}</div>
          <div className="text-sm text-slate-500">{description}</div>
        </div>
      </div>
      <ToggleSwitch enabled={enabled} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/**
 * Commission Settings Panel
 */
export default function CommissionSettings({ className = '' }) {
  const { settings, toggleSetting, loading } = useCommissionContext();

  if (loading) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-slate-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-200 bg-slate-50">
        <div className="p-2 bg-green-100 rounded-lg">
          <CurrencyDollarIcon className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-900">Commission Display</h3>
          <p className="text-sm text-slate-500">Control what commission info you see</p>
        </div>
      </div>

      {/* Settings list */}
      <div className="divide-y divide-slate-100">
        <SettingRow
          icon={EyeIcon}
          title="Show Commission"
          description="Display commission information during sales"
          enabled={settings.showCommission}
          onChange={() => toggleSetting('showCommission')}
        />

        <SettingRow
          icon={TableCellsIcon}
          title="Show Breakdown"
          description="View detailed per-item commission breakdown"
          enabled={settings.showBreakdown}
          onChange={() => toggleSetting('showBreakdown')}
          disabled={!settings.showCommission}
        />

        <SettingRow
          icon={SparklesIcon}
          title="Show Confirmation"
          description="Celebrate commission earned after each sale"
          enabled={settings.showConfirmation}
          onChange={() => toggleSetting('showConfirmation')}
          disabled={!settings.showCommission}
        />

        <SettingRow
          icon={ChartBarIcon}
          title="Show Leaderboard"
          description="See commission rankings with other reps"
          enabled={settings.showLeaderboard}
          onChange={() => toggleSetting('showLeaderboard')}
          disabled={!settings.showCommission}
        />

        <SettingRow
          icon={Cog6ToothIcon}
          title="Daily Widget"
          description="Show today's commission summary on dashboard"
          enabled={settings.showDailyWidget}
          onChange={() => toggleSetting('showDailyWidget')}
          disabled={!settings.showCommission}
        />
      </div>

      {/* Info footer */}
      <div className="p-4 bg-slate-50 border-t border-slate-200">
        <p className="text-xs text-slate-500">
          These settings only affect what you see. Commission is still calculated
          and recorded regardless of display preferences.
        </p>
      </div>
    </div>
  );
}

/**
 * Compact commission toggle for quick access
 */
export function CommissionVisibilityToggle({ className = '' }) {
  const { settings, toggleSetting } = useCommissionContext();

  return (
    <button
      onClick={() => toggleSetting('showCommission')}
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
        text-sm font-medium transition-colors
        ${settings.showCommission
          ? 'bg-green-100 text-green-700 hover:bg-green-200'
          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
        }
        ${className}
      `}
      title={settings.showCommission ? 'Hide commission' : 'Show commission'}
    >
      {settings.showCommission ? (
        <>
          <EyeIcon className="w-4 h-4" />
          <span>Commission On</span>
        </>
      ) : (
        <>
          <EyeSlashIcon className="w-4 h-4" />
          <span>Commission Off</span>
        </>
      )}
    </button>
  );
}
