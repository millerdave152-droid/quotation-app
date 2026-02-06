/**
 * Simple SVG Bar Chart Component
 * Lightweight chart without external dependencies
 */

import React from 'react';

const BarChart = ({
  data = [],
  xKey = 'label',
  yKey = 'value',
  width = 400,
  height = 200,
  barColor = '#3b82f6',
  secondaryBarColor = '#10b981',
  showSecondary = false,
  secondaryKey = 'value2',
  className = '',
}) => {
  if (!data || data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-48 bg-gray-50 rounded-lg ${className}`}>
        <span className="text-gray-400">No data available</span>
      </div>
    );
  }

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate max value
  const maxValue = Math.max(
    ...data.map(d => Math.max(d[yKey] || 0, showSecondary ? (d[secondaryKey] || 0) : 0))
  );
  const yMax = maxValue * 1.1 || 100;

  // Bar width calculation
  const barWidth = showSecondary
    ? (chartWidth / data.length - 8) / 2
    : chartWidth / data.length - 8;
  const groupWidth = chartWidth / data.length;

  // Y-axis ticks
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

  const formatValue = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full h-auto ${className}`}
      role="img"
      aria-label="Bar chart"
    >
      {/* Y-axis grid lines and labels */}
      {yTicks.map((tick, i) => {
        const y = padding.top + chartHeight - (tick / yMax) * chartHeight;
        return (
          <g key={i}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={y + 4}
              textAnchor="end"
              className="text-xs fill-gray-500"
              fontSize="10"
            >
              {formatValue(tick)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const x = padding.left + i * groupWidth + 4;
        const primaryBarHeight = ((d[yKey] || 0) / yMax) * chartHeight;
        const primaryY = padding.top + chartHeight - primaryBarHeight;

        return (
          <g key={i}>
            {/* Primary bar */}
            <rect
              x={x}
              y={primaryY}
              width={barWidth}
              height={primaryBarHeight}
              fill={barColor}
              rx="2"
              className="transition-all duration-200 hover:opacity-80"
            >
              <title>{`${d[xKey]}: ${formatValue(d[yKey] || 0)}`}</title>
            </rect>

            {/* Secondary bar */}
            {showSecondary && (
              <rect
                x={x + barWidth + 2}
                y={padding.top + chartHeight - ((d[secondaryKey] || 0) / yMax) * chartHeight}
                width={barWidth}
                height={((d[secondaryKey] || 0) / yMax) * chartHeight}
                fill={secondaryBarColor}
                rx="2"
                className="transition-all duration-200 hover:opacity-80"
              >
                <title>{`${d[xKey]} (Secondary): ${formatValue(d[secondaryKey] || 0)}`}</title>
              </rect>
            )}

            {/* X-axis label */}
            <text
              x={x + (showSecondary ? barWidth + 1 : barWidth / 2)}
              y={height - padding.bottom + 16}
              textAnchor="middle"
              className="text-xs fill-gray-600"
              fontSize="10"
            >
              {d[xKey]?.toString().slice(0, 8) || ''}
            </text>
          </g>
        );
      })}

      {/* Axes */}
      <line
        x1={padding.left}
        y1={padding.top}
        x2={padding.left}
        y2={padding.top + chartHeight}
        stroke="#9ca3af"
        strokeWidth="1"
      />
      <line
        x1={padding.left}
        y1={padding.top + chartHeight}
        x2={width - padding.right}
        y2={padding.top + chartHeight}
        stroke="#9ca3af"
        strokeWidth="1"
      />
    </svg>
  );
};

export default BarChart;
