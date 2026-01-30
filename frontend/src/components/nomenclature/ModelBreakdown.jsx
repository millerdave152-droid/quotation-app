/**
 * ModelBreakdown.jsx
 * Visual breakdown display of decoded model number
 */

import React, { useState } from 'react';

const ModelBreakdown = ({ result, modelNumber }) => {
  const [hoveredSegment, setHoveredSegment] = useState(null);

  if (!result || !result.breakdown || result.breakdown.length === 0) {
    return (
      <div style={{
        padding: '24px',
        backgroundColor: '#fef3c7',
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
        <div style={{ color: '#92400e', fontWeight: '500' }}>
          Could not decode this model number
        </div>
        <div style={{ color: '#a16207', fontSize: '14px', marginTop: '4px' }}>
          The model pattern may not be in our database yet
        </div>
      </div>
    );
  }

  const { breakdown, manufacturer, productType, confidence } = result;

  // Build the visual model with colored segments
  const buildVisualModel = () => {
    const chars = modelNumber.split('');
    const segments = [];
    let currentIdx = 0;

    // Sort breakdown by position_start
    const sortedBreakdown = [...breakdown].sort((a, b) => a.position_start - b.position_start);

    for (const segment of sortedBreakdown) {
      // Add any unmatched characters before this segment
      if (currentIdx < segment.position_start - 1) {
        const unmatchedChars = chars.slice(currentIdx, segment.position_start - 1);
        segments.push({
          chars: unmatchedChars.join(''),
          color: '#9ca3af',
          name: 'Unknown',
          meaning: 'Not decoded'
        });
      }

      // Add the segment
      const segmentChars = chars.slice(segment.position_start - 1, segment.position_end);
      segments.push({
        chars: segmentChars.join(''),
        color: segment.color || '#4f46e5',
        name: segment.segment_name,
        meaning: segment.meaning || 'Unknown code',
        code: segment.code,
        additionalInfo: segment.additional_info
      });

      currentIdx = segment.position_end;
    }

    // Add any remaining characters
    if (currentIdx < chars.length) {
      segments.push({
        chars: chars.slice(currentIdx).join(''),
        color: '#9ca3af',
        name: 'Unknown',
        meaning: 'Not decoded'
      });
    }

    return segments;
  };

  const visualSegments = buildVisualModel();

  return (
    <div>
      {/* Header with confidence */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            {manufacturer} {productType}
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'monospace', letterSpacing: '2px' }}>
            {modelNumber}
          </div>
        </div>
        <div style={{
          padding: '8px 16px',
          backgroundColor: confidence >= 80 ? '#d1fae5' : confidence >= 50 ? '#fef3c7' : '#fee2e2',
          color: confidence >= 80 ? '#059669' : confidence >= 50 ? '#d97706' : '#dc2626',
          borderRadius: '20px',
          fontSize: '14px',
          fontWeight: '600'
        }}>
          {confidence}% Match
        </div>
      </div>

      {/* Visual Model Display */}
      <div style={{
        backgroundColor: '#1f2937',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        overflowX: 'auto'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '4px',
          marginBottom: '16px'
        }}>
          {visualSegments.map((segment, idx) => (
            <div
              key={idx}
              onMouseEnter={() => setHoveredSegment(idx)}
              onMouseLeave={() => setHoveredSegment(null)}
              style={{
                padding: '12px 8px',
                backgroundColor: hoveredSegment === idx ? segment.color : `${segment.color}cc`,
                color: 'white',
                borderRadius: '6px',
                fontSize: '24px',
                fontFamily: 'monospace',
                fontWeight: '700',
                letterSpacing: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: hoveredSegment === idx ? 'scale(1.1)' : 'scale(1)',
                boxShadow: hoveredSegment === idx ? `0 4px 12px ${segment.color}80` : 'none'
              }}
            >
              {segment.chars}
            </div>
          ))}
        </div>

        {/* Hover Info */}
        {hoveredSegment !== null && (
          <div style={{
            textAlign: 'center',
            color: 'white',
            fontSize: '14px',
            padding: '8px',
            backgroundColor: 'rgba(255,255,255,0.1)',
            borderRadius: '8px'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '4px' }}>
              {visualSegments[hoveredSegment].name}
            </div>
            <div style={{ color: '#d1d5db' }}>
              "{visualSegments[hoveredSegment].chars}" = {visualSegments[hoveredSegment].meaning}
            </div>
          </div>
        )}
      </div>

      {/* Detailed Breakdown Table */}
      <div style={{
        backgroundColor: '#f9fafb',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#f3f4f6',
          borderBottom: '1px solid #e5e7eb',
          fontWeight: '600',
          color: '#374151'
        }}>
          Segment Breakdown
        </div>

        {breakdown.map((segment, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'stretch',
              borderBottom: idx < breakdown.length - 1 ? '1px solid #e5e7eb' : 'none'
            }}
          >
            {/* Color Bar */}
            <div style={{
              width: '6px',
              backgroundColor: segment.color || '#4f46e5'
            }} />

            {/* Position */}
            <div style={{
              width: '80px',
              padding: '16px',
              backgroundColor: '#f9fafb',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              borderRight: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Position</div>
              <div style={{ fontWeight: '600', color: '#374151' }}>
                {segment.position_start}{segment.position_start !== segment.position_end ? `-${segment.position_end}` : ''}
              </div>
            </div>

            {/* Code */}
            <div style={{
              width: '100px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              borderRight: '1px solid #e5e7eb'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Code</div>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '18px',
                fontWeight: '700',
                color: segment.color || '#4f46e5'
              }}>
                {segment.code}
              </div>
            </div>

            {/* Segment Name */}
            <div style={{
              flex: 1,
              padding: '16px',
              backgroundColor: 'white'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                {segment.segment_name}
              </div>
              <div style={{ fontWeight: '600', color: '#111827' }}>
                {segment.meaning || 'Unknown'}
              </div>
              {segment.additional_info && (
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                  {segment.additional_info}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Not all segments decoded notice */}
      {confidence < 100 && (
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          backgroundColor: '#fef3c7',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#92400e',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '18px' }}>💡</span>
          <span>
            Some segments could not be decoded. The model pattern may have codes not yet in our database.
          </span>
        </div>
      )}
    </div>
  );
};

export default ModelBreakdown;
