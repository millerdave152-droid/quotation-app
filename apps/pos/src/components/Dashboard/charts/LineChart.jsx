/**
 * Simple SVG Line Chart Component
 * Lightweight chart without external dependencies
 */

import React from 'react';

const LineChart = ({
  data = [],
  xKey = 'label',
  yKey = 'value',
  width = 400,
  height = 200,
  lineColor = '#3b82f6',
  secondaryLineColor = '#10b981',
  showSecondary = false,
  secondaryKey = 'value2',
  showDots = true,
  showArea = false,
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
  const allValues = data.flatMap(d => [d[yKey] || 0, showSecondary ? (d[secondaryKey] || 0) : 0]);
  const maxValue = Math.max(...allValues);
  const yMax = maxValue * 1.1 || 100;

  // Calculate points
  const xStep = chartWidth / (data.length - 1 || 1);

  const getPoints = (key) => {
    return data.map((d, i) => ({
      x: padding.left + i * xStep,
      y: padding.top + chartHeight - ((d[key] || 0) / yMax) * chartHeight,
      value: d[key] || 0,
      label: d[xKey],
    }));
  };

  const primaryPoints = getPoints(yKey);
  const secondaryPoints = showSecondary ? getPoints(secondaryKey) : [];

  // Create path string
  const createPath = (points) => {
    if (points.length === 0) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };

  // Create area path (for filled area under line)
  const createAreaPath = (points) => {
    if (points.length === 0) return '';
    const baseline = padding.top + chartHeight;
    return `${createPath(points)} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
  };

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
      aria-label="Line chart"
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

      {/* Primary area fill */}
      {showArea && primaryPoints.length > 0 && (
        <path
          d={createAreaPath(primaryPoints)}
          fill={lineColor}
          fillOpacity="0.1"
        />
      )}

      {/* Secondary area fill */}
      {showArea && secondaryPoints.length > 0 && (
        <path
          d={createAreaPath(secondaryPoints)}
          fill={secondaryLineColor}
          fillOpacity="0.1"
        />
      )}

      {/* Primary line */}
      <path
        d={createPath(primaryPoints)}
        fill="none"
        stroke={lineColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Secondary line */}
      {showSecondary && (
        <path
          d={createPath(secondaryPoints)}
          fill="none"
          stroke={secondaryLineColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Primary dots */}
      {showDots && primaryPoints.map((p, i) => (
        <circle
          key={`primary-${i}`}
          cx={p.x}
          cy={p.y}
          r="4"
          fill="white"
          stroke={lineColor}
          strokeWidth="2"
          className="hover:r-6 transition-all"
        >
          <title>{`${p.label}: ${formatValue(p.value)}`}</title>
        </circle>
      ))}

      {/* Secondary dots */}
      {showDots && secondaryPoints.map((p, i) => (
        <circle
          key={`secondary-${i}`}
          cx={p.x}
          cy={p.y}
          r="4"
          fill="white"
          stroke={secondaryLineColor}
          strokeWidth="2"
          className="hover:r-6 transition-all"
        >
          <title>{`${p.label}: ${formatValue(p.value)}`}</title>
        </circle>
      ))}

      {/* X-axis labels */}
      {data.map((d, i) => (
        <text
          key={i}
          x={padding.left + i * xStep}
          y={height - padding.bottom + 16}
          textAnchor="middle"
          className="text-xs fill-gray-600"
          fontSize="10"
        >
          {d[xKey]?.toString().slice(0, 8) || ''}
        </text>
      ))}

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

export default LineChart;
