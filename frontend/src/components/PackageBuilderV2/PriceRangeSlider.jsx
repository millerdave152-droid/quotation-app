/**
 * PriceRangeSlider - Dual-handle range slider for price filtering
 * With quick presets and product count display
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import './PriceRangeSlider.css';

const PriceRangeSlider = ({
  min = 0,
  max = 15000,
  value = [0, 15000],
  onChange,
  packageType = 'kitchen',
  productCountAtPrice = () => null
}) => {
  const [localValue, setLocalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef(null);

  // Presets based on package type
  const presets = packageType === 'kitchen'
    ? [
        { label: 'Under $3K', range: [0, 3000] },
        { label: '$3K - $5K', range: [3000, 5000] },
        { label: '$5K - $8K', range: [5000, 8000] },
        { label: '$8K+', range: [8000, max] }
      ]
    : [
        { label: 'Under $1.5K', range: [0, 1500] },
        { label: '$1.5K - $2.5K', range: [1500, 2500] },
        { label: '$2.5K - $4K', range: [2500, 4000] },
        { label: '$4K+', range: [4000, max] }
      ];

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const formatPrice = (val) => {
    if (val >= 1000) {
      return `$${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
    }
    return `$${val}`;
  };

  const handleMinChange = (e) => {
    const newMin = Math.min(parseInt(e.target.value), localValue[1] - 100);
    const newValue = [newMin, localValue[1]];
    setLocalValue(newValue);
  };

  const handleMaxChange = (e) => {
    const newMax = Math.max(parseInt(e.target.value), localValue[0] + 100);
    const newValue = [localValue[0], newMax];
    setLocalValue(newValue);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (onChange && (localValue[0] !== value[0] || localValue[1] !== value[1])) {
      onChange(localValue);
    }
  };

  const handlePresetClick = (range) => {
    setLocalValue(range);
    if (onChange) {
      onChange(range);
    }
  };

  const isPresetActive = (range) => {
    return localValue[0] === range[0] && localValue[1] === range[1];
  };

  // Calculate slider fill percentage
  const minPercent = ((localValue[0] - min) / (max - min)) * 100;
  const maxPercent = ((localValue[1] - min) / (max - min)) * 100;

  return (
    <div className="price-range-slider">
      <div className="price-range-header">
        <span className="price-range-label">Price Range</span>
        <span className="price-range-value">
          {formatPrice(localValue[0])} - {formatPrice(localValue[1])}
        </span>
      </div>

      <div className="price-range-track-container" ref={sliderRef}>
        <div className="price-range-track">
          <div
            className="price-range-fill"
            style={{
              left: `${minPercent}%`,
              width: `${maxPercent - minPercent}%`
            }}
          />
        </div>

        <input
          type="range"
          min={min}
          max={max}
          step={100}
          value={localValue[0]}
          onChange={handleMinChange}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleMouseUp}
          className="price-range-input price-range-min"
        />

        <input
          type="range"
          min={min}
          max={max}
          step={100}
          value={localValue[1]}
          onChange={handleMaxChange}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleMouseUp}
          className="price-range-input price-range-max"
        />
      </div>

      <div className="price-range-labels">
        <span>{formatPrice(min)}</span>
        <span>{formatPrice(max)}</span>
      </div>

      <div className="price-range-presets">
        {presets.map((preset, idx) => (
          <button
            key={idx}
            className={`price-preset-btn ${isPresetActive(preset.range) ? 'active' : ''}`}
            onClick={() => handlePresetClick(preset.range)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <button
        className="price-range-reset"
        onClick={() => handlePresetClick([min, max])}
        disabled={localValue[0] === min && localValue[1] === max}
      >
        Reset Price Filter
      </button>
    </div>
  );
};

export default PriceRangeSlider;
