/**
 * TeleTime POS - Batch Email Settings
 * Admin settings for scheduled/automatic batch email sending
 */

import { useState, useEffect, useCallback } from 'react';
import {
  EnvelopeIcon,
  ClockIcon,
  Cog6ToothIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  BeakerIcon,
  BellIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';

/**
 * Toggle Switch Component
 */
function Toggle({ enabled, onChange, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
        ${enabled ? 'bg-blue-600' : 'bg-gray-200'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform
          ${enabled ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
}

/**
 * Section Header
 */
function SectionHeader({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="p-2 bg-blue-100 rounded-lg">
        <Icon className="w-5 h-5 text-blue-600" />
      </div>
      <div>
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </div>
  );
}

/**
 * Form Field
 */
function FormField({ label, description, children, error }) {
  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">{label}</label>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
        <div className="ml-4">{children}</div>
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

/**
 * Batch Email Settings Component
 */
export default function BatchEmailSettings() {
  // State
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Test state
  const [testEmail, setTestEmail] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Load settings
  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await api.get('/batch-email-settings');
      setSettings(response.data.data || response.data);
    } catch (err) {
      console.error('[BatchEmailSettings] Load error:', err);
      setError(err.message || 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Save settings
  const saveSettings = useCallback(async (updates) => {
    try {
      setIsSaving(true);
      setError(null);

      const response = await api.put('/batch-email-settings', updates);
      setSettings(response.data.data || response.data);

      setSuccessMessage('Settings saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('[BatchEmailSettings] Save error:', err);
      setError(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Update single setting
  const updateSetting = useCallback((key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings({ [key]: value });
  }, [settings, saveSettings]);

  // Send test email
  const handleTestEmail = useCallback(async () => {
    if (!testEmail) return;

    try {
      setIsTesting(true);
      setTestResult(null);

      await api.post('/batch-email-settings/test', { email: testEmail });

      setTestResult({ success: true, message: `Test email sent to ${testEmail}` });
    } catch (err) {
      console.error('[BatchEmailSettings] Test error:', err);
      setTestResult({ success: false, message: err.message || 'Failed to send test email' });
    } finally {
      setIsTesting(false);
    }
  }, [testEmail]);

  // Test batch (dry run)
  const handleTestBatch = useCallback(async () => {
    try {
      setIsTesting(true);
      setTestResult(null);

      const response = await api.post('/batch-email-settings/test-batch', {});

      setTestResult({
        success: true,
        message: response.data.data?.message || `${response.data.data?.unsentCount || 0} receipts would be sent`,
      });
    } catch (err) {
      console.error('[BatchEmailSettings] Test batch error:', err);
      setTestResult({ success: false, message: err.message || 'Failed to test batch' });
    } finally {
      setIsTesting(false);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-12">
        <ExclamationTriangleIcon className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <p className="text-gray-600">Failed to load settings</p>
        <button
          onClick={loadSettings}
          className="mt-4 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Batch Email Settings</h2>
          <p className="text-sm text-gray-500">
            Configure automatic receipt email sending
          </p>
        </div>
        {isSaving && (
          <div className="flex items-center gap-2 text-blue-600">
            <ArrowPathIcon className="w-4 h-4 animate-spin" />
            <span className="text-sm">Saving...</span>
          </div>
        )}
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircleIcon className="w-5 h-5 text-green-500" />
          <span className="text-green-700">{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Auto-Send Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SectionHeader
          icon={EnvelopeIcon}
          title="Automatic Sending"
          description="Enable automatic batch sending of receipt emails"
        />

        <div className="space-y-1">
          <FormField
            label="Enable Auto-Send"
            description="Automatically send receipt emails at shift end or scheduled time"
          >
            <Toggle
              enabled={settings.auto_send_enabled}
              onChange={(value) => updateSetting('auto_send_enabled', value)}
            />
          </FormField>

          {settings.auto_send_enabled && (
            <>
              <FormField
                label="Trigger"
                description="When to send batch emails"
              >
                <select
                  value={settings.send_trigger}
                  onChange={(e) => updateSetting('send_trigger', e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="shift_end">At Shift End</option>
                  <option value="scheduled_time">At Scheduled Time</option>
                </select>
              </FormField>

              {settings.send_trigger === 'scheduled_time' && (
                <FormField
                  label="Scheduled Time"
                  description="Daily time to send batch emails"
                >
                  <input
                    type="time"
                    value={settings.scheduled_time?.substring(0, 5) || '18:00'}
                    onChange={(e) => updateSetting('scheduled_time', e.target.value + ':00')}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </FormField>
              )}

              <FormField
                label="Current Shift Only"
                description="Only include orders from the current/closing shift"
              >
                <Toggle
                  enabled={settings.include_current_shift_only}
                  onChange={(value) => updateSetting('include_current_shift_only', value)}
                />
              </FormField>
            </>
          )}
        </div>
      </div>

      {/* Email Customization */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SectionHeader
          icon={Cog6ToothIcon}
          title="Email Customization"
          description="Customize receipt email content"
        />

        <div className="space-y-1">
          <FormField
            label="Subject Template"
            description="Variables: {{business_name}}, {{order_number}}, {{customer_name}}"
          >
            <input
              type="text"
              value={settings.email_subject_template || ''}
              onChange={(e) => updateSetting('email_subject_template', e.target.value)}
              placeholder="Your Receipt from {{business_name}}"
              className="w-64 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
        </div>
      </div>

      {/* Manager Notifications */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SectionHeader
          icon={BellIcon}
          title="Manager Notifications"
          description="Send summary and alert emails to managers"
        />

        <div className="space-y-1">
          <FormField
            label="Send Summary Email"
            description="Email batch summary to manager after each run"
          >
            <Toggle
              enabled={settings.send_manager_summary}
              onChange={(value) => updateSetting('send_manager_summary', value)}
            />
          </FormField>

          {settings.send_manager_summary && (
            <FormField
              label="Manager Email"
              description="Email address for batch summaries"
            >
              <input
                type="email"
                value={settings.manager_email || ''}
                onChange={(e) => updateSetting('manager_email', e.target.value)}
                placeholder="manager@example.com"
                className="w-64 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </FormField>
          )}

          <FormField
            label="Alert on Failures"
            description="CC manager when batch has failed emails"
          >
            <Toggle
              enabled={settings.cc_manager_on_failures}
              onChange={(value) => updateSetting('cc_manager_on_failures', value)}
            />
          </FormField>
        </div>
      </div>

      {/* Rate Limiting */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SectionHeader
          icon={ClockIcon}
          title="Rate Limiting"
          description="Control email sending speed and limits"
        />

        <div className="space-y-1">
          <FormField
            label="Max Emails per Batch"
            description="Maximum number of emails to send in one batch"
          >
            <input
              type="number"
              min="1"
              max="100"
              value={settings.max_emails_per_batch || 50}
              onChange={(e) => updateSetting('max_emails_per_batch', parseInt(e.target.value, 10))}
              className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <FormField
            label="Send Delay (ms)"
            description="Delay between sending each email"
          >
            <input
              type="number"
              min="100"
              max="5000"
              step="100"
              value={settings.send_delay_ms || 1000}
              onChange={(e) => updateSetting('send_delay_ms', parseInt(e.target.value, 10))}
              className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <FormField
            label="Max Retries"
            description="Number of retry attempts for failed emails"
          >
            <input
              type="number"
              min="0"
              max="5"
              value={settings.max_retries || 3}
              onChange={(e) => updateSetting('max_retries', parseInt(e.target.value, 10))}
              className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
        </div>
      </div>

      {/* Testing Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <SectionHeader
          icon={BeakerIcon}
          title="Testing"
          description="Test your email configuration"
        />

        {/* Test Result */}
        {testResult && (
          <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
            testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {testResult.success ? (
              <CheckCircleIcon className="w-5 h-5" />
            ) : (
              <ExclamationTriangleIcon className="w-5 h-5" />
            )}
            <span className="text-sm">{testResult.message}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Test Email */}
          <div className="flex items-center gap-3">
            <input
              type="email"
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleTestEmail}
              disabled={isTesting || !testEmail}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isTesting ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <PaperAirplaneIcon className="w-4 h-4" />
              )}
              Send Test
            </button>
          </div>

          {/* Test Batch */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700">Test Batch (Dry Run)</p>
              <p className="text-xs text-gray-500">Check how many receipts would be sent</p>
            </div>
            <button
              onClick={handleTestBatch}
              disabled={isTesting}
              className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isTesting ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <BeakerIcon className="w-4 h-4" />
              )}
              Test Batch
            </button>
          </div>
        </div>
      </div>

      {/* Info Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <EnvelopeIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-medium">How it works</p>
            <ul className="mt-1 list-disc list-inside space-y-1 text-blue-600">
              <li><strong>Shift End:</strong> Automatically sends all unsent receipts when a shift is closed</li>
              <li><strong>Scheduled Time:</strong> Runs daily at the specified time for all completed shifts</li>
              <li>Only transactions with customer emails are included</li>
              <li>Already-sent receipts are automatically skipped</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
