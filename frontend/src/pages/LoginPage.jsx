import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import companyConfig from '../config/companyConfig';
import teletimeLogoWhite from '../assets/logos/teletime-logo-white-400.png';

// SVG Icons
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

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  const sessionExpired = location.state?.reason === 'expired';

  const from = location.state?.from?.pathname || '/quotes';

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
    alert('Please contact your administrator to reset your password.\n\nEmail: support@teletime.ca');
  };

  const cssStyles = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
      20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .login-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(145deg, #0a1628 0%, #0f2341 40%, #132f52 70%, #0a1628 100%);
      padding: 24px;
      position: relative;
      overflow: hidden;
    }
    .login-page::before {
      content: '';
      position: absolute;
      top: -30%;
      right: -20%;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(37, 99, 235, 0.08) 0%, transparent 70%);
      pointer-events: none;
    }
    .login-page::after {
      content: '';
      position: absolute;
      bottom: -20%;
      left: -15%;
      width: 500px;
      height: 500px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(6, 182, 212, 0.06) 0%, transparent 70%);
      pointer-events: none;
    }
    .login-brand {
      text-align: center;
      margin-bottom: 36px;
      animation: fadeIn 0.6s ease-out;
      position: relative;
      z-index: 1;
    }
    .login-logo-img {
      width: 320px;
      max-width: 90vw;
      height: auto;
      filter: drop-shadow(0 4px 24px rgba(59, 130, 246, 0.25));
      margin-bottom: 12px;
    }
    .login-tagline {
      color: rgba(148, 163, 184, 0.8);
      font-size: 14px;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .login-card-wrapper {
      width: 100%;
      max-width: 420px;
      position: relative;
      z-index: 1;
      padding: 2px;
      border-radius: 18px;
      background: linear-gradient(135deg, #2563eb, #06b6d4, #2563eb);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: fadeIn 0.6s ease-out 0.1s both;
    }
    .login-card {
      width: 100%;
      background: rgba(255, 255, 255, 0.97);
      border-radius: 16px;
      padding: 40px 36px 36px;
      position: relative;
    }
    .login-card-header {
      text-align: center;
      margin-bottom: 28px;
    }
    .login-card-header h2 {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin: 0 0 6px;
    }
    .login-card-header p {
      font-size: 14px;
      color: #6b7280;
      margin: 0;
    }
    .login-alert {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .login-alert-error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
    }
    .login-alert-warn {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #b45309;
    }
    .login-field {
      margin-bottom: 18px;
    }
    .login-field label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .login-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .login-input-icon {
      position: absolute;
      left: 14px;
      color: #9ca3af;
      pointer-events: none;
      display: flex;
      align-items: center;
    }
    .login-input {
      width: 100%;
      padding: 13px 14px 13px 46px;
      border: 2px solid #e5e7eb;
      border-radius: 10px;
      font-size: 15px;
      box-sizing: border-box;
      transition: border-color 0.2s, box-shadow 0.2s;
      outline: none;
      background: #f9fafb;
      height: 50px;
    }
    .login-input:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      background: #fff;
    }
    .login-input-pw {
      padding-right: 50px;
    }
    .login-eye-btn {
      position: absolute;
      right: 12px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      color: #9ca3af;
      display: flex;
      align-items: center;
      transition: color 0.2s;
    }
    .login-eye-btn:hover {
      color: #374151;
    }
    .login-options {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    .login-remember {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 14px;
      color: #4b5563;
    }
    .login-remember input {
      width: 18px;
      height: 18px;
      accent-color: #3b82f6;
      cursor: pointer;
    }
    .login-forgot {
      background: none;
      border: none;
      color: #3b82f6;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      padding: 0;
      transition: color 0.2s;
    }
    .login-forgot:hover {
      color: #1d4ed8;
    }
    .login-submit {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      height: 52px;
    }
    .login-submit:hover:not(:disabled) {
      background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5);
    }
    .login-submit:active:not(:disabled) {
      transform: translateY(0);
    }
    .login-submit:disabled {
      background: #94a3b8;
      cursor: not-allowed;
      box-shadow: none;
    }
    .login-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .login-secure {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 20px;
      color: #9ca3af;
      font-size: 12px;
    }
    .login-footer {
      text-align: center;
      margin-top: 32px;
      animation: fadeIn 0.6s ease-out 0.2s both;
      position: relative;
      z-index: 1;
    }
    .login-footer-text {
      color: rgba(148, 163, 184, 0.5);
      font-size: 12px;
      margin: 0;
    }
    @media (max-width: 480px) {
      .login-card-wrapper {
        padding: 2px;
      }
      .login-card {
        padding: 32px 24px 28px;
      }
      .login-logo-img {
        width: 260px;
      }
    }
  `;

  return (
    <>
      <style>{cssStyles}</style>
      <div className="login-page">
        {/* Brand / Logo */}
        <div className="login-brand">
          <img
            className="login-logo-img"
            src={teletimeLogoWhite}
            alt="Teletime - TV Electronics Appliances Furniture"
          />
          <p className="login-tagline">Staff Portal</p>
        </div>

        {/* Login Card */}
        <div
          className="login-card-wrapper"
          style={{ animation: shake ? 'shake 0.5s ease-in-out' : undefined }}
        >
        <div className="login-card">
          <div className="login-card-header">
            <h2>Welcome back</h2>
            <p>Sign in to your account</p>
          </div>

          {/* Session Expired */}
          {sessionExpired && (
            <div className="login-alert login-alert-warn">
              <span>&#9888;</span>
              Your session expired. Please log in again.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="login-alert login-alert-error">
              <span>&#9888;</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div className="login-field">
              <label>Email</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><MailIcon /></span>
                <input
                  className="login-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@teletime.ca"
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div className="login-field">
              <label>Password</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><LockIcon /></span>
                <input
                  className="login-input login-input-pw"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* Options row */}
            <div className="login-options">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
              <button
                type="button"
                className="login-forgot"
                onClick={handleForgotPassword}
              >
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="login-submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="login-spinner" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Secure indicator */}
          <div className="login-secure">
            <ShieldIcon />
            <span>Secure encrypted login</span>
          </div>
        </div>
        </div>

        {/* Footer */}
        <div className="login-footer">
          <p className="login-footer-text">
            &copy; {new Date().getFullYear()} {companyConfig.legalName || 'Teletime Inc.'} &middot; {companyConfig.contact?.website || 'www.teletime.ca'}
          </p>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
