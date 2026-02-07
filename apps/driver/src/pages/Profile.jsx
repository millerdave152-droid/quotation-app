import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import api from '../api/client';
import ClockInModal from '../components/ClockInModal';
import ClockOutModal from '../components/ClockOutModal';
import PostTripInspection from '../components/PostTripInspection';

export default function Profile() {
  const { user, logout } = useAuth();
  const { online, showToast } = useApp();
  const [shift, setShift] = useState(null);
  const [stats, setStats] = useState({ total: 0, completed: 0, remaining: 0 });
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showClockIn, setShowClockIn] = useState(false);
  const [showInspection, setShowInspection] = useState(false);
  const [inspectionData, setInspectionData] = useState(null);
  const [showClockOut, setShowClockOut] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [profileRes, shiftRes] = await Promise.all([
        api.get('/api/driver/me'),
        api.get('/api/driver/me/shift/today'),
      ]);
      setVehicle(profileRes.data.vehicle || null);
      setShift(shiftRes.data.shift || null);
      setStats(shiftRes.data.stats || { total: 0, completed: 0, remaining: 0 });
    } catch (err) {
      console.error('Failed to load profile data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const shiftStatus = shift?.status || 'none';

  function handleClockInComplete(newShift) {
    setShift(newShift);
    setShowClockIn(false);
    showToast('Clocked in successfully', 'success');
    loadData();
  }

  function handleInspectionComplete(data) {
    setInspectionData(data);
    setShowInspection(false);
    setShowClockOut(true);
  }

  function handleClockOutComplete(newShift) {
    setShift(newShift);
    setShowClockOut(false);
    setInspectionData(null);
    showToast('Clocked out — have a good evening!', 'success');
    loadData();
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <div className="p-4">
      {/* Driver header */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-600">
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            (user?.name || 'D').charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{user?.name}</h1>
          <p className="text-sm text-slate-500">{user?.employee_id}</p>
        </div>
      </div>

      {/* Shift status card */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium uppercase text-slate-400">Today's Shift</p>
          <ShiftBadge status={shiftStatus} />
        </div>

        {shiftStatus === 'started' && shift && (
          <div className="mb-3 space-y-1 text-sm text-slate-600">
            <p>Started: {new Date(shift.actual_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            {shift.vehicle_name && (
              <p>Vehicle: {shift.vehicle_name} ({shift.license_plate || shift.plate_number})</p>
            )}
            {shift.start_odometer && <p>Start odometer: {shift.start_odometer.toLocaleString()} km</p>}
          </div>
        )}

        {shiftStatus === 'completed' && shift && (
          <div className="mb-3 space-y-1 text-sm text-slate-600">
            <p>
              {new Date(shift.actual_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {' — '}
              {new Date(shift.actual_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {shift.total_distance_km != null && <p>Distance: {shift.total_distance_km} km</p>}
            <p>Deliveries: {shift.total_deliveries}</p>
          </div>
        )}

        {/* Clock in / out buttons */}
        {(shiftStatus === 'none' || shiftStatus === 'scheduled') && (
          <button
            onClick={() => setShowClockIn(true)}
            disabled={!online}
            className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Clock In
          </button>
        )}

        {shiftStatus === 'started' && (
          <button
            onClick={() => setShowInspection(true)}
            disabled={!online}
            className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Clock Out
          </button>
        )}
      </div>

      {/* Today's stats */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Assigned" value={stats.total} color="blue" />
        <StatCard label="Done" value={stats.completed} color="green" />
        <StatCard label="Left" value={stats.remaining} color="amber" />
      </div>

      {/* Vehicle info */}
      {vehicle && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase text-slate-400">Assigned Vehicle</p>
          <p className="font-semibold text-slate-900">{vehicle.name}</p>
          <p className="text-sm text-slate-500">
            {vehicle.license_plate || vehicle.plate_number} — {vehicle.vehicle_type}
          </p>
          <div className="mt-2 flex gap-3 text-xs text-slate-500">
            {vehicle.has_lift_gate && <span className="rounded bg-slate-100 px-2 py-0.5">Lift gate</span>}
            {vehicle.has_blankets && <span className="rounded bg-slate-100 px-2 py-0.5">Blankets</span>}
          </div>
        </div>
      )}

      {/* Sign out */}
      <button
        onClick={logout}
        className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600"
      >
        Sign Out
      </button>

      {/* Modals */}
      {showClockIn && (
        <ClockInModal
          onComplete={handleClockInComplete}
          onClose={() => setShowClockIn(false)}
        />
      )}
      {showInspection && (
        <PostTripInspection
          shift={shift}
          stats={stats}
          onComplete={handleInspectionComplete}
          onClose={() => setShowInspection(false)}
        />
      )}
      {showClockOut && (
        <ClockOutModal
          shift={shift}
          stats={stats}
          inspectionData={inspectionData}
          onComplete={handleClockOutComplete}
          onClose={() => setShowClockOut(false)}
        />
      )}
    </div>
  );
}

function ShiftBadge({ status }) {
  const map = {
    none: { label: 'Not Started', cls: 'bg-slate-100 text-slate-600' },
    scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700' },
    started: { label: 'In Progress', cls: 'bg-green-100 text-green-700' },
    on_break: { label: 'On Break', cls: 'bg-amber-100 text-amber-700' },
    completed: { label: 'Completed', cls: 'bg-slate-100 text-slate-600' },
  };
  const { label, cls } = map[status] || map.none;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
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
