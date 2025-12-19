import React, { useState, useEffect, useRef } from 'react';
import logger from '../utils/logger';
import { cachedFetch, invalidateCache } from '../services/apiCache';
import { handleApiError } from '../utils/errorHandler';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

const ProductManagement = () => {
  // State Management
  const [view, setView] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterManufacturer, setFilterManufacturer] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('updated_desc');

  // Edit States
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({});

  // CSV Import States
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);

  const isMounted = useRef(true);
  const loadedOnce = useRef(false);

  // Load initial data ONCE
  useEffect(() => {
    isMounted.current = true;

    if (!loadedOnce.current) {
      loadedOnce.current = true;
      loadAllData();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  // Filter products when filters change
  useEffect(() => {
    if (products.length > 0) {
      filterProducts();
    }
  }, [products, searchTerm, filterManufacturer, filterCategory, sortBy]);

  const loadAllData = async () => {
    try {
      setLoading(true);

      // Load products and stats in parallel with caching
      const [productsData, statsData] = await Promise.all([
        cachedFetch('/api/products?limit=1000').catch(err => {
          handleApiError(err, { context: 'Loading products', silent: true });
          return [];
        }),
        cachedFetch('/api/products/stats').catch(err => {
          handleApiError(err, { context: 'Loading stats', silent: true });
          return {};
        })
      ]);

      if (isMounted.current) {
        setProducts(Array.isArray(productsData) ? productsData : []);
        setStats(statsData);
      }

    } catch (error) {
      handleApiError(error, { context: 'Loading products' });
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      if (isMounted.current) {
        setNotification(null);
      }
    }, 4000);
  };

  const filterProducts = () => {
    let filtered = [...products];

    // Search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.model?.toLowerCase().includes(search) ||
        p.name?.toLowerCase().includes(search) ||
        p.manufacturer?.toLowerCase().includes(search) ||
        p.description?.toLowerCase().includes(search)
      );
    }

    // Manufacturer filter
    if (filterManufacturer !== 'all') {
      filtered = filtered.filter(p => p.manufacturer === filterManufacturer);
    }

    // Category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(p => p.category === filterCategory);
    }

    // Sort
    switch (sortBy) {
      case 'name_asc':
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'name_desc':
        filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        break;
      case 'price_asc':
        filtered.sort((a, b) => (a.cost_cents || 0) - (b.cost_cents || 0));
        break;
      case 'price_desc':
        filtered.sort((a, b) => (b.cost_cents || 0) - (a.cost_cents || 0));
        break;
      case 'updated_desc':
        filtered.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        break;
      default:
        break;
    }

    setFilteredProducts(filtered);
  };

  const createProduct = async (productData) => {
    try {
      logger.log('➕ Creating product:', productData);

      const response = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create product');
      }

      showNotification('Product created successfully!', 'success');
      await loadAllData();
      setFormData({});
      setView('browser');
    } catch (error) {
      handleApiError(error, { context: 'Creating product' });
    }
  };

  const updateProduct = async (productId, updates) => {
    try {
      logger.log('📝 Updating product ID:', productId);
      logger.log('📝 Updates:', updates);

      const response = await fetch(`${API_BASE}/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update product');
      }

      showNotification('Product updated successfully!', 'success');
      await loadAllData();
      setEditingProduct(null);
      setView('browser');
    } catch (error) {
      handleApiError(error, { context: 'Updating product' });
    }
  };

  const handleCreateProduct = () => {
    // Validate required fields
    if (!formData.model || !formData.name || !formData.manufacturer) {
      showNotification('Model, Name, and Manufacturer are required', 'error');
      return;
    }

    const productData = {
      name: formData.name,
      model: formData.model,
      manufacturer: formData.manufacturer,
      category: formData.category || '',
      description: formData.description || '',
      cost_cents: Math.round(parseFloat(formData.cost || 0) * 100),
      msrp_cents: Math.round(parseFloat(formData.msrp || 0) * 100)
    };

    createProduct(productData);
  };

  const handleSaveProduct = () => {
    if (!editingProduct) return;

    const costValue = formData.cost !== undefined ? formData.cost : (editingProduct.cost_cents / 100).toFixed(2);
    const msrpValue = formData.msrp !== undefined ? formData.msrp : (editingProduct.msrp_cents / 100).toFixed(2);

    const updates = {
      name: formData.name !== undefined ? formData.name : editingProduct.name,
      model: formData.model !== undefined ? formData.model : editingProduct.model,
      manufacturer: formData.manufacturer !== undefined ? formData.manufacturer : editingProduct.manufacturer,
      category: formData.category !== undefined ? formData.category : editingProduct.category,
      description: formData.description !== undefined ? formData.description : editingProduct.description,
      cost_cents: Math.round(parseFloat(costValue || 0) * 100),
      msrp_cents: Math.round(parseFloat(msrpValue || 0) * 100)
    };

    updateProduct(editingProduct.id, updates);
  };

  const handleCSVImport = async () => {
    if (!importFile) {
      showNotification('Please select a file to import', 'error');
      return;
    }

    // Validate file type - support CSV and Excel files
    const fileName = importFile.name.toLowerCase();
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const isValidType = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValidType) {
      showNotification('Please select a valid CSV or Excel file (.csv, .xlsx, .xls)', 'error');
      return;
    }

    // Validate file size (25MB max for Excel files)
    const maxSize = 25 * 1024 * 1024;
    if (importFile.size > maxSize) {
      showNotification('File size exceeds 25MB limit. Please use a smaller file.', 'error');
      return;
    }

    try {
      setImporting(true);
      setImportResults(null);

      const formData = new FormData();
      formData.append('file', importFile);

      // Use the new universal import endpoint
      const response = await fetch(`${API_BASE}/products/import-universal`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Import failed');
      }

      setImportResults(result);
      const fileType = fileName.endsWith('.csv') ? 'CSV' : 'Excel';
      showNotification(`${fileType} import complete! ${result.summary?.inserted || 0} new, ${result.summary?.updated || 0} updated`, 'success');

      // Reload products after successful import
      await loadAllData();
      setImportFile(null);
    } catch (error) {
      handleApiError(error, { context: 'Importing products' });
    } finally {
      if (isMounted.current) {
        setImporting(false);
      }
    }
  };

  const downloadCSVTemplate = () => {
    const template = `MANUFACTURER,MODEL,Description,CATEGORY,COST,MSRP
Samsung,RF28R7351SG,French Door Refrigerator 28 cu ft,Refrigerators,1299.99,2499.99
LG,WM9000HVA,Front Load Washer 5.2 cu ft,Washers,899.99,1599.99
Whirlpool,WRS325SDHZ,Side-by-Side Refrigerator 25 cu ft,Refrigerators,749.99,1299.99`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product-import-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showNotification('CSV template downloaded successfully', 'success');
  };

  const formatPrice = (cents) => {
    if (!cents) return '$0.00';
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getManufacturers = () => {
    const manufacturers = [...new Set(products.map(p => p.manufacturer).filter(Boolean))];
    return manufacturers.sort();
  };

  const getCategories = () => {
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    return categories.sort();
  };

  // Dashboard View
  const renderDashboard = () => {
    // Get recent products sorted by updated_at
    const recentProducts = [...products]
      .sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at || 0);
        const dateB = new Date(b.updated_at || b.created_at || 0);
        return dateB - dateA; // Most recent first
      })
      .slice(0, 10);

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #667eea' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Total Products</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>{stats.total_products || products.length}</div>
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #10b981' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Manufacturers</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>{stats.manufacturers || getManufacturers().length}</div>
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px', fontWeight: '500' }}>Categories</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827' }}>{stats.categories || getCategories().length}</div>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600' }}>Recently Updated Products</h3>
          {recentProducts.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
              <div style={{ fontSize: '16px' }}>No products yet. Add your first product!</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Model</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Name</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Manufacturer</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Cost</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>MSRP</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {recentProducts.map(product => (
                    <tr key={product.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '13px' }}>{product.model || '-'}</td>
                      <td style={{ padding: '12px', fontWeight: '500' }}>{product.name || '-'}</td>
                      <td style={{ padding: '12px' }}>{product.manufacturer || '-'}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{formatPrice(product.cost_cents)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>{formatPrice(product.msrp_cents)}</td>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#6b7280' }}>
                        {product.updated_at ? new Date(product.updated_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Browser View
  const renderBrowser = () => (
    <div>
      {/* Search and Filters */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Model, name, manufacturer..."
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Manufacturer</label>
            <select
              value={filterManufacturer}
              onChange={(e) => setFilterManufacturer(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            >
              <option value="all">All Manufacturers</option>
              {getManufacturers().map(mfr => (
                <option key={mfr} value={mfr}>{mfr}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Category</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            >
              <option value="all">All Categories</option>
              {getCategories().map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' }}>Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            >
              <option value="updated_desc">Recently Updated</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="price_asc">Price (Low-High)</option>
              <option value="price_desc">Price (High-Low)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ marginBottom: '15px', fontSize: '14px', fontWeight: '600', color: '#6b7280' }}>
          Showing {filteredProducts.length} of {products.length} products
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Model</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Name</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Manufacturer</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Category</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Cost</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>MSRP</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                    <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
                    No products match your filters
                  </td>
                </tr>
              ) : (
                filteredProducts.slice(0, 100).map(product => (
                  <tr key={product.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '13px' }}>{product.model || '-'}</td>
                    <td style={{ padding: '12px', fontWeight: '500' }}>{product.name || '-'}</td>
                    <td style={{ padding: '12px' }}>{product.manufacturer || '-'}</td>
                    <td style={{ padding: '12px' }}>{product.category || '-'}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{formatPrice(product.cost_cents)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>{formatPrice(product.msrp_cents)}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button
                        onClick={() => {
                          setSelectedProduct(product);
                          setView('details');
                        }}
                        style={{ padding: '6px 12px', marginRight: '5px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                      >
                        View
                      </button>
                      <button
                        onClick={() => {
                          setEditingProduct(product);
                          setFormData({});
                          setView('edit');
                        }}
                        style={{ padding: '6px 12px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredProducts.length > 100 && (
          <div style={{ marginTop: '15px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
            Showing first 100 results. Use filters to narrow down.
          </div>
        )}
      </div>
    </div>
  );

  // Details View
  const renderDetails = () => {
    if (!selectedProduct) return null;

    return (
      <div>
        <button
          onClick={() => setView('browser')}
          style={{ marginBottom: '20px', padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          ← Back to Browser
        </button>

        <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 'bold' }}>{selectedProduct.name}</h2>
          <div style={{ color: '#6b7280', marginBottom: '20px', fontFamily: 'monospace' }}>Model: {selectedProduct.model}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Product Information</h3>
              <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#6b7280' }}>Manufacturer:</td>
                    <td style={{ padding: '10px' }}>{selectedProduct.manufacturer}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#6b7280' }}>Category:</td>
                    <td style={{ padding: '10px' }}>{selectedProduct.category}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#6b7280' }}>Description:</td>
                    <td style={{ padding: '10px' }}>{selectedProduct.description || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Pricing</h3>
              <table style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#6b7280' }}>Cost:</td>
                    <td style={{ padding: '10px', fontSize: '18px', fontWeight: 'bold' }}>{formatPrice(selectedProduct.cost_cents)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#6b7280' }}>MSRP:</td>
                    <td style={{ padding: '10px', fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>{formatPrice(selectedProduct.msrp_cents)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#6b7280' }}>Margin:</td>
                    <td style={{ padding: '10px', fontSize: '16px' }}>
                      {selectedProduct.cost_cents && selectedProduct.msrp_cents
                        ? `${(((selectedProduct.msrp_cents - selectedProduct.cost_cents) / selectedProduct.msrp_cents) * 100).toFixed(1)}%`
                        : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: '30px', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => {
                setEditingProduct(selectedProduct);
                setFormData({});
                setView('edit');
              }}
              style={{ padding: '12px 24px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
            >
              Edit Product
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Add View
  const renderAdd = () => (
    <div>
      <button
        onClick={() => {
          setFormData({});
          setView('browser');
        }}
        style={{ marginBottom: '20px', padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
      >
        ← Cancel
      </button>

      <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: 'bold' }}>Add New Product</h2>

        <div style={{ display: 'grid', gap: '20px', maxWidth: '600px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Model Number *</label>
            <input
              type="text"
              value={formData.model || ''}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              placeholder="Enter model number"
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Product Name *</label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter product name"
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Manufacturer *</label>
            <input
              type="text"
              value={formData.manufacturer || ''}
              onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
              placeholder="Enter manufacturer"
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Category</label>
            <input
              type="text"
              value={formData.category || ''}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="Enter category"
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter product description"
              rows="3"
              style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Cost ($)</label>
              <input
                type="number"
                step="0.01"
                value={formData.cost || ''}
                onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                placeholder="0.00"
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>MSRP ($)</label>
              <input
                type="number"
                step="0.01"
                value={formData.msrp || ''}
                onChange={(e) => setFormData({ ...formData, msrp: e.target.value })}
                placeholder="0.00"
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button
              onClick={handleCreateProduct}
              style={{ padding: '12px 30px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
            >
              Create Product
            </button>
            <button
              onClick={() => {
                setFormData({});
                setView('browser');
              }}
              style={{ padding: '12px 30px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Edit View
  const renderEdit = () => {
    if (!editingProduct) return null;

    return (
      <div>
        <button
          onClick={() => {
            setEditingProduct(null);
            setFormData({});
            setView(selectedProduct ? 'details' : 'browser');
          }}
          style={{ marginBottom: '20px', padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          ← Cancel
        </button>

        <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: 'bold' }}>Edit Product</h2>

          <div style={{ display: 'grid', gap: '20px', maxWidth: '600px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Model Number *</label>
              <input
                type="text"
                defaultValue={editingProduct.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Product Name *</label>
              <input
                type="text"
                defaultValue={editingProduct.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Manufacturer *</label>
              <input
                type="text"
                defaultValue={editingProduct.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Category</label>
              <input
                type="text"
                defaultValue={editingProduct.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Description</label>
              <textarea
                defaultValue={editingProduct.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows="3"
                style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  defaultValue={(editingProduct.cost_cents / 100).toFixed(2)}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>MSRP ($)</label>
                <input
                  type="number"
                  step="0.01"
                  defaultValue={(editingProduct.msrp_cents / 100).toFixed(2)}
                  onChange={(e) => setFormData({ ...formData, msrp: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={handleSaveProduct}
                style={{ padding: '12px 30px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setFormData({});
                  setView(selectedProduct ? 'details' : 'browser');
                }}
                style={{ padding: '12px 30px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Import View
  const renderImport = () => (
    <div>
      <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h2 style={{ margin: '0', fontSize: '24px', fontWeight: 'bold' }}>CSV Import</h2>
          <button
            onClick={downloadCSVTemplate}
            style={{
              padding: '8px 16px',
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📥 Download Template
          </button>
        </div>
        <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
          Upload a CSV or Excel file to import products from manufacturer price lists. Supported formats: .csv, .xlsx, .xls<br/>
          <span style={{ fontSize: '12px' }}>Common column names supported: MODEL, SKU, Part Number, MANUFACTURER, Brand, COST, Dealer Cost, MSRP, Retail Price, Description</span>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Select File (CSV or Excel)</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  const maxSize = 25 * 1024 * 1024; // 25MB for Excel files
                  if (file.size > maxSize) {
                    showNotification('File size exceeds 25MB limit. Please use a smaller file.', 'error');
                    e.target.value = '';
                    setImportFile(null);
                    return;
                  }
                  if (file.size > 10 * 1024 * 1024) { // 10MB warning
                    showNotification('Large file detected (>10MB). Import may take longer.', 'warning');
                  }
                  setImportFile(file);
                  setImportResults(null);
                }
              }}
              style={{ padding: '10px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', width: '100%' }}
            />
          </div>

          {importFile && (
            <div style={{ padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '14px' }}>
              Selected: <strong>{importFile.name}</strong> ({(importFile.size / 1024).toFixed(2)} KB)
            </div>
          )}

          <button
            onClick={handleCSVImport}
            disabled={!importFile || importing}
            style={{
              padding: '12px 30px',
              background: importing ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: importing || !importFile ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '16px'
            }}
          >
            {importing ? '⏳ Importing...' : 'Upload and Import'}
          </button>
        </div>
      </div>

      {/* Import Results */}
      {importResults && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>Import Results</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '2px solid #10b981' }}>
              <div style={{ fontSize: '12px', color: '#059669', fontWeight: '600', marginBottom: '4px' }}>Successful</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#059669' }}>{importResults.successful}</div>
            </div>
            <div style={{ padding: '16px', background: '#fef2f2', borderRadius: '8px', border: '2px solid #ef4444' }}>
              <div style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600', marginBottom: '4px' }}>Failed</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#dc2626' }}>{importResults.failed}</div>
            </div>
            <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '2px solid #6b7280' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>Total Rows</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#6b7280' }}>{importResults.total}</div>
            </div>
          </div>

          {importResults.errors && importResults.errors.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600', color: '#dc2626' }}>Errors:</h4>
              <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#fef2f2', padding: '15px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                {importResults.errors.map((error, idx) => (
                  <div key={idx} style={{ marginBottom: '8px', fontSize: '13px', fontFamily: 'monospace', color: '#991b1b' }}>
                    Row {error.row}: {error.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            <button
              onClick={() => {
                setImportResults(null);
                setImportFile(null);
              }}
              style={{ padding: '10px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
            >
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', color: '#6b7280' }}>Loading products...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '30px', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f9fafb', minHeight: 'calc(100vh - 140px)' }}>
      {/* Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: notification.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '16px 24px',
          borderRadius: '8px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          fontWeight: '500'
        }}>
          {notification.type === 'success' ? '✅' : '❌'} {notification.message}
        </div>
      )}

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              🏷️ Products
            </h1>
            <p style={{ margin: '8px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
              Product catalog and management
            </p>
          </div>
          <button
            onClick={() => {
              loadedOnce.current = false;
              loadAllData();
            }}
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: loading ? '#9ca3af' : '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '30px', borderBottom: '2px solid #e5e7eb' }}>
          {[
            { id: 'dashboard', label: '📊 Dashboard' },
            { id: 'browser', label: '🔍 Browse' },
            { id: 'add', label: '➕ Add Product' },
            { id: 'import', label: '📤 Import Products' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setView(tab.id);
                if (tab.id === 'add') {
                  setFormData({});
                }
              }}
              style={{
                padding: '12px 24px',
                background: view === tab.id ? '#667eea' : 'transparent',
                color: view === tab.id ? 'white' : '#6b7280',
                border: 'none',
                borderBottom: view === tab.id ? '3px solid #667eea' : '3px solid transparent',
                borderRadius: '8px 8px 0 0',
                cursor: 'pointer',
                fontWeight: view === tab.id ? '600' : 'normal',
                fontSize: '15px'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {view === 'dashboard' && renderDashboard()}
        {view === 'browser' && renderBrowser()}
        {view === 'add' && renderAdd()}
        {view === 'import' && renderImport()}
        {view === 'details' && renderDetails()}
        {view === 'edit' && renderEdit()}
      </div>
    </div>
  );
};

export default ProductManagement;
