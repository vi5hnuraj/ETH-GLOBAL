// Prepaid-only purchase session statuses.
// Lifecycle: awaiting_payment -> paid (payment confirmed + invoice paid +
// credits granted) -> active -> completed. Failures: payment_failed | cancelled
// | expired. Postpaid states (requested/reserved/running/invoice_generated/
// closed) were removed in the prepaid-only migration.

export const SESSION_STATUS_TONE = {
  added_to_cart: 'slate',
  awaiting_payment: 'amber',
  processing: 'violet',
  paid: 'emerald',
  active: 'blue',
  completed: 'sky',
  payment_failed: 'red',
  cancelled: 'red',
  failed: 'red',
  expired: 'zinc'
};

export const SESSION_STATUS_META = {
  added_to_cart: { label: 'Added to Cart', tone: 'slate', cls: 'bg-zinc-800/60 text-zinc-300 border-zinc-600/50', dot: 'bg-zinc-400' },
  awaiting_payment: { label: 'Awaiting Payment', tone: 'amber', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
  processing: { label: 'Processing Payment', tone: 'violet', cls: 'bg-violet-500/10 text-violet-300 border-violet-500/30', dot: 'bg-violet-400' },
  paid: { label: 'Paid', tone: 'emerald', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  active: { label: 'Active · Credits Granted', tone: 'blue', cls: 'bg-blue-500/10 text-blue-300 border-blue-500/30', dot: 'bg-blue-400' },
  completed: { label: 'Completed', tone: 'sky', cls: 'bg-sky-500/10 text-sky-300 border-sky-500/30', dot: 'bg-sky-400' },
  payment_failed: { label: 'Payment Failed', tone: 'red', cls: 'bg-red-500/10 text-red-300 border-red-500/30', dot: 'bg-red-400' },
  cancelled: { label: 'Cancelled', tone: 'red', cls: 'bg-red-500/10 text-red-300 border-red-500/30', dot: 'bg-red-400' },
  failed: { label: 'Failed', tone: 'red', cls: 'bg-red-500/10 text-red-300 border-red-500/30', dot: 'bg-red-400' },
  expired: { label: 'Expired', tone: 'zinc', cls: 'bg-zinc-800 text-zinc-300 border-zinc-600', dot: 'bg-zinc-400' },
  // Legacy fallbacks guarded during migration only.
  requested: { label: 'Requested', tone: 'amber', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
  reserved: { label: 'Reserved', tone: 'blue', cls: 'bg-blue-500/10 text-blue-300 border-blue-500/30', dot: 'bg-blue-400' },
  running: { label: 'Running', tone: 'emerald', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  invoice_generated: { label: 'Invoice Generated', tone: 'violet', cls: 'bg-violet-500/10 text-violet-300 border-violet-500/30', dot: 'bg-violet-400' },
  closed: { label: 'Closed', tone: 'zinc', cls: 'bg-zinc-800 text-zinc-300 border-zinc-600', dot: 'bg-zinc-400' }
};

export const INVOICE_STATUS_TONE = {
  paid: 'emerald',
  expired: 'zinc',
  cancelled: 'red',
  failed: 'red',
  // Legacy fallback only — pending invoices are no longer created.
  pending: 'amber'
};

export const SESSION_FLOW = ['added_to_cart', 'awaiting_payment', 'processing', 'paid', 'active', 'completed'];

export const TERMINAL_SESSION_STATUSES = ['cancelled', 'failed', 'expired', 'payment_failed'];