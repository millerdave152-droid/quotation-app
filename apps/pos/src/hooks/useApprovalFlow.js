/**
 * TeleTime POS - Approval Flow Hook
 *
 * Orchestrates the full price-override approval lifecycle:
 *   Online:  idle → select_manager → pending → approved/denied/countered → done
 *   Offline: idle → pin_offline → approved → done (skip consuming — no token)
 *
 * Integrates WebSocket for real-time updates with polling fallback.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  createApprovalRequest,
  getApprovalStatus,
  consumeApprovalToken,
  acceptCounterOffer as acceptCounterAPI,
  declineCounterOffer as declineCounterAPI,
  cancelApproval,
} from '../api/approvals';

const POLL_INTERVAL = 10_000; // 10s polling fallback
const WS_RECONNECT_DELAY = 5_000;
const WS_MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param {object} [options]
 * @param {boolean} [options.isOffline] - Whether the system is currently offline
 * @param {function} [options.verifyPinOffline] - Offline PIN verification function
 * @param {function} [options.addOfflineApproval] - Queue an offline approval for later sync
 */
export function useApprovalFlow(options = {}) {
  const { isOffline = false, verifyPinOffline, addOfflineApproval } = options;
  // Core state
  const [flowState, setFlowState] = useState('idle');
  const [itemData, setItemData] = useState(null);       // cart item + requestedPrice + reason
  const [approvalRequest, setApprovalRequest] = useState(null); // server response
  const [approvedPrice, setApprovedPrice] = useState(null);
  const [approvedByName, setApprovedByName] = useState(null);
  const [counterOffer, setCounterOffer] = useState(null);
  const [denyReason, setDenyReason] = useState(null);
  const [error, setError] = useState(null);
  const [isOfflineApprovalFlag, setIsOfflineApprovalFlag] = useState(false);
  const [offlineClientRequestId, setOfflineClientRequestId] = useState(null);

  // Refs for cleanup
  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const wsRetriesRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // -------------------------------------------------------------------
  // WebSocket management
  // -------------------------------------------------------------------

  const closeWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect on intentional close
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connectWs = useCallback((requestId) => {
    closeWs();

    const token = localStorage.getItem('pos_token');
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        wsRetriesRef.current = 0;
      };

      ws.onmessage = (evt) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(evt.data);
          if (!msg.event || !msg.data) return;

          // Only handle events for our current request
          if (msg.data.requestId !== requestId) return;

          switch (msg.event) {
            case 'approval:approved':
              setApprovedPrice(msg.data.approvedPrice);
              setApprovedByName(msg.data.managerName || 'Manager');
              setFlowState('approved');
              break;

            case 'approval:denied':
              setDenyReason({
                reasonCode: msg.data.reasonCode,
                reasonNote: msg.data.reasonNote,
                managerName: msg.data.managerName,
              });
              setFlowState('denied');
              break;

            case 'approval:countered':
              setCounterOffer({
                id: msg.data.counterOfferId,
                price: msg.data.counterPrice,
                marginAmount: msg.data.marginAmount,
                marginPercent: msg.data.marginPercent,
                managerName: msg.data.managerName,
              });
              setFlowState('countered');
              break;

            default:
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        wsRef.current = null;
        // Auto-reconnect if still in a waiting state
        if (wsRetriesRef.current < WS_MAX_RETRIES) {
          wsRetriesRef.current += 1;
          setTimeout(() => {
            if (mountedRef.current) connectWs(requestId);
          }, WS_RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    } catch {
      // WebSocket not available — polling will handle it
    }
  }, [closeWs]);

  // -------------------------------------------------------------------
  // Polling fallback
  // -------------------------------------------------------------------

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback((requestId) => {
    stopPolling();

    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const res = await getApprovalStatus(requestId);
        const data = res?.data || res;
        if (!mountedRef.current) return;

        switch (data.status) {
          case 'approved': {
            // Fetch the full request to get the token
            setApprovalRequest((prev) => ({ ...prev, ...data }));
            setApprovedByName(data.managerName || 'Manager');
            setApprovedPrice(data.approvedPrice);
            setFlowState('approved');
            break;
          }
          case 'denied':
            setDenyReason({
              reasonCode: data.reasonCode,
              reasonNote: data.reasonNote,
              managerName: data.managerName,
            });
            setFlowState('denied');
            break;
          case 'countered': {
            const offers = data.counterOffers || [];
            const pending = offers.find((o) => o.status === 'pending');
            if (pending) {
              setCounterOffer({
                id: pending.id,
                price: parseFloat(pending.price),
                marginAmount: pending.margin_amount ? parseFloat(pending.margin_amount) : null,
                marginPercent: pending.margin_percent ? parseFloat(pending.margin_percent) : null,
                managerName: data.managerName,
              });
              setFlowState('countered');
            }
            break;
          }
          case 'timed_out':
            setFlowState('timed_out');
            break;
          case 'cancelled':
            setFlowState('cancelled');
            break;
          default:
            // still pending, keep polling
            break;
        }
      } catch {
        // Silently fail, will retry next interval
      }
    };

    // Poll immediately, then at interval
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
  }, [stopPolling]);

  // -------------------------------------------------------------------
  // Start/stop WS + polling based on state
  // -------------------------------------------------------------------

  useEffect(() => {
    const reqId = approvalRequest?.id;
    if (!reqId) return;

    if (flowState === 'pending' || flowState === 'countered') {
      connectWs(reqId);
      startPolling(reqId);
    } else {
      closeWs();
      stopPolling();
    }

    return () => {
      closeWs();
      stopPolling();
    };
  }, [flowState, approvalRequest?.id, connectWs, startPolling, closeWs, stopPolling]);

  // -------------------------------------------------------------------
  // Auto-consume token when approved
  // -------------------------------------------------------------------

  useEffect(() => {
    if (flowState !== 'approved') return;

    // Offline approvals skip token consumption — go straight to done
    if (isOfflineApprovalFlag) {
      setFlowState('done');
      return;
    }

    const consume = async () => {
      setFlowState('consuming');
      try {
        // We need the token. First try from approvalRequest, then re-fetch status.
        let token = approvalRequest?.approval_token;
        if (!token) {
          const statusRes = await getApprovalStatus(approvalRequest.id);
          const statusData = statusRes?.data || statusRes;
          token = statusData.approval_token;
          if (!mountedRef.current) return;
        }

        if (!token) {
          setError('No approval token available');
          setFlowState('error');
          return;
        }

        const res = await consumeApprovalToken(token);
        if (!mountedRef.current) return;
        const consumed = res?.data || res;

        setApprovedPrice(consumed.approvedPrice);
        setFlowState('done');
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err?.message || 'Failed to consume approval token');
        setFlowState('error');
      }
    };

    consume();
  }, [flowState, approvalRequest, isOfflineApprovalFlag]);

  // -------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------

  const startFlow = useCallback((item) => {
    setItemData(item);
    setApprovalRequest(null);
    setApprovedPrice(null);
    setApprovedByName(null);
    setCounterOffer(null);
    setDenyReason(null);
    setError(null);
    setIsOfflineApprovalFlag(false);
    setOfflineClientRequestId(null);

    if (isOffline) {
      // Offline mode: skip manager selection, go straight to PIN entry
      setFlowState('pin_offline');
    } else {
      setFlowState('select_manager');
    }
  }, [isOffline]);

  const submitRequest = useCallback(async (managerId) => {
    if (!itemData) return;
    setFlowState('pending');
    setError(null);

    try {
      const res = await createApprovalRequest({
        productId: itemData.productId,
        requestedPrice: itemData.requestedPrice,
        managerId,
        cartItemId: itemData.cartItemId,
      });

      if (!mountedRef.current) return;
      const data = res?.data || res;

      setApprovalRequest(data);

      if (data.autoApproved) {
        // Tier 1 auto-approved — go straight to approved
        setApprovedByName('Auto-approved');
        setApprovedPrice(data.approved_price || data.requestedPrice);
        setFlowState('approved');
      }
      // Otherwise stay in 'pending' — WS/poll will pick up the response
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Failed to create approval request');
      setFlowState('error');
    }
  }, [itemData]);

  /**
   * Submit a PIN for offline verification.
   * On success: queues the offline approval, transitions to 'approved'.
   */
  const submitOfflinePin = useCallback(async (pin) => {
    if (!itemData || !verifyPinOffline) {
      setError('Offline PIN verification not available');
      return;
    }

    setError(null);

    // Determine required level from tier (if provided) or default to 'manager'
    const requiredLevel = itemData.requiredLevel || 'manager';

    const result = await verifyPinOffline(pin, requiredLevel);

    if (!mountedRef.current) return;

    if (!result.valid) {
      setError(result.error || 'Invalid PIN');
      return;
    }

    // Generate client-side request ID for dedup
    const clientRequestId = crypto.randomUUID();
    setOfflineClientRequestId(clientRequestId);
    setIsOfflineApprovalFlag(true);

    // Queue for later sync
    if (addOfflineApproval) {
      await addOfflineApproval({
        clientRequestId,
        productId: itemData.productId,
        productName: itemData.productName,
        requestedPrice: itemData.requestedPrice,
        originalPrice: itemData.retailPrice || itemData.originalPrice,
        managerId: result.userId,
        managerName: result.managerName,
        approvalLevel: result.approvalLevel,
        salespersonId: itemData.salespersonId,
        offlineApprovedAt: new Date().toISOString(),
        deviceId: navigator.userAgent?.slice(0, 64) || 'unknown',
        reason: itemData.reason || 'Offline PIN override',
        cartItemId: itemData.cartItemId || itemData.itemId,
        entryPoint: itemData.entryPoint,
      });
    }

    setApprovedByName(`${result.managerName} (offline)`);
    setApprovedPrice(itemData.requestedPrice);
    setFlowState('approved');
  }, [itemData, verifyPinOffline, addOfflineApproval]);

  const acceptCounter = useCallback(async () => {
    if (!approvalRequest?.id || !counterOffer?.id) return;
    setFlowState('pending'); // briefly back to pending while server processes

    try {
      const res = await acceptCounterAPI(approvalRequest.id, counterOffer.id);
      if (!mountedRef.current) return;
      const data = res?.data || res;

      setApprovalRequest((prev) => ({ ...prev, ...data }));
      setApprovedByName(counterOffer.managerName || 'Manager');
      setApprovedPrice(counterOffer.price);
      setFlowState('approved');
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Failed to accept counter-offer');
      setFlowState('error');
    }
  }, [approvalRequest, counterOffer]);

  const declineCounter = useCallback(async () => {
    if (!approvalRequest?.id || !counterOffer?.id) return;

    try {
      await declineCounterAPI(approvalRequest.id, counterOffer.id);
      if (!mountedRef.current) return;
      setCounterOffer(null);
      setFlowState('pending'); // back to waiting
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Failed to decline counter-offer');
    }
  }, [approvalRequest, counterOffer]);

  const cancel = useCallback(async () => {
    if (approvalRequest?.id && (flowState === 'pending' || flowState === 'countered')) {
      try {
        await cancelApproval(approvalRequest.id);
      } catch {
        // best-effort cancel
      }
    }
    closeWs();
    stopPolling();
    setFlowState('cancelled');
  }, [approvalRequest, flowState, closeWs, stopPolling]);

  const reset = useCallback(() => {
    closeWs();
    stopPolling();
    setFlowState('idle');
    setItemData(null);
    setApprovalRequest(null);
    setApprovedPrice(null);
    setApprovedByName(null);
    setCounterOffer(null);
    setDenyReason(null);
    setError(null);
    setIsOfflineApprovalFlag(false);
    setOfflineClientRequestId(null);
  }, [closeWs, stopPolling]);

  return {
    flowState,
    itemData,
    approvalRequest,
    approvedPrice,
    approvedByName,
    counterOffer,
    denyReason,
    error,
    isOfflineApproval: isOfflineApprovalFlag,
    offlineClientRequestId,
    startFlow,
    submitRequest,
    submitOfflinePin,
    acceptCounter,
    declineCounter,
    cancel,
    reset,
  };
}
