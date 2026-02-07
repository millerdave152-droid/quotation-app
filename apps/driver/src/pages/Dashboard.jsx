import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import api from '../api/client';
import { db } from '../lib/db';

export default function Dashboard() {
  const { user } = useAuth();
  const { online } = useApp();
  const [stats, setStats] = useState({ today: 0, completed: 0, remaining: 0 });
  const [nextDelivery, setNextDelivery] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      if (online) {
        const res = await api.get('/api/dispatch/drivers/me/dashboard');
        setStats(res.data.stats || { today: 0, completed: 0, remaining: 0 });
        setNextDelivery(res.data.next_delivery || null);
        // Cache deliveries locally
        if (res.data.deliveries) {
          for (const d of res.data.deliveries) {
            await db.put('deliveries', d);
          }
        }
      } else {
        // Load from IndexedDB
        const today = new Date().toISOString().slice(0, 10);
        const deliveries = await db.getAllFromIndex('deliveries', 'date', today);
        const completed = deliveries.filter(d => d.status === 'delivered').length;
        setStats({ today: deliveries.length, completed, remaining: deliveries.length - completed });
        const pending = deliveries.find(d => d.status !== 'delivered');
        setNextDelivery(pending || null);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    }
  }

  return (
    <div className="p-4">
      <h1 className="mb-1 text-xl font-bold">
        Hey, {user?.name?.split(' ')[0] || 'Driver'}
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        {new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      {/* Stats cards */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label="Today" value={stats.today} color="blue" />
        <StatCard label="Done" value={stats.completed} color="green" />
        <StatCard label="Left" value={stats.remaining} color="amber" />
      </div>

      {/* Next delivery */}
      {nextDelivery ? (
        <Link
          to={`/deliveries/${nextDelivery.id}`}
          className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <p className="mb-1 text-xs font-medium uppercase text-slate-400">Next Delivery</p>
          <p className="font-semibold text-slate-900">{nextDelivery.customer_name}</p>
          <p className="text-sm text-slate-600">{nextDelivery.delivery_address}</p>
          {nextDelivery.scheduled_time && (
            <p className="mt-2 text-sm font-medium text-blue-600">{nextDelivery.scheduled_time}</p>
          )}
        </Link>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
          No upcoming deliveries
        </div>
      )}

      <Link
        to="/deliveries"
        className="mt-4 block rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white"
      >
        View All Deliveries
      </Link>
    </div>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`rounded-xl p-3 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}
