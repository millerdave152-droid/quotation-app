import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

const ProductsView = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedManufacturer, setSelectedManufacturer] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Modal
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showModal, setShowModal] = useState(false);
  
  // Statistics
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalManufacturers: 0,
    totalCategories: 0
  });

  // Fetch products from API
  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/products`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch products');
      }
      
      const data = await response.json();
      setProducts(data);
      setFilteredProducts(data);
      calculateStats(data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      console.error('Error fetching products:', err);
    }
  };

  // Calculate statistics
  const calculateStats = (data) => {
    const manufacturers = new Set(data.map(p => p.manufacturer).filter(Boolean));
    const categories = new Set(data.map(p => p.category).filter(Boolean));
    
    setStats({
      totalProducts: data.length,
      totalManufacturers: manufacturers.size,
      totalCategories: categories.size
    });
  };

  // Get unique manufacturers
  const getManufacturers = () => {
    return [...new Set(products.map(p => p.manufacturer).filter(Boolean))].sort();
  };

  // Get unique categories
  const getCategories = () => {
    return [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  };

  // Filter products
  useEffect(() => {
    let filtered = products;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Manufacturer filter
    if (selectedManufacturer) {
      filtered = filtered.filter(p => p.manufacturer === selectedManufacturer);
    }

    // Category filter
    if (selectedCategory) {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }

    setFilteredProducts(filtered);
  }, [searchTerm, selectedManufacturer, selectedCategory, products]);

  // Reset filters
  const resetFilters = () => {
    setSearchTerm('');
    setSelectedManufacturer('');
    setSelectedCategory('');
  };

  // Calculate discount
  const calculateDiscount = (price, msrp) => {
    if (!msrp || !price || msrp <= price) return 0;
    return Math.round(((msrp - price) / msrp) * 100);
  };

  // Show product details
  const handleProductClick = (product) => {
    setSelectedProduct(product);
    setShowModal(true);
  };

  // Close modal
  const closeModal = () => {
    setShowModal(false);
    setSelectedProduct(null);
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Manufacturer', 'Model', 'Description', 'Category', 'Price', 'MSRP'];
    const csvContent = [
      headers.join(','),
      ...filteredProducts.map(p => [
        `"${p.manufacturer || ''}"`,
        `"${p.model || ''}"`,
        `"${(p.description || '').replace(/"/g, '""')}"`,
        `"${p.category || ''}"`,
        p.price || 0,
        p.msrp || 0
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading products...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Error Loading Products</h2>
        <p>{error}</p>
        <button onClick={fetchProducts} className="btn btn-primary">Retry</button>
      </div>
    );
  }

  return (
    <div className="products-view">
      {/* Header */}
      <div className="products-header">
        <h1>Product Catalog</h1>
        <p>Manage and browse all products</p>
      </div>

      {/* Statistics */}
      <div className="stats-container">
        <div className="stat-card">
          <div className="stat-value">{stats.totalProducts.toLocaleString()}</div>
          <div className="stat-label">Total Products</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalManufacturers}</div>
          <div className="stat-label">Manufacturers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalCategories}</div>
          <div className="stat-label">Categories</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{filteredProducts.length.toLocaleString()}</div>
          <div className="stat-label">Showing</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-container">
        <div className="filter-group">
          <label>Search</label>
          <input
            type="text"
            placeholder="Search by model or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>Manufacturer</label>
          <select
            value={selectedManufacturer}
            onChange={(e) => setSelectedManufacturer(e.target.value)}
            className="filter-select"
          >
            <option value="">All Manufacturers</option>
            {getManufacturers().map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="filter-select"
          >
            <option value="">All Categories</option>
            {getCategories().map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="filter-actions">
          <button onClick={resetFilters} className="btn btn-secondary">Reset Filters</button>
          <button onClick={exportToCSV} className="btn btn-primary">Export CSV</button>
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="no-results">
          <p>No products found matching your criteria.</p>
        </div>
      ) : (
        <div className="products-grid">
          {filteredProducts.map(product => {
            const discount = calculateDiscount(product.price, product.msrp);
            
            return (
              <div
                key={product.id}
                className="product-card"
                onClick={() => handleProductClick(product)}
              >
                <div className="product-manufacturer">{product.manufacturer || 'Unknown'}</div>
                <div className="product-model">{product.model}</div>
                {product.description && (
                  <div className="product-description">{product.description}</div>
                )}
                {product.category && (
                  <div className="product-category">{product.category}</div>
                )}
                <div className="product-pricing">
                  <div className="price-info">
                    <div className="price">${parseFloat(product.price || 0).toFixed(2)}</div>
                    {product.msrp && (
                      <div className="msrp">MSRP: ${parseFloat(product.msrp).toFixed(2)}</div>
                    )}
                  </div>
                  {discount > 0 && (
                    <div className="discount-badge">{discount}% OFF</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Product Detail Modal */}
      {showModal && selectedProduct && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedProduct.model}</h2>
              <span className="close" onClick={closeModal}>&times;</span>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span className="detail-label">Manufacturer:</span>
                <span className="detail-value">{selectedProduct.manufacturer || 'N/A'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Model:</span>
                <span className="detail-value">{selectedProduct.model}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Description:</span>
                <span className="detail-value">{selectedProduct.description || 'No description'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Category:</span>
                <span className="detail-value">{selectedProduct.category || 'Uncategorized'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Price (Cost):</span>
                <span className="detail-value price-highlight">
                  ${parseFloat(selectedProduct.price || 0).toFixed(2)}
                </span>
              </div>
              {selectedProduct.msrp && (
                <div className="detail-row">
                  <span className="detail-label">MSRP:</span>
                  <span className="detail-value">
                    ${parseFloat(selectedProduct.msrp).toFixed(2)}
                    {calculateDiscount(selectedProduct.price, selectedProduct.msrp) > 0 && (
                      <span className="discount-badge-small">
                        {calculateDiscount(selectedProduct.price, selectedProduct.msrp)}% savings
                      </span>
                    )}
                  </span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Product ID:</span>
                <span className="detail-value">#{selectedProduct.id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Last Updated:</span>
                <span className="detail-value">
                  {new Date(selectedProduct.last_updated).toLocaleDateString()}
                </span>
              </div>
              <div className="modal-actions">
                <button className="btn btn-primary">Add to Quote</button>
                <button className="btn btn-secondary" onClick={closeModal}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsView;