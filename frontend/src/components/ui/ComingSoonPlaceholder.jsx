import React from 'react';

export default function ComingSoonPlaceholder({ title }) {
  const name = title || 'This feature';
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '400px',
      padding: '48px',
      textAlign: 'center'
    }}>
      <div style={{
        fontSize: '48px',
        marginBottom: '16px',
        opacity: 0.3
      }}>
        🚧
      </div>
      <h2 style={{
        fontSize: '24px',
        fontWeight: 600,
        color: '#374151',
        marginBottom: '8px'
      }}>
        {name}
      </h2>
      <p style={{
        fontSize: '14px',
        color: '#6b7280'
      }}>
        Lunaris preview — coming soon
      </p>
    </div>
  );
}
