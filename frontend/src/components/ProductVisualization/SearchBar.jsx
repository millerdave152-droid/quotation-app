import React, { useState, useCallback, useEffect, useRef } from 'react';

/**
 * SearchBar - Search input with debounce and clear button
 */
function SearchBar({ value = '', onChange, placeholder = 'Search...' }) {
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef(null);
  const debounceTimer = useRef(null);

  // Sync external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Debounced search
  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Debounce the onChange callback
    debounceTimer.current = setTimeout(() => {
      onChange(newValue);
    }, 300);
  }, [onChange]);

  const handleClear = () => {
    setInputValue('');
    onChange('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return (
    <div className="search-bar">
      <span className="sb-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 001.48-5.34c-.47-2.78-2.79-5-5.59-5.34a6.505 6.505 0 00-7.27 7.27c.34 2.8 2.56 5.12 5.34 5.59a6.5 6.5 0 005.34-1.48l.27.28v.79l4.25 4.25c.41.41 1.08.41 1.49 0 .41-.41.41-1.08 0-1.49L15.5 14zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
      </span>

      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="sb-input"
      />

      {inputValue && (
        <button className="sb-clear" onClick={handleClear} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      )}

      <style jsx>{`
        .search-bar {
          display: flex;
          align-items: center;
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 0 12px;
          transition: all 0.2s;
        }

        .search-bar:focus-within {
          border-color: #2196F3;
          box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
        }

        .sb-icon {
          display: flex;
          align-items: center;
          color: #888;
        }

        .sb-input {
          flex: 1;
          border: none;
          outline: none;
          padding: 12px;
          font-size: 14px;
          background: transparent;
        }

        .sb-input::placeholder {
          color: #aaa;
        }

        .sb-clear {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border: none;
          background: #f0f0f0;
          border-radius: 50%;
          cursor: pointer;
          color: #666;
          transition: all 0.2s;
        }

        .sb-clear:hover {
          background: #e0e0e0;
          color: #333;
        }
      `}</style>
    </div>
  );
}

export default SearchBar;
