import { authFetch } from '../../services/authFetch';
/**
 * Package Builder Wizard
 * Guided appliance package builder with Good/Better/Best recommendations
 * Enhanced with loading states, animations, and mobile responsiveness
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from '../ui/Toast';
import PackageComparison from './PackageComparison';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

// Skeleton loader component for loading states
const SkeletonCard = ({ delay = 0 }) => (
  <div style={{
    border: '2px solid #e5e7eb',
    borderRadius: '16px',
    overflow: 'hidden',
    animation: `fadeIn 0.5s ease ${delay}ms both`
  }}>
    <div style={{
      height: '90px',
      backgroundColor: '#e5e7eb',
      animation: 'shimmer 1.5s infinite'
    }} />
    <div style={{ padding: '16px' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          padding: '12px',
          backgroundColor: '#f3f4f6',
          borderRadius: '8px',
          marginBottom: '8px'
        }}>
          <div style={{
            height: '10px',
            width: '60%',
            backgroundColor: '#e5e7eb',
            borderRadius: '4px',
            marginBottom: '8px',
            animation: 'shimmer 1.5s infinite'
          }} />
          <div style={{
            height: '14px',
            width: '80%',
            backgroundColor: '#e5e7eb',
            borderRadius: '4px',
            animation: 'shimmer 1.5s infinite'
          }} />
        </div>
      ))}
    </div>
    <div style={{
      borderTop: '2px solid #e5e7eb',
      padding: '16px',
      backgroundColor: '#f9fafb'
    }}>
      <div style={{
        height: '28px',
        width: '50%',
        backgroundColor: '#e5e7eb',
        borderRadius: '4px',
        margin: '0 auto',
        animation: 'shimmer 1.5s infinite'
      }} />
    </div>
  </div>
);

// Progress indicator for package generation
const GenerationProgress = ({ stage }) => {
  const stages = [
    { id: 1, label: 'Analyzing preferences', icon: '🔍' },
    { id: 2, label: 'Matching products', icon: '📦' },
    { id: 3, label: 'Building packages', icon: '🏗️' },
    { id: 4, label: 'Optimizing prices', icon: '💰' }
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '24px',
      marginTop: '20px'
    }}>
      {stages.map((s, idx) => (
        <div
          key={s.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            opacity: stage >= s.id ? 1 : 0.4,
            transition: 'all 0.3s ease',
            animation: stage === s.id ? 'pulse 1s infinite' : 'none'
          }}
        >
          <span style={{ fontSize: '24px' }}>{s.icon}</span>
          <span style={{
            fontWeight: stage === s.id ? '600' : '400',
            color: stage >= s.id ? '#111827' : '#9ca3af'
          }}>
            {s.label}
            {stage === s.id && <span style={{ marginLeft: '8px' }}>...</span>}
            {stage > s.id && <span style={{ marginLeft: '8px', color: '#10b981' }}>✓</span>}
          </span>
        </div>
      ))}
    </div>
  );
};

// Budget slider component
const BudgetSlider = ({ value, onChange, packageType }) => {
  const presets = packageType === 'kitchen'
    ? [
        { label: 'Budget', value: 2500, desc: 'Essential appliances' },
        { label: 'Mid-Range', value: 4500, desc: 'Quality brands' },
        { label: 'Premium', value: 7000, desc: 'Top features' },
        { label: 'Luxury', value: 12000, desc: 'Best of the best' }
      ]
    : [
        { label: 'Budget', value: 1200, desc: 'Basic pair' },
        { label: 'Mid-Range', value: 2000, desc: 'Efficient models' },
        { label: 'Premium', value: 3500, desc: 'Smart features' },
        { label: 'Luxury', value: 5000, desc: 'High capacity' }
      ];

  const min = packageType === 'kitchen' ? 1500 : 800;
  const max = packageType === 'kitchen' ? 15000 : 7000;

  return (
    <div style={{
      padding: '24px',
      backgroundColor: '#f9fafb',
      borderRadius: '12px',
      marginBottom: '24px'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>💰</span>
        <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '4px' }}>
          What's your budget?
        </h3>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>
          We'll optimize packages to fit your price range
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{
          fontSize: '32px',
          fontWeight: 'bold',
          color: '#3b82f6',
          textAlign: 'center',
          marginBottom: '12px'
        }}>
          ${value.toLocaleString()}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={100}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          style={{
            width: '100%',
            height: '8px',
            borderRadius: '4px',
            appearance: 'none',
            backgroundColor: '#e5e7eb',
            cursor: 'pointer'
          }}
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#9ca3af',
          marginTop: '4px'
        }}>
          <span>${min.toLocaleString()}</span>
          <span>${max.toLocaleString()}</span>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px'
      }}>
        {presets.map(preset => (
          <button
            key={preset.label}
            onClick={() => onChange(preset.value)}
            style={{
              padding: '10px 8px',
              border: value === preset.value ? '2px solid #3b82f6' : '1px solid #e5e7eb',
              borderRadius: '8px',
              backgroundColor: value === preset.value ? '#eff6ff' : 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <div style={{
              fontWeight: '600',
              fontSize: '13px',
              color: value === preset.value ? '#1d4ed8' : '#374151'
            }}>
              {preset.label}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              ${preset.value.toLocaleString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// Step indicator component
const StepIndicator = ({ steps, currentStep }) => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px 0',
      marginBottom: '24px',
      borderBottom: '1px solid #e5e7eb'
    }}>
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '14px',
              backgroundColor: currentStep > index + 1 ? '#10b981' :
                              currentStep === index + 1 ? '#3b82f6' : '#e5e7eb',
              color: currentStep >= index + 1 ? 'white' : '#6b7280',
              transition: 'all 0.3s ease'
            }}>
              {currentStep > index + 1 ? '✓' : index + 1}
            </div>
            <span style={{
              fontSize: '11px',
              marginTop: '6px',
              color: currentStep >= index + 1 ? '#374151' : '#9ca3af',
              fontWeight: currentStep === index + 1 ? '600' : '400'
            }}>
              {step.name}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div style={{
              width: '60px',
              height: '3px',
              backgroundColor: currentStep > index + 1 ? '#10b981' : '#e5e7eb',
              margin: '0 8px',
              marginBottom: '20px',
              transition: 'all 0.3s ease'
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// Question card component
const QuestionCard = ({ question, currentAnswer, onAnswer }) => {
  const isMultiSelect = question.question_type === 'multi_select';
  const selectedValues = isMultiSelect
    ? (Array.isArray(currentAnswer) ? currentAnswer : [])
    : currentAnswer;

  const handleOptionClick = (optionKey) => {
    if (isMultiSelect) {
      const maxSelections = question.max_selections || 99;
      if (selectedValues.includes(optionKey)) {
        onAnswer(selectedValues.filter(v => v !== optionKey));
      } else if (selectedValues.length < maxSelections) {
        onAnswer([...selectedValues, optionKey]);
      } else {
        toast.warning(`Maximum ${maxSelections} selections allowed`, 'Selection Limit');
      }
    } else {
      onAnswer(optionKey);
    }
  };

  const isSelected = (optionKey) => {
    return isMultiSelect
      ? selectedValues.includes(optionKey)
      : selectedValues === optionKey;
  };

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>
          {question.icon}
        </span>
        <h3 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '8px', color: '#111827' }}>
          {question.question_text}
        </h3>
        {question.help_text && (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>{question.help_text}</p>
        )}
        {isMultiSelect && question.max_selections && (
          <p style={{ color: '#3b82f6', fontSize: '13px', marginTop: '8px' }}>
            Select up to {question.max_selections} ({selectedValues.length} selected)
          </p>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: question.options.length <= 3 ? 'repeat(3, 1fr)' :
                            question.options.length <= 4 ? 'repeat(4, 1fr)' :
                            'repeat(3, 1fr)',
        gap: '12px',
        maxWidth: '700px',
        margin: '0 auto'
      }}>
        {question.options.map((option) => (
          <button
            key={option.id}
            onClick={() => handleOptionClick(option.option_key)}
            style={{
              padding: '16px 12px',
              border: isSelected(option.option_key)
                ? '3px solid #3b82f6'
                : '2px solid #e5e7eb',
              borderRadius: '12px',
              backgroundColor: isSelected(option.option_key) ? '#eff6ff' : 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {option.option_icon && (
              <span style={{ fontSize: '24px' }}>{option.option_icon}</span>
            )}
            <span style={{
              fontSize: '14px',
              fontWeight: isSelected(option.option_key) ? '600' : '500',
              color: isSelected(option.option_key) ? '#1d4ed8' : '#374151'
            }}>
              {option.option_text}
            </span>
            {isMultiSelect && isSelected(option.option_key) && (
              <span style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                backgroundColor: '#3b82f6',
                color: 'white',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px'
              }}>✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

// Manufacturer logo mapping for visual branding
const getManufacturerBadge = (manufacturer) => {
  const badges = {
    'LG': { bg: '#A50034', text: 'white' },
    'Samsung': { bg: '#1428A0', text: 'white' },
    'Whirlpool': { bg: '#003B73', text: 'white' },
    'GE': { bg: '#2C5697', text: 'white' },
    'Frigidaire': { bg: '#00529B', text: 'white' },
    'Bosch': { bg: '#E20015', text: 'white' },
    'KitchenAid': { bg: '#B30000', text: 'white' },
    'Maytag': { bg: '#0066B2', text: 'white' }
  };
  return badges[manufacturer] || { bg: '#6b7280', text: 'white' };
};

// Energy rating badge
const EnergyRatingBadge = ({ rating }) => {
  if (!rating) return null;
  const colors = {
    'A+++': '#15803d',
    'A++': '#16a34a',
    'A+': '#22c55e',
    'A': '#84cc16',
    'B': '#eab308',
    'C': '#f97316'
  };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 6px',
      backgroundColor: colors[rating] || '#9ca3af',
      color: 'white',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: 'bold',
      marginLeft: '8px'
    }}>
      {rating}
    </span>
  );
};

// Package tier card component - Enhanced with thumbnails and animations
const PackageTierCard = ({ tier, pkg, isSelected, onSelect, animationDelay = 0 }) => {
  const tierConfig = {
    good: { name: 'Good', color: '#10b981', bgColor: '#d1fae5', icon: '👍', desc: 'Great value' },
    better: { name: 'Better', color: '#3b82f6', bgColor: '#dbeafe', icon: '⭐', desc: 'Popular choice' },
    best: { name: 'Best', color: '#8b5cf6', bgColor: '#ede9fe', icon: '💎', desc: 'Premium quality' }
  };

  const config = tierConfig[tier];

  // Handle case when pkg is undefined or null
  if (!pkg) {
    return (
      <div style={{
        border: '2px dashed #e5e7eb',
        borderRadius: '16px',
        padding: '40px 20px',
        textAlign: 'center',
        color: '#9ca3af',
        animation: `fadeInUp 0.5s ease ${animationDelay}ms both`
      }}>
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>{config.icon}</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#6b7280' }}>{config.name}</div>
        <div style={{ fontSize: '14px', marginTop: '8px' }}>No package available</div>
      </div>
    );
  }

  const hasSavings = (pkg.bundle_savings_cents || 0) > 0;
  const finalPrice = (pkg.total_msrp_cents || 0) - (pkg.bundle_savings_cents || 0);

  return (
    <div
      onClick={onSelect}
      style={{
        border: isSelected ? `3px solid ${config.color}` : '2px solid #e5e7eb',
        borderRadius: '16px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: isSelected ? 'scale(1.02)' : 'scale(1)',
        boxShadow: isSelected ? '0 10px 25px -5px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.1)',
        animation: `fadeInUp 0.5s ease ${animationDelay}ms both`
      }}
    >
      {/* Header */}
      <div style={{
        backgroundColor: config.color,
        color: 'white',
        padding: '16px',
        textAlign: 'center',
        position: 'relative'
      }}>
        {tier === 'better' && (
          <div style={{
            position: 'absolute',
            top: '-1px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#fbbf24',
            color: '#78350f',
            padding: '4px 16px',
            borderRadius: '0 0 8px 8px',
            fontSize: '10px',
            fontWeight: 'bold',
            textTransform: 'uppercase'
          }}>
            Most Popular
          </div>
        )}
        <div style={{ fontSize: '28px', marginBottom: '4px', marginTop: tier === 'better' ? '12px' : 0 }}>
          {config.icon}
        </div>
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{config.name}</div>
        <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>{config.desc}</div>
        {hasSavings && (
          <div style={{
            marginTop: '8px',
            backgroundColor: 'rgba(255,255,255,0.2)',
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '600',
            display: 'inline-block'
          }}>
            🎉 Save ${((pkg.bundle_savings_cents || 0) / 100).toFixed(0)}!
          </div>
        )}
      </div>

      {/* Items with thumbnails */}
      <div style={{ padding: '16px' }}>
        {(pkg.items || []).map((item, idx) => {
          const mfrBadge = getManufacturerBadge(item.product?.manufacturer);
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: '12px',
                padding: '12px',
                backgroundColor: idx % 2 === 0 ? '#f9fafb' : 'white',
                borderRadius: '8px',
                marginBottom: '8px',
                animation: `fadeIn 0.3s ease ${animationDelay + (idx * 100)}ms both`
              }}
            >
              {/* Product thumbnail placeholder */}
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '8px',
                backgroundColor: '#f3f4f6',
                border: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                overflow: 'hidden'
              }}>
                {item.product?.image_url ? (
                  <img
                    src={item.product.image_url}
                    alt={item.product.model || 'Product'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = '<span style="font-size:24px">📦</span>';
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '24px' }}>
                    {item.slot_label?.includes('Fridge') ? '🧊' :
                     item.slot_label?.includes('Range') ? '🍳' :
                     item.slot_label?.includes('Dish') ? '🍽️' :
                     item.slot_label?.includes('Wash') ? '🧺' :
                     item.slot_label?.includes('Dry') ? '💨' : '📦'}
                  </span>
                )}
              </div>

              {/* Product info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '11px',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  {item.slot_label || 'Item'}
                  {item.product?.energy_rating && (
                    <EnergyRatingBadge rating={item.product.energy_rating} />
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '2px'
                }}>
                  <span style={{
                    padding: '2px 6px',
                    backgroundColor: mfrBadge.bg,
                    color: mfrBadge.text,
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }}>
                    {item.product?.manufacturer || 'Unknown'}
                  </span>
                  {item.product?.is_smart && (
                    <span style={{ fontSize: '12px' }} title="Smart Connected">📱</span>
                  )}
                </div>
                <div style={{
                  fontSize: '13px',
                  color: '#374151',
                  marginBottom: '2px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {item.product?.model || 'N/A'}
                </div>
                <div style={{ fontWeight: 'bold', color: config.color, fontSize: '15px' }}>
                  ${((item.product?.msrp_cents || 0) / 100).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div style={{
        borderTop: '2px solid #e5e7eb',
        padding: '16px',
        backgroundColor: config.bgColor
      }}>
        <div style={{ textAlign: 'center' }}>
          {hasSavings && (
            <div style={{
              fontSize: '14px',
              color: '#6b7280',
              textDecoration: 'line-through',
              marginBottom: '4px'
            }}>
              ${((pkg.total_msrp_cents || 0) / 100).toLocaleString()}
            </div>
          )}
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: config.color }}>
            ${(finalPrice / 100).toLocaleString()}
          </div>
          {pkg.brand_cohesion_score !== undefined && (
            <div style={{
              marginTop: '8px',
              fontSize: '12px',
              color: config.color,
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px'
            }}>
              {pkg.brand_cohesion_score === 100 ? (
                <>
                  <span>✨</span>
                  <span>All {pkg.items?.[0]?.product?.manufacturer} Suite</span>
                </>
              ) : (
                <>
                  <span>🎯</span>
                  <span>Brand Cohesion: {pkg.brand_cohesion_score}%</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Select Button */}
      <div style={{ padding: '0 16px 16px' }}>
        <button
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: isSelected ? config.color : 'white',
            color: isSelected ? 'white' : config.color,
            border: `2px solid ${config.color}`,
            borderRadius: '8px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          {isSelected ? (
            <>
              <span>✓</span>
              <span>Selected</span>
            </>
          ) : (
            <>
              <span>Select Package</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// Main PackageBuilder component
const PackageBuilder = ({
  onClose,
  onAddToQuote,
  customerId = null,
  defaultPackageType = 'kitchen'
}) => {
  // State
  const [packageType, setPackageType] = useState(defaultPackageType);
  const [questionnaire, setQuestionnaire] = useState(null);
  const [sessionUuid, setSessionUuid] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [packages, setPackages] = useState(null);
  const [selectedTier, setSelectedTier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState(0);
  const [budget, setBudget] = useState(null);
  const [step, setStep] = useState('type'); // 'type', 'budget', 'questions', 'results', 'confirm'
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showComparison, setShowComparison] = useState(false);

  // Handle responsive layout
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const STEPS = [
    { id: 1, name: 'Type' },
    { id: 2, name: 'Budget' },
    { id: 3, name: 'Preferences' },
    { id: 4, name: 'Packages' }
  ];

  // Load questionnaire and create session
  useEffect(() => {
    if (step === 'questions') {
      loadQuestionnaireAndCreateSession();
    }
  }, [step, packageType]);

  const loadQuestionnaireAndCreateSession = async () => {
    setLoading(true);
    try {
      // Load questionnaire
      const qRes = await authFetch(`${API_URL}/api/package-builder/questionnaires/${packageType}`, {
        headers: getAuthHeaders()
      });
      const qData = await qRes.json();

      if (!qData.success) {
        throw new Error(qData.error || 'Failed to load questionnaire');
      }

      setQuestionnaire(qData.data);

      // Create session
      const sRes = await authFetch(`${API_URL}/api/package-builder/sessions`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ package_type: packageType, customer_id: customerId })
      });
      const sData = await sRes.json();

      if (!sData.success) {
        throw new Error(sData.error || 'Failed to create session');
      }

      setSessionUuid(sData.data.session_uuid);
      setLoading(false);
    } catch (err) {
      console.error('Error loading questionnaire:', err);
      toast.error(err.message, 'Load Error');
      setLoading(false);
    }
  };

  // Handle answer
  const handleAnswer = useCallback((questionKey, value) => {
    setAnswers(prev => ({
      ...prev,
      [questionKey]: value
    }));
  }, []);

  // Check if current question is answered
  const isCurrentQuestionAnswered = () => {
    if (!questionnaire) return false;
    const currentQuestion = questionnaire.questions[currentQuestionIndex];
    if (!currentQuestion) return false;

    const answer = answers[currentQuestion.question_key];

    if (!currentQuestion.is_required) return true;

    if (currentQuestion.question_type === 'multi_select') {
      return Array.isArray(answer) && answer.length > 0;
    }

    return answer !== undefined && answer !== null && answer !== '';
  };

  // Navigate questions
  const goToNextQuestion = () => {
    if (currentQuestionIndex < questionnaire.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      // All questions answered, generate packages
      generatePackages();
    }
  };

  const goToPreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  // Generate packages with progress stages
  const generatePackages = async () => {
    setGenerating(true);
    setGenerationStage(1);
    setStep('results');

    try {
      // Stage 1: Analyzing preferences
      await new Promise(resolve => setTimeout(resolve, 400));
      setGenerationStage(2);

      // Stage 2: Save answers to session
      await authFetch(`${API_URL}/api/package-builder/sessions/${sessionUuid}/answers`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          answers,
          budget_cents: budget ? budget * 100 : null
        })
      });

      setGenerationStage(3);

      // Stage 3: Generate packages
      const res = await authFetch(`${API_URL}/api/package-builder/sessions/${sessionUuid}/generate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          budget_cents: budget ? budget * 100 : null
        })
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate packages');
      }

      setGenerationStage(4);

      // Stage 4: Brief delay for optimizing prices visual
      await new Promise(resolve => setTimeout(resolve, 300));

      // Extract the nested packages object (API returns { packages: { packages: { good, better, best } } })
      const packageData = data.data.packages;
      setPackages(packageData?.packages || packageData);
      setGenerating(false);
      setGenerationStage(0);
    } catch (err) {
      console.error('Error generating packages:', err);
      toast.error(err.message, 'Generation Error');
      setGenerating(false);
      setGenerationStage(0);
    }
  };

  // Add to quote
  const handleAddToQuote = async () => {
    if (!selectedTier || !packages) return;

    try {
      // Select tier in session
      await authFetch(`${API_URL}/api/package-builder/sessions/${sessionUuid}/select`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ tier: selectedTier })
      });

      // Get items for quote
      const res = await authFetch(`${API_URL}/api/package-builder/sessions/${sessionUuid}/add-to-quote`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({})
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to prepare quote items');
      }

      // Call parent handler with items
      onAddToQuote(data.data);

      toast.success(`${selectedTier.toUpperCase()} package added to quote!`, 'Package Added');
      onClose();
    } catch (err) {
      console.error('Error adding to quote:', err);
      toast.error(err.message, 'Error');
    }
  };

  // Render type selection
  const renderTypeSelection = () => (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <h2 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '12px' }}>
        Build Your Appliance Package
      </h2>
      <p style={{ color: '#6b7280', marginBottom: '32px' }}>
        Answer a few questions and we'll recommend the perfect Good / Better / Best options
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
        gap: '24px',
        maxWidth: '500px',
        margin: '0 auto'
      }}>
        <button
          onClick={() => {
            setPackageType('kitchen');
            setBudget(4500);
            setStep('budget');
          }}
          style={{
            padding: '32px 24px',
            border: '3px solid #3b82f6',
            borderRadius: '16px',
            backgroundColor: '#eff6ff',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🍳</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1d4ed8' }}>Kitchen Suite</div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
            Fridge + Range + Dishwasher
          </div>
        </button>

        <button
          onClick={() => {
            setPackageType('laundry');
            setBudget(2000);
            setStep('budget');
          }}
          style={{
            padding: '32px 24px',
            border: '3px solid #8b5cf6',
            borderRadius: '16px',
            backgroundColor: '#f5f3ff',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🧺</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#6d28d9' }}>Laundry Pair</div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
            Washer + Dryer
          </div>
        </button>
      </div>
    </div>
  );

  // Render budget selection step
  const renderBudget = () => (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <BudgetSlider
        value={budget || (packageType === 'kitchen' ? 4500 : 2000)}
        onChange={setBudget}
        packageType={packageType}
      />
    </div>
  );

  // Render questions
  const renderQuestions = () => {
    if (loading) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid #e5e7eb',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 24px'
          }} />
          <p style={{ color: '#6b7280' }}>Loading questionnaire...</p>
        </div>
      );
    }

    if (!questionnaire || !questionnaire.questions) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ color: '#ef4444' }}>Failed to load questionnaire</p>
        </div>
      );
    }

    const currentQuestion = questionnaire.questions[currentQuestionIndex];

    return (
      <div>
        {/* Progress bar */}
        <div style={{
          height: '4px',
          backgroundColor: '#e5e7eb',
          borderRadius: '2px',
          marginBottom: '24px'
        }}>
          <div style={{
            height: '100%',
            backgroundColor: '#3b82f6',
            borderRadius: '2px',
            width: `${((currentQuestionIndex + 1) / questionnaire.questions.length) * 100}%`,
            transition: 'width 0.3s ease'
          }} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>
          Question {currentQuestionIndex + 1} of {questionnaire.questions.length}
        </div>

        <QuestionCard
          question={currentQuestion}
          currentAnswer={answers[currentQuestion.question_key]}
          onAnswer={(value) => handleAnswer(currentQuestion.question_key, value)}
        />
      </div>
    );
  };

  // Render results
  const renderResults = () => {
    if (generating) {
      return (
        <div style={{ padding: '40px 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              border: '4px solid #e5e7eb',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 24px'
            }} />
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>
              Finding the best packages for you...
            </h3>
            <GenerationProgress stage={generationStage} />
          </div>

          {/* Skeleton loaders */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: '20px',
            marginTop: '32px'
          }}>
            <SkeletonCard delay={0} />
            <SkeletonCard delay={100} />
            <SkeletonCard delay={200} />
          </div>
        </div>
      );
    }

    if (!packages) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
          <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>
            No packages could be generated
          </h3>
          <p style={{ color: '#6b7280', marginBottom: '24px' }}>
            We couldn't find products matching your criteria. Try adjusting your preferences.
          </p>
          <button
            onClick={() => {
              setStep('questions');
              setCurrentQuestionIndex(0);
            }}
            style={{
              padding: '12px 24px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Adjust Preferences
          </button>
        </div>
      );
    }

    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
            Your Recommended Packages
          </h2>
          <p style={{ color: '#6b7280' }}>
            Based on your preferences{budget ? ` and $${budget.toLocaleString()} budget` : ''}, here are three options
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: '20px'
        }}>
          {['good', 'better', 'best'].map((tier, idx) => (
            <PackageTierCard
              key={tier}
              tier={tier}
              pkg={packages[tier]}
              isSelected={selectedTier === tier}
              onSelect={() => setSelectedTier(tier)}
              animationDelay={idx * 150}
            />
          ))}
        </div>

        {/* Comparison button */}
        <div style={{
          textAlign: 'center',
          marginTop: '24px'
        }}>
          <button
            onClick={() => setShowComparison(true)}
            style={{
              padding: '12px 24px',
              backgroundColor: '#f0f9ff',
              color: '#0369a1',
              border: '1px solid #bae6fd',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <span>📊</span>
            <span>Compare Packages Side by Side</span>
          </button>
        </div>

        {/* Comparison Modal */}
        {showComparison && (
          <PackageComparison
            packages={packages}
            selectedTier={selectedTier}
            onSelectTier={setSelectedTier}
            onClose={() => setShowComparison(false)}
          />
        )}
      </div>
    );
  };

  // Get current step number for indicator
  const getCurrentStepNumber = () => {
    switch (step) {
      case 'type': return 1;
      case 'budget': return 2;
      case 'questions': return 3;
      case 'results': return 4;
      default: return 1;
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      {/* Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes shimmer {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }
        input[type="range"]::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }
      `}</style>

      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        width: '95%',
        maxWidth: step === 'results' ? '1100px' : '800px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
              {packageType === 'kitchen' ? '🍳 ' : '🧺 '}
              Package Builder
            </h2>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {packageType.charAt(0).toUpperCase() + packageType.slice(1)} Package
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '8px'
            }}
          >
            ×
          </button>
        </div>

        {/* Step Indicator */}
        {step !== 'type' && (
          <StepIndicator steps={STEPS} currentStep={getCurrentStepNumber()} />
        )}

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: isMobile ? '16px' : '24px'
        }}>
          {step === 'type' && renderTypeSelection()}
          {step === 'budget' && renderBudget()}
          {step === 'questions' && renderQuestions()}
          {step === 'results' && renderResults()}
        </div>

        {/* Footer Navigation */}
        <div style={{
          padding: isMobile ? '12px 16px' : '16px 24px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f9fafb',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          gap: isMobile ? '12px' : '0'
        }}>
          {/* Back Button */}
          <div style={{ order: isMobile ? 1 : 0, width: isMobile ? '48%' : 'auto' }}>
            {step === 'budget' && (
              <button
                onClick={() => { setStep('type'); setBudget(null); }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto'
                }}
              >
                ← Back
              </button>
            )}
            {step === 'questions' && currentQuestionIndex > 0 && (
              <button
                onClick={goToPreviousQuestion}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto'
                }}
              >
                ← Back
              </button>
            )}
            {step === 'questions' && currentQuestionIndex === 0 && (
              <button
                onClick={() => { setStep('budget'); }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto'
                }}
              >
                ← Budget
              </button>
            )}
            {step === 'results' && !generating && (
              <button
                onClick={() => {
                  setStep('questions');
                  setCurrentQuestionIndex(questionnaire?.questions?.length - 1 || 0);
                }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto'
                }}
              >
                ← Edit Answers
              </button>
            )}
          </div>

          {/* Next/Add Button */}
          <div style={{ order: isMobile ? 2 : 0, width: isMobile ? '48%' : 'auto' }}>
            {step === 'budget' && (
              <button
                onClick={() => setStep('questions')}
                style={{
                  padding: '12px 32px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '16px',
                  width: isMobile ? '100%' : 'auto'
                }}
              >
                Next →
              </button>
            )}
            {step === 'questions' && (
              <button
                onClick={goToNextQuestion}
                disabled={!isCurrentQuestionAnswered() && questionnaire?.questions[currentQuestionIndex]?.is_required}
                style={{
                  padding: '12px 32px',
                  backgroundColor: isCurrentQuestionAnswered() ? '#3b82f6' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: isCurrentQuestionAnswered() ? 'pointer' : 'not-allowed',
                  fontSize: '16px',
                  width: isMobile ? '100%' : 'auto'
                }}
              >
                {currentQuestionIndex === questionnaire?.questions.length - 1 ? 'Generate →' : 'Next →'}
              </button>
            )}
            {step === 'results' && !generating && (
              <button
                onClick={handleAddToQuote}
                disabled={!selectedTier}
                style={{
                  padding: '12px 32px',
                  backgroundColor: selectedTier ? '#10b981' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: selectedTier ? 'pointer' : 'not-allowed',
                  fontSize: isMobile ? '14px' : '16px',
                  width: isMobile ? '100%' : 'auto'
                }}
              >
                {isMobile ? `Add ${selectedTier?.toUpperCase() || ''} to Quote` : `Add ${selectedTier?.toUpperCase() || ''} Package to Quote`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PackageBuilder;
