import React from 'react';

/**
 * Reusable loading skeleton components for better UX during data fetching
 */

// Base skeleton with shimmer animation
const SkeletonBase = ({ style, className = '' }) => (
  <div
    className={`skeleton ${className}`}
    style={{
      background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      borderRadius: '4px',
      ...style
    }}
  />
);

// Text line skeleton
export const SkeletonText = ({ width = '100%', height = '16px', style = {} }) => (
  <SkeletonBase style={{ width, height, ...style }} />
);

// Circle skeleton (for avatars)
export const SkeletonCircle = ({ size = '40px', style = {} }) => (
  <SkeletonBase style={{ width: size, height: size, borderRadius: '50%', ...style }} />
);

// Card skeleton
export const SkeletonCard = ({ height = '120px', style = {} }) => (
  <SkeletonBase style={{ width: '100%', height, borderRadius: '12px', ...style }} />
);

// Table row skeleton
export const SkeletonTableRow = ({ columns = 5 }) => (
  <tr>
    {Array.from({ length: columns }).map((_, i) => (
      <td key={i} style={{ padding: '16px' }}>
        <SkeletonText width={`${60 + Math.random() * 30}%`} />
      </td>
    ))}
  </tr>
);

// Table skeleton
export const SkeletonTable = ({ rows = 5, columns = 5 }) => (
  <div style={{ width: '100%' }}>
    {/* Header skeleton */}
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: '16px',
      padding: '16px',
      background: '#f9fafb',
      borderRadius: '8px 8px 0 0'
    }}>
      {Array.from({ length: columns }).map((_, i) => (
        <SkeletonText key={i} width="80%" height="14px" />
      ))}
    </div>
    {/* Rows skeleton */}
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div
        key={rowIndex}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: '16px',
          padding: '16px',
          borderBottom: '1px solid #e5e7eb'
        }}
      >
        {Array.from({ length: columns }).map((_, colIndex) => (
          <SkeletonText key={colIndex} width={`${50 + Math.random() * 40}%`} />
        ))}
      </div>
    ))}
  </div>
);

// Stats card skeleton
export const SkeletonStats = ({ count = 4 }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: `repeat(${Math.min(count, 4)}, 1fr)`,
    gap: '16px'
  }}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}
      >
        <SkeletonText width="60%" height="14px" style={{ marginBottom: '12px' }} />
        <SkeletonText width="40%" height="28px" />
      </div>
    ))}
  </div>
);

// Form skeleton
export const SkeletonForm = ({ fields = 4 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
    {Array.from({ length: fields }).map((_, i) => (
      <div key={i}>
        <SkeletonText width="30%" height="14px" style={{ marginBottom: '8px' }} />
        <SkeletonText width="100%" height="42px" style={{ borderRadius: '8px' }} />
      </div>
    ))}
  </div>
);

// Product card skeleton
export const SkeletonProductCard = () => (
  <div style={{
    padding: '16px',
    background: 'white',
    borderRadius: '8px',
    border: '1px solid #e5e7eb'
  }}>
    <SkeletonText width="70%" height="18px" style={{ marginBottom: '8px' }} />
    <SkeletonText width="90%" height="14px" style={{ marginBottom: '12px' }} />
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <SkeletonText width="30%" height="14px" />
      <SkeletonText width="25%" height="14px" />
    </div>
  </div>
);

// Full page loading skeleton
export const PageLoadingSkeleton = () => (
  <div style={{ padding: '24px' }}>
    {/* Header */}
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
      <SkeletonText width="200px" height="32px" />
      <SkeletonText width="120px" height="40px" style={{ borderRadius: '8px' }} />
    </div>

    {/* Stats */}
    <div style={{ marginBottom: '24px' }}>
      <SkeletonStats count={4} />
    </div>

    {/* Table */}
    <div style={{
      background: 'white',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <SkeletonTable rows={8} columns={6} />
    </div>
  </div>
);

// Inline spinner for buttons
export const ButtonSpinner = ({ size = '16px', color = 'white' }) => (
  <span
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      border: `2px solid ${color}40`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      marginRight: '8px'
    }}
  />
);

// CSS keyframes (inject once)
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
if (!document.querySelector('#skeleton-styles')) {
  styleSheet.id = 'skeleton-styles';
  document.head.appendChild(styleSheet);
}

export default {
  SkeletonText,
  SkeletonCircle,
  SkeletonCard,
  SkeletonTableRow,
  SkeletonTable,
  SkeletonStats,
  SkeletonForm,
  SkeletonProductCard,
  PageLoadingSkeleton,
  ButtonSpinner
};
