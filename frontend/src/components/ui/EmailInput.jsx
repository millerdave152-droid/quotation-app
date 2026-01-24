import React, { useState, useRef, useEffect, useCallback } from 'react';
import { searchDomains, findDomainByName, getSortedDomains } from '../../data/emailDomains';

/**
 * EmailInput - Email input with split username/domain layout
 *
 * Features:
 * - Username field (left) + Domain dropdown (right)
 * - Searchable domain dropdown with common providers
 * - "Other" option for custom domains
 * - Smart paste detection (auto-splits pasted emails)
 * - Optional "No email" checkbox
 */
const EmailInput = ({
  value = '',
  onChange,
  onBlur,
  disabled = false,
  noEmailChecked = false,
  onNoEmailChange,
  showNoEmailOption = true,
  error = false,
  id,
  name,
  required = false,
  className = '',
}) => {
  // Parse email into username and domain
  const parseEmail = useCallback((email) => {
    if (!email) return { username: '', domain: '' };
    const parts = email.split('@');
    if (parts.length === 2) {
      return { username: parts[0], domain: parts[1] };
    }
    return { username: email, domain: '' };
  }, []);

  // Initialize state from value
  const initialParsed = parseEmail(value);
  const [username, setUsername] = useState(initialParsed.username);
  const [domain, setDomain] = useState(() => {
    const d = initialParsed.domain;
    return d && findDomainByName(d) ? d : '';
  });
  const [customDomain, setCustomDomain] = useState(() => {
    const d = initialParsed.domain;
    return d && !findDomainByName(d) ? d : '';
  });
  const [isCustomDomain, setIsCustomDomain] = useState(() => {
    const d = initialParsed.domain;
    return d ? !findDomainByName(d) : false;
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const customDomainInputRef = useRef(null);
  const containerRef = useRef(null);

  // Track the last value we sent to parent to avoid loops
  const lastSentValue = useRef(value);

  // Helper to notify parent of changes
  const notifyChange = useCallback((newUsername, newDomain, newCustomDomain, newIsCustom) => {
    if (noEmailChecked) return;

    const effectiveDomain = newIsCustom ? newCustomDomain : newDomain;
    let combined = '';

    if (newUsername && effectiveDomain) {
      combined = `${newUsername}@${effectiveDomain}`;
    }

    // Only call onChange if the value actually changed
    if (combined !== lastSentValue.current) {
      lastSentValue.current = combined;
      onChange?.({ target: { name, value: combined } });
    }
  }, [name, onChange, noEmailChecked]);

  // Sync from external value changes (e.g., form reset)
  useEffect(() => {
    if (noEmailChecked) {
      setUsername('');
      setDomain('');
      setCustomDomain('');
      setIsCustomDomain(false);
      return;
    }

    // Only sync if the external value differs from what we last sent
    if (value !== lastSentValue.current) {
      lastSentValue.current = value;
      const parsed = parseEmail(value);
      setUsername(parsed.username);

      if (parsed.domain) {
        if (findDomainByName(parsed.domain)) {
          setDomain(parsed.domain);
          setCustomDomain('');
          setIsCustomDomain(false);
        } else {
          setDomain('');
          setCustomDomain(parsed.domain);
          setIsCustomDomain(true);
        }
      } else {
        setDomain('');
        setCustomDomain('');
        setIsCustomDomain(false);
      }
    }
  }, [value, parseEmail, noEmailChecked]);

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

  // Focus custom domain input when "Other" is selected
  useEffect(() => {
    if (isCustomDomain && customDomainInputRef.current && !customDomain) {
      customDomainInputRef.current.focus();
    }
  }, [isCustomDomain, customDomain]);

  // Get filtered domains
  const filteredDomains = searchQuery
    ? searchDomains(searchQuery)
    : getSortedDomains();

  // Handle domain selection
  const handleDomainSelect = (selectedDomain) => {
    if (selectedDomain === 'other') {
      setIsCustomDomain(true);
      setDomain('');
      setDropdownOpen(false);
      setSearchQuery('');
      setHighlightedIndex(0);
      // Focus custom domain input
      setTimeout(() => customDomainInputRef.current?.focus(), 50);
    } else {
      setDomain(selectedDomain);
      setIsCustomDomain(false);
      setCustomDomain('');
      setDropdownOpen(false);
      setSearchQuery('');
      setHighlightedIndex(0);
      // Notify parent of change
      notifyChange(username, selectedDomain, '', false);
    }
  };

  // Handle username input
  const handleUsernameChange = (e) => {
    const input = e.target.value;
    // Don't allow @ in username
    const cleaned = input.replace(/@/g, '');
    setUsername(cleaned);
    // Notify parent of change
    notifyChange(cleaned, domain, customDomain, isCustomDomain);
  };

  // Handle custom domain input
  const handleCustomDomainChange = (e) => {
    const newDomain = e.target.value.toLowerCase().replace(/\s/g, '');
    setCustomDomain(newDomain);
    // Notify parent of change
    notifyChange(username, domain, newDomain, true);
  };

  // Handle paste in username input
  const handleUsernamePaste = (e) => {
    const pasted = e.clipboardData.getData('text').trim();

    // Check if it's a full email
    if (pasted.includes('@')) {
      e.preventDefault();
      const [pastedUsername, pastedDomain] = pasted.split('@');
      setUsername(pastedUsername);

      if (pastedDomain) {
        const knownDomain = findDomainByName(pastedDomain);
        if (knownDomain) {
          setDomain(pastedDomain);
          setIsCustomDomain(false);
          setCustomDomain('');
          notifyChange(pastedUsername, pastedDomain, '', false);
        } else {
          setCustomDomain(pastedDomain);
          setIsCustomDomain(true);
          setDomain('');
          notifyChange(pastedUsername, '', pastedDomain, true);
        }
      } else {
        notifyChange(pastedUsername, domain, customDomain, isCustomDomain);
      }
    }
  };

  // Handle keyboard navigation in dropdown
  const handleSearchKeyDown = (e) => {
    const totalItems = filteredDomains.length + 1; // +1 for "Other" option

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, totalItems - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= filteredDomains.length) {
          handleDomainSelect('other');
        } else if (filteredDomains[highlightedIndex]) {
          handleDomainSelect(filteredDomains[highlightedIndex].domain);
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

  // Handle switching back from custom domain
  const handleClearCustomDomain = () => {
    setIsCustomDomain(false);
    setCustomDomain('');
    setDomain('');
    notifyChange(username, '', '', false);
  };

  // Get current domain display
  const getDomainDisplay = () => {
    if (isCustomDomain) {
      return customDomain || 'Custom...';
    }
    if (domain) {
      return domain;
    }
    return 'Select domain';
  };

  const isDisabled = disabled || noEmailChecked;

  return (
    <div className={`email-input-wrapper ${className}`}>
      <div ref={containerRef} className="email-input-container">
        {/* Username Input */}
        <div className="email-username-wrapper">
          <input
            type="text"
            id={id}
            value={username}
            onChange={handleUsernameChange}
            onPaste={handleUsernamePaste}
            onBlur={onBlur}
            disabled={isDisabled}
            required={required && !noEmailChecked}
            placeholder="username"
            className={`email-username-input ${error ? 'error' : ''}`}
            aria-label="Email username"
          />
        </div>

        {/* @ Symbol */}
        <span className={`email-at-symbol ${isDisabled ? 'disabled' : ''}`}>@</span>

        {/* Domain Dropdown or Custom Input */}
        <div className="email-domain-wrapper">
          {isCustomDomain ? (
            <div className="email-custom-domain-wrapper">
              <input
                ref={customDomainInputRef}
                type="text"
                value={customDomain}
                onChange={handleCustomDomainChange}
                onBlur={onBlur}
                disabled={isDisabled}
                placeholder="domain.com"
                className={`email-custom-domain-input ${error ? 'error' : ''}`}
                aria-label="Custom email domain"
              />
              <button
                type="button"
                onClick={handleClearCustomDomain}
                disabled={isDisabled}
                className="email-custom-domain-clear"
                aria-label="Use common domain"
                title="Switch to common domains"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3L11 11M3 11L11 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={`email-domain-button ${error ? 'error' : ''} ${isDisabled ? 'disabled' : ''}`}
                onClick={() => !isDisabled && setDropdownOpen(!dropdownOpen)}
                disabled={isDisabled}
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
              >
                <span className={domain ? 'domain-selected' : 'domain-placeholder'}>
                  {getDomainDisplay()}
                </span>
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
                <div ref={dropdownRef} className="email-dropdown">
                  <div className="email-dropdown-search">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setHighlightedIndex(0);
                      }}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search domains..."
                      className="email-dropdown-search-input"
                    />
                  </div>
                  <ul className="email-dropdown-list" role="listbox">
                    {filteredDomains.map((d, index) => (
                      <li
                        key={d.domain}
                        role="option"
                        aria-selected={d.domain === domain}
                        className={`email-dropdown-item ${
                          index === highlightedIndex ? 'highlighted' : ''
                        } ${d.domain === domain ? 'selected' : ''}`}
                        onClick={() => handleDomainSelect(d.domain)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                      >
                        <span className="item-domain">{d.domain}</span>
                        <span className="item-label">{d.label}</span>
                      </li>
                    ))}
                    {/* "Other" option */}
                    <li
                      role="option"
                      aria-selected={isCustomDomain}
                      className={`email-dropdown-item other-option ${
                        highlightedIndex >= filteredDomains.length ? 'highlighted' : ''
                      }`}
                      onClick={() => handleDomainSelect('other')}
                      onMouseEnter={() => setHighlightedIndex(filteredDomains.length)}
                    >
                      <span className="item-domain">Other...</span>
                      <span className="item-label">Enter custom domain</span>
                    </li>
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* No Email Checkbox */}
      {showNoEmailOption && (
        <label className="email-no-email-label">
          <input
            type="checkbox"
            checked={noEmailChecked}
            onChange={(e) => {
              onNoEmailChange?.(e.target.checked);
              if (e.target.checked) {
                setUsername('');
                setDomain('');
                setCustomDomain('');
                setIsCustomDomain(false);
                lastSentValue.current = '';
              }
            }}
            disabled={disabled}
            className="email-no-email-checkbox"
          />
          <span>No email provided</span>
        </label>
      )}

      <style>{`
        .email-input-wrapper {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .email-input-container {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .email-username-wrapper {
          flex: 1;
          min-width: 120px;
        }

        .email-username-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .email-username-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .email-username-input.error {
          border-color: #ef4444;
        }

        .email-username-input:disabled {
          background: #f3f4f6;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .email-at-symbol {
          font-size: 14px;
          font-weight: 500;
          color: #6b7280;
          padding: 0 4px;
        }

        .email-at-symbol.disabled {
          opacity: 0.5;
        }

        .email-domain-wrapper {
          position: relative;
          flex: 1;
          min-width: 160px;
        }

        .email-domain-button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          padding: 8px 12px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .email-domain-button:hover:not(.disabled) {
          border-color: #9ca3af;
        }

        .email-domain-button:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .email-domain-button.error {
          border-color: #ef4444;
        }

        .email-domain-button.disabled {
          background: #f3f4f6;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .domain-selected {
          color: #111827;
        }

        .domain-placeholder {
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

        .email-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          min-width: 220px;
          max-height: 320px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          z-index: 50;
          overflow: hidden;
        }

        .email-dropdown-search {
          padding: 8px;
          border-bottom: 1px solid #e5e7eb;
        }

        .email-dropdown-search-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 14px;
          outline: none;
        }

        .email-dropdown-search-input:focus {
          border-color: #3b82f6;
        }

        .email-dropdown-list {
          max-height: 240px;
          overflow-y: auto;
          margin: 0;
          padding: 4px 0;
          list-style: none;
        }

        .email-dropdown-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          cursor: pointer;
          transition: background 0.1s;
        }

        .email-dropdown-item:hover,
        .email-dropdown-item.highlighted {
          background: #f3f4f6;
        }

        .email-dropdown-item.selected {
          background: #eff6ff;
        }

        .email-dropdown-item .item-domain {
          font-weight: 500;
          color: #111827;
        }

        .email-dropdown-item .item-label {
          color: #9ca3af;
          font-size: 12px;
        }

        .email-dropdown-item.other-option {
          border-top: 1px solid #e5e7eb;
          margin-top: 4px;
          padding-top: 12px;
        }

        .email-dropdown-item.other-option .item-domain {
          color: #3b82f6;
        }

        .email-custom-domain-wrapper {
          display: flex;
          gap: 4px;
        }

        .email-custom-domain-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .email-custom-domain-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .email-custom-domain-input.error {
          border-color: #ef4444;
        }

        .email-custom-domain-input:disabled {
          background: #f3f4f6;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .email-custom-domain-clear {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          padding: 0;
          background: #f3f4f6;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          cursor: pointer;
          color: #6b7280;
          transition: all 0.15s;
        }

        .email-custom-domain-clear:hover:not(:disabled) {
          background: #e5e7eb;
          color: #374151;
        }

        .email-custom-domain-clear:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .email-no-email-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #374151;
          cursor: pointer;
        }

        .email-no-email-checkbox {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .email-no-email-label:has(.email-no-email-checkbox:disabled) {
          opacity: 0.7;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default EmailInput;
