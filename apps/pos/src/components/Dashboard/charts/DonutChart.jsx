/**
 * Simple SVG Donut Chart Component
 * Lightweight chart without external dependencies
 */

import React from 'react';

const DonutChart = ({
  data = [],
  valueKey = 'value',
  labelKey = 'label',
  size = 160,
  thickness = 30,
  colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
  className = '',
  showLegend = true,
  centerText = '',
  centerSubtext = '',
}) => {
  if (!data || data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-40 bg-gray-50 rounded-lg ${className}`}>
        <span className="text-gray-400">No data available</span>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + (d[valueKey] || 0), 0);
  const radius = size / 2;
  const innerRadius = radius - thickness;

  // Calculate segments
  let currentAngle = -90; // Start from top
  const segments = data.map((d, i) => {
    const value = d[valueKey] || 0;
    const percentage = total > 0 ? (value / total) * 100 : 0;
    const angle = (percentage / 100) * 360;

    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    // Calculate arc path
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = radius + radius * Math.cos(startRad);
    const y1 = radius + radius * Math.sin(startRad);
    const x2 = radius + radius * Math.cos(endRad);
    const y2 = radius + radius * Math.sin(endRad);

    const x3 = radius + innerRadius * Math.cos(endRad);
    const y3 = radius + innerRadius * Math.sin(endRad);
    const x4 = radius + innerRadius * Math.cos(startRad);
    const y4 = radius + innerRadius * Math.sin(startRad);

    const largeArc = angle > 180 ? 1 : 0;

    const path = `
      M ${x1} ${y1}
      A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
      L ${x3} ${y3}
      A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}
      Z
    `;

    return {
      path,
      color: colors[i % colors.length],
      label: d[labelKey],
      value,
      percentage,
    };
  });

  const formatValue = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Donut chart"
        >
          {segments.map((seg, i) => (
            <path
              key={i}
              d={seg.path}
              fill={seg.color}
              className="transition-opacity hover:opacity-80"
            >
              <title>{`${seg.label}: ${formatValue(seg.value)} (${seg.percentage.toFixed(1)}%)`}</title>
            </path>
          ))}
        </svg>

        {/* Center text */}
        {(centerText || centerSubtext) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerText && (
              <span className="text-lg font-semibold text-gray-900">{centerText}</span>
            )}
            {centerSubtext && (
              <span className="text-xs text-gray-500">{centerSubtext}</span>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="mt-4 grid grid-cols-2 gap-2 w-full max-w-xs">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-gray-600 truncate">{seg.label}</span>
              <span className="text-gray-400 text-xs ml-auto">{seg.percentage.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DonutChart;
