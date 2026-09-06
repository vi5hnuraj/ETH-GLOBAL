import React, { useState } from 'react';
import Modal from './Modal';
import { FiAlertTriangle } from 'react-icons/fi';

/**
 * ConfirmModal — confirmation dialog for destructive actions.
 * Handles async onConfirm callbacks with internal loading state.
 */
const ConfirmModal = ({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmClassName = 'bg-red-600 hover:bg-red-500',
  busy: externalBusy = false,
  danger = true
}) => {
  const [internalBusy, setInternalBusy] = useState(false);
  const busy = externalBusy || internalBusy;

  const handleClick = async () => {
    if (busy) return;
    try {
      setInternalBusy(true);
      const result = onConfirm?.();
      if (result && typeof result.then === 'function') await result;
    } catch {
      // parent handles errors
    } finally {
      setInternalBusy(false);
    }
  };

  return (
  <Modal open={open} onClose={busy ? undefined : onClose} maxWidth="max-w-md">
    <div className="flex items-start gap-3">
      <div className={`shrink-0 rounded-full p-2.5 ${danger ? 'bg-red-950 text-red-400' : 'bg-blue-950 text-blue-400'}`}>
        <FiAlertTriangle size={18} />
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && <p className="text-sm text-zinc-400 mt-1.5">{description}</p>}
      </div>
    </div>
    <div className="flex items-center gap-3 mt-6">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={`flex-1 inline-flex items-center justify-center gap-2 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 transition-colors ${confirmClassName}`}
      >
        {busy && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
        {busy ? 'Working…' : confirmLabel}
      </button>
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="flex-1 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 transition-colors"
      >
        {cancelLabel}
      </button>
    </div>
  </Modal>
  );
};

export default ConfirmModal;
