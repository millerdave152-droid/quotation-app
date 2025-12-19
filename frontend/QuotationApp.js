import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Package, Download, Mail, Search, X, Award } from 'lucide-react';
import { handleApiError } from './src/utils/errorHandler';

const API_URL = 'http://localhost:3001/api';

const QuotationAppMain = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const HST_RATE = 0.13;

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [customersRes, productsRes, quotationsRes] = await Promise.all([
        fetch(`${API_URL}/customers`),
        fetch(`${API_URL}/products`),
        fetch(`${API_URL}/quotations`)
      ]);
      setCustomers(await customersRes.json());
      setProducts(await productsRes.json());
      setQuotations(await quotationsRes.json());
    } catch (error) {
      handleApiError(error, { context: 'Loading data' });
    } finally {
      setLoading(false);
    }
  };

  const addCustomer = async (data) => {
    try {
      const res = await fetch(`${API_URL}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      setCustomers([...customers, await res.json()]);
    } catch (error) {
      handleApiError(error, { context: 'Adding customer' });
    }
  };

  const updateCustomer = async (id, data) => {
    try {
      const res = await fetch(`${API_URL}/customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const updated = await res.json();
      setCustomers(customers.map(c => c.id === id ? updated : c));
    } catch (error) {
      handleApiError(error, { context: 'Updating customer' });
    }
  };

  const deleteCustomer = async (id) => {
    if (!window.confirm('Delete?')) return;
    try {
      await fetch(`${API_URL}/customers/${id}`, { method: 'DELETE' });
      setCustomers(customers.filter(c => c.id !== id));
    } catch (error) {
      handleApiError(error, { context: 'Deleting customer' });
    }
  };

  const addProduct = async (data) => {
    try {
      const res = await fetch(`${API_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      setProducts([...products, await res.json()]);
    } catch (error) {
      handleApiError(error, { context: 'Adding product' });
    }
  };

  const updateProduct = async (id, data) => {
    try {
      const res = await fetch(`${API_URL}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const updated = await res.json();
      setProducts(products.map(p => p.id === id ? updated : p));
    } catch (error) {
      handleApiError(error, { context: 'Updating product' });
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Delete?')) return;
    try {
      await fetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
      setProducts(products.filter(p => p.id !== id));
    } catch (error) {
      handleApiError(error, { context: 'Deleting product' });
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_URL}/products/import`, {
        method: 'POST',
        body: formData
      });
      const result = await res.json();
      if (res.ok) {
        alert(`✅ Imported: ${result.imported || result.totalImported} products`);
        fetchAllData();
      }
    } catch (error) {
      handleApiError(error, { context: 'Importing products' });
    }
    e.target.value = '';
  };

  const createQuotation = async (data) => {
    try {
      await fetch(`${API_URL}/quotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      fetchAllData();
    } catch (error) {
      handleApiError(error, { context: 'Creating quotation' });
    }
  };

  const exportToPDF = (quote) => {
    const html = `<html><body><h1>Quote #${quote.id}</h1><p>Customer: ${quote.customer_name}</p><p>Total: $${parseFloat(quote.total).toFixed(2)}</p></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quote-${quote.id}.html`;
    a.click();
  };

  const sendEmail = async (quote) => {
    if (!window.confirm(`Send to ${quote.customer_email}?`)) return;
    try {
      await fetch(`${API_URL}/quotations/${quote.id}/email`, { method: 'POST' });
      alert('Sent!');
    } catch (error) {
      handleApiError(error, { context: 'Sending email' });
    }
  };

  // Get unique brands and categories
  const brands = [...new Set(products.map(p => p.manufacturer).filter(Boolean))].sort();
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesBrand = !filterBrand || p.manufacturer === filterBrand;
    const matchesCategory = !filterCategory || p.category === filterCategory;
    return matchesSearch && matchesBrand && matchesCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-blue-600 text-white p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold">Quotation System</h1>
        </div>
      </div>

      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto">
          <nav className="flex gap-1">
            {['dashboard', 'customers', 'products', 'quotations'].map(view => (
              <button
                key={view}
                onClick={() => { setCurrentView(view); setSearchTerm(''); setFilterBrand(''); setFilterCategory(''); }}
                className={`px-6 py-3 font-medium capitalize ${currentView === view ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-600'}`}
              >
                {view}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8">
        {currentView === 'dashboard' && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 border rounded-lg p-6">
                <p className="text-sm text-blue-600">Customers</p>
                <p className="text-3xl font-bold">{customers.length}</p>
              </div>
              <div className="bg-green-50 border rounded-lg p-6">
                <p className="text-sm text-green-600">Products</p>
                <p className="text-3xl font-bold">{products.length}</p>
              </div>
              <div className="bg-purple-50 border rounded-lg p-6">
                <p className="text-sm text-purple-600">Quotations</p>
                <p className="text-3xl font-bold">{quotations.length}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => setShowQuoteForm(true)} className="bg-blue-600 text-white px-4 py-3 rounded flex items-center justify-center gap-2">
                <Plus size={20} />Create Quote
              </button>
              <button onClick={() => setShowCustomerForm(true)} className="border-2 border-blue-600 text-blue-600 px-4 py-3 rounded flex items-center justify-center gap-2">
                <Plus size={20} />Add Customer
              </button>
              <button onClick={() => setShowProductForm(true)} className="border-2 border-blue-600 text-blue-600 px-4 py-3 rounded flex items-center justify-center gap-2">
                <Plus size={20} />Add Product
              </button>
            </div>
          </div>
        )}

        {currentView === 'customers' && (
          <div className="space-y-4">
            <div className="flex justify-between">
              <h1 className="text-3xl font-bold">Customers</h1>
              <button onClick={() => setShowCustomerForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2">
                <Plus size={20} />Add
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded" />
            </div>
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3">Phone</th>
                    <th className="text-center p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(c => (
                    <tr key={c.id} className="border-t">
                      <td className="p-3">{c.name}</td>
                      <td className="p-3">{c.email}</td>
                      <td className="p-3">{c.phone}</td>
                      <td className="p-3">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => { setEditingCustomer(c); setShowCustomerForm(true); }} className="text-blue-600">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => deleteCustomer(c.id)} className="text-red-600">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {currentView === 'products' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h1 className="text-3xl font-bold">Products</h1>
              <div className="flex gap-2">
                <button onClick={() => setShowProductForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2">
                  <Plus size={20} />Add
                </button>
                <button onClick={() => document.getElementById('excel-upload').click()} className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2">
                  <Package size={20} />Import
                </button>
                <input id="excel-upload" type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileUpload} />
              </div>
            </div>

            {/* Search and Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                <input 
                  type="text" 
                  placeholder="Search by model or description..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  className="w-full pl-10 pr-4 py-2 border rounded" 
                />
              </div>
              <select 
                value={filterBrand} 
                onChange={(e) => setFilterBrand(e.target.value)}
                className="border rounded px-3 py-2"
              >
                <option value="">All Brands</option>
                {brands.map(brand => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
              <select 
                value={filterCategory} 
                onChange={(e) => setFilterCategory(e.target.value)}
                className="border rounded px-3 py-2"
              >
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Results count */}
            <div className="text-sm text-gray-600">
              Showing {filteredProducts.length} of {products.length} products
            </div>

            {/* Products Table with NEW COLUMNS */}
            <div className="bg-white border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-semibold">Model</th>
                    <th className="text-left p-3 font-semibold">Brand</th>
                    <th className="text-left p-3 font-semibold">Description</th>
                    <th className="text-left p-3 font-semibold">Category</th>
                    <th className="text-right p-3 font-semibold">MSRP</th>
                    <th className="text-right p-3 font-semibold">Your Cost</th>
                    <th className="text-right p-3 font-semibold">Margin</th>
                    <th className="text-center p-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(p => {
                    const price = parseFloat(p.price) || 0;
                    const cost = parseFloat(p.cost) || 0;
                    const margin = price > 0 ? (((price - cost) / price) * 100) : 0;
                    const hasRebate = parseFloat(p.sell_through_rebate || 0) > 0;
                    
                    // Margin color coding
                    let marginColor = 'text-red-600';
                    let marginBg = 'bg-red-50';
                    if (margin >= 40) {
                      marginColor = 'text-green-600';
                      marginBg = 'bg-green-50';
                    } else if (margin >= 30) {
                      marginColor = 'text-yellow-600';
                      marginBg = 'bg-yellow-50';
                    }

                    // Truncate description
                    const shortDesc = p.description 
                      ? (p.description.length > 50 ? p.description.substring(0, 50) + '...' : p.description)
                      : '-';

                    return (
                      <tr key={p.id} className="border-t hover:bg-gray-50">
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {p.manufacturer || 'Unknown'}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600" title={p.description}>{shortDesc}</td>
                        <td className="p-3 text-gray-600">{p.category}</td>
                        <td className="p-3 text-right font-medium">${price.toFixed(2)}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            ${cost.toFixed(2)}
                            {hasRebate && (
                              <span 
                                className="inline-flex items-center text-blue-600" 
                                title={`Rebate: $${parseFloat(p.sell_through_rebate).toFixed(2)}`}
                              >
                                <Award size={14} />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <span className={`inline-flex items-center px-2 py-1 rounded font-bold ${marginBg} ${marginColor}`}>
                            {margin.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex justify-center gap-2">
                            <button 
                              onClick={() => { setEditingProduct(p); setShowProductForm(true); }} 
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button 
                              onClick={() => deleteProduct(p.id)} 
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {currentView === 'quotations' && (
          <div className="space-y-4">
            <div className="flex justify-between">
              <h1 className="text-3xl font-bold">Quotations</h1>
              <button onClick={() => setShowQuoteForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2">
                <Plus size={20} />Create
              </button>
            </div>
            <div className="space-y-3">
              {quotations.length === 0 ? (
                <div className="bg-white border rounded-lg p-8 text-center text-gray-500">
                  No quotations yet
                </div>
              ) : (
                quotations.map(q => (
                  <div key={q.id} className="bg-white border rounded-lg p-4">
                    <div className="flex justify-between mb-3">
                      <div>
                        <h3 className="font-bold">Quote #{q.id}</h3>
                        <p className="text-sm text-gray-600">{new Date(q.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => exportToPDF(q)} className="bg-green-600 text-white px-3 py-1 rounded text-sm flex items-center gap-1">
                          <Download size={16} />Export
                        </button>
                        <button onClick={() => sendEmail(q)} className="bg-blue-600 text-white px-3 py-1 rounded text-sm flex items-center gap-1">
                          <Mail size={16} />Email
                        </button>
                      </div>
                    </div>
                    <p className="text-sm"><strong>Customer:</strong> {q.customer_name}</p>
                    <p className="text-sm"><strong>Total:</strong> ${parseFloat(q.total).toFixed(2)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {showCustomerForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-bold">{editingCustomer ? 'Edit' : 'Add'} Customer</h2>
              <button onClick={() => { setShowCustomerForm(false); setEditingCustomer(null); }}>
                <X size={20} />
              </button>
            </div>
            <CustomerForm 
              editingCustomer={editingCustomer}
              addCustomer={addCustomer}
              updateCustomer={updateCustomer}
              setShowCustomerForm={setShowCustomerForm}
              setEditingCustomer={setEditingCustomer}
            />
          </div>
        </div>
      )}

      {showProductForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between mb-4">
              <h2 className="text-xl font-bold">{editingProduct ? 'Edit' : 'Add'} Product</h2>
              <button onClick={() => { setShowProductForm(false); setEditingProduct(null); }}>
                <X size={20} />
              </button>
            </div>
            <ProductForm 
              editingProduct={editingProduct}
              addProduct={addProduct}
              updateProduct={updateProduct}
              setShowProductForm={setShowProductForm}
              setEditingProduct={setEditingProduct}
            />
          </div>
        </div>
      )}

      {showQuoteForm && (
        <QuoteFormModal 
          customers={customers}
          products={products}
          HST_RATE={HST_RATE}
          createQuotation={createQuotation}
          setShowQuoteForm={setShowQuoteForm}
          setCurrentView={setCurrentView}
        />
      )}
    </div>
  );
};

const CustomerForm = ({ editingCustomer, addCustomer, updateCustomer, setShowCustomerForm, setEditingCustomer }) => {
  const [formData, setFormData] = useState(editingCustomer || { name: '', email: '', phone: '', address: '' });
  
  const handleSubmit = async () => {
    if (!formData.name || !formData.email || !formData.phone) {
      alert('Fill required fields');
      return;
    }
    if (editingCustomer) {
      await updateCustomer(editingCustomer.id, formData);
    } else {
      await addCustomer(formData);
    }
    setShowCustomerForm(false);
    setEditingCustomer(null);
  };

  return (
    <div className="space-y-4">
      <input type="text" placeholder="Name *" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full border rounded px-3 py-2" />
      <input type="email" placeholder="Email *" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full border rounded px-3 py-2" />
      <input type="tel" placeholder="Phone *" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full border rounded px-3 py-2" />
      <textarea placeholder="Address" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="w-full border rounded px-3 py-2" rows="2" />
      <div className="flex gap-2">
        <button onClick={handleSubmit} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded">{editingCustomer ? 'Update' : 'Add'}</button>
        <button onClick={() => { setShowCustomerForm(false); setEditingCustomer(null); }} className="flex-1 border px-4 py-2 rounded">Cancel</button>
      </div>
    </div>
  );
};

const ProductForm = ({ editingProduct, addProduct, updateProduct, setShowProductForm, setEditingProduct }) => {
  const [formData, setFormData] = useState(editingProduct || { name: '', category: 'General', price: '', cost: '', description: '' });
  
  const handleSubmit = async () => {
    if (!formData.name || !formData.price) {
      alert('Fill required fields');
      return;
    }
    const data = { ...formData, price: parseFloat(formData.price), cost: parseFloat(formData.cost) || 0 };
    if (editingProduct) {
      await updateProduct(editingProduct.id, data);
    } else {
      await addProduct(data);
    }
    setShowProductForm(false);
    setEditingProduct(null);
  };

  return (
    <div className="space-y-4">
      <input type="text" placeholder="Name *" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full border rounded px-3 py-2" />
      <input type="text" placeholder="Category" value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full border rounded px-3 py-2" />
      <input type="number" step="0.01" placeholder="Cost" value={formData.cost} onChange={(e) => setFormData({...formData, cost: e.target.value})} className="w-full border rounded px-3 py-2" />
      <input type="number" step="0.01" placeholder="Price *" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} className="w-full border rounded px-3 py-2" />
      <textarea placeholder="Description" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="w-full border rounded px-3 py-2" rows="2" />
      <div className="flex gap-2">
        <button onClick={handleSubmit} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded">{editingProduct ? 'Update' : 'Add'}</button>
        <button onClick={() => { setShowProductForm(false); setEditingProduct(null); }} className="flex-1 border px-4 py-2 rounded">Cancel</button>
      </div>
    </div>
  );
};

const QuoteFormModal = ({ customers, products, HST_RATE, createQuotation, setShowQuoteForm, setCurrentView }) => {
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [quoteItems, setQuoteItems] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);

  const addItem = () => {
    if (!selectedProduct) return;
    const product = products.find(p => p.id === parseInt(selectedProduct));
    const price = parseFloat(product.price);
    setQuoteItems([...quoteItems, {
      ...product,
      quantity,
      discount,
      lineTotal: (price * quantity) * (1 - discount / 100)
    }]);
    setSelectedProduct('');
    setQuantity(1);
    setDiscount(0);
  };

  const subtotal = quoteItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const tax = subtotal * HST_RATE;
  const total = subtotal + tax;

  const generateQuote = async () => {
    if (!selectedCustomer || quoteItems.length === 0) {
      alert('Select customer and add items');
      return;
    }
    await createQuotation({
      customer_id: parseInt(selectedCustomer),
      items: quoteItems,
      subtotal,
      tax,
      total
    });
    setShowQuoteForm(false);
    setCurrentView('quotations');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-screen overflow-y-auto">
        <div className="flex justify-between mb-4">
          <h2 className="text-xl font-bold">Create Quotation</h2>
          <button onClick={() => setShowQuoteForm(false)}><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} className="w-full border rounded px-3 py-2">
            <option value="">Select customer...</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="grid grid-cols-4 gap-2">
            <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} className="col-span-2 border rounded px-3 py-2">
              <option value="">Select product...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} - ${parseFloat(p.price).toFixed(2)}</option>
              ))}
            </select>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)} placeholder="Qty" className="border rounded px-3 py-2" />
            <input type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} placeholder="Disc%" className="border rounded px-3 py-2" />
          </div>
          <button onClick={addItem} className="bg-green-600 text-white px-4 py-2 rounded w-full">Add Item</button>
          {quoteItems.length > 0 && (
            <div className="border rounded">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2">Product</th>
                    <th className="text-center p-2">Qty</th>
                    <th className="text-right p-2">Price</th>
                    <th className="text-right p-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteItems.map((item, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{item.name}</td>
                      <td className="p-2 text-center">{item.quantity}</td>
                      <td className="p-2 text-right">${parseFloat(item.price).toFixed(2)}</td>
                      <td className="p-2 text-right">${item.lineTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-gray-50 p-4 border-t">
                <div className="space-y-1 text-right">
                  <div className="flex justify-between"><span>Subtotal:</span><span>${subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>HST:</span><span>${tax.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-lg border-t pt-1"><span>Total:</span><span>${total.toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={generateQuote} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded">Generate</button>
            <button onClick={() => setShowQuoteForm(false)} className="flex-1 border px-4 py-2 rounded">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationAppMain;