/**
 * FilterOption - Individual filter option with count badge
 * Supports radio (single-select), checkbox (multi-select), and toggle types
 */
import React from 'react';
import './FilterOption.css';

const FilterOption = ({
  value,
  label,
  count,
  selected,
  type = 'radio', // 'radio', 'checkbox', 'toggle'
  disabled = false,
  onChange
}) => {
  const handleClick = () => {
    if (!disabled) {
      onChange(value, !selected);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={`filter-option ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
      role={type === 'radio' ? 'radio' : 'checkbox'}
      aria-checked={selected}
      aria-disabled={disabled}
    >
      <div className="filter-option-indicator">
        {type === 'radio' ? (
          <span className={`radio-circle ${selected ? 'checked' : ''}`}>
            {selected && <span className="radio-dot" />}
          </span>
        ) : (
          <span className={`checkbox-box ${selected ? 'checked' : ''}`}>
            {selected && <span className="checkbox-check">&#10003;</span>}
          </span>
        )}
      </div>

      <span className="filter-option-label">{label}</span>

      {count !== undefined && count !== null && (
        <span className={`filter-option-count ${count === 0 ? 'zero' : ''}`}>
          ({count})
        </span>
      )}
    </div>
  );
};

export default FilterOption;
