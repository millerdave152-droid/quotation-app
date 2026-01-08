import React, { useState, useEffect, useCallback } from 'react';
import ImageViewer from './ImageViewer';

/**
 * ImageGallery - Multi-image gallery with thumbnails, zoom, and lightbox
 * Supports multiple image types and keyboard navigation
 */
function ImageGallery({ images = [], productName = '' }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);
  const [activeType, setActiveType] = useState('all');
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });

  // Group images by type
  const imageTypes = ['all', ...new Set(images.map(img => img.image_type))];

  // Filter images by type
  const filteredImages = activeType === 'all'
    ? images
    : images.filter(img => img.image_type === activeType);

  // Current image
  const currentImage = filteredImages[selectedIndex] || null;

  // Get image URL (prefer web size, fallback to local_path or original_url)
  const getImageUrl = (image, size = 'web') => {
    if (!image) return null;
    switch (size) {
      case 'thumbnail':
        return image.thumbnail_path || image.web_path || image.local_path || image.original_url;
      case 'web':
        return image.web_path || image.local_path || image.original_url;
      case 'print':
        return image.print_path || image.local_path || image.original_url;
      default:
        return image.web_path || image.local_path || image.original_url;
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setSelectedIndex(prev => Math.min(filteredImages.length - 1, prev + 1));
      } else if (e.key === 'Escape') {
        setShowLightbox(false);
        setIsZoomed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredImages.length]);

  // Reset selected index when type changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [activeType]);

  const handleMouseMove = useCallback((e) => {
    if (!isZoomed) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPosition({ x, y });
  }, [isZoomed]);

  if (images.length === 0) {
    return (
      <div className="image-gallery empty">
        <div className="ig-placeholder">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <p>No images available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="image-gallery">
      {/* Image Type Tabs */}
      {imageTypes.length > 2 && (
        <div className="ig-type-tabs">
          {imageTypes.map(type => (
            <button
              key={type}
              className={activeType === type ? 'active' : ''}
              onClick={() => setActiveType(type)}
            >
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
              <span className="ig-type-count">
                {type === 'all' ? images.length : images.filter(i => i.image_type === type).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Main Image */}
      <div
        className={`ig-main ${isZoomed ? 'zoomed' : ''}`}
        onMouseEnter={() => setIsZoomed(true)}
        onMouseLeave={() => setIsZoomed(false)}
        onMouseMove={handleMouseMove}
        onClick={() => setShowLightbox(true)}
      >
        {currentImage && (
          <>
            <img
              src={getImageUrl(currentImage, 'web')}
              alt={currentImage.alt_text || `${productName} - Image ${selectedIndex + 1}`}
              style={isZoomed ? {
                transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
                transform: 'scale(2)'
              } : {}}
            />

            {/* Navigation Arrows */}
            {filteredImages.length > 1 && (
              <>
                <button
                  className="ig-nav ig-prev"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIndex(prev => prev > 0 ? prev - 1 : filteredImages.length - 1);
                  }}
                  disabled={selectedIndex === 0}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                  </svg>
                </button>
                <button
                  className="ig-nav ig-next"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIndex(prev => prev < filteredImages.length - 1 ? prev + 1 : 0);
                  }}
                  disabled={selectedIndex === filteredImages.length - 1}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                  </svg>
                </button>
              </>
            )}

            {/* Expand Button */}
            <button className="ig-expand" onClick={() => setShowLightbox(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
              </svg>
            </button>

            {/* Image Counter */}
            <div className="ig-counter">
              {selectedIndex + 1} / {filteredImages.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {filteredImages.length > 1 && (
        <div className="ig-thumbnails">
          {filteredImages.map((image, idx) => (
            <button
              key={image.id || idx}
              className={`ig-thumb ${idx === selectedIndex ? 'active' : ''}`}
              onClick={() => setSelectedIndex(idx)}
            >
              <img
                src={getImageUrl(image, 'thumbnail')}
                alt={image.alt_text || `Thumbnail ${idx + 1}`}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {showLightbox && (
        <ImageViewer
          images={filteredImages}
          initialIndex={selectedIndex}
          productName={productName}
          onClose={() => setShowLightbox(false)}
        />
      )}

      <style jsx>{`
        .image-gallery {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .image-gallery.empty {
          min-height: 400px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ig-placeholder {
          text-align: center;
          color: #999;
        }

        .ig-placeholder p {
          margin-top: 16px;
        }

        .ig-type-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .ig-type-tabs button {
          padding: 6px 12px;
          border: 1px solid #ddd;
          background: white;
          border-radius: 16px;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .ig-type-tabs button:hover {
          border-color: #2196F3;
        }

        .ig-type-tabs button.active {
          background: #2196F3;
          border-color: #2196F3;
          color: white;
        }

        .ig-type-count {
          font-size: 11px;
          background: rgba(0, 0, 0, 0.1);
          padding: 2px 6px;
          border-radius: 10px;
        }

        .ig-type-tabs button.active .ig-type-count {
          background: rgba(255, 255, 255, 0.3);
        }

        .ig-main {
          position: relative;
          aspect-ratio: 1;
          background: #f8f8f8;
          border-radius: 12px;
          overflow: hidden;
          cursor: zoom-in;
        }

        .ig-main.zoomed {
          cursor: move;
        }

        .ig-main img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          transition: transform 0.1s ease-out;
        }

        .ig-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 40px;
          height: 40px;
          border: none;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          transition: all 0.2s;
          z-index: 10;
        }

        .ig-nav:hover {
          background: white;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .ig-nav:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .ig-prev {
          left: 12px;
        }

        .ig-next {
          right: 12px;
        }

        .ig-expand {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 36px;
          height: 36px;
          border: none;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          z-index: 10;
        }

        .ig-expand:hover {
          background: white;
        }

        .ig-counter {
          position: absolute;
          bottom: 12px;
          right: 12px;
          background: rgba(0, 0, 0, 0.6);
          color: white;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          z-index: 10;
        }

        .ig-thumbnails {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .ig-thumb {
          flex-shrink: 0;
          width: 64px;
          height: 64px;
          padding: 2px;
          border: 2px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          background: #f8f8f8;
          overflow: hidden;
        }

        .ig-thumb:hover {
          border-color: #ccc;
        }

        .ig-thumb.active {
          border-color: #2196F3;
        }

        .ig-thumb img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      `}</style>
    </div>
  );
}

export default ImageGallery;
