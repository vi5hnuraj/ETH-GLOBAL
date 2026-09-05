import { useState, useEffect } from 'react';
import { getDeveloperId, getOrganizationId } from '../utils/identity';

/**
 * useCurrentAccount — reactive view of the active developer + organization.
 * Identity is stored per-browser in localStorage and changes via
 * `setOrganizationId` / explicit developer id switches. Those dispatch the
 * window `organizationchange` event (and the native `storage` event fires in
 * other tabs), but neither is a React state change — so lists keyed on the old
 * account would otherwise keep showing stale, cross-account data.
 *
 * Returns `{ developerId, organizationId }`, updated on any identity change.
 */
const useCurrentAccount = () => {
  const [account, setAccount] = useState(() => ({
    developerId: getDeveloperId(),
    organizationId: getOrganizationId()
  }));

  useEffect(() => {
    const refresh = () =>
      setAccount({ developerId: getDeveloperId(), organizationId: getOrganizationId() });
    refresh();
    window.addEventListener('organizationchange', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('organizationchange', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return account;
};

export default useCurrentAccount;