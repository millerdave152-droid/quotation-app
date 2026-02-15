/**
 * TeleTime POS - Change Password Modal
 * Allows any user to change their password from the POS header menu.
 */

import { useState, useEffect, useRef } from 'react';
import { XMarkIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';

const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { key: 'lower', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { key: 'number', label: 'One number', test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'One special character', test: (v) => /[!@#$%^&*(),.?":{}|<>]/.test(v) },
];

export function ChangePasswordModal({ isOpen, onClose }) {
  const { changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const currentRef = useRef(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setError('');
      setSuccess(false);
      setSubmitting(false);
      setTimeout(() => currentRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Auto-close and logout after success
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        onClose();
        logout();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [success, onClose, logout]);

  const rulesPass = PASSWORD_RULES.map((rule) => ({
    ...rule,
    passed: rule.test(newPassword),
  }));

  const allRulesPass = rulesPass.every((r) => r.passed);
  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const canSubmit = currentPassword && allRulesPass && passwordsMatch && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setSubmitting(true);

    const result = await changePassword(currentPassword, newPassword, confirmPassword);

    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error || 'Failed to change password');
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Change Password</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-6 text-center">
            <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-gray-900 mb-1">Password Changed</p>
            <p className="text-sm text-gray-500">You will be signed out in a moment...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Current Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <div className="relative">
                <input
                  ref={currentRef}
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  placeholder="Enter new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showNew ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>

              {/* Password Rules Checklist */}
              {newPassword && (
                <ul className="mt-2 space-y-1">
                  {rulesPass.map((rule) => (
                    <li key={rule.key} className="flex items-center gap-2 text-xs">
                      {rule.passed ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircleIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      )}
                      <span className={rule.passed ? 'text-green-700' : 'text-gray-500'}>
                        {rule.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full px-4 py-2.5 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 ${
                    confirmPassword
                      ? passwordsMatch
                        ? 'border-green-400'
                        : 'border-red-400'
                      : 'border-gray-300'
                  }`}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
