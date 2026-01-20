/**
 * SearchBar - Debounced search input with clear button
 */
import React, { useState, useEffect, useRef } from 'react';

const SearchBar = ({
  value = '',
  onChange,
  placeholder = 'Search...',
  loading = false,
  debounceMs = 300
}) => {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef(null);

  // Sync local value with prop
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced onChange
  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      onChange(newValue);
    }, debounceMs);
  };

  // Clear search
  const handleClear = () => {
    setLocalValue('');
    onChange('');
  };

  // Handle enter key for immediate search
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      onChange(localValue);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="search-bar-container">
      <div className="search-bar">
        <svg
          className="search-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <input
          type="text"
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck="false"
        />

        {loading ? (
          <svg
            className="loading-spinner"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1" />
          </svg>
        ) : localValue ? (
          <button
            className="clear-btn"
            onClick={handleClear}
            type="button"
            aria-label="Clear search"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default SearchBar;
