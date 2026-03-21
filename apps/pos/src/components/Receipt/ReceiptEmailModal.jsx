import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function ReceiptEmailModal({
  isOpen,
  onClose,
  initialEmail = '',
  title = 'Email Receipt',
  successLabel = 'Receipt sent',
  sendLabel = 'Send Receipt',
  onSend,
}) {
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEmail(initialEmail || '');
      setSending(false);
      setSuccess('');
      setError('');
    }
  }, [initialEmail, isOpen]);

  if (!isOpen) return null;

  const handleSend = async () => {
    const trimmedEmail = email.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setSending(true);
    setError('');
    try {
      await onSend?.(trimmedEmail);
      setSuccess(`${successLabel} to ${trimmedEmail}`);
      setTimeout(() => {
        onClose?.();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="mb-4 text-lg font-bold text-gray-900">{title}</h3>

        {success ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Mail className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-lg font-semibold text-gray-900">Email Sent</p>
            <p className="text-gray-500">{success}</p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@example.com"
                className="h-12 w-full rounded-lg border-2 border-gray-200 px-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 py-3 text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!email.trim() || sending}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    {sendLabel}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ReceiptEmailModal;
