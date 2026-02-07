import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { db } from '../lib/db';
import { processSyncQueue } from '../utils/syncManager';
import { useState } from 'react';

export default function Settings() {
  const { user, logout } = useAuth();
  const { online, showToast } = useApp();
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(null);

  async function handleSync() {
    setSyncing(true);
    try {
      const synced = await processSyncQueue();
      showToast(`Synced ${synced} item(s)`, 'success');
    } catch (err) {
      showToast('Sync failed: ' + err.message, 'error');
    } finally {
      setSyncing(false);
    }
  }

  async function checkPending() {
    const count = await db.count('syncQueue');
    setPendingCount(count);
  }

  return (
    <div className="p-4">
      <h1 className="mb-6 text-xl font-bold">Settings</h1>

      {/* Profile */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
        <p className="text-sm text-slate-500">{user?.email}</p>
        <p className="mt-1 text-xs text-slate-400">
          Status: {online ? 'Online' : 'Offline'}
        </p>
      </div>

      {/* Sync */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-900">Offline Sync</p>
        <div className="flex gap-2">
          <button
            onClick={checkPending}
            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700"
          >
            Check Pending
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || !online}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
        {pendingCount !== null && (
          <p className="mt-2 text-xs text-slate-500">{pendingCount} action(s) pending</p>
        )}
      </div>

      {/* Clear cache */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-slate-900">Cache</p>
        <button
          onClick={async () => {
            await db.clear('deliveries');
            showToast('Local cache cleared', 'success');
          }}
          className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700"
        >
          Clear Delivery Cache
        </button>
      </div>

      <button
        onClick={logout}
        className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600"
      >
        Sign Out
      </button>
    </div>
  );
}
