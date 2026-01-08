/**
 * Package Builder Wizard
 * Guided appliance package builder with Good/Better/Best recommendations
 */

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from '../ui/Toast';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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

// Package tier card component
const PackageTierCard = ({ tier, pkg, isSelected, onSelect }) => {
  const tierConfig = {
    good: { name: 'Good', color: '#10b981', bgColor: '#d1fae5', icon: '👍' },
    better: { name: 'Better', color: '#3b82f6', bgColor: '#dbeafe', icon: '⭐' },
    best: { name: 'Best', color: '#8b5cf6', bgColor: '#ede9fe', icon: '💎' }
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
        color: '#9ca3af'
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
        boxShadow: isSelected ? '0 10px 25px -5px rgba(0,0,0,0.1)' : 'none'
      }}
    >
      {/* Header */}
      <div style={{
        backgroundColor: config.color,
        color: 'white',
        padding: '16px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '28px', marginBottom: '4px' }}>{config.icon}</div>
        <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{config.name}</div>
        {hasSavings && (
          <div style={{
            marginTop: '8px',
            backgroundColor: 'rgba(255,255,255,0.2)',
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '600'
          }}>
            Save ${((pkg.bundle_savings_cents || 0) / 100).toFixed(0)}!
          </div>
        )}
      </div>

      {/* Items */}
      <div style={{ padding: '16px' }}>
        {(pkg.items || []).map((item, idx) => (
          <div
            key={idx}
            style={{
              padding: '12px',
              backgroundColor: idx % 2 === 0 ? '#f9fafb' : 'white',
              borderRadius: '8px',
              marginBottom: '8px'
            }}
          >
            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>
              {item.slot_label || 'Item'}
            </div>
            <div style={{ fontWeight: '600', fontSize: '14px', color: '#111827' }}>
              {item.product?.manufacturer || 'Unknown'}
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
              {item.product?.model || 'N/A'}
            </div>
            <div style={{ fontWeight: 'bold', color: config.color }}>
              ${((item.product?.msrp_cents || 0) / 100).toFixed(0)}
            </div>
          </div>
        ))}
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
              ${((pkg.total_msrp_cents || 0) / 100).toFixed(2)}
            </div>
          )}
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: config.color }}>
            ${(finalPrice / 100).toFixed(2)}
          </div>
          {pkg.brand_cohesion_score === 100 && pkg.items?.[0]?.product?.manufacturer && (
            <div style={{
              marginTop: '8px',
              fontSize: '12px',
              color: config.color,
              fontWeight: '600'
            }}>
              All {pkg.items[0].product.manufacturer} Suite
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
            transition: 'all 0.2s ease'
          }}
        >
          {isSelected ? 'Selected ✓' : 'Select Package'}
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
  const [step, setStep] = useState('type'); // 'type', 'questions', 'results', 'confirm'

  const STEPS = [
    { id: 1, name: 'Type' },
    { id: 2, name: 'Preferences' },
    { id: 3, name: 'Packages' },
    { id: 4, name: 'Confirm' }
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
      const qRes = await fetch(`${API_URL}/api/package-builder/questionnaires/${packageType}`);
      const qData = await qRes.json();

      if (!qData.success) {
        throw new Error(qData.error || 'Failed to load questionnaire');
      }

      setQuestionnaire(qData.data);

      // Create session
      const sRes = await fetch(`${API_URL}/api/package-builder/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // Generate packages
  const generatePackages = async () => {
    setGenerating(true);
    setStep('results');

    try {
      // Save answers to session
      await fetch(`${API_URL}/api/package-builder/sessions/${sessionUuid}/answers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      });

      // Generate packages
      const res = await fetch(`${API_URL}/api/package-builder/sessions/${sessionUuid}/generate`, {
        method: 'POST'
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate packages');
      }

      // Extract the nested packages object (API returns { packages: { packages: { good, better, best } } })
      const packageData = data.data.packages;
      setPackages(packageData?.packages || packageData);
      setGenerating(false);
    } catch (err) {
      console.error('Error generating packages:', err);
      toast.error(err.message, 'Generation Error');
      setGenerating(false);
    }
  };

  // Add to quote
  const handleAddToQuote = async () => {
    if (!selectedTier || !packages) return;

    try {
      // Select tier in session
      await fetch(`${API_URL}/api/package-builder/sessions/${sessionUuid}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: selectedTier })
      });

      // Get items for quote
      const res = await fetch(`${API_URL}/api/package-builder/sessions/${sessionUuid}/add-to-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '24px',
        maxWidth: '500px',
        margin: '0 auto'
      }}>
        <button
          onClick={() => { setPackageType('kitchen'); setStep('questions'); }}
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
          onClick={() => { setPackageType('laundry'); setStep('questions'); }}
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
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
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
          <p style={{ color: '#6b7280' }}>Analyzing your preferences and matching products</p>
        </div>
      );
    }

    if (!packages) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ color: '#ef4444' }}>No packages generated</p>
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
            Based on your preferences, here are three package options
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '20px'
        }}>
          {['good', 'better', 'best'].map(tier => (
            <PackageTierCard
              key={tier}
              tier={tier}
              pkg={packages[tier]}
              isSelected={selectedTier === tier}
              onSelect={() => setSelectedTier(tier)}
            />
          ))}
        </div>
      </div>
    );
  };

  // Get current step number for indicator
  const getCurrentStepNumber = () => {
    switch (step) {
      case 'type': return 1;
      case 'questions': return 2;
      case 'results': return 3;
      case 'confirm': return 4;
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
      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
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
          padding: '24px'
        }}>
          {step === 'type' && renderTypeSelection()}
          {step === 'questions' && renderQuestions()}
          {step === 'results' && renderResults()}
        </div>

        {/* Footer Navigation */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f9fafb'
        }}>
          {/* Back Button */}
          <div>
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
                  cursor: 'pointer'
                }}
              >
                ← Back
              </button>
            )}
            {step === 'questions' && currentQuestionIndex === 0 && (
              <button
                onClick={() => { setStep('type'); setQuestionnaire(null); setAnswers({}); }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                ← Change Type
              </button>
            )}
            {step === 'results' && (
              <button
                onClick={() => { setStep('questions'); setCurrentQuestionIndex(questionnaire.questions.length - 1); }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                ← Edit Answers
              </button>
            )}
          </div>

          {/* Next/Add Button */}
          <div>
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
                  fontSize: '16px'
                }}
              >
                {currentQuestionIndex === questionnaire?.questions.length - 1 ? 'Generate Packages →' : 'Next →'}
              </button>
            )}
            {step === 'results' && (
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
                  fontSize: '16px'
                }}
              >
                Add {selectedTier?.toUpperCase() || ''} Package to Quote
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PackageBuilder;
