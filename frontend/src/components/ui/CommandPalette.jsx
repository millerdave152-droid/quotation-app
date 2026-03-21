import React, { useState, useEffect, useRef, useCallback } from 'react';

const CommandPalette = ({ isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommands, setRecentCommands] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Command categories with icons and shortcuts
  const commands = [
    // Navigation
    { id: 'nav-dashboard', category: 'Navigation', label: 'Go to Dashboard', icon: '📊', path: '/', keywords: ['home', 'main', 'overview'] },
    { id: 'nav-quotes', category: 'Navigation', label: 'Go to Quotations', icon: '📋', path: '/quotes', keywords: ['quote', 'estimate', 'proposal'] },
    { id: 'nav-customers', category: 'Navigation', label: 'Go to Customers', icon: '👥', path: '/customers', keywords: ['client', 'contact', 'buyer'] },
    { id: 'nav-products', category: 'Navigation', label: 'Go to Products', icon: '📦', path: '/products', keywords: ['item', 'inventory', 'catalog'] },
    { id: 'nav-orders', category: 'Navigation', label: 'Go to Orders', icon: '🛒', path: '/orders', keywords: ['purchase', 'sale'] },
    { id: 'nav-invoices', category: 'Navigation', label: 'Go to Invoices', icon: '🧾', path: '/invoices', keywords: ['bill', 'payment'] },
    { id: 'nav-analytics', category: 'Navigation', label: 'Go to Analytics', icon: '📈', path: '/analytics', keywords: ['report', 'stats', 'revenue'] },
    { id: 'nav-clv', category: 'Navigation', label: 'Go to CLV Dashboard', icon: '💎', path: '/analytics/clv', keywords: ['lifetime', 'value', 'customer'] },
    { id: 'nav-pricing', category: 'Navigation', label: 'Go to Pricing', icon: '💰', path: '/pricing', keywords: ['price', 'margin', 'cost'] },
    { id: 'nav-settings', category: 'Navigation', label: 'Go to Settings', icon: '⚙️', path: '/settings', keywords: ['config', 'preferences'] },

    // Actions
    { id: 'action-new-quote', category: 'Actions', label: 'Create New Quote', icon: '➕', action: 'new-quote', keywords: ['add', 'create', 'quotation'] },
    { id: 'action-new-customer', category: 'Actions', label: 'Add New Customer', icon: '👤', action: 'new-customer', keywords: ['add', 'create', 'client'] },
    { id: 'action-new-product', category: 'Actions', label: 'Add New Product', icon: '📦', action: 'new-product', keywords: ['add', 'create', 'item'] },
    { id: 'action-new-order', category: 'Actions', label: 'Create New Order', icon: '🛒', action: 'new-order', keywords: ['add', 'create', 'sale'] },

    // Quick Search
    { id: 'global-search', category: 'Search', label: 'Global Search (Ctrl+Shift+F)', icon: '🔎', action: 'global-search', keywords: ['find', 'lookup', 'all', 'everywhere'] },
    { id: 'search-quotes', category: 'Search', label: 'Search Quotes...', icon: '🔍', action: 'search-quotes', keywords: ['find', 'lookup'] },
    { id: 'search-customers', category: 'Search', label: 'Search Customers...', icon: '🔍', action: 'search-customers', keywords: ['find', 'lookup'] },
    { id: 'search-products', category: 'Search', label: 'Search Products...', icon: '🔍', action: 'search-products', keywords: ['find', 'lookup'] },

    // Theme
    { id: 'theme-toggle', category: 'Theme', label: 'Toggle Dark Mode', icon: '🌙', action: 'toggle-theme', keywords: ['dark', 'light', 'mode', 'night', 'appearance'] },
    { id: 'theme-light', category: 'Theme', label: 'Switch to Light Mode', icon: '☀️', action: 'set-light-theme', keywords: ['bright', 'day'] },
    { id: 'theme-dark', category: 'Theme', label: 'Switch to Dark Mode', icon: '🌙', action: 'set-dark-theme', keywords: ['night'] },
  ];

  // Load recent commands from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('commandPaletteRecent');
    if (saved) {
      setRecentCommands(JSON.parse(saved));
    }
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Filter commands based on query
  const filteredCommands = query.trim()
    ? commands.filter(cmd => {
        const searchStr = `${cmd.label} ${cmd.keywords.join(' ')}`.toLowerCase();
        return searchStr.includes(query.toLowerCase());
      })
    : recentCommands.length > 0
      ? [
          ...recentCommands.slice(0, 3).map(id => commands.find(c => c.id === id)).filter(Boolean),
          ...commands.filter(c => !recentCommands.includes(c.id))
        ]
      : commands;

  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  // Flatten for keyboard navigation
  const flatCommands = Object.values(groupedCommands).flat();

  // Execute command
  const executeCommand = useCallback((cmd) => {
    // Save to recent
    const newRecent = [cmd.id, ...recentCommands.filter(id => id !== cmd.id)].slice(0, 5);
    setRecentCommands(newRecent);
    localStorage.setItem('commandPaletteRecent', JSON.stringify(newRecent));

    if (cmd.path) {
      onNavigate(cmd.path);
    } else if (cmd.action) {
      onNavigate(null, cmd.action);
    }
    onClose();
  }, [recentCommands, onNavigate, onClose]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, flatCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatCommands[selectedIndex]) {
          executeCommand(flatCommands[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  }, [isOpen, flatCommands, selectedIndex, onClose, executeCommand]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedItem = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  let flatIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 9998,
        }}
        onClick={onClose}
      />

      {/* Palette */}
      <div
        style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '600px',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          zIndex: 9999,
          overflow: 'hidden',
        }}
      >
        {/* Search Input */}
        <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Type a command or search..."
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: '16px',
                backgroundColor: 'transparent',
              }}
            />
            <kbd style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#6b7280',
            }}>
              ESC
            </kbd>
          </div>
        </div>

        {/* Commands List */}
        <div
          ref={listRef}
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '8px',
          }}
        >
          {Object.entries(groupedCommands).map(([category, cmds]) => (
            <div key={category} style={{ marginBottom: '8px' }}>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {recentCommands.length > 0 && !query && flatIndex === 0 ? 'Recent' : category}
              </div>
              {cmds.map((cmd) => {
                const currentIndex = flatIndex++;
                const isSelected = currentIndex === selectedIndex;
                return (
                  <div
                    key={cmd.id}
                    data-index={currentIndex}
                    onClick={() => executeCommand(cmd)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#f3f4f6' : 'transparent',
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                  >
                    <span style={{ fontSize: '18px' }}>{cmd.icon}</span>
                    <span style={{ flex: 1, fontWeight: '500' }}>{cmd.label}</span>
                    {cmd.path && (
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {cmd.path}
                      </span>
                    )}
                    {isSelected && (
                      <kbd style={{
                        padding: '2px 6px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#6b7280',
                      }}>
                        ↵
                      </kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {flatCommands.length === 0 && (
            <div style={{
              padding: '32px',
              textAlign: 'center',
              color: '#9ca3af',
            }}>
              No commands found for "{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          display: 'flex',
          gap: '16px',
          fontSize: '12px',
          color: '#6b7280',
        }}>
          <span><kbd style={{ padding: '2px 4px', backgroundColor: '#e5e7eb', borderRadius: '2px' }}>↑↓</kbd> Navigate</span>
          <span><kbd style={{ padding: '2px 4px', backgroundColor: '#e5e7eb', borderRadius: '2px' }}>↵</kbd> Select</span>
          <span><kbd style={{ padding: '2px 4px', backgroundColor: '#e5e7eb', borderRadius: '2px' }}>ESC</kbd> Close</span>
        </div>
      </div>
    </>
  );
};

export default CommandPalette;
