import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

/**
 * Product Mapping Tool for Best Buy Marketplace
 * Maps internal products to Best Buy category codes
 */

const ProductMappingTool = () => {
  // State
  const [categories, setCategories] = useState({});
  const [unmappedProducts, setUnmappedProducts] = useState([]);
  const [mappedProducts, setMappedProducts] = useState([]);
  const [mappingStats, setMappingStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // Filters and search
  const [activeTab, setActiveTab] = useState('unmapped');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Selection for bulk operations
  const [selectedProducts, setSelectedProducts] = useState([]);

  // Pagination
  const [unmappedPage, setUnmappedPage] = useState(0);
  const [mappedPage, setMappedPage] = useState(0);
  const [unmappedTotal, setUnmappedTotal] = useState(0);
  const [mappedTotal, setMappedTotal] = useState(0);
  const ITEMS_PER_PAGE = 25;

  // Anti-flickering refs
  const isMounted = useRef(true);
  const loadedOnce = useRef(false);

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  // Initial load
  useEffect(() => {
    isMounted.current = true;

    if (!loadedOnce.current) {
      loadedOnce.current = true;
      loadInitialData();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  // Load all initial data
  const loadInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchCategories(),
        fetchUnmappedProducts(),
        fetchMappedProducts(),
        fetchMappingStats()
      ]);
    } catch (err) {
      if (isMounted.current) {
        setError('Failed to load data: ' + err.message);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  // Fetch categories
  const fetchCategories = async () => {
    const response = await axios.get(`${API_BASE_URL}/api/marketplace/bestbuy-categories`);
    if (isMounted.current) {
      setCategories(response.data.grouped || {});
    }
  };

  // Fetch unmapped products
  const fetchUnmappedProducts = async (page = 0, search = '') => {
    const params = {
      limit: ITEMS_PER_PAGE,
      offset: page * ITEMS_PER_PAGE
    };
    if (search) params.search = search;

    const response = await axios.get(`${API_BASE_URL}/api/marketplace/products/unmapped`, { params });
    if (isMounted.current) {
      setUnmappedProducts(response.data.products || []);
      setUnmappedTotal(response.data.total || 0);
    }
  };

  // Fetch mapped products
  const fetchMappedProducts = async (page = 0, search = '', categoryCode = '') => {
    const params = {
      limit: ITEMS_PER_PAGE,
      offset: page * ITEMS_PER_PAGE
    };
    if (search) params.search = search;
    if (categoryCode) params.category_code = categoryCode;

    const response = await axios.get(`${API_BASE_URL}/api/marketplace/products/mapped`, { params });
    if (isMounted.current) {
      setMappedProducts(response.data.products || []);
      setMappedTotal(response.data.total || 0);
    }
  };

  // Fetch mapping stats
  const fetchMappingStats = async () => {
    const response = await axios.get(`${API_BASE_URL}/api/marketplace/mapping-stats`);
    if (isMounted.current) {
      setMappingStats(response.data);
    }
  };

  // Handle search
  const handleSearch = () => {
    if (activeTab === 'unmapped') {
      setUnmappedPage(0);
      fetchUnmappedProducts(0, searchTerm);
    } else {
      setMappedPage(0);
      fetchMappedProducts(0, searchTerm);
    }
  };

  // Map single product
  const mapProduct = async (productId, categoryCode) => {
    try {
      setMessage(null);
      setError(null);

      await axios.post(`${API_BASE_URL}/api/marketplace/products/${productId}/map-category`, {
        category_code: categoryCode
      });

      setMessage('Product mapped successfully!');

      // Refresh data
      await Promise.all([
        fetchUnmappedProducts(unmappedPage, searchTerm),
        fetchMappedProducts(mappedPage),
        fetchMappingStats()
      ]);
    } catch (err) {
      setError('Failed to map product: ' + (err.response?.data?.error || err.message));
    }
  };

  // Bulk map products
  const bulkMapProducts = async () => {
    if (selectedProducts.length === 0 || !selectedCategory) {
      setError('Please select products and a category');
      return;
    }

    try {
      setMessage(null);
      setError(null);

      await axios.post(`${API_BASE_URL}/api/marketplace/products/bulk-map`, {
        product_ids: selectedProducts,
        category_code: selectedCategory
      });

      setMessage(`Successfully mapped ${selectedProducts.length} products!`);
      setSelectedProducts([]);

      // Refresh data
      await Promise.all([
        fetchUnmappedProducts(unmappedPage, searchTerm),
        fetchMappedProducts(mappedPage),
        fetchMappingStats()
      ]);
    } catch (err) {
      setError('Failed to bulk map products: ' + (err.response?.data?.error || err.message));
    }
  };

  // Remove mapping
  const removeMapping = async (productId) => {
    try {
      setMessage(null);
      setError(null);

      await axios.delete(`${API_BASE_URL}/api/marketplace/products/${productId}/map-category`);

      setMessage('Mapping removed successfully!');

      // Refresh data
      await Promise.all([
        fetchUnmappedProducts(unmappedPage),
        fetchMappedProducts(mappedPage, searchTerm),
        fetchMappingStats()
      ]);
    } catch (err) {
      setError('Failed to remove mapping: ' + (err.response?.data?.error || err.message));
    }
  };

  // Toggle product selection
  const toggleProductSelection = (productId) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // Select all visible products
  const selectAllVisible = () => {
    const visibleIds = unmappedProducts.map(p => p.id);
    setSelectedProducts(visibleIds);
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedProducts([]);
  };

  // Format price
  const formatPrice = (cents) => {
    if (!cents) return '$0.00';
    return '$' + (cents / 100).toFixed(2);
  };

  // Category group display names
  const groupDisplayNames = {
    TVS: 'TVs & Displays',
    AUDIO: 'Audio Equipment',
    APPLIANCES: 'Major Appliances',
    FURNITURE: 'Furniture',
    MATTRESSES: 'Mattresses & Bedding',
    BBQ: 'BBQ & Outdoor',
    GAMING: 'Gaming',
    PROJECTORS: 'Projectors & Screens',
    MEDIA: 'Blu-ray & Media'
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading product mapping tool...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Product Category Mapping</h2>

      {/* Messages */}
      {message && (
        <div style={styles.successMessage}>
          {message}
          <button style={styles.closeButton} onClick={() => setMessage(null)}>x</button>
        </div>
      )}

      {error && (
        <div style={styles.errorMessage}>
          {error}
          <button style={styles.closeButton} onClick={() => setError(null)}>x</button>
        </div>
      )}

      {/* Stats Cards */}
      {mappingStats && (
        <div style={styles.statsContainer}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{mappingStats.total_products}</div>
            <div style={styles.statLabel}>Total Products</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#28a745' }}>{mappingStats.mapped_products}</div>
            <div style={styles.statLabel}>Mapped</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#dc3545' }}>{mappingStats.unmapped_products}</div>
            <div style={styles.statLabel}>Unmapped</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#007bff' }}>{mappingStats.mapping_percentage}%</div>
            <div style={styles.statLabel}>Complete</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabContainer}>
        <button
          style={{
            ...styles.tabButton,
            ...(activeTab === 'unmapped' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('unmapped')}
        >
          Unmapped Products ({unmappedTotal})
        </button>
        <button
          style={{
            ...styles.tabButton,
            ...(activeTab === 'mapped' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('mapped')}
        >
          Mapped Products ({mappedTotal})
        </button>
      </div>

      {/* Search and Filters */}
      <div style={styles.filterContainer}>
        <input
          type="text"
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          style={styles.searchInput}
        />
        <button onClick={handleSearch} style={styles.searchButton}>
          Search
        </button>
      </div>

      {/* Bulk Mapping Section (Unmapped tab only) */}
      {activeTab === 'unmapped' && (
        <div style={styles.bulkSection}>
          <div style={styles.bulkHeader}>
            <span>Selected: {selectedProducts.length} products</span>
            <button onClick={selectAllVisible} style={styles.smallButton}>Select All Visible</button>
            <button onClick={clearSelection} style={styles.smallButton}>Clear</button>
          </div>

          <div style={styles.bulkActions}>
            <select
              value={selectedGroup}
              onChange={(e) => {
                setSelectedGroup(e.target.value);
                setSelectedCategory('');
              }}
              style={styles.select}
            >
              <option value="">-- Select Category Group --</option>
              {Object.keys(categories).map(group => (
                <option key={group} value={group}>
                  {groupDisplayNames[group] || group}
                </option>
              ))}
            </select>

            {selectedGroup && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={styles.select}
              >
                <option value="">-- Select Category --</option>
                {(categories[selectedGroup] || []).map(cat => (
                  <option key={cat.code} value={cat.code}>
                    {cat.name} ({cat.code})
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={bulkMapProducts}
              disabled={selectedProducts.length === 0 || !selectedCategory}
              style={{
                ...styles.button,
                ...styles.primaryButton,
                ...(selectedProducts.length === 0 || !selectedCategory ? styles.buttonDisabled : {})
              }}
            >
              Map Selected ({selectedProducts.length})
            </button>
          </div>
        </div>
      )}

      {/* Product List - Unmapped */}
      {activeTab === 'unmapped' && (
        <div style={styles.productList}>
          {unmappedProducts.length === 0 ? (
            <div style={styles.emptyState}>No unmapped products found</div>
          ) : (
            <>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>
                      <input
                        type="checkbox"
                        checked={selectedProducts.length === unmappedProducts.length && unmappedProducts.length > 0}
                        onChange={() => {
                          if (selectedProducts.length === unmappedProducts.length) {
                            clearSelection();
                          } else {
                            selectAllVisible();
                          }
                        }}
                      />
                    </th>
                    <th style={styles.th}>Model</th>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Manufacturer</th>
                    <th style={styles.th}>Price</th>
                    <th style={styles.th}>Quick Map</th>
                  </tr>
                </thead>
                <tbody>
                  {unmappedProducts.map(product => (
                    <tr key={product.id} style={styles.tr}>
                      <td style={styles.td}>
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                        />
                      </td>
                      <td style={styles.td}>{product.model}</td>
                      <td style={styles.td}>{product.name}</td>
                      <td style={styles.td}>{product.manufacturer}</td>
                      <td style={styles.td}>{formatPrice(product.msrp_cents)}</td>
                      <td style={styles.td}>
                        <QuickMapDropdown
                          categories={categories}
                          groupDisplayNames={groupDisplayNames}
                          onSelect={(code) => mapProduct(product.id, code)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div style={styles.pagination}>
                <button
                  onClick={() => {
                    const newPage = unmappedPage - 1;
                    setUnmappedPage(newPage);
                    fetchUnmappedProducts(newPage, searchTerm);
                  }}
                  disabled={unmappedPage === 0}
                  style={styles.pageButton}
                >
                  Previous
                </button>
                <span style={styles.pageInfo}>
                  Page {unmappedPage + 1} of {Math.ceil(unmappedTotal / ITEMS_PER_PAGE)}
                </span>
                <button
                  onClick={() => {
                    const newPage = unmappedPage + 1;
                    setUnmappedPage(newPage);
                    fetchUnmappedProducts(newPage, searchTerm);
                  }}
                  disabled={(unmappedPage + 1) * ITEMS_PER_PAGE >= unmappedTotal}
                  style={styles.pageButton}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Product List - Mapped */}
      {activeTab === 'mapped' && (
        <div style={styles.productList}>
          {mappedProducts.length === 0 ? (
            <div style={styles.emptyState}>No mapped products found</div>
          ) : (
            <>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Model</th>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Manufacturer</th>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Group</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mappedProducts.map(product => (
                    <tr key={product.id} style={styles.tr}>
                      <td style={styles.td}>{product.model}</td>
                      <td style={styles.td}>{product.name}</td>
                      <td style={styles.td}>{product.manufacturer}</td>
                      <td style={styles.td}>
                        <span style={styles.categoryBadge}>
                          {product.category_name}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.groupBadge}>
                          {groupDisplayNames[product.category_group] || product.category_group}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() => removeMapping(product.id)}
                          style={styles.removeButton}
                          title="Remove mapping"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div style={styles.pagination}>
                <button
                  onClick={() => {
                    const newPage = mappedPage - 1;
                    setMappedPage(newPage);
                    fetchMappedProducts(newPage, searchTerm);
                  }}
                  disabled={mappedPage === 0}
                  style={styles.pageButton}
                >
                  Previous
                </button>
                <span style={styles.pageInfo}>
                  Page {mappedPage + 1} of {Math.ceil(mappedTotal / ITEMS_PER_PAGE)}
                </span>
                <button
                  onClick={() => {
                    const newPage = mappedPage + 1;
                    setMappedPage(newPage);
                    fetchMappedProducts(newPage, searchTerm);
                  }}
                  disabled={(mappedPage + 1) * ITEMS_PER_PAGE >= mappedTotal}
                  style={styles.pageButton}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Mapping by Manufacturer */}
      {mappingStats && mappingStats.by_manufacturer && mappingStats.by_manufacturer.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Unmapped by Manufacturer</h3>
          <div style={styles.manufacturerGrid}>
            {mappingStats.by_manufacturer.slice(0, 10).map(item => (
              <div key={item.manufacturer} style={styles.manufacturerItem}>
                <span style={styles.manufacturerName}>{item.manufacturer || 'Unknown'}</span>
                <span style={styles.manufacturerCount}>{item.unmapped_count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Quick Map Dropdown Component
const QuickMapDropdown = ({ categories, groupDisplayNames, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('');

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={styles.quickMapButton}
      >
        Quick Map
      </button>

      {isOpen && (
        <div style={styles.dropdownMenu}>
          {!selectedGroup ? (
            <>
              <div style={styles.dropdownHeader}>Select Group</div>
              {Object.keys(categories).map(group => (
                <div
                  key={group}
                  style={styles.dropdownItem}
                  onClick={() => setSelectedGroup(group)}
                >
                  {groupDisplayNames[group] || group}
                </div>
              ))}
            </>
          ) : (
            <>
              <div
                style={styles.dropdownBack}
                onClick={() => setSelectedGroup('')}
              >
                Back to Groups
              </div>
              <div style={styles.dropdownHeader}>
                {groupDisplayNames[selectedGroup] || selectedGroup}
              </div>
              {(categories[selectedGroup] || []).map(cat => (
                <div
                  key={cat.code}
                  style={styles.dropdownItem}
                  onClick={() => {
                    onSelect(cat.code);
                    setIsOpen(false);
                    setSelectedGroup('');
                  }}
                >
                  {cat.name}
                </div>
              ))}
            </>
          )}
          <div
            style={styles.dropdownClose}
            onClick={() => {
              setIsOpen(false);
              setSelectedGroup('');
            }}
          >
            Close
          </div>
        </div>
      )}
    </div>
  );
};

// Styles
const styles = {
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    color: '#333',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    fontSize: '18px',
    color: '#666',
  },
  successMessage: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '12px 16px',
    borderRadius: '4px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: '1px solid #c3e6cb',
  },
  errorMessage: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '12px 16px',
    borderRadius: '4px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: '1px solid #f5c6cb',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '0 8px',
    opacity: 0.7,
  },
  statsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: '14px',
    color: '#666',
    marginTop: '4px',
  },
  tabContainer: {
    display: 'flex',
    gap: '4px',
    marginBottom: '20px',
    borderBottom: '2px solid #ddd',
  },
  tabButton: {
    padding: '12px 24px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#666',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
  },
  activeTab: {
    color: '#007bff',
    borderBottomColor: '#007bff',
  },
  filterContainer: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
  },
  searchInput: {
    flex: 1,
    padding: '10px 14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
  },
  searchButton: {
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  bulkSection: {
    backgroundColor: '#f8f9fa',
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
  },
  bulkHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
    fontWeight: 'bold',
  },
  smallButton: {
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: '#6c757d',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  bulkActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  select: {
    padding: '10px 14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    minWidth: '200px',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  primaryButton: {
    backgroundColor: '#007bff',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  productList: {
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center',
    color: '#666',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    backgroundColor: '#f8f9fa',
    borderBottom: '2px solid #dee2e6',
    fontWeight: 'bold',
    fontSize: '13px',
    color: '#495057',
  },
  tr: {
    borderBottom: '1px solid #e9ecef',
  },
  td: {
    padding: '12px 16px',
    fontSize: '14px',
    color: '#333',
    verticalAlign: 'middle',
  },
  categoryBadge: {
    display: 'inline-block',
    padding: '4px 8px',
    backgroundColor: '#e9ecef',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#495057',
  },
  groupBadge: {
    display: 'inline-block',
    padding: '4px 8px',
    backgroundColor: '#d4edda',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#155724',
  },
  removeButton: {
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    borderTop: '1px solid #e9ecef',
  },
  pageButton: {
    padding: '8px 16px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  pageInfo: {
    fontSize: '14px',
    color: '#666',
  },
  section: {
    marginTop: '24px',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '20px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#333',
  },
  manufacturerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px',
  },
  manufacturerItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '4px',
    border: '1px solid #e9ecef',
  },
  manufacturerName: {
    fontSize: '14px',
    color: '#495057',
  },
  manufacturerCount: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#dc3545',
  },
  quickMapButton: {
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: '#28a745',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '4px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    minWidth: '220px',
    maxHeight: '300px',
    overflowY: 'auto',
    zIndex: 1000,
  },
  dropdownHeader: {
    padding: '8px 12px',
    backgroundColor: '#f8f9fa',
    fontWeight: 'bold',
    fontSize: '12px',
    color: '#666',
    borderBottom: '1px solid #e9ecef',
  },
  dropdownItem: {
    padding: '10px 12px',
    cursor: 'pointer',
    fontSize: '13px',
    borderBottom: '1px solid #f1f1f1',
  },
  dropdownBack: {
    padding: '8px 12px',
    backgroundColor: '#e9ecef',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#007bff',
  },
  dropdownClose: {
    padding: '8px 12px',
    backgroundColor: '#f8f9fa',
    cursor: 'pointer',
    fontSize: '12px',
    textAlign: 'center',
    color: '#dc3545',
    borderTop: '1px solid #e9ecef',
  },
};

export default ProductMappingTool;
