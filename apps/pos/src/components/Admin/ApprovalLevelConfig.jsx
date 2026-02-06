/**
 * TeleTime POS - Approval Level Configuration Component
 * Configure what each approval level can authorize for a rule
 */

import { useState } from 'react';
import {
  UserIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  StarIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

const APPROVAL_LEVELS = [
  {
    id: 'shift_lead',
    name: 'Shift Lead',
    icon: UserIcon,
    color: 'blue',
    description: 'Front-line supervisor approval',
  },
  {
    id: 'manager',
    name: 'Manager',
    icon: UserGroupIcon,
    color: 'purple',
    description: 'Store manager approval',
  },
  {
    id: 'area_manager',
    name: 'Area Manager',
    icon: ShieldCheckIcon,
    color: 'orange',
    description: 'Regional manager approval',
  },
  {
    id: 'admin',
    name: 'Admin',
    icon: StarIcon,
    color: 'red',
    description: 'Full administrative access',
  },
];

const COLOR_CLASSES = {
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    icon: 'text-blue-600',
    activeBg: 'bg-blue-100',
  },
  purple: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    text: 'text-purple-700',
    icon: 'text-purple-600',
    activeBg: 'bg-purple-100',
  },
  orange: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    icon: 'text-orange-600',
    activeBg: 'bg-orange-100',
  },
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: 'text-red-600',
    activeBg: 'bg-red-100',
  },
};

/**
 * Single approval level row
 */
function ApprovalLevelRow({ level, config, thresholdType, onChange }) {
  const levelConfig = APPROVAL_LEVELS.find((l) => l.id === level.id);
  const colors = COLOR_CLASSES[level.color];
  const Icon = level.icon;

  const isEnabled = config?.enabled !== false;
  const maxValue = config?.maxValue || '';
  const isUnlimited = config?.isUnlimited || false;

  const getUnit = () => {
    if (thresholdType === 'discount_percent' || thresholdType === 'margin_below') {
      return '%';
    }
    if (thresholdType === 'discount_amount' || thresholdType === 'refund_amount') {
      return '$';
    }
    return '';
  };

  const handleToggle = () => {
    onChange({
      ...config,
      enabled: !isEnabled,
      level: level.id,
    });
  };

  const handleMaxValueChange = (value) => {
    onChange({
      ...config,
      enabled: true,
      level: level.id,
      maxValue: value,
      isUnlimited: false,
    });
  };

  const handleUnlimitedToggle = () => {
    onChange({
      ...config,
      enabled: true,
      level: level.id,
      isUnlimited: !isUnlimited,
      maxValue: !isUnlimited ? '' : config?.maxValue,
    });
  };

  return (
    <div
      className={`
        p-4 rounded-lg border-2 transition-all
        ${isEnabled ? `${colors.bg} ${colors.border}` : 'bg-gray-50 border-gray-200 opacity-60'}
      `}
    >
      <div className="flex items-start gap-4">
        {/* Enable checkbox */}
        <div className="pt-1">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={handleToggle}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </div>

        {/* Level info */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${isEnabled ? colors.activeBg : 'bg-gray-200'}`}>
              <Icon className={`w-5 h-5 ${isEnabled ? colors.icon : 'text-gray-400'}`} />
            </div>
            <div>
              <h4 className={`font-semibold ${isEnabled ? colors.text : 'text-gray-500'}`}>
                {level.name}
              </h4>
              <p className="text-xs text-gray-500">{level.description}</p>
            </div>
          </div>

          {/* Max value configuration */}
          {isEnabled && (
            <div className="mt-3 pl-11">
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={isUnlimited}
                  onChange={handleUnlimitedToggle}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Unlimited approval authority</span>
              </label>

              {!isUnlimited && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Can approve up to</span>
                  <div className="relative">
                    {getUnit() === '$' && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    )}
                    <input
                      type="number"
                      value={maxValue}
                      onChange={(e) => handleMaxValueChange(e.target.value)}
                      placeholder="0"
                      min="0"
                      step={getUnit() === '%' ? '1' : '0.01'}
                      className={`
                        w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                        ${getUnit() === '$' ? 'pl-7' : ''}
                      `}
                    />
                    {getUnit() === '%' && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Approval Level Configuration Component
 */
export function ApprovalLevelConfig({ thresholdType, levels, onChange }) {
  // Build config map from levels array
  const configMap = {};
  (levels || []).forEach((level) => {
    configMap[level.level] = {
      enabled: true,
      level: level.level,
      maxValue: level.maxValue || '',
      isUnlimited: level.isUnlimited || false,
      description: level.description || '',
    };
  });

  const handleLevelChange = (levelId, newConfig) => {
    const updatedLevels = [];

    APPROVAL_LEVELS.forEach((level) => {
      if (level.id === levelId) {
        if (newConfig.enabled) {
          updatedLevels.push({
            level: levelId,
            maxValue: newConfig.isUnlimited ? 999999.99 : parseFloat(newConfig.maxValue) || 0,
            isUnlimited: newConfig.isUnlimited || false,
            description: newConfig.description || '',
          });
        }
      } else if (configMap[level.id]?.enabled !== false && configMap[level.id]) {
        updatedLevels.push({
          level: level.id,
          maxValue: configMap[level.id].isUnlimited ? 999999.99 : parseFloat(configMap[level.id].maxValue) || 0,
          isUnlimited: configMap[level.id].isUnlimited || false,
          description: configMap[level.id].description || '',
        });
      }
    });

    onChange(updatedLevels);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
        <InformationCircleIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-medium">Tiered Approval System</p>
          <p className="mt-1">
            Configure what each approval level can authorize. Lower levels handle smaller requests,
            escalating to higher levels for larger amounts.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {APPROVAL_LEVELS.map((level) => (
          <ApprovalLevelRow
            key={level.id}
            level={level}
            config={configMap[level.id] || { enabled: false }}
            thresholdType={thresholdType}
            onChange={(config) => handleLevelChange(level.id, config)}
          />
        ))}
      </div>

      {/* Validation message */}
      {(!levels || levels.length === 0) && (
        <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
          At least one approval level must be enabled for this rule.
        </p>
      )}
    </div>
  );
}

export default ApprovalLevelConfig;
