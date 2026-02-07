import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, isRemembered } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(isRemembered);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!employeeId.trim() || !pin.trim()) {
      setError('Please enter your Employee ID and PIN');
      return;
    }

    setLoading(true);
    try {
      await login(employeeId.trim(), pin, remember);
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-blue-800 to-blue-950 px-6">
      <div className="w-full max-w-sm">
        {/* Logo / branding */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <svg className="h-9 w-9 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25m-2.25 0h-2.25m0 0V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v8.625m9-3.75h3.75" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">TeleTime Driver</h1>
          <p className="mt-1 text-sm text-blue-200">Sign in to start your shift</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-500/20 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-blue-100">
              Employee ID
            </label>
            <input
              type="text"
              inputMode="text"
              autoComplete="username"
              autoCapitalize="characters"
              placeholder="e.g. DRV-001"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-base text-white placeholder-blue-300/50 focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-blue-100">
              PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="Enter your PIN"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-center text-2xl tracking-[0.5em] text-white placeholder-blue-300/50 placeholder:text-base placeholder:tracking-normal focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/40"
            />
          </div>

          {/* Remember device */}
          <label className="flex items-center gap-2.5 py-1">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4.5 w-4.5 rounded border-white/30 bg-white/10 text-blue-400 focus:ring-blue-400/50"
            />
            <span className="text-sm text-blue-200">Remember this device</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-white px-4 py-3.5 text-sm font-bold text-blue-900 shadow-lg hover:bg-blue-50 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-blue-300/60">
          Contact your manager if you need help logging in
        </p>
      </div>
    </div>
  );
}
