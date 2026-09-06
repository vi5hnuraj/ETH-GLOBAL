import React, { useEffect, useId, useRef } from 'react';
import { FiX } from 'react-icons/fi';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Modal — accessible dialog shell.
 * Adds role="dialog"/aria-modal, labels the panel from `title`, traps focus,
 * closes on Escape, restores focus on close, and locks background scroll.
 */
const Modal = ({ open, onClose, title, subtitle, children, maxWidth = 'max-w-lg' }) => {
  const titleId = useId();
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;

    const panel = panelRef.current;
    if (panel) {
      const first = panel.querySelector(FOCUSABLE);
      if (first) first.focus();
      else {
        panel.setAttribute('tabindex', '-1');
        panel.focus();
      }
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = panel.querySelectorAll(FOCUSABLE);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      if (previousFocusRef.current?.focus) previousFocusRef.current.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full ${maxWidth} my-8`}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            {title && <h2 id={titleId} className="text-lg font-bold text-white">{title}</h2>}
            {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white p-1" aria-label="Close">
            <FiX size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Modal;
