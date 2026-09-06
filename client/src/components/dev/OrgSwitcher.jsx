import React, { useEffect, useCallback, useRef, useState } from 'react';
import { FiChevronDown, FiCheck, FiPlus, FiLoader, FiUsers, FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import developerApi from '../../utils/developerApi';
import { getOrganizationId, setOrganizationId } from '../../utils/identity';

const MAX_AUTO_RETRIES = 2;
const BACKOFF_MS = 3000;

/**
 * OrgSwitcher — active-organization selector for the Developer Platform.
 *
 * Loading always terminates: on failure it auto-retries twice with backoff and
 * then settles into an explicit "Unable to load developer workspace" state with
 * a manual Retry — it never sits on "Loading…" forever.
 */
const OrgSwitcher = ({ onChange }) => {
  const [orgs, setOrgs] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(getOrganizationId());
  const activeIdRef = useRef(activeId);
  const rootRef = useRef(null);
  const aliveRef = useRef(true);
  const attemptRef = useRef(0);
  const retryTimerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const loadOrgs = useCallback(async () => {
    setBusy(true);
    try {
      const list = await developerApi.organizations();
      if (!aliveRef.current) return;
      attemptRef.current = 0;
      setOrgs(list);
      setError(null);
      const currentId = getOrganizationId();
      if (!currentId || !list.some((o) => o.id === currentId)) {
        const personal = list.find((o) => o.isPersonal) || list[0];
        if (personal) {
          // Persist so every API request sends a valid X-Organization-Id.
          // A stale/garbage gpay_org_id must not keep being sent (backend
          // returns 404/500 on an org the browser cannot resolve).
          setActiveId(personal.id);
          activeIdRef.current = personal.id;
          setOrganizationId(personal.id);
          onChangeRef.current?.(personal.id);
        }
      }
    } catch (err) {
      if (!aliveRef.current) return;
      const attempt = attemptRef.current + 1;
      attemptRef.current = attempt;
      setError(err.message || 'Unable to load developer workspace.');
      if (attempt < MAX_AUTO_RETRIES) {
        retryTimerRef.current = setTimeout(() => {
          if (aliveRef.current) loadOrgs();
        }, BACKOFF_MS * attempt);
      } else {
        console.warn('[org] failed to load organizations after retries:', err?.message);
      }
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    loadOrgs();

    const onOrgChange = (e) => {
      const next = e.detail?.id || getOrganizationId();
      if (next !== activeIdRef.current) {
        activeIdRef.current = next;
        setActiveId(next);
        onChangeRef.current?.(next);
      }
      loadOrgs();
    };
     const onStorage = (e) => {
      if (e.key === 'gpay_org_id' && e.newValue !== activeIdRef.current) {
        const next = e.newValue && getOrganizationId() ? getOrganizationId() : null;
        activeIdRef.current = next;
        setActiveId(next);
        onChangeRef.current?.(next);
      }
    };
    window.addEventListener('organizationchange', onOrgChange);
    window.addEventListener('storage', onStorage);

    return () => {
      aliveRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      window.removeEventListener('organizationchange', onOrgChange);
      window.removeEventListener('storage', onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const retry = () => {
    attemptRef.current = 0;
    setError(null);
    loadOrgs();
  };

  const active = orgs?.find((o) => o.id === activeId) || null;

  const switchTo = (id) => {
    setActiveId(id);
    activeIdRef.current = id;
    setOrganizationId(id);
    setOpen(false);
    onChangeRef.current?.(id);
  };

  return (
    <div ref={rootRef} className="relative mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!orgs && !error}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 text-left transition-colors"
      >
        {!orgs && !error ? (
          <FiLoader size={16} className="text-zinc-500 animate-spin shrink-0" />
        ) : !orgs && error ? (
          <FiAlertTriangle size={16} className="text-amber-500 shrink-0" />
        ) : (
          <span className="w-6 h-6 shrink-0 rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
            {active?.name?.[0]?.toUpperCase() || 'O'}
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] uppercase tracking-widest text-zinc-500">Organization</span>
          <span className="block text-sm font-medium text-zinc-200 truncate">
            {orgs ? (active?.name || 'Select') : error ? 'Unavailable' : 'Loading…'}
          </span>
        </span>
        {orgs && !error && (
          <FiChevronDown size={14} className={`text-zinc-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {error && !orgs && (
        <div className="mt-2 rounded-lg border border-amber-800/60 bg-amber-950/30 p-2.5 space-y-2">
          <p className="flex items-start gap-1.5 text-[11px] text-amber-300 leading-snug">
            <FiAlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>Unable to load developer workspace.</span>
          </p>
          <button
            onClick={retry}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-amber-600/20 text-amber-300 border border-amber-700/50 hover:bg-amber-600/30 disabled:opacity-50"
          >
            {busy ? <FiLoader size={11} className="animate-spin" /> : <FiRefreshCw size={11} />}
            {busy ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {open && orgs && (
        <div role="listbox" aria-label="Organizations" className="absolute left-0 right-0 mt-2 z-40 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl shadow-black/50 p-2">
          <div className="max-h-60 overflow-y-auto space-y-1">
            {(orgs || []).map((o) => (
              <button
                type="button"
                key={o.id}
                role="option"
                aria-selected={o.id === activeId}
                onClick={() => switchTo(o.id)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-zinc-800 text-left text-sm"
              >
                <span className="w-6 h-6 shrink-0 rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                  {o.name?.[0]?.toUpperCase() || 'O'}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-zinc-200 truncate">{o.name}</span>
                  <span className="block text-[10px] uppercase tracking-wide text-zinc-500">
                    {o.isPersonal ? 'Personal' : o.role || 'member'}
                  </span>
                </span>
                {o.id === activeId && <FiCheck size={14} className="text-blue-400 shrink-0" />}
              </button>
            ))}
          </div>
          <div className="border-t border-zinc-800 mt-2 pt-2 space-y-1">
            <Link
              to="/developer/organizations"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-zinc-800 text-sm text-zinc-300"
            >
              <FiUsers size={14} className="text-zinc-500" /> Manage organizations
            </Link>
            <Link
              to="/developer/organizations"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-zinc-800 text-sm text-zinc-300"
            >
              <FiPlus size={14} className="text-zinc-500" /> Create organization
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgSwitcher;
