import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import api from '../api/client';
import { db } from '../lib/db';
import { queueAction } from '../utils/syncManager';
import NavigationButton from '../components/NavigationButton';
import ArrivalConfirmation from '../components/ArrivalConfirmation';
import DeliveryStartChecklist from '../components/DeliveryStartChecklist';
import { getCurrentPosition } from '../utils/gps';
import PhotoCapture from '../components/PhotoCapture';
import PhotoGallery from '../components/PhotoGallery';
import DeliveryCompletionScreen from '../components/DeliveryCompletionScreen';
import DeliveryOutcomeSelector from '../components/DeliveryOutcomeSelector';
import PartialDeliveryModal from '../components/PartialDeliveryModal';
import RefusedDeliveryModal from '../components/RefusedDeliveryModal';
import NoAccessModal from '../components/NoAccessModal';
import RescheduleModal from '../components/RescheduleModal';
import ProblemReportModal from '../components/ProblemReportModal';

const STATUS_FLOW = ['pending', 'confirmed', 'in_transit', 'arrived', 'in_progress', 'delivered'];

export default function DeliveryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { online, showToast } = useApp();
  const [delivery, setDelivery] = useState(null);
  const [items, setItems] = useState([]);
  const [previousAttempts, setPreviousAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [showArrival, setShowArrival] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [showOutcomeSelector, setShowOutcomeSelector] = useState(false);
  const [outcomeModal, setOutcomeModal] = useState(null); // 'partial' | 'refused' | 'no_access' | 'no_one_home' | 'wrong_address' | 'damaged' | 'reschedule'
  const [showProblemReport, setShowProblemReport] = useState(false);

  const loadDelivery = useCallback(async () => {
    setLoading(true);
    try {
      if (online) {
        const res = await api.get(`/api/driver/deliveries/${id}`);
        setDelivery(res.data.delivery);
        setItems(res.data.items || []);
        setPreviousAttempts(res.data.previousAttempts || []);
        await db.put('deliveries', { id: Number(id), ...res.data.delivery, items: res.data.items });
      } else {
        const cached = await db.get('deliveries', Number(id));
        if (cached) {
          setDelivery(cached);
          setItems(cached.items || []);
        }
      }
    } catch {
      const cached = await db.get('deliveries', Number(id));
      if (cached) {
        setDelivery(cached);
        setItems(cached.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [id, online]);

  useEffect(() => { loadDelivery(); }, [loadDelivery]);

  // ---- Arrival ----
  async function handleArrivalConfirm(payload) {
    try {
      if (online) {
        await api.post(`/api/driver/deliveries/${id}/arrived`, payload);
      } else {
        await queueAction({ type: 'status_update', deliveryId: id, status: 'arrived', ...payload });
      }
      setDelivery(prev => ({ ...prev, status: 'arrived' }));
      setShowArrival(false);
      showToast('Arrival confirmed', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to confirm arrival', 'error');
      throw err;
    }
  }

  // ---- Begin delivery (pre-delivery checklist) ----
  async function handleDeliveryStart(payload) {
    try {
      if (online) {
        await api.post(`/api/driver/deliveries/${id}/start`, payload);
      } else {
        await queueAction({ type: 'status_update', deliveryId: id, status: 'in_progress', ...payload });
      }
      setDelivery(prev => ({ ...prev, status: 'in_progress' }));
      setShowChecklist(false);
      showToast('Delivery started', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to start delivery', 'error');
      throw err;
    }
  }

  // ---- Photo management (in_progress phase) ----
  function handlePhotoCapture(photo) {
    setPhotos(prev => [...prev, photo]);
    setShowCamera(false);
    db.put('photos', { ...photo, deliveryId: Number(id) }).catch(() => {});
  }

  function handlePhotoDelete(photoId) {
    setPhotos(prev => prev.filter(p => p.id !== photoId));
    db.delete('photos', photoId).catch(() => {});
  }

  function handleTagPhoto(photoId, tag) {
    setPhotos(prev => prev.map(p => {
      if (p.id === photoId) return { ...p, tag };
      if (p.tag === tag && tag !== 'damage') return { ...p, tag: undefined };
      return p;
    }));
  }

  // ---- Completion workflow submit ----
  async function handleCompletionSubmit(payload) {
    let lat, lng;
    try {
      const pos = await getCurrentPosition();
      lat = pos.latitude;
      lng = pos.longitude;
    } catch { /* continue without GPS */ }

    const body = {
      completed_at: payload.completed_at,
      completion_type: payload.completion_type,
      latitude: lat,
      longitude: lng,
      signature_image: payload.signature?.image || null,
      signer_name: payload.signature?.signer_name || null,
      relationship: payload.signature?.relationship || null,
      signed_at: payload.signature?.signed_at || null,
      photos: payload.photos,
      checklist: payload.checklist,
      notes: payload.notes,
    };

    if (online) {
      const res = await api.post(`/api/driver/deliveries/${id}/complete`, body);
      setDelivery(prev => ({ ...prev, status: 'delivered' }));
      // Clean up cached photos
      for (const p of photos) {
        db.delete('photos', p.id).catch(() => {});
      }
      return res.data;
    } else {
      await queueAction({ type: 'status_update', deliveryId: id, status: 'delivered', ...body });
      setDelivery(prev => ({ ...prev, status: 'delivered' }));
      return {};
    }
  }

  // ---- Outcome selection ----
  function handleOutcomeSelect(outcome) {
    setShowOutcomeSelector(false);
    if (outcome === 'delivered') {
      // Go straight to the full completion flow
      setShowCompletion(true);
      return;
    }
    // For partial, also route through completion screen (it has photo/sig steps)
    if (outcome === 'partial') {
      setOutcomeModal('partial');
      return;
    }
    // Other outcomes open their specific modal
    setOutcomeModal(outcome);
  }

  async function handleOutcomeSubmit(outcome, data) {
    setOutcomeModal(null);
    setActionLoading('outcome');
    try {
      let lat, lng;
      try {
        const pos = await getCurrentPosition();
        lat = pos.latitude;
        lng = pos.longitude;
      } catch { /* continue without GPS */ }

      const body = {
        completed_at: new Date().toISOString(),
        completion_type: outcome,
        latitude: lat,
        longitude: lng,
        photos: photos.map(p => ({ data: p.data, caption: p.caption, tag: p.tag, timestamp: p.timestamp })),
        notes: data.notes,
        outcome_details: data,
      };

      if (online) {
        await api.post(`/api/driver/deliveries/${id}/complete`, body);
      } else {
        await queueAction({ type: 'status_update', deliveryId: id, status: 'failed', ...body });
      }

      const newStatus = ['refused', 'no_access', 'no_one_home', 'wrong_address', 'damaged'].includes(outcome)
        ? 'failed' : outcome === 'reschedule' ? 'pending' : 'delivered';
      setDelivery(prev => ({ ...prev, status: newStatus }));
      showToast(`Delivery marked as ${outcome.replace('_', ' ')}`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to submit outcome', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  // ---- Problem/issue report ----
  async function handleProblemSubmit(payload) {
    const res = await api.post('/api/driver/issues', payload);
    return res.data;
  }

  // ---- Generic status update (start driving, report problem) ----
  async function handleStatusUpdate(newStatus) {
    setActionLoading(newStatus);
    try {
      let lat, lng;
      try {
        const pos = await getCurrentPosition();
        lat = pos.latitude;
        lng = pos.longitude;
      } catch { /* continue without GPS */ }
      await queueAction({ type: 'status_update', deliveryId: id, status: newStatus, latitude: lat, longitude: lng });
      setDelivery(prev => ({ ...prev, status: newStatus }));
      showToast(`Status updated to ${newStatus.replace('_', ' ')}`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  // ---- Send ETA ----
  async function handleSendETA() {
    setActionLoading('eta');
    try {
      const res = await api.post(`/api/driver/deliveries/${id}/send-eta`, { eta_minutes: 15 });
      showToast(`ETA sent to ${res.data.phone}`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to send ETA', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  // ---- Loading / not found ----
  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading...</div>;
  }
  if (!delivery) {
    return <div className="p-4 text-center text-sm text-slate-400">Delivery not found</div>;
  }

  const status = delivery.status || 'pending';
  const statusIdx = STATUS_FLOW.indexOf(status);

  // ---- Completion screen overlay ----
  if (showCompletion) {
    return (
      <DeliveryCompletionScreen
        delivery={delivery}
        items={items}
        initialPhotos={photos}
        onSubmit={handleCompletionSubmit}
        onCancel={() => setShowCompletion(false)}
        onGoToNext={(nextId) => navigate(`/deliveries/${nextId}`)}
        onGoToRoute={() => navigate('/')}
      />
    );
  }

  // ---- Camera overlay ----
  if (showCamera) {
    return (
      <PhotoCapture
        onCapture={handlePhotoCapture}
        onClose={() => setShowCamera(false)}
        maxPhotos={5}
        currentCount={photos.length}
      />
    );
  }

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="text-sm font-medium text-blue-600">&larr; Back</button>
          <StatusBadge status={status} />
        </div>
        {/* Progress bar */}
        <div className="mt-2 flex gap-1">
          {STATUS_FLOW.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= statusIdx ? 'bg-blue-600' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* Customer section */}
        <CustomerSection delivery={delivery} onSendETA={handleSendETA} etaLoading={actionLoading === 'eta'} online={online} />

        {/* Address section */}
        <AddressSection delivery={delivery} />

        {/* Items section */}
        {items.length > 0 && <ItemsSection items={items} />}

        {/* Access info section */}
        <AccessInfoSection delivery={delivery} />

        {/* Notes section */}
        <NotesSection delivery={delivery} previousAttempts={previousAttempts} />

        {/* Photo gallery — shown once delivery is in progress */}
        {(status === 'in_progress' || status === 'arrived') && (
          <PhotoGallery
            photos={photos}
            onDelete={handlePhotoDelete}
            onAdd={() => setShowCamera(true)}
            onTagPhoto={handleTagPhoto}
            maxPhotos={5}
            minRequired={2}
          />
        )}
      </div>

      {/* Fixed bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white p-4 shadow-lg">
        <ActionButtons
          status={status}
          onArrived={() => setShowArrival(true)}
          onStartDelivery={() => handleStatusUpdate('in_transit')}
          onBeginDelivery={() => setShowChecklist(true)}
          onComplete={() => setShowCompletion(true)}
          onReportProblem={() => setShowOutcomeSelector(true)}
          onReportIssue={() => setShowProblemReport(true)}
          loading={actionLoading}
          photosCount={photos.length}
        />
      </div>

      {/* Arrival confirmation modal */}
      {showArrival && (
        <ArrivalConfirmation
          delivery={delivery}
          onConfirm={handleArrivalConfirm}
          onCancel={() => setShowArrival(false)}
          online={online}
        />
      )}

      {/* Pre-delivery checklist modal */}
      {showChecklist && (
        <DeliveryStartChecklist
          delivery={delivery}
          onStart={handleDeliveryStart}
          onBack={() => setShowChecklist(false)}
        />
      )}

      {/* Outcome selector */}
      {showOutcomeSelector && (
        <DeliveryOutcomeSelector
          onSelect={handleOutcomeSelect}
          onCancel={() => setShowOutcomeSelector(false)}
          currentStatus={status}
        />
      )}

      {/* Outcome-specific modals */}
      {outcomeModal === 'partial' && (
        <PartialDeliveryModal
          items={items}
          onConfirm={(data) => handleOutcomeSubmit('partial', data)}
          onBack={() => { setOutcomeModal(null); setShowOutcomeSelector(true); }}
        />
      )}
      {outcomeModal === 'refused' && (
        <RefusedDeliveryModal
          delivery={delivery}
          onConfirm={(data) => handleOutcomeSubmit('refused', data)}
          onBack={() => { setOutcomeModal(null); setShowOutcomeSelector(true); }}
        />
      )}
      {(outcomeModal === 'no_access' || outcomeModal === 'no_one_home' || outcomeModal === 'wrong_address' || outcomeModal === 'damaged') && (
        <NoAccessModal
          delivery={delivery}
          onConfirm={(data) => handleOutcomeSubmit(outcomeModal, data)}
          onBack={() => { setOutcomeModal(null); setShowOutcomeSelector(true); }}
        />
      )}
      {outcomeModal === 'reschedule' && (
        <RescheduleModal
          delivery={delivery}
          onConfirm={(data) => handleOutcomeSubmit('reschedule', data)}
          onBack={() => { setOutcomeModal(null); setShowOutcomeSelector(true); }}
        />
      )}

      {/* Problem report modal */}
      {showProblemReport && (
        <ProblemReportModal
          deliveryId={Number(id)}
          onSubmit={handleProblemSubmit}
          onClose={() => setShowProblemReport(false)}
        />
      )}
    </div>
  );
}

/* ============ Sub-components ============ */

function StatusBadge({ status }) {
  const cfg = {
    pending:     { label: 'Pending',     cls: 'bg-slate-100 text-slate-600' },
    scheduled:   { label: 'Scheduled',   cls: 'bg-slate-100 text-slate-600' },
    confirmed:   { label: 'Confirmed',   cls: 'bg-blue-100 text-blue-700' },
    in_transit:  { label: 'En Route',    cls: 'bg-blue-100 text-blue-700' },
    arrived:     { label: 'Arrived',     cls: 'bg-purple-100 text-purple-700' },
    in_progress: { label: 'In Progress', cls: 'bg-indigo-100 text-indigo-700' },
    delivered:   { label: 'Delivered',   cls: 'bg-green-100 text-green-700' },
    failed:      { label: 'Failed',      cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = cfg[status] || cfg.pending;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

/* ---- CustomerSection ---- */
function CustomerSection({ delivery, onSendETA, etaLoading, online }) {
  const name = delivery.customer_name || delivery.contact_name || 'Customer';
  const phone = delivery.contact_phone || delivery.customer_phone_main;
  const altPhone = delivery.alternate_phone;
  const email = delivery.contact_email || delivery.customer_email;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-2 text-xs font-medium uppercase text-slate-400">Customer</p>
      <p className="text-base font-semibold text-slate-900">{name}</p>

      {phone && (
        <div className="mt-2 flex items-center gap-2">
          <a href={`tel:${phone}`} className="flex-1 rounded-lg bg-green-50 px-3 py-2.5 text-center text-sm font-medium text-green-700">
            Call {phone}
          </a>
          {online && (
            <button
              onClick={onSendETA}
              disabled={etaLoading}
              className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm font-medium text-blue-700 disabled:opacity-50"
            >
              {etaLoading ? 'Sending...' : 'Send ETA'}
            </button>
          )}
        </div>
      )}

      {altPhone && (
        <a href={`tel:${altPhone}`} className="mt-1 block text-xs text-slate-500">
          Alt: {altPhone}
        </a>
      )}

      {email && (
        <p className="mt-1 text-xs text-slate-400">{email}</p>
      )}
    </div>
  );
}

/* ---- AddressSection ---- */
function AddressSection({ delivery }) {
  const address = delivery.delivery_address || '';
  const city = delivery.delivery_city;
  const postalCode = delivery.delivery_postal_code;
  const fullAddress = [address, city, postalCode].filter(Boolean).join(', ');
  const lat = delivery.latitude;
  const lng = delivery.longitude;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(fullAddress);
    } catch { /* clipboard API might not work */ }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-2 text-xs font-medium uppercase text-slate-400">Delivery Address</p>

      {/* Map preview */}
      {lat && lng && (
        <div className="mb-3 h-32 overflow-hidden rounded-lg bg-slate-100">
          <img
            src={`https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=600&height=200&center=lonlat:${lng},${lat}&zoom=15&marker=lonlat:${lng},${lat};color:%233b82f6;size:medium&apiKey=placeholder`}
            alt="Map"
            className="h-full w-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
      )}

      <p className="text-sm font-medium text-slate-800">{address}</p>
      {(city || postalCode) && (
        <p className="text-sm text-slate-600">{[city, postalCode].filter(Boolean).join(', ')}</p>
      )}

      <div className="mt-3 flex gap-2">
        <NavigationButton
          address={fullAddress}
          lat={lat ? parseFloat(lat) : undefined}
          lng={lng ? parseFloat(lng) : undefined}
          className="flex-1"
        />
        <button
          onClick={copyAddress}
          className="rounded-lg bg-slate-100 px-3 py-3 text-xs font-medium text-slate-600"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

/* ---- ItemsSection ---- */
function ItemsSection({ items }) {
  const [checked, setChecked] = useState({});
  const totalItems = items.reduce((s, i) => s + (i.quantity || 1), 0);
  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase text-slate-400">Items to Deliver</p>
        <span className="text-xs text-slate-500">
          {checkedCount}/{items.length} verified
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item, i) => (
          <label key={i} className="flex items-start gap-3 rounded-lg border border-slate-100 p-2.5">
            <input
              type="checkbox"
              checked={!!checked[i]}
              onChange={() => setChecked(prev => ({ ...prev, [i]: !prev[i] }))}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            <div className="flex-1">
              <p className={`text-sm font-medium ${checked[i] ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                {item.product_name}
              </p>
              <div className="flex gap-3 text-xs text-slate-500">
                {item.sku && <span>SKU: {item.sku}</span>}
                <span>Qty: {item.quantity}</span>
              </div>
            </div>
          </label>
        ))}
      </div>

      <p className="mt-2 text-xs text-slate-400">{totalItems} total item{totalItems !== 1 ? 's' : ''}</p>
    </div>
  );
}

/* ---- AccessInfoSection ---- */
function AccessInfoSection({ delivery }) {
  const entries = [];

  if (delivery.dwelling_type) {
    entries.push({ icon: '🏠', label: 'Dwelling', value: formatDwelling(delivery.dwelling_type) });
  }
  if (delivery.entry_point) {
    entries.push({ icon: '🚪', label: 'Entry', value: capitalize(delivery.entry_point) });
  }
  if (delivery.floor_number != null || delivery.floor_level != null) {
    const floor = delivery.floor_number ?? delivery.floor_level;
    entries.push({ icon: '🏢', label: 'Floor', value: `${floor}` });
  }
  if (delivery.elevator_booking_required) {
    const when = [delivery.elevator_booking_date, delivery.elevator_booking_time].filter(Boolean).join(' at ');
    entries.push({ icon: '🛗', label: 'Elevator', value: when || 'Required', warn: true });
  }
  if (delivery.has_elevator === false && (delivery.floor_level > 1 || delivery.floor_number > 1)) {
    entries.push({ icon: '🚶', label: 'Stairs', value: 'No elevator', warn: true });
  }
  if (delivery.access_narrow_stairs) {
    entries.push({ icon: '⚠️', label: 'Narrow stairs', value: 'Yes', warn: true });
  }
  if (delivery.access_code || delivery.delivery_buzzer) {
    entries.push({ icon: '🔑', label: 'Buzzer / Code', value: delivery.delivery_buzzer || delivery.access_code });
  }
  if (delivery.parking_type) {
    const dist = delivery.parking_distance ? ` (${delivery.parking_distance}ft)` : '';
    entries.push({ icon: '🅿️', label: 'Parking', value: capitalize(delivery.parking_type.replace('_', ' ')) + dist });
  }
  if (delivery.pathway_confirmed != null) {
    entries.push({
      icon: delivery.pathway_confirmed ? '✅' : '❌',
      label: 'Pathway clear',
      value: delivery.pathway_confirmed ? 'Confirmed' : 'Not confirmed',
      warn: !delivery.pathway_confirmed,
    });
  }

  if (entries.length === 0) return null;

  const hasWarnings = entries.some(e => e.warn);
  const notes = [delivery.access_notes, delivery.parking_notes, delivery.pathway_notes].filter(Boolean);

  return (
    <div className={`rounded-xl border p-4 ${hasWarnings ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-white'}`}>
      <p className="mb-2 text-xs font-medium uppercase text-slate-400">Access Information</p>

      <div className="grid grid-cols-2 gap-2">
        {entries.map((e, i) => (
          <div key={i} className={`rounded-lg p-2 ${e.warn ? 'bg-amber-100/60' : 'bg-slate-50'}`}>
            <p className="text-xs text-slate-500">{e.icon} {e.label}</p>
            <p className={`text-sm font-medium ${e.warn ? 'text-amber-800' : 'text-slate-800'}`}>{e.value}</p>
          </div>
        ))}
      </div>

      {notes.length > 0 && (
        <div className="mt-3 space-y-1">
          {notes.map((n, i) => (
            <p key={i} className="text-xs text-amber-700">{n}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- NotesSection ---- */
function NotesSection({ delivery, previousAttempts }) {
  const notes = [
    delivery.delivery_instructions,
    delivery.notes,
    delivery.booking_notes,
    delivery.internal_notes,
    delivery.order_notes,
  ].filter(Boolean);

  if (notes.length === 0 && previousAttempts.length === 0) return null;

  return (
    <div className="space-y-3">
      {notes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-1 text-xs font-medium uppercase text-amber-600">Instructions & Notes</p>
          {notes.map((n, i) => (
            <p key={i} className="text-sm text-amber-800">{n}</p>
          ))}
        </div>
      )}

      {previousAttempts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="mb-2 text-xs font-medium uppercase text-red-500">Previous Attempts</p>
          <div className="space-y-2">
            {previousAttempts.map(a => (
              <div key={a.id} className="text-xs text-red-700">
                <p className="font-medium">
                  {new Date(a.scheduled_date).toLocaleDateString()} — {capitalize(a.status)}
                </p>
                {a.issue_reported && <p>{a.issue_reported}</p>}
                {a.notes && <p className="text-red-600">{a.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- ActionButtons ---- */
function ActionButtons({ status, onArrived, onStartDelivery, onBeginDelivery, onComplete, onReportProblem, onReportIssue, loading, photosCount }) {
  if (status === 'delivered') {
    return (
      <div className="rounded-lg bg-green-50 p-3 text-center text-sm font-medium text-green-700">
        ✓ Delivery completed
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="rounded-lg bg-red-50 p-3 text-center text-sm font-medium text-red-700">
        Delivery failed — issue reported
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* pending/confirmed → Start Driving */}
      {(status === 'pending' || status === 'scheduled' || status === 'confirmed') && (
        <button
          onClick={onStartDelivery}
          disabled={!!loading}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading === 'in_transit' ? 'Updating...' : 'Start Driving'}
        </button>
      )}

      {/* in_transit → I've Arrived */}
      {status === 'in_transit' && (
        <button
          onClick={onArrived}
          disabled={!!loading}
          className="w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading === 'arrived' ? 'Updating...' : "I've Arrived"}
        </button>
      )}

      {/* arrived → Begin Delivery */}
      {status === 'arrived' && (
        <button
          onClick={onBeginDelivery}
          disabled={!!loading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Begin Delivery
        </button>
      )}

      {/* in_progress → Complete Delivery */}
      {status === 'in_progress' && (
        <button
          onClick={onComplete}
          disabled={!!loading}
          className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading === 'delivered' ? 'Completing...' : 'Complete Delivery'}
          {photosCount > 0 && (
            <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
              {photosCount} photos
            </span>
          )}
        </button>
      )}

      {/* Report problem / other outcome */}
      {status !== 'delivered' && status !== 'failed' && (
        <div className="flex gap-2">
          <button
            onClick={onReportProblem}
            disabled={!!loading}
            className="flex-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 disabled:opacity-50"
          >
            {loading === 'outcome' ? 'Submitting...' : 'Other Outcome'}
          </button>
          <button
            onClick={onReportIssue}
            disabled={!!loading}
            className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700 disabled:opacity-50"
          >
            Report Problem
          </button>
        </div>
      )}
    </div>
  );
}

/* ---- Helpers ---- */
function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function formatDwelling(type) {
  const map = {
    house: 'House', condo: 'Condo', apartment: 'Apartment',
    townhouse: 'Townhouse', highrise: 'High-Rise',
    commercial: 'Commercial', other: 'Other',
  };
  return map[type] || capitalize(type);
}
