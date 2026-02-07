import React, { useState, useRef } from 'react';

import { authFetch } from '../../services/authFetch';
const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

/**
 * Model3DUploader - Component for uploading and managing 3D models for products
 */
const Model3DUploader = ({ productId, currentModel, onModelUpdated, compact = false }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);
  const posterInputRef = useRef(null);

  const handleFileSelect = async (e, type = 'model') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = type === 'model'
      ? ['.glb', '.gltf']
      : ['.jpg', '.jpeg', '.png', '.webp'];

    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!allowedTypes.includes(ext)) {
      setError(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`);
      return;
    }

    // Validate file size (100MB for models, 10MB for images)
    const maxSize = type === 'model' ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`File too large. Maximum: ${maxSize / (1024 * 1024)}MB`);
      return;
    }

    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append(type, file);

      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error('Upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));

        xhr.open('POST', `${API_URL}/product-3d/${productId}/upload`);
        xhr.send(formData);
      });

      // Fetch updated model data
      const response = await authFetch(`${API_URL}/product-3d/${productId}`);
      if (response.ok) {
        const data = await response.json();
        onModelUpdated?.(data);
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setError(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      setProgress(0);
      // Reset file inputs
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (posterInputRef.current) posterInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!currentModel) return;
    if (!window.confirm('Are you sure you want to delete this 3D model?')) return;

    try {
      const response = await authFetch(`${API_URL}/product-3d/${productId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete model');
      }

      onModelUpdated?.(null);
    } catch (err) {
      console.error('Error deleting model:', err);
      setError(err.message || 'Failed to delete model');
    }
  };

  const containerStyle = {
    padding: compact ? '12px' : '20px',
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
    border: '1px solid #e5e7eb'
  };

  const uploadAreaStyle = {
    padding: compact ? '20px' : '40px',
    border: '2px dashed #d1d5db',
    borderRadius: '8px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: '#fff'
  };

  const buttonStyle = {
    padding: '10px 20px',
    backgroundColor: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer'
  };

  if (compact) {
    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {currentModel ? (
            <>
              <span style={{ fontSize: '20px' }}>cube</span>
              <span style={{ flex: 1, fontSize: '14px', color: '#374151' }}>
                3D Model Active
              </span>
              <button
                onClick={handleDelete}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,.gltf"
                onChange={(e) => handleFileSelect(e, 'model')}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  ...buttonStyle,
                  opacity: uploading ? 0.7 : 1,
                  cursor: uploading ? 'not-allowed' : 'pointer'
                }}
              >
                {uploading ? `Uploading ${progress}%` : 'Upload 3D Model'}
              </button>
            </>
          )}
        </div>
        {error && (
          <div style={{ marginTop: '8px', color: '#dc2626', fontSize: '12px' }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#1a1a2e' }}>
        3D Model
      </h3>

      {currentModel ? (
        <div>
          <div style={{
            padding: '16px',
            backgroundColor: '#dcfce7',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '24px' }}>cube</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '600', color: '#166534' }}>3D Model Active</div>
              <div style={{ fontSize: '13px', color: '#166534' }}>
                {currentModel.file_size_bytes ? `${(currentModel.file_size_bytes / 1024 / 1024).toFixed(2)} MB` : 'Model uploaded'}
              </div>
            </div>
            <button
              onClick={handleDelete}
              style={{
                padding: '8px 16px',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Delete
            </button>
          </div>

          {/* Update poster image */}
          <div style={{ marginTop: '12px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '8px', display: 'block' }}>
              Update Poster Image (shown while loading)
            </label>
            <input
              ref={posterInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={(e) => handleFileSelect(e, 'poster')}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => posterInputRef.current?.click()}
              disabled={uploading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {uploading ? `Uploading ${progress}%` : 'Upload Poster'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            onChange={(e) => handleFileSelect(e, 'model')}
            style={{ display: 'none' }}
          />

          <div
            style={uploadAreaStyle}
            onClick={() => !uploading && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files?.[0];
              if (file) {
                fileInputRef.current.files = e.dataTransfer.files;
                handleFileSelect({ target: { files: e.dataTransfer.files } }, 'model');
              }
            }}
          >
            {uploading ? (
              <div>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>Uploading...</div>
                <div style={{
                  width: '200px',
                  height: '8px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '4px',
                  margin: '0 auto',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    backgroundColor: '#6366f1',
                    transition: 'width 0.3s'
                  }} />
                </div>
                <div style={{ marginTop: '8px', color: '#6b7280' }}>{progress}%</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '48px', marginBottom: '12px', color: '#9ca3af' }}>3D</div>
                <div style={{ fontSize: '16px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  Upload 3D Model
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                  Drag & drop or click to browse
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                  Supports GLB and GLTF formats (max 100MB)
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '12px',
          padding: '12px',
          backgroundColor: '#fee2e2',
          color: '#dc2626',
          borderRadius: '6px',
          fontSize: '13px'
        }}>
          {error}
        </div>
      )}

      <div style={{
        marginTop: '16px',
        padding: '12px',
        backgroundColor: '#dbeafe',
        borderRadius: '8px',
        fontSize: '13px',
        color: '#1d4ed8'
      }}>
        <strong>Tips:</strong>
        <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
          <li>Use GLB format for best compatibility</li>
          <li>Keep polygon count under 100k for smooth performance</li>
          <li>Include PBR textures for realistic rendering</li>
        </ul>
      </div>
    </div>
  );
};

export default Model3DUploader;
