import React, { useState, useRef, useEffect, useCallback } from 'react';
import { searchAreaCodes, findAreaCodeByCode, getSortedAreaCodes } from '../../data/canadianAreaCodes';

/**
 * PhoneInput - Phone number input with area code dropdown
 *
 * Features:
 * - Searchable area code dropdown (by code, city, or region)
 * - Auto-formatting phone number as user types
 * - Smart paste detection
 * - Keyboard navigation
 */
const PhoneInput = ({
  value = '',
  onChange,
  onBlur,
  disabled = false,
  error = false,
  id,
  name,
  required = false,
  className = '',
  placeholder = '(___) ___-____',
}) => {
  // Parse phone into area code and local number
  const parsePhone = useCallback((phone) => {
    if (!phone) return { areaCode: '', localNumber: '' };

    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');

    if (digits.length >= 10) {
      return {
        areaCode: digits.slice(0, 3),
        localNumber: digits.slice(3, 10),
      };
    } else if (digits.length > 7) {
      return {
        areaCode: digits.slice(0, 3),
        localNumber: digits.slice(3),
      };
    } else {
      return {
        areaCode: '',
        localNumber: digits.slice(0, 7),
      };
    }
  }, []);

  const initialParsed = parsePhone(value);
  const [areaCode, setAreaCode] = useState(initialParsed.areaCode);
  const [localNumber, setLocalNumber] = useState(initialParsed.localNumber);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const localInputRef = useRef(null);
  const containerRef = useRef(null);

  // Track the last value we sent to parent to avoid loops
  const lastSentValue = useRef(value);

  // Helper to notify parent of changes
  const notifyChange = useCallback((newAreaCode, newLocalNumber) => {
    let formatted = '';

    if (newAreaCode && newLocalNumber.length === 7) {
      formatted = `(${newAreaCode}) ${newLocalNumber.slice(0, 3)}-${newLocalNumber.slice(3)}`;
    } else if (newLocalNumber.length === 7 && !newAreaCode) {
      formatted = `${newLocalNumber.slice(0, 3)}-${newLocalNumber.slice(3)}`;
    } else if (newAreaCode && newLocalNumber.length > 0) {
      // Partial number - still notify parent so they can see progress
      formatted = `(${newAreaCode}) ${newLocalNumber}`;
    } else if (newAreaCode && newLocalNumber.length === 0) {
      // Just area code selected - store it
      formatted = `(${newAreaCode}) `;
    }

    // Only call onChange if the value actually changed
    if (formatted !== lastSentValue.current) {
      lastSentValue.current = formatted;
      onChange?.({ target: { name, value: formatted } });
    }
  }, [name, onChange]);

  // Sync from external value changes (e.g., form reset)
  useEffect(() => {
    // Only sync if the external value differs from what we last sent
    if (value !== lastSentValue.current) {
      lastSentValue.current = value;
      const parsed = parsePhone(value);
      setAreaCode(parsed.areaCode);
      setLocalNumber(parsed.localNumber);
    }
  }, [value, parsePhone]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (dropdownOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [dropdownOpen]);

  // Get filtered area codes
  const filteredAreaCodes = searchQuery
    ? searchAreaCodes(searchQuery)
    : getSortedAreaCodes();

  // Format local number for display
  const formatLocalDisplay = (num) => {
    if (!num) return '';
    if (num.length <= 3) return num;
    if (num.length <= 7) return `${num.slice(0, 3)}-${num.slice(3)}`;
    return `${num.slice(0, 3)}-${num.slice(3, 7)}`;
  };

  // Handle area code selection
  const handleAreaCodeSelect = (code) => {
    setAreaCode(code);
    setDropdownOpen(false);
    setSearchQuery('');
    setHighlightedIndex(0);
    // Notify parent of change
    notifyChange(code, localNumber);
    // Auto-focus local number input
    setTimeout(() => localInputRef.current?.focus(), 50);
  };

  // Handle local number input
  const handleLocalNumberChange = (e) => {
    const input = e.target.value;
    // Extract only digits
    const digits = input.replace(/\D/g, '').slice(0, 7);
    setLocalNumber(digits);
    // Notify parent of change
    notifyChange(areaCode, digits);
  };

  // Handle paste in local input
  const handleLocalPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const digits = pasted.replace(/\D/g, '');

    let newAreaCode = areaCode;
    let newLocalNumber = localNumber;

    if (digits.length >= 10) {
      // Full number pasted - extract area code and local
      newAreaCode = digits.slice(0, 3);
      newLocalNumber = digits.slice(3, 10);
    } else if (digits.length > 7) {
      // Partial with area code
      newAreaCode = digits.slice(0, 3);
      newLocalNumber = digits.slice(3);
    } else {
      // Just local number
      newLocalNumber = digits.slice(0, 7);
    }

    setAreaCode(newAreaCode);
    setLocalNumber(newLocalNumber);
    notifyChange(newAreaCode, newLocalNumber);
  };

  // Handle keyboard navigation in dropdown
  const handleSearchKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          Math.min(prev + 1, filteredAreaCodes.length - 1)
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredAreaCodes[highlightedIndex]) {
          handleAreaCodeSelect(filteredAreaCodes[highlightedIndex].code);
        }
        break;
      case 'Escape':
        setDropdownOpen(false);
        setSearchQuery('');
        break;
      case 'Tab':
        setDropdownOpen(false);
        setSearchQuery('');
        break;
      default:
        break;
    }
  };

  // Handle keyboard in local input
  const handleLocalKeyDown = (e) => {
    // If backspace at beginning and empty, clear area code
    if (e.key === 'Backspace' && localNumber === '' && areaCode) {
      setAreaCode('');
      notifyChange('', '');
    }
  };

  // Get the selected area code object for display
  const selectedAreaCode = findAreaCodeByCode(areaCode);

  return (
    <div ref={containerRef} className={`phone-input-container ${className}`}>
      {/* Area Code Dropdown */}
      <div className="phone-area-code-wrapper">
        <button
          type="button"
          className={`phone-area-code-button ${error ? 'error' : ''} ${disabled ? 'disabled' : ''}`}
          onClick={() => !disabled && setDropdownOpen(!dropdownOpen)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
        >
          {areaCode ? (
            <span className="area-code-selected">
              {areaCode}
              {selectedAreaCode && (
                <span className="area-code-city"> - {selectedAreaCode.city}</span>
              )}
            </span>
          ) : (
            <span className="area-code-placeholder">Area code</span>
          )}
          <svg
            className={`dropdown-arrow ${dropdownOpen ? 'open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div ref={dropdownRef} className="phone-dropdown">
            <div className="phone-dropdown-search">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search by code or city..."
                className="phone-dropdown-search-input"
              />
            </div>
            <ul className="phone-dropdown-list" role="listbox">
              {filteredAreaCodes.length === 0 ? (
                <li className="phone-dropdown-empty">No matches found</li>
              ) : (
                filteredAreaCodes.map((ac, index) => (
                  <li
                    key={ac.code}
                    role="option"
                    aria-selected={ac.code === areaCode}
                    className={`phone-dropdown-item ${
                      index === highlightedIndex ? 'highlighted' : ''
                    } ${ac.code === areaCode ? 'selected' : ''}`}
                    onClick={() => handleAreaCodeSelect(ac.code)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <span className="item-code">{ac.code}</span>
                    <span className="item-region">{ac.region}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Local Number Input */}
      <div className="phone-local-wrapper">
        <input
          ref={localInputRef}
          type="tel"
          id={id}
          name={name}
          value={formatLocalDisplay(localNumber)}
          onChange={handleLocalNumberChange}
          onPaste={handleLocalPaste}
          onKeyDown={handleLocalKeyDown}
          onBlur={onBlur}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          className={`phone-local-input ${error ? 'error' : ''}`}
          aria-label="Local phone number"
        />
      </div>

      <style>{`
        .phone-input-container {
          display: flex;
          gap: 8px;
          align-items: stretch;
        }

        .phone-area-code-wrapper {
          position: relative;
          flex-shrink: 0;
        }

        .phone-area-code-button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 160px;
          padding: 8px 12px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          height: 100%;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .phone-area-code-button:hover:not(.disabled) {
          border-color: #9ca3af;
        }

        .phone-area-code-button:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .phone-area-code-button.error {
          border-color: #ef4444;
        }

        .phone-area-code-button.disabled {
          background: #f3f4f6;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .area-code-selected {
          color: #111827;
          font-weight: 500;
        }

        .area-code-city {
          color: #6b7280;
          font-weight: 400;
        }

        .area-code-placeholder {
          color: #9ca3af;
        }

        .dropdown-arrow {
          color: #6b7280;
          transition: transform 0.2s;
          flex-shrink: 0;
        }

        .dropdown-arrow.open {
          transform: rotate(180deg);
        }

        .phone-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          min-width: 280px;
          max-height: 320px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          z-index: 50;
          overflow: hidden;
        }

        .phone-dropdown-search {
          padding: 8px;
          border-bottom: 1px solid #e5e7eb;
        }

        .phone-dropdown-search-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 14px;
          outline: none;
        }

        .phone-dropdown-search-input:focus {
          border-color: #3b82f6;
        }

        .phone-dropdown-list {
          max-height: 240px;
          overflow-y: auto;
          margin: 0;
          padding: 4px 0;
          list-style: none;
        }

        .phone-dropdown-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          cursor: pointer;
          transition: background 0.1s;
        }

        .phone-dropdown-item:hover,
        .phone-dropdown-item.highlighted {
          background: #f3f4f6;
        }

        .phone-dropdown-item.selected {
          background: #eff6ff;
        }

        .phone-dropdown-item .item-code {
          font-weight: 600;
          color: #111827;
          min-width: 36px;
        }

        .phone-dropdown-item .item-region {
          color: #6b7280;
          font-size: 13px;
        }

        .phone-dropdown-empty {
          padding: 16px 12px;
          text-align: center;
          color: #9ca3af;
        }

        .phone-local-wrapper {
          flex: 1;
        }

        .phone-local-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .phone-local-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .phone-local-input.error {
          border-color: #ef4444;
        }

        .phone-local-input:disabled {
          background: #f3f4f6;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .phone-local-input::placeholder {
          color: #9ca3af;
        }
      `}</style>
    </div>
  );
};

export default PhoneInput;
