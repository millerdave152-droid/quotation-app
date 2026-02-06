/**
 * TeleTime POS - Communication Preferences Component
 * CASL-compliant explicit opt-in checkboxes for email and SMS communications
 */

/**
 * @param {object} props
 * @param {object} props.value - { emailTransactional, emailMarketing, smsTransactional, smsMarketing }
 * @param {function} props.onChange - Callback with updated preferences object
 * @param {boolean} props.hasEmail - Whether the customer has an email address
 * @param {boolean} props.hasPhone - Whether the customer has a phone number
 * @param {string} props.className - Additional classes
 */
export function CommunicationPreferences({ value, onChange, hasEmail, hasPhone, className = '' }) {
  const handleChange = (field) => (e) => {
    onChange({ ...value, [field]: e.target.checked });
  };

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Communication Preferences
      </label>
      <p className="text-xs text-gray-400 mb-3">
        Canadian Anti-Spam Law (CASL) requires explicit consent for commercial messages.
      </p>

      <div className="space-y-3">
        {/* Email Transactional */}
        <label className={`flex items-start gap-3 cursor-pointer ${!hasEmail ? 'opacity-40 pointer-events-none' : ''}`}>
          <input
            type="checkbox"
            checked={value.emailTransactional}
            onChange={handleChange('emailTransactional')}
            disabled={!hasEmail}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-gray-800">Receive order updates and receipts by email</span>
            {!hasEmail && <span className="block text-xs text-gray-400">Requires email address</span>}
          </div>
        </label>

        {/* Email Marketing */}
        <label className={`flex items-start gap-3 cursor-pointer ${!hasEmail ? 'opacity-40 pointer-events-none' : ''}`}>
          <input
            type="checkbox"
            checked={value.emailMarketing}
            onChange={handleChange('emailMarketing')}
            disabled={!hasEmail}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-gray-800">Receive promotions and deals by email</span>
            {!hasEmail && <span className="block text-xs text-gray-400">Requires email address</span>}
          </div>
        </label>

        {/* SMS Transactional */}
        <label className={`flex items-start gap-3 cursor-pointer ${!hasPhone ? 'opacity-40 pointer-events-none' : ''}`}>
          <input
            type="checkbox"
            checked={value.smsTransactional}
            onChange={handleChange('smsTransactional')}
            disabled={!hasPhone}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-gray-800">Receive order updates by text message</span>
            {!hasPhone && <span className="block text-xs text-gray-400">Requires phone number</span>}
          </div>
        </label>

        {/* SMS Marketing */}
        <label className={`flex items-start gap-3 cursor-pointer ${!hasPhone ? 'opacity-40 pointer-events-none' : ''}`}>
          <input
            type="checkbox"
            checked={value.smsMarketing}
            onChange={handleChange('smsMarketing')}
            disabled={!hasPhone}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-gray-800">Receive promotions and deals by text</span>
            {!hasPhone && <span className="block text-xs text-gray-400">Requires phone number</span>}
          </div>
        </label>
      </div>
    </div>
  );
}

export default CommunicationPreferences;
