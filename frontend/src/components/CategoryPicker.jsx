/**
 * CategoryPicker - Hierarchical category selection component
 *
 * Features:
 * - Expandable category tree structure
 * - Product counts per category
 * - Search/filter categories
 * - Support for both select and dropdown modes
 */

import React, { useState, useEffect, useRef } from 'react';

const API_BASE_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

const CategoryPicker = ({
  value,                    // Selected category slug or ID
  onChange,                 // Callback when category selected
  mode = 'dropdown',        // 'dropdown' or 'select'
  showCounts = true,        // Show product counts
  placeholder = 'All Categories',
  allowClear = true,        // Allow clearing selection
  style = {}
}) => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const dropdownRef = useRef(null);

  // Fetch hierarchical categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/products/categories/hierarchy`);
        const data = await response.json();

        if (data.success && data.categories) {
          setCategories(data.categories);
          // Auto-expand groups with products
          const expanded = {};
          data.categories.forEach(group => {
            if (group.total_products > 0) {
              expanded[group.id] = true;
            }
          });
          setExpandedGroups(expanded);
        }
      } catch (err) {
        console.error('Failed to fetch categories:', err);
        setError('Failed to load categories');
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Find selected category info
  const findCategory = (slug, cats = categories) => {
    for (const cat of cats) {
      if (cat.slug === slug) return cat;
      if (cat.children) {
        for (const child of cat.children) {
          if (child.slug === slug) return child;
          if (child.children) {
            for (const grandchild of child.children) {
              if (grandchild.slug === slug) return grandchild;
            }
          }
        }
      }
    }
    return null;
  };

  const selectedCategory = value ? findCategory(value) : null;

  // Toggle group expansion
  const toggleGroup = (groupId, e) => {
    e.stopPropagation();
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Handle category selection
  const handleSelect = (category) => {
    onChange(category ? category.slug : null, category);
    setIsOpen(false);
    setSearchTerm('');
  };

  // Filter categories by search term
  const filterCategories = (cats) => {
    if (!searchTerm) return cats;
    const term = searchTerm.toLowerCase();

    return cats.map(group => {
      const matchingChildren = (group.children || []).filter(cat => {
        const catMatches = cat.name.toLowerCase().includes(term) ||
                          cat.slug.toLowerCase().includes(term);
        const hasMatchingSubcats = (cat.children || []).some(sub =>
          sub.name.toLowerCase().includes(term)
        );
        return catMatches || hasMatchingSubcats;
      }).map(cat => ({
        ...cat,
        children: searchTerm ? (cat.children || []).filter(sub =>
          sub.name.toLowerCase().includes(term) ||
          cat.name.toLowerCase().includes(term)
        ) : cat.children
      }));

      return {
        ...group,
        children: matchingChildren
      };
    }).filter(group =>
      group.name.toLowerCase().includes(term) ||
      group.children.length > 0
    );
  };

  const filteredCategories = filterCategories(categories);

  // Styles
  const styles = {
    container: {
      position: 'relative',
      width: '100%',
      ...style
    },
    trigger: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      border: '2px solid #e5e7eb',
      borderRadius: '8px',
      backgroundColor: 'white',
      cursor: 'pointer',
      fontSize: '14px',
      transition: 'border-color 0.2s',
    },
    triggerOpen: {
      borderColor: '#667eea',
    },
    dropdown: {
      position: 'absolute',
      top: 'calc(100% + 4px)',
      left: 0,
      right: 0,
      maxHeight: '400px',
      overflowY: 'auto',
      backgroundColor: 'white',
      border: '2px solid #e5e7eb',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 1000,
    },
    searchInput: {
      width: '100%',
      padding: '10px 12px',
      border: 'none',
      borderBottom: '1px solid #e5e7eb',
      fontSize: '14px',
      outline: 'none',
    },
    group: {
      borderBottom: '1px solid #f3f4f6',
    },
    groupHeader: {
      display: 'flex',
      alignItems: 'center',
      padding: '8px 12px',
      cursor: 'pointer',
      backgroundColor: '#f9fafb',
      fontWeight: '600',
      fontSize: '13px',
      color: '#374151',
    },
    category: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px 8px 24px',
      cursor: 'pointer',
      fontSize: '14px',
      color: '#374151',
      transition: 'background-color 0.1s',
    },
    categoryHover: {
      backgroundColor: '#f3f4f6',
    },
    subcategory: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 12px 6px 40px',
      cursor: 'pointer',
      fontSize: '13px',
      color: '#6b7280',
    },
    count: {
      fontSize: '12px',
      color: '#9ca3af',
      marginLeft: '8px',
    },
    clearBtn: {
      padding: '2px 6px',
      fontSize: '12px',
      color: '#ef4444',
      backgroundColor: '#fee2e2',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      marginLeft: '8px',
    },
    expandIcon: {
      marginRight: '8px',
      fontSize: '10px',
      color: '#9ca3af',
      transition: 'transform 0.2s',
    },
    selected: {
      backgroundColor: '#eff6ff',
      color: '#2563eb',
      fontWeight: '500',
    },
    allOption: {
      display: 'flex',
      alignItems: 'center',
      padding: '10px 12px',
      cursor: 'pointer',
      fontSize: '14px',
      color: '#6b7280',
      borderBottom: '1px solid #e5e7eb',
    }
  };

  if (loading) {
    return (
      <div style={{ ...styles.trigger, color: '#9ca3af' }}>
        Loading categories...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...styles.trigger, color: '#ef4444' }}>
        {error}
      </div>
    );
  }

  return (
    <div ref={dropdownRef} style={styles.container}>
      {/* Trigger */}
      <div
        style={{
          ...styles.trigger,
          ...(isOpen ? styles.triggerOpen : {})
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ color: selectedCategory ? '#111827' : '#9ca3af' }}>
          {selectedCategory ? selectedCategory.display_name || selectedCategory.name : placeholder}
        </span>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {selectedCategory && showCounts && (
            <span style={styles.count}>({selectedCategory.total_products || selectedCategory.product_count || 0})</span>
          )}
          {value && allowClear && (
            <button
              style={styles.clearBtn}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(null);
              }}
            >
              Clear
            </button>
          )}
          <span style={{ marginLeft: '8px', color: '#9ca3af' }}>
            {isOpen ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div style={styles.dropdown}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
            autoFocus
          />

          {/* All Categories Option */}
          {allowClear && (
            <div
              style={{
                ...styles.allOption,
                ...(value === null ? styles.selected : {})
              }}
              onClick={() => handleSelect(null)}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              {placeholder}
            </div>
          )}

          {/* Category Tree */}
          {filteredCategories.map(group => (
            <div key={group.id} style={styles.group}>
              {/* Group Header (Level 1) */}
              <div
                style={styles.groupHeader}
                onClick={(e) => toggleGroup(group.id, e)}
              >
                <span style={{
                  ...styles.expandIcon,
                  transform: expandedGroups[group.id] ? 'rotate(90deg)' : 'rotate(0deg)'
                }}>
                  ▶
                </span>
                {group.name}
                {showCounts && (
                  <span style={styles.count}>({group.total_products || 0})</span>
                )}
              </div>

              {/* Categories (Level 2) */}
              {expandedGroups[group.id] && group.children?.map(category => (
                <div key={category.id}>
                  <div
                    style={{
                      ...styles.category,
                      ...(value === category.slug ? styles.selected : {})
                    }}
                    onClick={() => handleSelect(category)}
                    onMouseEnter={(e) => {
                      if (value !== category.slug) {
                        e.currentTarget.style.backgroundColor = '#f3f4f6';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (value !== category.slug) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <span>
                      {category.display_name || category.name}
                    </span>
                    {showCounts && (
                      <span style={styles.count}>({category.total_products || 0})</span>
                    )}
                  </div>

                  {/* Subcategories (Level 3) */}
                  {category.children?.map(subcategory => (
                    <div
                      key={subcategory.id}
                      style={{
                        ...styles.subcategory,
                        ...(value === subcategory.slug ? styles.selected : {})
                      }}
                      onClick={() => handleSelect(subcategory)}
                      onMouseEnter={(e) => {
                        if (value !== subcategory.slug) {
                          e.currentTarget.style.backgroundColor = '#f3f4f6';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (value !== subcategory.slug) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <span>
                        ↳ {subcategory.display_name || subcategory.name}
                      </span>
                      {showCounts && (
                        <span style={styles.count}>({subcategory.total_products || subcategory.product_count || 0})</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}

          {filteredCategories.length === 0 && (
            <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af' }}>
              No categories found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CategoryPicker;
