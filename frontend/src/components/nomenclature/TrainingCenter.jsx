import { authFetch } from '../../services/authFetch';
/**
 * TrainingCenter.jsx
 * Main page for Model Nomenclature Decoder training system
 * Features: Interactive decoder, reference charts, quiz mode
 */

import React, { useState, useEffect, useCallback } from 'react';
import InteractiveDecoder from './InteractiveDecoder';
import ReferenceChart from './ReferenceChart';
import QuizMode from './QuizMode';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const TrainingCenter = () => {
  // State
  const [activeTab, setActiveTab] = useState('decoder');
  const [selectedManufacturer, setSelectedManufacturer] = useState('SAMSUNG');
  const [manufacturers, setManufacturers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [userProgress, setUserProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch manufacturers and templates
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      // Fetch grouped templates
      const templatesRes = await authFetch(`${API_BASE}/api/nomenclature/templates/grouped`, { headers });
      if (templatesRes.ok) {
        const templatesData = await templatesRes.json();
        if (templatesData.success) {
          setTemplates(templatesData.data);
          setManufacturers(Object.keys(templatesData.data));
        }
      }

      // Fetch user progress
      const progressRes = await authFetch(`${API_BASE}/api/nomenclature/progress`, { headers });
      if (progressRes.ok) {
        const progressData = await progressRes.json();
        if (progressData.success) {
          setUserProgress(progressData.data);
        }
      }

      setError(null);
    } catch (err) {
      console.error('Error fetching nomenclature data:', err);
      setError('Failed to load training data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Tab styles
  const tabStyle = (isActive) => ({
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: isActive ? '600' : '500',
    color: isActive ? '#4f46e5' : '#6b7280',
    backgroundColor: isActive ? '#eef2ff' : 'transparent',
    border: 'none',
    borderBottom: isActive ? '3px solid #4f46e5' : '3px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  });

  const manufacturerTabStyle = (isActive) => ({
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: isActive ? '600' : '400',
    color: isActive ? 'white' : '#374151',
    backgroundColor: isActive ? '#4f46e5' : '#f3f4f6',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginRight: '8px',
    marginBottom: '8px'
  });

  // Get mastery badge
  const getMasteryBadge = (level) => {
    const badges = {
      beginner: { color: '#6b7280', bg: '#f3f4f6', icon: '📖' },
      intermediate: { color: '#3b82f6', bg: '#dbeafe', icon: '📘' },
      advanced: { color: '#059669', bg: '#d1fae5', icon: '🎓' },
      expert: { color: '#7c3aed', bg: '#ede9fe', icon: '🏆' }
    };
    return badges[level] || badges.beginner;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📚</div>
          <div style={{ color: '#6b7280' }}>Loading Training Center...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>
          Model Nomenclature Training Center
        </h1>
        <p style={{ color: '#6b7280', fontSize: '15px' }}>
          Learn to decode appliance model numbers and become an expert in product identification
        </p>
      </div>

      {/* Progress Overview Card */}
      {userProgress && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '40px' }}>
              {getMasteryBadge(userProgress.overallMastery || 'beginner').icon}
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                Your Progress
              </div>
              <div style={{ color: '#6b7280', fontSize: '14px' }}>
                Overall Mastery: <span style={{
                  textTransform: 'capitalize',
                  color: getMasteryBadge(userProgress.overallMastery || 'beginner').color,
                  fontWeight: '600'
                }}>
                  {userProgress.overallMastery || 'Beginner'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '32px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#4f46e5' }}>
                {userProgress.totalQuizzes || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Quizzes Completed</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#059669' }}>
                {userProgress.averageScore ? `${Math.round(userProgress.averageScore)}%` : 'N/A'}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Average Score</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b' }}>
                {userProgress.manufacturersMastered || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Brands Mastered</div>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          color: '#dc2626'
        }}>
          {error}
        </div>
      )}

      {/* Main Content Card */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {/* Main Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#fafafa'
        }}>
          <button
            onClick={() => setActiveTab('decoder')}
            style={tabStyle(activeTab === 'decoder')}
          >
            🔍 Interactive Decoder
          </button>
          <button
            onClick={() => setActiveTab('reference')}
            style={tabStyle(activeTab === 'reference')}
          >
            📋 Reference Charts
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            style={tabStyle(activeTab === 'quiz')}
          >
            📝 Quiz Mode
          </button>
        </div>

        {/* Manufacturer Selection */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#fafafa'
        }}>
          <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: '#6b7280' }}>
            Select Brand:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {manufacturers.map(mfr => (
              <button
                key={mfr}
                onClick={() => setSelectedManufacturer(mfr)}
                style={manufacturerTabStyle(selectedManufacturer === mfr)}
              >
                {mfr}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div style={{ padding: '24px' }}>
          {activeTab === 'decoder' && (
            <InteractiveDecoder
              manufacturer={selectedManufacturer}
              templates={templates[selectedManufacturer] || []}
            />
          )}

          {activeTab === 'reference' && (
            <ReferenceChart
              manufacturer={selectedManufacturer}
              templates={templates[selectedManufacturer] || []}
            />
          )}

          {activeTab === 'quiz' && (
            <QuizMode
              manufacturer={selectedManufacturer}
              templates={templates[selectedManufacturer] || []}
              onQuizComplete={fetchData}
            />
          )}
        </div>
      </div>

      {/* Manufacturer Mastery Cards */}
      {userProgress?.byManufacturer && Object.keys(userProgress.byManufacturer).length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
            Your Brand Mastery
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {Object.entries(userProgress.byManufacturer).map(([mfr, data]) => {
              const badge = getMasteryBadge(data.mastery_level);
              return (
                <div
                  key={mfr}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    padding: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    borderLeft: `4px solid ${badge.color}`
                  }}
                >
                  <div style={{ fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
                    {mfr}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '12px',
                      padding: '4px 8px',
                      backgroundColor: badge.bg,
                      color: badge.color,
                      borderRadius: '4px',
                      fontWeight: '500',
                      textTransform: 'capitalize'
                    }}>
                      {data.mastery_level}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#4f46e5' }}>
                      {data.best_score ? `${Math.round(data.best_score)}%` : '-'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                    {data.quizzes_completed || 0} quizzes completed
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingCenter;
