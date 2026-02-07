import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import api from '../api/client';
import { db } from '../lib/db';

const STATUS_BADGES = {
  assigned: 'bg-slate-100 text-slate-700',
  en_route: 'bg-blue-100 text-blue-700',
  arrived: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function DeliveryList() {
  const { online } = useApp();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');

  useEffect(() => {
    loadDeliveries();
  }, [filter]);

  async function loadDeliveries() {
    setLoading(true);
    try {
      if (online) {
        const res = await api.get(`/api/dispatch/drivers/me/deliveries?filter=${filter}`);
        const list = res.data.deliveries || res.data || [];
        setDeliveries(list);
        for (const d of list) await db.put('deliveries', d);
      } else {
        const all = await db.getAll('deliveries');
        if (filter === 'active') {
          setDeliveries(all.filter(d => d.status !== 'delivered' && d.status !== 'failed'));
        } else {
          setDeliveries(all);
        }
      }
    } catch (err) {
      console.error('Failed to load deliveries:', err);
      const all = await db.getAll('deliveries');
      setDeliveries(all);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold">Deliveries</h1>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2">
        {['active', 'all'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading...</div>
      ) : deliveries.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No deliveries found</div>
      ) : (
        <div className="space-y-3">
          {deliveries.map((d) => (
            <Link
              key={d.id}
              to={`/deliveries/${d.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-slate-900">{d.customer_name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[d.status] || 'bg-slate-100'}`}>
                  {(d.status || '').replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-slate-600">{d.delivery_address}</p>
              {d.scheduled_time && (
                <p className="mt-1 text-xs text-slate-400">{d.scheduled_time}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
