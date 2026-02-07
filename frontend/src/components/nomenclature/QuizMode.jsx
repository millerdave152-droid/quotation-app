import { authFetch } from '../../services/authFetch';
/**
 * QuizMode.jsx
 * Quiz/training mode with scoring and progress tracking
 */

import React, { useState, useCallback } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const QuizMode = ({ manufacturer, templates, onQuizComplete }) => {
  // State
  const [quizState, setQuizState] = useState('setup'); // setup, active, results
  const [quizConfig, setQuizConfig] = useState({
    quizType: 'mixed',
    questionCount: 10,
    difficulty: 'medium',
    productType: ''
  });
  const [quiz, setQuiz] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startTime, setStartTime] = useState(null);

  // Generate quiz
  const generateQuiz = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(`${API_BASE}/api/nomenclature/quiz/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...quizConfig,
          manufacturer
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setQuiz(data.data);
          setQuizState('active');
          setCurrentQuestion(0);
          setAnswers({});
          setStartTime(Date.now());
        }
      }
    } catch (err) {
      console.error('Error generating quiz:', err);
    } finally {
      setLoading(false);
    }
  }, [manufacturer, quizConfig]);

  // Submit quiz
  const submitQuiz = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const response = await authFetch(`${API_BASE}/api/nomenclature/quiz/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          quizId: quiz.quizId,
          answers,
          quiz: quiz
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setResults(data.data);
          setQuizState('results');
          if (onQuizComplete) {
            onQuizComplete();
          }
        }
      }
    } catch (err) {
      console.error('Error submitting quiz:', err);
    } finally {
      setLoading(false);
    }
  }, [quiz, answers, onQuizComplete]);

  // Handle answer selection
  const selectAnswer = (questionId, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  // Navigate questions
  const nextQuestion = () => {
    if (currentQuestion < quiz.questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      submitQuiz();
    }
  };

  const prevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  // Get progress
  const getProgress = () => {
    const answered = Object.keys(answers).length;
    return Math.round((answered / (quiz?.questions?.length || 1)) * 100);
  };

  // Render setup screen
  if (quizState === 'setup') {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{
          textAlign: 'center',
          marginBottom: '32px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📝</div>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>
            Start a Quiz
          </h2>
          <p style={{ color: '#6b7280' }}>
            Test your knowledge of {manufacturer} model nomenclature
          </p>
        </div>

        {/* Quiz Configuration */}
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          padding: '24px'
        }}>
          {/* Question Type */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
              Question Type
            </label>
            <select
              value={quizConfig.quizType}
              onChange={(e) => setQuizConfig(prev => ({ ...prev, quizType: e.target.value }))}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: 'white'
              }}
            >
              <option value="mixed">Mixed (All Types)</option>
              <option value="decode">Decode Questions (What does X mean?)</option>
              <option value="identify">Identify Questions (Which segment is?)</option>
              <option value="match">Match Questions (Match codes to meanings)</option>
            </select>
          </div>

          {/* Product Type */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
              Product Type
            </label>
            <select
              value={quizConfig.productType}
              onChange={(e) => setQuizConfig(prev => ({ ...prev, productType: e.target.value }))}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: 'white'
              }}
            >
              <option value="">All Product Types</option>
              {templates.map(t => (
                <option key={t.id} value={t.product_type}>{t.product_type}</option>
              ))}
            </select>
          </div>

          {/* Question Count */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
              Number of Questions
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[5, 10, 15, 20].map(count => (
                <button
                  key={count}
                  onClick={() => setQuizConfig(prev => ({ ...prev, questionCount: count }))}
                  style={{
                    flex: 1,
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: quizConfig.questionCount === count ? '600' : '400',
                    backgroundColor: quizConfig.questionCount === count ? '#4f46e5' : 'white',
                    color: quizConfig.questionCount === count ? 'white' : '#374151',
                    border: '1px solid',
                    borderColor: quizConfig.questionCount === count ? '#4f46e5' : '#e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
              Difficulty
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { value: 'easy', label: 'Easy', desc: 'Common codes only' },
                { value: 'medium', label: 'Medium', desc: 'All codes' },
                { value: 'hard', label: 'Hard', desc: 'Tricky questions' }
              ].map(diff => (
                <button
                  key={diff.value}
                  onClick={() => setQuizConfig(prev => ({ ...prev, difficulty: diff.value }))}
                  style={{
                    flex: 1,
                    padding: '12px 8px',
                    fontSize: '14px',
                    fontWeight: quizConfig.difficulty === diff.value ? '600' : '400',
                    backgroundColor: quizConfig.difficulty === diff.value ? '#4f46e5' : 'white',
                    color: quizConfig.difficulty === diff.value ? 'white' : '#374151',
                    border: '1px solid',
                    borderColor: quizConfig.difficulty === diff.value ? '#4f46e5' : '#e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <div>{diff.label}</div>
                  <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '2px' }}>{diff.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={generateQuiz}
            disabled={loading || templates.length === 0}
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '16px',
              fontWeight: '600',
              backgroundColor: loading ? '#9ca3af' : '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'wait' : 'pointer',
              transition: 'background-color 0.2s ease'
            }}
          >
            {loading ? 'Generating Quiz...' : 'Start Quiz'}
          </button>
        </div>
      </div>
    );
  }

  // Render active quiz
  if (quizState === 'active' && quiz) {
    const question = quiz.questions[currentQuestion];
    const isAnswered = answers[question.id] !== undefined;

    return (
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Progress Bar */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              Question {currentQuestion + 1} of {quiz.questions.length}
            </span>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {getProgress()}% Complete
            </span>
          </div>
          <div style={{
            height: '8px',
            backgroundColor: '#e5e7eb',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${getProgress()}%`,
              backgroundColor: '#4f46e5',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Question Card */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '32px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}>
          {/* Question Type Badge */}
          <div style={{
            display: 'inline-block',
            padding: '4px 12px',
            backgroundColor: '#f3f4f6',
            borderRadius: '16px',
            fontSize: '12px',
            color: '#6b7280',
            marginBottom: '16px',
            textTransform: 'capitalize'
          }}>
            {question.type} Question
          </div>

          {/* Question Text */}
          <h3 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#111827',
            marginBottom: '24px',
            lineHeight: '1.4'
          }}>
            {question.question}
          </h3>

          {/* Model Number Display (if applicable) */}
          {question.modelNumber && (
            <div style={{
              backgroundColor: '#1f2937',
              borderRadius: '8px',
              padding: '16px 24px',
              marginBottom: '24px',
              textAlign: 'center'
            }}>
              <span style={{
                fontFamily: 'monospace',
                fontSize: '28px',
                fontWeight: '700',
                color: 'white',
                letterSpacing: '4px'
              }}>
                {question.modelNumber}
              </span>
            </div>
          )}

          {/* Answer Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {question.options.map((option, idx) => {
              const isSelected = answers[question.id] === option;
              return (
                <button
                  key={idx}
                  onClick={() => selectAnswer(question.id, option)}
                  style={{
                    padding: '16px 20px',
                    fontSize: '15px',
                    textAlign: 'left',
                    backgroundColor: isSelected ? '#eef2ff' : 'white',
                    color: '#374151',
                    border: '2px solid',
                    borderColor: isSelected ? '#4f46e5' : '#e5e7eb',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: isSelected ? '#4f46e5' : '#f3f4f6',
                    color: isSelected ? 'white' : '#6b7280',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '600',
                    fontSize: '13px'
                  }}>
                    {String.fromCharCode(65 + idx)}
                  </div>
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        {/* Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            onClick={prevQuestion}
            disabled={currentQuestion === 0}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: 'white',
              color: currentQuestion === 0 ? '#9ca3af' : '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              cursor: currentQuestion === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            Previous
          </button>

          <div style={{ display: 'flex', gap: '6px' }}>
            {quiz.questions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentQuestion(idx)}
                style={{
                  width: '32px',
                  height: '32px',
                  fontSize: '12px',
                  fontWeight: answers[quiz.questions[idx].id] ? '600' : '400',
                  backgroundColor: idx === currentQuestion ? '#4f46e5' : answers[quiz.questions[idx].id] ? '#d1fae5' : '#f3f4f6',
                  color: idx === currentQuestion ? 'white' : answers[quiz.questions[idx].id] ? '#059669' : '#6b7280',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          <button
            onClick={nextQuestion}
            disabled={!isAnswered || loading}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              backgroundColor: !isAnswered ? '#9ca3af' : '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: !isAnswered ? 'not-allowed' : 'pointer'
            }}
          >
            {currentQuestion === quiz.questions.length - 1 ? (loading ? 'Submitting...' : 'Submit Quiz') : 'Next'}
          </button>
        </div>
      </div>
    );
  }

  // Render results
  if (quizState === 'results' && results) {
    const scoreColor = results.score >= 80 ? '#059669' : results.score >= 60 ? '#d97706' : '#dc2626';
    const elapsedTime = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;

    return (
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        {/* Score Card */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '40px',
          textAlign: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}>
          <div style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            backgroundColor: `${scoreColor}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            border: `4px solid ${scoreColor}`
          }}>
            <div>
              <div style={{ fontSize: '40px', fontWeight: '700', color: scoreColor }}>
                {Math.round(results.score)}%
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginBottom: '8px' }}>
            {results.score >= 90 ? 'Excellent!' :
             results.score >= 80 ? 'Great Job!' :
             results.score >= 60 ? 'Good Effort!' :
             'Keep Practicing!'}
          </h2>

          <p style={{ color: '#6b7280', marginBottom: '24px' }}>
            You got {results.correct} out of {results.total} questions correct
          </p>

          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '32px',
            paddingTop: '24px',
            borderTop: '1px solid #e5e7eb'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: '600', color: '#059669' }}>
                {results.correct}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Correct</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: '600', color: '#dc2626' }}>
                {results.incorrect}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Incorrect</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: '600', color: '#6b7280' }}>
                {minutes}:{seconds.toString().padStart(2, '0')}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Time</div>
            </div>
          </div>
        </div>

        {/* Question Review */}
        {results.details && results.details.length > 0 && (
          <div style={{
            backgroundColor: '#f9fafb',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
              Question Review
            </h3>
            {results.details.map((detail, idx) => (
              <div
                key={idx}
                style={{
                  padding: '16px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  marginBottom: idx < results.details.length - 1 ? '12px' : 0,
                  borderLeft: `4px solid ${detail.correct ? '#059669' : '#dc2626'}`
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '8px'
                }}>
                  <div style={{ fontWeight: '500', color: '#374151', fontSize: '14px' }}>
                    Q{idx + 1}: {detail.question}
                  </div>
                  <span style={{
                    fontSize: '16px'
                  }}>
                    {detail.correct ? '✓' : '✗'}
                  </span>
                </div>
                <div style={{ fontSize: '13px' }}>
                  <span style={{ color: '#6b7280' }}>Your answer: </span>
                  <span style={{ color: detail.correct ? '#059669' : '#dc2626', fontWeight: '500' }}>
                    {detail.userAnswer}
                  </span>
                  {!detail.correct && (
                    <>
                      <span style={{ color: '#6b7280' }}> • Correct: </span>
                      <span style={{ color: '#059669', fontWeight: '500' }}>
                        {detail.correctAnswer}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={() => {
              setQuizState('setup');
              setQuiz(null);
              setResults(null);
            }}
            style={{
              padding: '14px 28px',
              fontSize: '14px',
              fontWeight: '600',
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Take Another Quiz
          </button>
          <button
            onClick={() => {
              setQuiz(null);
              setResults(null);
              generateQuiz();
            }}
            style={{
              padding: '14px 28px',
              fontSize: '14px',
              fontWeight: '500',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Retry Same Quiz
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default QuizMode;
