import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import companyConfig from '../config/companyConfig';
import teletimeLogo from '../assets/teletime-logo.png';

// Feature highlights for the left panel
const FEATURES = [
  {
    title: 'Professional Quotes',
    description: 'Generate branded quotes in seconds'
  },
  {
    title: 'Customer Analytics',
    description: 'Track CLV and engagement metrics'
  },
  {
    title: 'Smart Pricing',
    description: 'AI-powered pricing recommendations'
  },
  {
    title: 'Team Collaboration',
    description: 'Approval workflows built-in'
  }
];

// SVG Icons as components
const MailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [shake, setShake] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get the page user was trying to access, default to /quotes
  const from = location.state?.from?.pathname || '/quotes';

  // Load remembered email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email || !password) {
      setError('Please enter both email and password');
      setLoading(false);
      triggerShake();
      return;
    }

    const result = await login(email, password);

    if (result.success) {
      // Save or clear remembered email
      if (rememberMe) {
        localStorage.setItem('remembered_email', email);
      } else {
        localStorage.removeItem('remembered_email');
      }
      navigate(from, { replace: true });
    } else {
      setError(result.error || 'Login failed. Please check your credentials.');
      triggerShake();
    }

    setLoading(false);
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleForgotPassword = () => {
    alert('Please contact your administrator to reset your password.\n\nEmail: support@' + (companyConfig.name?.toLowerCase().replace(/\s/g, '') || 'company') + '.com');
  };

  // Styles
  const styles = {
    container: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'row',
      background: '#f8fafc'
    },
    leftPanel: {
      flex: '0 0 45%',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '60px 40px',
      position: 'relative',
      overflow: 'hidden'
    },
    leftPanelContent: {
      position: 'relative',
      zIndex: 1,
      maxWidth: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0 20px'
    },
    logoContainer: {
      marginBottom: '40px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    },
    logo: {
      width: '1120px',
      maxWidth: '100%',
      height: 'auto',
      objectFit: 'contain',
      filter: 'drop-shadow(0 12px 48px rgba(59, 130, 246, 0.5))'
    },
    logoFallback: {
      color: 'white',
      fontSize: '48px',
      fontWeight: '700'
    },
    featuresContainer: {
      marginTop: '48px',
      width: '100%',
      maxWidth: '400px'
    },
    featureItem: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '16px',
      marginBottom: '24px'
    },
    featureIcon: {
      width: '24px',
      height: '24px',
      background: '#3b82f6',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      color: 'white'
    },
    featureTitle: {
      color: 'white',
      fontSize: '16px',
      fontWeight: '600',
      margin: '0 0 4px 0'
    },
    featureDescription: {
      color: 'rgba(255, 255, 255, 0.5)',
      fontSize: '14px',
      margin: 0
    },
    copyright: {
      position: 'absolute',
      bottom: '24px',
      left: '40px',
      color: 'rgba(255, 255, 255, 0.4)',
      fontSize: '13px'
    },
    rightPanel: {
      flex: '1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px'
    },
    formContainer: {
      width: '100%',
      maxWidth: '400px',
      animation: shake ? 'shake 0.5s ease-in-out' : 'none'
    },
    formHeader: {
      marginBottom: '32px'
    },
    welcomeText: {
      fontSize: '28px',
      fontWeight: '700',
      color: '#111827',
      margin: '0 0 8px 0'
    },
    subtitleText: {
      fontSize: '15px',
      color: '#6b7280',
      margin: 0
    },
    errorBox: {
      background: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '10px',
      padding: '14px 16px',
      marginBottom: '24px',
      color: '#dc2626',
      fontSize: '14px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    },
    inputGroup: {
      marginBottom: '20px'
    },
    label: {
      display: 'block',
      fontSize: '14px',
      fontWeight: '500',
      color: '#374151',
      marginBottom: '8px'
    },
    inputWrapper: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center'
    },
    inputIcon: {
      position: 'absolute',
      left: '14px',
      color: '#9ca3af',
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    input: {
      width: '100%',
      padding: '14px 14px 14px 48px',
      border: '2px solid #e5e7eb',
      borderRadius: '10px',
      fontSize: '15px',
      boxSizing: 'border-box',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      outline: 'none',
      height: '52px'
    },
    passwordInput: {
      width: '100%',
      padding: '14px 52px 14px 48px',
      border: '2px solid #e5e7eb',
      borderRadius: '10px',
      fontSize: '15px',
      boxSizing: 'border-box',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      outline: 'none',
      height: '52px'
    },
    eyeButton: {
      position: 'absolute',
      right: '14px',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '4px',
      color: '#9ca3af',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'color 0.2s'
    },
    checkboxRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '24px'
    },
    checkboxLabel: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      cursor: 'pointer',
      fontSize: '14px',
      color: '#374151'
    },
    checkbox: {
      width: '20px',
      height: '20px',
      accentColor: '#3b82f6',
      cursor: 'pointer'
    },
    submitButton: {
      width: '100%',
      padding: '16px',
      background: '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '10px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
      boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      height: '54px'
    },
    submitButtonDisabled: {
      background: '#9ca3af',
      cursor: 'not-allowed',
      boxShadow: 'none'
    },
    spinner: {
      width: '20px',
      height: '20px',
      border: '2px solid rgba(255, 255, 255, 0.3)',
      borderTopColor: 'white',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite'
    },
    forgotPassword: {
      textAlign: 'center',
      marginTop: '20px'
    },
    forgotLink: {
      background: 'none',
      border: 'none',
      color: '#3b82f6',
      fontSize: '14px',
      cursor: 'pointer',
      padding: 0,
      textDecoration: 'none',
      transition: 'color 0.2s'
    },
    secureLogin: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      marginTop: '32px',
      color: '#9ca3af',
      fontSize: '13px'
    },
    // Background decoration
    bgCircle1: {
      position: 'absolute',
      width: '400px',
      height: '400px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
      top: '-100px',
      right: '-100px'
    },
    bgCircle2: {
      position: 'absolute',
      width: '300px',
      height: '300px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 70%)',
      bottom: '-50px',
      left: '-50px'
    }
  };

  // Mobile styles (will be applied via media query CSS)
  const mobileStyles = `
    @media (max-width: 900px) {
      .login-container {
        flex-direction: column !important;
      }
      .login-left-panel {
        flex: 0 0 auto !important;
        padding: 40px 24px !important;
        min-height: auto !important;
      }
      .login-logo {
        width: 400px !important;
        max-width: 95% !important;
      }
      .login-features {
        display: none !important;
      }
      .login-copyright {
        display: none !important;
      }
      .login-right-panel {
        padding: 24px !important;
      }
    }

    @media (max-width: 600px) {
      .login-logo {
        width: 320px !important;
        max-width: 95% !important;
      }
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
      20%, 40%, 60%, 80% { transform: translateX(5px); }
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;

  return (
    <>
      <style>{mobileStyles}</style>
      <div className="login-container" style={styles.container}>
        {/* Left Panel - Branding */}
        <div className="login-left-panel" style={styles.leftPanel}>
          {/* Background decorations */}
          <div style={styles.bgCircle1} />
          <div style={styles.bgCircle2} />

          <div style={styles.leftPanelContent}>
            {/* Logo - Full Teletime logo with name and tagline */}
            <div style={styles.logoContainer}>
              <img
                className="login-logo"
                src={teletimeLogo}
                alt="Teletime - TV Electronics Appliances Furniture"
                style={styles.logo}
              />
            </div>

            {/* Features */}
            <div className="login-features" style={styles.featuresContainer}>
              {FEATURES.map((feature, index) => (
                <div key={index} style={styles.featureItem}>
                  <div style={styles.featureIcon}>
                    <CheckIcon />
                  </div>
                  <div>
                    <h3 style={styles.featureTitle}>{feature.title}</h3>
                    <p style={styles.featureDescription}>{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Copyright */}
          <div className="login-copyright" style={styles.copyright}>
            &copy; {new Date().getFullYear()} {companyConfig.legalName || companyConfig.name || 'Company'}. All rights reserved.
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className="login-right-panel" style={styles.rightPanel}>
          <div style={{...styles.formContainer, animation: shake ? 'shake 0.5s ease-in-out' : 'none'}}>
            {/* Header */}
            <div style={styles.formHeader}>
              <h2 style={styles.welcomeText}>Welcome back</h2>
              <p style={styles.subtitleText}>Sign in to your account to continue</p>
            </div>

            {/* Error Message */}
            {error && (
              <div style={styles.errorBox}>
                <span style={{ fontSize: '18px' }}>⚠</span>
                {error}
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit}>
              {/* Email Field */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>Email Address</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.inputIcon}>
                    <MailIcon />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    style={styles.input}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#3b82f6';
                      e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>Password</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.inputIcon}>
                    <LockIcon />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    style={styles.passwordInput}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#3b82f6';
                      e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                    onMouseOver={(e) => e.target.style.color = '#374151'}
                    onMouseOut={(e) => e.target.style.color = '#9ca3af'}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div style={styles.checkboxRow}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={styles.checkbox}
                  />
                  Remember me
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  ...styles.submitButton,
                  ...(loading ? styles.submitButtonDisabled : {})
                }}
                onMouseOver={(e) => {
                  if (!loading) {
                    e.target.style.background = '#2563eb';
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = '0 6px 20px rgba(59, 130, 246, 0.5)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!loading) {
                    e.target.style.background = '#3b82f6';
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 4px 14px rgba(59, 130, 246, 0.4)';
                  }
                }}
              >
                {loading ? (
                  <>
                    <div style={styles.spinner} />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            {/* Forgot Password */}
            <div style={styles.forgotPassword}>
              <button
                type="button"
                onClick={handleForgotPassword}
                style={styles.forgotLink}
                onMouseOver={(e) => e.target.style.color = '#1d4ed8'}
                onMouseOut={(e) => e.target.style.color = '#3b82f6'}
              >
                Forgot your password?
              </button>
            </div>

            {/* Secure Login Indicator */}
            <div style={styles.secureLogin}>
              <ShieldIcon />
              <span>Secure login</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
