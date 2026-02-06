import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * AutocompleteInput - Reusable autocomplete input component
 *
 * Features:
 * - Debounced search (300ms)
 * - Keyboard navigation (arrows, enter, escape)
 * - ARIA accessibility attributes
 * - Loading/empty states
 * - Grouped results support
 * - Click-outside to close
 */
function AutocompleteInput({
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  placeholder = 'Type to search...',
  label,
  required = false,
  disabled = false,
  minChars = 2,
  debounceMs = 300,
  maxSuggestions = 10,
  renderSuggestion,
  groupBy,
  groupLabels = {},
  allowFreeText = true,
  clearOnSelect = false,
  className = '',
  inputClassName = '',
  error = null,
  helperText = null
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [inputValue, setInputValue] = useState(value || '');

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const containerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Sync input value with external value prop
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Fetch suggestions with debounce
  const fetchSuggestionsDebounced = useCallback(async (query) => {
    if (!query || query.length < minChars) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await fetchSuggestions(query);
        setSuggestions(results.slice(0, maxSuggestions));
        setIsOpen(results.length > 0);
        setHighlightedIndex(-1);
      } catch (err) {
        console.error('Error fetching suggestions:', err);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);
  }, [fetchSuggestions, minChars, maxSuggestions, debounceMs]);

  // Handle input change
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    if (allowFreeText && onChange) {
      onChange(newValue);
    }

    fetchSuggestionsDebounced(newValue);
  };

  // Handle suggestion selection
  const handleSelect = (suggestion, index) => {
    const displayValue = renderSuggestion
      ? (typeof suggestion === 'string' ? suggestion : suggestion.label || suggestion.name || '')
      : (typeof suggestion === 'string' ? suggestion : suggestion.label || suggestion.name || '');

    if (clearOnSelect) {
      setInputValue('');
    } else {
      setInputValue(displayValue);
    }

    setIsOpen(false);
    setSuggestions([]);

    if (onSelect) {
      onSelect(suggestion, index);
    }

    if (onChange && !clearOnSelect) {
      onChange(displayValue);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelect(suggestions[highlightedIndex], highlightedIndex);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;

      case 'Tab':
        setIsOpen(false);
        break;

      default:
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedEl = listRef.current.children[highlightedIndex];
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  // Group suggestions if groupBy is provided
  const groupedSuggestions = groupBy
    ? suggestions.reduce((groups, suggestion) => {
        const group = groupBy(suggestion);
        if (!groups[group]) {
          groups[group] = [];
        }
        groups[group].push(suggestion);
        return groups;
      }, {})
    : null;

  // Render a single suggestion item
  const renderSuggestionItem = (suggestion, index) => {
    const isHighlighted = index === highlightedIndex;

    return (
      <li
        key={index}
        className={`ac-suggestion ${isHighlighted ? 'ac-highlighted' : ''}`}
        onClick={() => handleSelect(suggestion, index)}
        onMouseEnter={() => setHighlightedIndex(index)}
        role="option"
        aria-selected={isHighlighted}
      >
        {renderSuggestion
          ? renderSuggestion(suggestion)
          : (typeof suggestion === 'string' ? suggestion : suggestion.label || suggestion.name || JSON.stringify(suggestion))
        }
      </li>
    );
  };

  const inputId = `autocomplete-${label?.replace(/\s+/g, '-').toLowerCase() || 'input'}`;

  return (
    <div className={`autocomplete-container ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={inputId} className="ac-label">
          {label}
          {required && <span className="ac-required">*</span>}
        </label>
      )}

      <div className="ac-input-wrapper">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className={`ac-input ${inputClassName} ${error ? 'ac-error' : ''}`}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={`${inputId}-listbox`}
          aria-activedescendant={highlightedIndex >= 0 ? `${inputId}-option-${highlightedIndex}` : undefined}
        />

        {isLoading && (
          <div className="ac-loading">
            <span className="ac-spinner"></span>
          </div>
        )}
      </div>

      {error && <span className="ac-error-text">{error}</span>}
      {helperText && !error && <span className="ac-helper-text">{helperText}</span>}

      {isOpen && suggestions.length > 0 && (
        <ul
          ref={listRef}
          id={`${inputId}-listbox`}
          className="ac-suggestions"
          role="listbox"
        >
          {groupedSuggestions
            ? Object.entries(groupedSuggestions).map(([group, items]) => (
                <React.Fragment key={group}>
                  <li className="ac-group-header">
                    {groupLabels[group] || group}
                  </li>
                  {items.map((suggestion, idx) => {
                    const globalIndex = suggestions.indexOf(suggestion);
                    return renderSuggestionItem(suggestion, globalIndex);
                  })}
                </React.Fragment>
              ))
            : suggestions.map((suggestion, index) =>
                renderSuggestionItem(suggestion, index)
              )
          }
        </ul>
      )}

      {isOpen && suggestions.length === 0 && !isLoading && inputValue.length >= minChars && (
        <div className="ac-no-results">No results found</div>
      )}

      <style jsx>{`
        .autocomplete-container {
          position: relative;
          width: 100%;
        }

        .ac-label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
        }

        .ac-required {
          color: #ef4444;
          margin-left: 2px;
        }

        .ac-input-wrapper {
          position: relative;
        }

        .ac-input {
          width: 100%;
          padding: 10px 12px;
          font-size: 14px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          background: white;
          box-sizing: border-box;
        }

        .ac-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .ac-input:disabled {
          background: #f3f4f6;
          cursor: not-allowed;
        }

        .ac-input.ac-error {
          border-color: #ef4444;
        }

        .ac-loading {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
        }

        .ac-spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid #e5e7eb;
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .ac-error-text {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #ef4444;
        }

        .ac-helper-text {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #6b7280;
        }

        .ac-suggestions {
          position: absolute;
          z-index: 50;
          width: 100%;
          max-height: 240px;
          overflow-y: auto;
          margin: 0;
          padding: 4px 0;
          list-style: none;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .ac-suggestion {
          padding: 10px 12px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .ac-suggestion:hover,
        .ac-highlighted {
          background: #f3f4f6;
        }

        .ac-group-header {
          padding: 8px 12px 4px;
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }

        .ac-no-results {
          position: absolute;
          z-index: 50;
          width: 100%;
          padding: 12px;
          text-align: center;
          font-size: 13px;
          color: #6b7280;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </div>
  );
}

export default AutocompleteInput;
