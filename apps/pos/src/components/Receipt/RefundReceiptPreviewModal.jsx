/**
 * TeleTime POS - Refund Receipt Preview Modal
 *
 * Reusable modal for displaying refund receipt PDFs from authenticated blob URLs.
 */

export function RefundReceiptPreviewModal({
  isOpen,
  onClose,
  previewUrl,
  receiptNumber,
  title = 'Refund Receipt Preview',
}) {
  if (!isOpen || !previewUrl) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <div>
            <h3 className="font-semibold text-white">{title}</h3>
            {receiptNumber && <p className="text-xs text-slate-400">{receiptNumber}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            Close
          </button>
        </div>
        <iframe
          title={title}
          src={previewUrl}
          className="h-[calc(90vh-57px)] w-full bg-white"
        />
      </div>
    </div>
  );
}

export default RefundReceiptPreviewModal;
