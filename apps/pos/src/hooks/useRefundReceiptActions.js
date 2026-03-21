import { useCallback, useEffect, useState } from 'react';
import { emailReturnReceipt } from '../api/returns';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const getToken = () => localStorage.getItem('pos_token') || localStorage.getItem('auth_token') || '';

export function useRefundReceiptActions({
  returnId,
  receiptNumber,
  initialEmail = '',
  onEmailSuccess,
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  useEffect(() => () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  }, [previewUrl]);

  const resolveTarget = useCallback((target) => ({
    returnId: target?.returnId ?? target?.id ?? returnId,
    receiptNumber: target?.receiptNumber ?? target?.return_number ?? receiptNumber,
  }), [receiptNumber, returnId]);

  const fetchReceiptBlob = useCallback(async (endpoint = 'preview', target) => {
    const resolved = resolveTarget(target);
    if (!resolved.returnId) {
      throw new Error('Refund receipt not available');
    }

    const response = await fetch(`${API_BASE}/returns/${resolved.returnId}/refund-receipt/${endpoint}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch refund receipt ${endpoint}`);
    }

    return response.blob();
  }, [resolveTarget]);

  const preview = useCallback(async (target) => {
    const resolved = resolveTarget(target);
    if (!resolved.returnId) return;
    setBusy(true);
    setMessage(null);
    try {
      const blob = await fetchReceiptBlob('preview', resolved);
      const url = URL.createObjectURL(blob);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (err) {
      setMessage(err.message || 'Failed to preview refund receipt');
    } finally {
      setBusy(false);
    }
  }, [fetchReceiptBlob, previewUrl, resolveTarget]);

  const download = useCallback(async (target) => {
    const resolved = resolveTarget(target);
    if (!resolved.returnId) return;
    setBusy(true);
    setMessage(null);
    try {
      const blob = await fetchReceiptBlob('pdf', resolved);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `refund-${resolved.receiptNumber || resolved.returnId}.pdf`;
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setMessage(err.message || 'Failed to download refund receipt');
    } finally {
      setBusy(false);
    }
  }, [fetchReceiptBlob, resolveTarget]);

  const print = useCallback(async (target) => {
    const resolved = resolveTarget(target);
    if (!resolved.returnId) return;
    setBusy(true);
    setMessage(null);
    try {
      const blob = await fetchReceiptBlob('preview', resolved);
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank', 'width=800,height=600');
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print();
        });
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setMessage(err.message || 'Failed to print refund receipt');
    } finally {
      setBusy(false);
    }
  }, [fetchReceiptBlob, resolveTarget]);

  const sendEmail = useCallback(async (email, target) => {
    const resolved = resolveTarget(target);
    if (!resolved.returnId) {
      throw new Error('Refund receipt not available');
    }

    const result = await emailReturnReceipt(resolved.returnId, email);
    if (!result.success) {
      throw new Error(result.error || 'Failed to email refund receipt');
    }

    const successMessage = `Refund receipt emailed to ${email}`;
    setMessage(successMessage);
    onEmailSuccess?.(email, successMessage);
  }, [onEmailSuccess, resolveTarget]);

  return {
    busy,
    message,
    setMessage,
    previewUrl,
    previewOpen,
    setPreviewOpen,
    emailModalOpen,
    setEmailModalOpen,
    initialEmail,
    preview,
    download,
    print,
    sendEmail,
  };
}

export default useRefundReceiptActions;
