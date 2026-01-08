import React, { useState, useEffect, useCallback } from 'react';

/**
 * ImageViewer - Fullscreen lightbox for viewing product images
 * Features: navigation, zoom, keyboard support, touch gestures
 */
function ImageViewer({ images = [], initialIndex = 0, productName = '', onClose }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });

  const currentImage = images[currentIndex];

  // Get image URL (prefer print size for lightbox)
  const getImageUrl = (image) => {
    if (!image) return null;
    return image.print_path || image.web_path || image.local_path || image.original_url;
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'ArrowLeft':
          goToPrev();
          break;
        case 'ArrowRight':
          goToNext();
          break;
        case 'Escape':
          onClose();
          break;
        case ' ':
          e.preventDefault();
          setIsZoomed(!isZoomed);
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isZoomed, onClose]);

  const goToPrev = useCallback(() => {
    setCurrentIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
    setIsZoomed(false);
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
    setIsZoomed(false);
  }, [images.length]);

  const handleMouseMove = useCallback((e) => {
    if (!isZoomed) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPosition({ x, y });
  }, [isZoomed]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="image-viewer" onClick={handleBackdropClick}>
      {/* Close Button */}
      <button className="iv-close" onClick={onClose}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>

      {/* Navigation Arrows */}
      {images.length > 1 && (
        <>
          <button className="iv-nav iv-prev" onClick={goToPrev}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
            </svg>
          </button>
          <button className="iv-nav iv-next" onClick={goToNext}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
          </button>
        </>
      )}

      {/* Main Image */}
      <div
        className={`iv-image-container ${isZoomed ? 'zoomed' : ''}`}
        onClick={() => setIsZoomed(!isZoomed)}
        onMouseMove={handleMouseMove}
      >
        {currentImage && (
          <img
            src={getImageUrl(currentImage)}
            alt={currentImage.alt_text || `${productName} - Image ${currentIndex + 1}`}
            style={isZoomed ? {
              transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
              transform: 'scale(2)'
            } : {}}
          />
        )}
      </div>

      {/* Info Bar */}
      <div className="iv-info">
        <div className="iv-info-left">
          {currentImage?.image_type && (
            <span className="iv-type">{currentImage.image_type}</span>
          )}
          {currentImage?.angle && (
            <span className="iv-angle">{currentImage.angle}</span>
          )}
        </div>
        <div className="iv-info-center">
          {currentIndex + 1} / {images.length}
        </div>
        <div className="iv-info-right">
          <span className="iv-hint">Click to zoom | Arrow keys to navigate | ESC to close</span>
        </div>
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="iv-thumbnails">
          {images.map((image, idx) => (
            <button
              key={image.id || idx}
              className={idx === currentIndex ? 'active' : ''}
              onClick={() => {
                setCurrentIndex(idx);
                setIsZoomed(false);
              }}
            >
              <img
                src={image.thumbnail_path || image.web_path || image.local_path}
                alt={`Thumbnail ${idx + 1}`}
              />
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .image-viewer {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.95);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .iv-close {
          position: absolute;
          top: 20px;
          right: 20px;
          width: 44px;
          height: 44px;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          z-index: 10;
        }

        .iv-close:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .iv-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 60px;
          height: 60px;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          transition: all 0.2s;
          z-index: 10;
        }

        .iv-nav:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .iv-prev {
          left: 20px;
        }

        .iv-next {
          right: 20px;
        }

        .iv-image-container {
          flex: 1;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          cursor: zoom-in;
        }

        .iv-image-container.zoomed {
          cursor: zoom-out;
        }

        .iv-image-container img {
          max-width: 90%;
          max-height: 80vh;
          object-fit: contain;
          transition: transform 0.2s ease-out;
        }

        .iv-info {
          position: absolute;
          bottom: 100px;
          left: 0;
          right: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 20px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 13px;
        }

        .iv-info-left {
          display: flex;
          gap: 8px;
        }

        .iv-type, .iv-angle {
          padding: 4px 10px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          text-transform: capitalize;
        }

        .iv-info-center {
          font-size: 14px;
          color: white;
        }

        .iv-hint {
          opacity: 0.5;
        }

        .iv-thumbnails {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
          padding: 10px;
          background: rgba(0, 0, 0, 0.5);
          border-radius: 12px;
          max-width: 80vw;
          overflow-x: auto;
        }

        .iv-thumbnails button {
          flex-shrink: 0;
          width: 56px;
          height: 56px;
          padding: 2px;
          border: 2px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.1);
          overflow: hidden;
        }

        .iv-thumbnails button:hover {
          border-color: rgba(255, 255, 255, 0.5);
        }

        .iv-thumbnails button.active {
          border-color: white;
        }

        .iv-thumbnails button img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        @media (max-width: 768px) {
          .iv-nav {
            width: 44px;
            height: 44px;
          }

          .iv-prev { left: 10px; }
          .iv-next { right: 10px; }

          .iv-info {
            flex-direction: column;
            gap: 8px;
            bottom: 90px;
          }

          .iv-hint {
            display: none;
          }

          .iv-thumbnails {
            bottom: 10px;
          }
        }
      `}</style>
    </div>
  );
}

export default ImageViewer;
