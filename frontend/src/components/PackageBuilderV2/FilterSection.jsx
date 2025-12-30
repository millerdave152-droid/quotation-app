/**
 * FilterSection - Collapsible filter category section
 * Used in the filter sidebar for Package Builder V2
 */
import React, { useState } from 'react';
import './FilterSection.css';

const FilterSection = ({
  title,
  icon,
  children,
  defaultExpanded = false,
  badge = null
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={`filter-section ${isExpanded ? 'expanded' : ''}`}>
      <button
        className="filter-section-header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <div className="filter-section-title">
          {icon && <span className="filter-section-icon">{icon}</span>}
          <span>{title}</span>
          {badge !== null && (
            <span className="filter-section-badge">{badge}</span>
          )}
        </div>
        <span className={`filter-section-chevron ${isExpanded ? 'rotated' : ''}`}>
          &#9660;
        </span>
      </button>

      {isExpanded && (
        <div className="filter-section-content">
          {children}
        </div>
      )}
    </div>
  );
};

export default FilterSection;
