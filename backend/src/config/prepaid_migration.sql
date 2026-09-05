-- ============================================================================
-- PREPAID-ONLY MIGRATION
-- Removes all postpaid (use-first, pay-later) purchase-session states and
-- normalizes any legacy rows created before this migration.
-- New lifecycle (see commerceService.SESSION_STATUS):
--   awaiting_payment -> paid -> active -> completed
--   failures: payment_failed | cancelled | expired
-- Removed states: requested, reserved, running, invoice_generated, closed
-- ============================================================================

-- 1. Normalize legacy purchase_sessions rows to the prepaid-only machine.
--    - requested  (awaited a human approval — approval workflow removed)
--    - reserved   (unpaid "live" session — no longer valid without payment)
--    - running    (execution started before payment — invalid without payment)
--    - invoice_generated (post-paid invoice awaiting settlement — invalid)
--    => all unpaid states are voided (cancelled). Nothing is "allowed to run
--       unpaid" in the prepaid model.
UPDATE public.purchase_sessions
SET status = 'cancelled',
    updated_at = NOW()
WHERE status IN ('requested', 'reserved', 'running', 'invoice_generated');

--    - closed (prepaid flow's old terminal success state, now 'active')
--    => success states map onto the new machine.
UPDATE public.purchase_sessions
SET status = 'completed',
    updated_at = NOW()
WHERE status = 'closed';

-- 2. Approval flag is meaningless going forward — every purchase pays now.
UPDATE public.purchase_sessions SET approval_required = FALSE;

-- 3. Default status for new rows becomes 'awaiting_payment'.
ALTER TABLE public.purchase_sessions ALTER COLUMN status SET DEFAULT 'awaiting_payment';

-- 4. (Optional, if you want a hard guard vs. stray legacy transitions.)
--    Uncomment to enforce the prepaid-only status set at the DB level.
-- ALTER TABLE public.purchase_sessions DROP CONSTRAINT IF EXISTS purchase_sessions_status_check;
-- ALTER TABLE public.purchase_sessions ADD CONSTRAINT purchase_sessions_status_check
--   CHECK (status IN ('awaiting_payment','processing','paid','active','completed',
--                     'payment_failed','cancelled','expired'));

-- 5. Usage reports created before the migration with an associated pending
--    invoice stay as historical records. They are intentionally NOT matured
--    into payable invoices: no new invoice is ever created from usage now.

-- 6. service_invoices rows still in 'pending' were pre-migration debts. They
--    remain payable through the legacy settlement endpoints so they can be
--    cleared; new invoices are created only as status=paid after confirmed
--    payment (confirmPrepaidPurchase).