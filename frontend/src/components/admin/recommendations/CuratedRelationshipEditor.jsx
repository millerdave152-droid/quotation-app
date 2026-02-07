import { authFetch } from '../../../services/authFetch';
/**
 * CuratedRelationshipEditor - Create and manage manually linked product relationships
 * Allows admins to curate "When customer buys X, suggest Y" relationships
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  MagnifyingGlassIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  XMarkIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Product search/select component
 */
function ProductSearch({ value, onChange, placeholder, exclude = [] }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search products
  useEffect(() => {
    if (!search || search.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('auth_token');
        const response = await authFetch(
          `${API_BASE}/api/products?search=${encodeURIComponent(search)}&limit=10`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const products = data.data || data.products || [];
          // Filter out excluded products
          const filtered = products.filter(
            (p) => !exclude.includes(p.product_id || p.id)
          );
          setResults(filtered);
        }
      } catch (err) {
        console.error('Product search failed:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, exclude]);

  const handleSelect = (product) => {
    onChange({
      id: product.product_id || product.id,
      name: product.name,
      sku: product.sku,
      price: product.price,
    });
    setSearch('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setSearch('');
  };

  return (
    <div ref={wrapperRef} className="relative">
      {value ? (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">{value.name}</p>
            <p className="text-xs text-blue-600">
              {value.sku} - ${value.price?.toFixed(2)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="p-1 text-blue-400 hover:text-blue-600"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder={placeholder}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              </div>
            )}
          </div>

          {isOpen && results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {results.map((product) => (
                <button
                  key={product.product_id || product.id}
                  type="button"
                  onClick={() => handleSelect(product)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <p className="text-sm font-medium text-gray-900">
                    {product.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {product.sku} - ${product.price?.toFixed(2)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Relationship form modal
 */
function RelationshipModal({ isOpen, onClose, onSave, editData }) {
  const [formData, setFormData] = useState({
    sourceProduct: null,
    relatedProduct: null,
    relationshipType: 'accessory',
    strength: 0.8,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      if (editData) {
        setFormData({
          sourceProduct: {
            id: editData.productId,
            name: editData.productName,
            sku: editData.productSku,
          },
          relatedProduct: {
            id: editData.relatedProductId,
            name: editData.relatedProductName,
            sku: editData.relatedProductSku,
            price: editData.relatedProductPrice,
          },
          relationshipType: editData.relationshipType,
          strength: editData.strength,
          notes: editData.notes || '',
        });
      } else {
        setFormData({
          sourceProduct: null,
          relatedProduct: null,
          relationshipType: 'accessory',
          strength: 0.8,
          notes: '',
        });
      }
      setError(null);
    }
  }, [isOpen, editData]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.sourceProduct || !formData.relatedProduct) {
      setError('Please select both source and related products');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const url = editData
        ? `${API_BASE}/api/recommendations/relationships/${editData.id}`
        : `${API_BASE}/api/recommendations/relationships`;

      const body = editData
        ? {
            strength: formData.strength,
            notes: formData.notes,
          }
        : {
            productId: formData.sourceProduct.id,
            relatedProductId: formData.relatedProduct.id,
            relationshipType: formData.relationshipType,
            strength: formData.strength,
            notes: formData.notes,
          };

      const response = await authFetch(url, {
        method: editData ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        onSave();
        onClose();
      } else {
        setError(data.error || 'Failed to save relationship');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div
          className="fixed inset-0 bg-black/50"
          onClick={onClose}
        />

        <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editData ? 'Edit Relationship' : 'Create Curated Relationship'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Source Product */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                When customer buys...
              </label>
              <ProductSearch
                value={formData.sourceProduct}
                onChange={(p) =>
                  setFormData((prev) => ({ ...prev, sourceProduct: p }))
                }
                placeholder="Search for source product..."
                exclude={
                  formData.relatedProduct ? [formData.relatedProduct.id] : []
                }
              />
            </div>

            {/* Arrow indicator */}
            <div className="flex justify-center">
              <ArrowRightIcon className="w-6 h-6 text-gray-400 rotate-90" />
            </div>

            {/* Related Product */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Suggest this product...
              </label>
              <ProductSearch
                value={formData.relatedProduct}
                onChange={(p) =>
                  setFormData((prev) => ({ ...prev, relatedProduct: p }))
                }
                placeholder="Search for product to suggest..."
                exclude={
                  formData.sourceProduct ? [formData.sourceProduct.id] : []
                }
              />
            </div>

            {/* Relationship Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Relationship Type
              </label>
              <select
                value={formData.relationshipType}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    relationshipType: e.target.value,
                  }))
                }
                disabled={!!editData}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="accessory">Accessory</option>
                <option value="bought_together">Frequently Bought Together</option>
                <option value="upgrade">Upgrade Option</option>
                <option value="alternative">Alternative</option>
              </select>
            </div>

            {/* Strength */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Relevance Strength: {Math.round(formData.strength * 100)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={formData.strength}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    strength: parseFloat(e.target.value),
                  }))
                }
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Higher strength = shows more prominently in recommendations
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                rows={2}
                placeholder="Why this recommendation makes sense..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckIcon className="w-4 h-4" />
                    {editData ? 'Update' : 'Create'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * CSV Upload Modal
 */
function CSVUploadModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setResults(null);

    // Parse CSV for preview
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== 'string') return;

      const lines = text.split('\n').filter((line) => line.trim());
      const rows = lines.slice(0, 6).map((line) => {
        const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
        return values;
      });
      setPreview(rows);
    };
    reader.readAsText(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter((line) => line.trim());

      // Skip header row
      const dataRows = lines.slice(1);

      let created = 0;
      let failed = 0;
      const errors = [];

      const token = localStorage.getItem('auth_token');

      for (const line of dataRows) {
        const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
        const [sourceId, relatedId, type, strength] = values;

        if (!sourceId || !relatedId) continue;

        try {
          const response = await authFetch(
            `${API_BASE}/api/recommendations/relationships`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                productId: parseInt(sourceId),
                relatedProductId: parseInt(relatedId),
                relationshipType: type || 'accessory',
                strength: parseFloat(strength) || 0.8,
              }),
            }
          );

          if (response.ok) {
            created++;
          } else {
            failed++;
            const data = await response.json();
            errors.push(`Row ${created + failed}: ${data.error}`);
          }
        } catch (err) {
          failed++;
          errors.push(`Row ${created + failed}: ${err.message}`);
        }
      }

      setResults({ created, failed, errors: errors.slice(0, 5) });

      if (created > 0) {
        onSuccess();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Bulk Upload Relationships
          </h3>

          <div className="space-y-4">
            {/* Instructions */}
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800 font-medium">CSV Format:</p>
              <code className="text-xs text-blue-700 block mt-1">
                source_product_id, related_product_id, type, strength
              </code>
              <p className="text-xs text-blue-600 mt-2">
                Types: accessory, bought_together, upgrade, alternative
              </p>
            </div>

            {/* File Input */}
            <div>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {/* Preview */}
            {preview.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Preview (first 5 rows):
                </p>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full text-xs">
                    <tbody>
                      {preview.map((row, i) => (
                        <tr
                          key={i}
                          className={i === 0 ? 'bg-gray-50 font-medium' : ''}
                        >
                          {row.map((cell, j) => (
                            <td key={j} className="px-3 py-2 border-b">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Results */}
            {results && (
              <div
                className={`p-4 rounded-lg ${
                  results.failed > 0
                    ? 'bg-yellow-50 border border-yellow-200'
                    : 'bg-green-50 border border-green-200'
                }`}
              >
                <p className="font-medium">
                  Created: {results.created} | Failed: {results.failed}
                </p>
                {results.errors.length > 0 && (
                  <ul className="mt-2 text-xs text-red-600 space-y-1">
                    {results.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Close
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <ArrowUpTrayIcon className="w-4 h-4" />
                    Upload
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Main curated relationship editor
 */
export default function CuratedRelationshipEditor({ onStatsUpdate }) {
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editData, setEditData] = useState(null);

  // Load curated relationships
  const loadRelationships = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(
        `${API_BASE}/api/recommendations/relationships?curated=true&limit=100`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setRelationships(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load relationships:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRelationships();
  }, [loadRelationships]);

  // Delete relationship
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this relationship?')) return;

    try {
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(
        `${API_BASE}/api/recommendations/relationships/${id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        setRelationships((prev) => prev.filter((r) => r.id !== id));
        onStatsUpdate?.();
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  // Edit relationship
  const handleEdit = (rel) => {
    setEditData(rel);
    setShowModal(true);
  };

  // Handle save
  const handleSave = () => {
    loadRelationships();
    onStatsUpdate?.();
  };

  const typeLabels = {
    bought_together: 'Bought Together',
    accessory: 'Accessory',
    upgrade: 'Upgrade',
    alternative: 'Alternative',
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Curated Relationships
            </h2>
            <p className="text-sm text-gray-500">
              Manually link products for targeted recommendations
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <ArrowUpTrayIcon className="w-4 h-4" />
              Bulk Upload
            </button>
            <button
              onClick={() => {
                setEditData(null);
                setShowModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <PlusIcon className="w-4 h-4" />
              Add Relationship
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : relationships.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-gray-500 mb-4">No curated relationships yet.</p>
          <button
            onClick={() => setShowModal(true)}
            className="text-blue-600 hover:underline"
          >
            Create your first one
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {relationships.map((rel) => (
            <div
              key={rel.id}
              className="px-6 py-4 flex items-center justify-between hover:bg-gray-50"
            >
              <div className="flex items-center gap-4 flex-1">
                {/* Source Product */}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {rel.productName}
                  </p>
                  <p className="text-xs text-gray-500">{rel.productSku}</p>
                </div>

                {/* Arrow and Type */}
                <div className="flex items-center gap-2 px-4">
                  <ArrowRightIcon className="w-5 h-5 text-gray-400" />
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                    {typeLabels[rel.relationshipType]}
                  </span>
                </div>

                {/* Related Product */}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {rel.relatedProductName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {rel.relatedProductSku} - $
                    {rel.relatedProductPrice?.toFixed(2)}
                  </p>
                </div>

                {/* Strength */}
                <div className="w-24">
                  <div className="text-xs text-gray-500 mb-1">
                    Strength: {Math.round(rel.strength * 100)}%
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${rel.strength * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => handleEdit(rel)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(rel.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <RelationshipModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditData(null);
        }}
        onSave={handleSave}
        editData={editData}
      />

      <CSVUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={handleSave}
      />
    </div>
  );
}
