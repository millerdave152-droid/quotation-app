/**
 * TeleTime POS - Batch Approval Flow Hook
 *
 * Orchestrates the batch price-override approval lifecycle:
 *   idle → select_manager → pending → approved → consuming → done
 *                                   → denied
 *                                   → timed_out
 *                                   → error
 *
 * Integrates WebSocket for real-time updates with polling fallback.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  createBatchApprovalRequest,
  getBatchDetails,
  consumeBatchTokens,
} from '../api/approvals';

const POLL_INTERVAL = 10_000;
const WS_RECONNECT_DELAY = 5_000;
const WS_MAX_RETRIES = 3;

export function useBatchApprovalFlow() {
  const [flowState, setFlowState] = useState('idle');
  const [batchItems, setBatchItems] = useState([]);
  const [batchResult, setBatchResult] = useState(null);
  const [approvedChildren, setApprovedChildren] = useState([]);
  const [approvedByName, setApprovedByName] = useState(null);
  const [denyReason, setDenyReason] = useState(null);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const wsRetriesRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // -------------------------------------------------------------------
  // WebSocket
  // -------------------------------------------------------------------

  const closeWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connectWs = useCallback((parentRequestId) => {
    closeWs();

    const token = localStorage.getItem('pos_token');
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { wsRetriesRef.current = 0; };

      ws.onmessage = (evt) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(evt.data);
          if (!msg.event || !msg.data) return;
          if (msg.data.parentRequestId !== parentRequestId) return;

          switch (msg.event) {
            case 'approval:batch-approved':
              setApprovedByName(msg.data.managerName || 'Manager');
              setFlowState('approved');
              break;

            case 'approval:batch-denied':
              setDenyReason({
                reasonCode: msg.data.reasonCode,
                reasonNote: msg.data.reasonNote,
                managerName: msg.data.managerName,
              });
              setFlowState('denied');
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
        if (wsRetriesRef.current < WS_MAX_RETRIES) {
          wsRetriesRef.current += 1;
          setTimeout(() => {
            if (mountedRef.current) connectWs(parentRequestId);
          }, WS_RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {};
    } catch {
      // WebSocket not available — polling handles it
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

  const startPolling = useCallback((parentRequestId) => {
    stopPolling();

    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const res = await getBatchDetails(parentRequestId);
        const data = res?.data || res;
        if (!mountedRef.current) return;

        switch (data.status) {
          case 'approved':
            setBatchResult((prev) => ({ ...prev, parent: data, children: data.children }));
            setApprovedByName(data.manager_name || 'Manager');
            setFlowState('approved');
            break;
          case 'denied':
            setDenyReason({
              reasonCode: data.reason_code,
              reasonNote: data.reason_note,
              managerName: data.manager_name,
            });
            setFlowState('denied');
            break;
          case 'timed_out':
            setFlowState('timed_out');
            break;
          case 'cancelled':
            setFlowState('cancelled');
            break;
          default:
            break;
        }
      } catch {
        // silently fail, will retry
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
  }, [stopPolling]);

  // -------------------------------------------------------------------
  // WS + polling lifecycle
  // -------------------------------------------------------------------

  useEffect(() => {
    const parentId = batchResult?.parent?.id;
    if (!parentId) return;

    if (flowState === 'pending') {
      connectWs(parentId);
      startPolling(parentId);
    } else {
      closeWs();
      stopPolling();
    }

    return () => {
      closeWs();
      stopPolling();
    };
  }, [flowState, batchResult?.parent?.id, connectWs, startPolling, closeWs, stopPolling]);

  // -------------------------------------------------------------------
  // Auto-consume tokens when approved
  // -------------------------------------------------------------------

  useEffect(() => {
    if (flowState !== 'approved') return;

    const consume = async () => {
      setFlowState('consuming');
      try {
        const parentId = batchResult?.parent?.id;
        if (!parentId) {
          setError('No batch parent ID available');
          setFlowState('error');
          return;
        }

        const res = await consumeBatchTokens(parentId);
        if (!mountedRef.current) return;
        const consumed = res?.data || res;

        setApprovedChildren(Array.isArray(consumed) ? consumed : []);
        setFlowState('done');
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err?.message || 'Failed to consume batch tokens');
        setFlowState('error');
      }
    };

    consume();
  }, [flowState, batchResult?.parent?.id]);

  // -------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------

  const startFlow = useCallback((items) => {
    setBatchItems(items);
    setBatchResult(null);
    setApprovedChildren([]);
    setApprovedByName(null);
    setDenyReason(null);
    setError(null);
    setFlowState('select_manager');
  }, []);

  const submitRequest = useCallback(async (managerId) => {
    if (batchItems.length === 0) return;
    setFlowState('pending');
    setError(null);

    try {
      const res = await createBatchApprovalRequest({
        managerId,
        items: batchItems.map((item) => ({
          cartItemId: item.cartItemId,
          productId: item.productId,
          requestedPrice: item.requestedPrice,
        })),
      });

      if (!mountedRef.current) return;
      const data = res?.data || res;

      setBatchResult(data);

      if (data.allAutoApproved) {
        setApprovedByName('Auto-approved');
        setApprovedChildren(
          data.children.map((c) => ({
            childId: c.id,
            approvedPrice: parseFloat(c.approved_price || c.requested_price),
            productId: c.product_id,
            cartItemId: c.cart_item_id,
          }))
        );
        setFlowState('done');
      }
      // Otherwise stay in 'pending' — WS/poll will pick up the response
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Failed to create batch approval request');
      setFlowState('error');
    }
  }, [batchItems]);

  const cancel = useCallback(() => {
    closeWs();
    stopPolling();
    setFlowState('cancelled');
  }, [closeWs, stopPolling]);

  const reset = useCallback(() => {
    closeWs();
    stopPolling();
    setFlowState('idle');
    setBatchItems([]);
    setBatchResult(null);
    setApprovedChildren([]);
    setApprovedByName(null);
    setDenyReason(null);
    setError(null);
  }, [closeWs, stopPolling]);

  return {
    flowState,
    batchItems,
    batchResult,
    approvedChildren,
    approvedByName,
    denyReason,
    error,
    startFlow,
    submitRequest,
    cancel,
    reset,
  };
}
