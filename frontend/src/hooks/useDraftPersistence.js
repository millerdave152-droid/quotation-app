/**
 * useDraftPersistence Hook
 * Core hook for IndexedDB draft auto-save, lifecycle management,
 * server merge on mount, and reconnect sync.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import db from '../db/localDb';
import { getDraftSyncService } from '../services/draftSyncService';
import { authFetch } from '../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const DEBOUNCE_MS = 500;

export default function useDraftPersistence({
  builderState,
  builderSetters,
  activeDraftId,
  setActiveDraftId,
  isBuilderActive,
  userId,
  tenantId,
}) {
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localDrafts, setLocalDrafts] = useState([]);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const debounceRef = useRef(null);
  const syncService = useRef(getDraftSyncService());
  const mountedRef = useRef(true);

  // ── Refresh local drafts list ─────────────────────────────────
  const refreshLocalDrafts = useCallback(async () => {
    try {
      const drafts = await db.quote_drafts
        .where('user_id')
        .equals(userId)
        .reverse()
        .sortBy('updated_at');
      if (mountedRef.current) setLocalDrafts(drafts);

      const pending = await db.quote_drafts
        .where('status')
        .equals('pending_sync')
        .count();
      if (mountedRef.current) setPendingSyncCount(pending);
    } catch (_) { /* db not ready yet */ }
  }, [userId]);

  // ── Auto-save: debounced write to IndexedDB ───────────────────
  useEffect(() => {
    if (!isBuilderActive || !activeDraftId || !userId) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        setIsSaving(true);
        const now = new Date().toISOString();

        await db.quote_drafts.put({
          id: activeDraftId,
          tenant_id: tenantId || null,
          user_id: userId,
          server_quote_id: builderState.editingQuoteId || null,
          status: 'draft',
          updated_at: now,
          created_at: now,
          snapshot: builderState,
        });

        if (mountedRef.current) {
          setLastSavedAt(now);
          setIsSaving(false);
        }

        // Push to server in background for cross-device sync
        syncService.current.pushDraftToServer(activeDraftId);
      } catch (err) {
        console.error('[DraftPersistence] auto-save error:', err);
        if (mountedRef.current) setIsSaving(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isBuilderActive, activeDraftId, userId, tenantId, builderState]);

  // ── Merge server drafts on mount (when online) ────────────────
  useEffect(() => {
    if (!userId) return;

    const mergeServerDrafts = async () => {
      if (!navigator.onLine) return;

      try {
        const token = localStorage.getItem('auth_token');
        const res = await authFetch(`${API_URL}/api/v1/quotes/drafts`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;

        const result = await res.json();
        const serverDrafts = result.data || result;

        for (const sd of serverDrafts) {
          const localDraft = await db.quote_drafts.get(sd.client_draft_id);

          if (!localDraft) {
            // Server has a draft we don't — import it
            await db.quote_drafts.put({
              id: sd.client_draft_id,
              tenant_id: sd.tenant_id,
              user_id: sd.user_id,
              server_quote_id: sd.server_quote_id,
              status: 'draft',
              updated_at: sd.updated_at,
              created_at: sd.created_at,
              snapshot: sd.snapshot,
            });
          } else if (localDraft.status !== 'pending_sync') {
            // Server wins if local is not pending_sync and server is newer
            const serverTime = new Date(sd.updated_at).getTime();
            const localTime = new Date(localDraft.updated_at).getTime();
            if (serverTime > localTime) {
              await db.quote_drafts.put({
                ...localDraft,
                snapshot: sd.snapshot,
                updated_at: sd.updated_at,
                server_quote_id: sd.server_quote_id,
              });
            }
          }
          // If local is pending_sync, keep local version (unsync'd changes take precedence)
        }

        refreshLocalDrafts();
      } catch (err) {
        console.error('[DraftPersistence] merge error:', err);
      }
    };

    mergeServerDrafts();
  }, [userId, refreshLocalDrafts]);

  // ── Reconnect handler ─────────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      syncService.current.syncPendingDrafts().then(() => {
        refreshLocalDrafts();
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [refreshLocalDrafts]);

  // ── Refresh drafts periodically ───────────────────────────────
  useEffect(() => {
    refreshLocalDrafts();
    const interval = setInterval(refreshLocalDrafts, 10000);
    return () => clearInterval(interval);
  }, [refreshLocalDrafts]);

  // ── Cleanup ───────────────────────────────────────────────────
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // ── Load draft into builder ───────────────────────────────────
  const loadDraft = useCallback(async (draftId) => {
    try {
      const draft = await db.quote_drafts.get(draftId);
      if (!draft || !draft.snapshot) return false;

      const s = draft.snapshot;
      const setters = builderSetters;

      // Restore all builder fields from snapshot
      if (setters.setSelectedCustomer) setters.setSelectedCustomer(s.selectedCustomer || null);
      if (setters.setQuoteItems) setters.setQuoteItems(s.quoteItems || []);
      if (setters.setDiscountPercent) setters.setDiscountPercent(s.discountPercent ?? 0);
      if (setters.setNotes) setters.setNotes(s.notes || '');
      if (setters.setInternalNotes) setters.setInternalNotes(s.internalNotes || '');
      if (setters.setTerms) setters.setTerms(s.terms || 'Payment due within 30 days. All prices in CAD.');
      if (setters.setEditingQuoteId) setters.setEditingQuoteId(s.editingQuoteId || null);
      if (setters.setEditingQuoteNumber) setters.setEditingQuoteNumber(s.editingQuoteNumber || null);

      // Quote protection
      if (setters.setHideModelNumbers) setters.setHideModelNumbers(s.hideModelNumbers ?? false);
      if (setters.setWatermarkText) setters.setWatermarkText(s.watermarkText || 'CONFIDENTIAL - FOR CUSTOMER USE ONLY');
      if (setters.setWatermarkEnabled) setters.setWatermarkEnabled(s.watermarkEnabled ?? true);
      if (setters.setQuoteExpiryDate) setters.setQuoteExpiryDate(s.quoteExpiryDate || '');

      // Delivery & Installation
      if (setters.setDeliveryAddress) setters.setDeliveryAddress(s.deliveryAddress || '');
      if (setters.setDeliveryCity) setters.setDeliveryCity(s.deliveryCity || '');
      if (setters.setDeliveryPostalCode) setters.setDeliveryPostalCode(s.deliveryPostalCode || '');
      if (setters.setDeliveryDate) setters.setDeliveryDate(s.deliveryDate || '');
      if (setters.setDeliveryTimeSlot) setters.setDeliveryTimeSlot(s.deliveryTimeSlot || '');
      if (setters.setDeliveryInstructions) setters.setDeliveryInstructions(s.deliveryInstructions || '');
      if (setters.setInstallationRequired) setters.setInstallationRequired(s.installationRequired ?? false);
      if (setters.setInstallationType) setters.setInstallationType(s.installationType || '');
      if (setters.setHaulAwayRequired) setters.setHaulAwayRequired(s.haulAwayRequired ?? false);
      if (setters.setHaulAwayItems) setters.setHaulAwayItems(s.haulAwayItems || '');

      // Sales & Commission
      if (setters.setSalesRepName) setters.setSalesRepName(s.salesRepName || '');
      if (setters.setCommissionPercent) setters.setCommissionPercent(s.commissionPercent ?? 5);
      if (setters.setReferralSource) setters.setReferralSource(s.referralSource || '');
      if (setters.setReferralName) setters.setReferralName(s.referralName || '');

      // Customer Experience
      if (setters.setPriorityLevel) setters.setPriorityLevel(s.priorityLevel || 'standard');
      if (setters.setSpecialInstructions) setters.setSpecialInstructions(s.specialInstructions || '');
      if (setters.setPaymentMethod) setters.setPaymentMethod(s.paymentMethod || '');
      if (setters.setDepositRequired) setters.setDepositRequired(s.depositRequired ?? false);
      if (setters.setDepositAmount) setters.setDepositAmount(s.depositAmount ?? 0);

      // Revenue features
      if (setters.setQuoteFinancing) setters.setQuoteFinancing(s.quoteFinancing || null);
      if (setters.setQuoteWarranties) setters.setQuoteWarranties(s.quoteWarranties || []);
      if (setters.setQuoteDelivery) setters.setQuoteDelivery(s.quoteDelivery || null);
      if (setters.setQuoteRebates) setters.setQuoteRebates(s.quoteRebates || []);
      if (setters.setQuoteTradeIns) setters.setQuoteTradeIns(s.quoteTradeIns || []);

      setActiveDraftId(draftId);
      return true;
    } catch (err) {
      console.error('[DraftPersistence] loadDraft error:', err);
      return false;
    }
  }, [builderSetters, setActiveDraftId]);

  // ── Delete draft ──────────────────────────────────────────────
  const deleteDraft = useCallback(async (draftId) => {
    try {
      await db.quote_drafts.delete(draftId);

      // Also delete from server
      if (navigator.onLine) {
        const token = localStorage.getItem('auth_token');
        authFetch(`${API_URL}/api/v1/quotes/new/draft`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ client_draft_id: draftId, snapshot: null }),
        }).catch(() => {});
      }

      refreshLocalDrafts();
    } catch (err) {
      console.error('[DraftPersistence] deleteDraft error:', err);
    }
  }, [refreshLocalDrafts]);

  // ── Clear active draft (on successful submit) ─────────────────
  const clearActiveDraft = useCallback(async () => {
    if (activeDraftId) {
      try {
        await db.quote_drafts.delete(activeDraftId);
      } catch (_) { /* ok */ }
    }
    setActiveDraftId(null);
    setLastSavedAt(null);
    refreshLocalDrafts();
  }, [activeDraftId, setActiveDraftId, refreshLocalDrafts]);

  // ── Force sync all pending ────────────────────────────────────
  const forceSyncAll = useCallback(async () => {
    await syncService.current.syncPendingDrafts();
    refreshLocalDrafts();
  }, [refreshLocalDrafts]);

  return {
    lastSavedAt,
    isSaving,
    hasPendingSyncDrafts: pendingSyncCount > 0,
    pendingSyncCount,
    localDrafts,
    loadDraft,
    deleteDraft,
    clearActiveDraft,
    refreshLocalDrafts,
    forceSyncAll,
  };
}
