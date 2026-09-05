/**
 * Developer identity — a per-browser scoping key for the platform APIs.
 * Every /api/developers request carries this as the X-Developer-Id header,
 * giving each session its own isolated agent/wallet/usage/billing space.
 */

const KEY = 'gpay_developer_id';
const ORG_KEY = 'gpay_org_id';

// Organization ids are Postgres UUIDs. A stale/non-UUID value would otherwise be
// sent as X-Organization-Id and rejected by the API — return null instead.
const ORG_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export { ORG_KEY, ORG_UUID_RE };

export const getOrganizationId = () => {
  const id = localStorage.getItem(ORG_KEY);
  return id && ORG_UUID_RE.test(id) ? id : null;
};

export const setOrganizationId = (id) => {
  const value = String(id || '').trim();
  if (!value) localStorage.removeItem(ORG_KEY);
  else localStorage.setItem(ORG_KEY, value);
  // Dispatch a custom event so same-tab listeners (e.g. the sidebar OrgSwitcher)
  // can react to org changes without a full page reload. The native `storage`
  // event only fires in *other* tabs/windows, not the one that made the change.
  window.dispatchEvent(new CustomEvent('organizationchange', { detail: { id: value || null } }));
  return value;
};

export const getDeveloperId = () => {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `dev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
};

export const setDeveloperId = (id) => {
  const value = String(id || '').trim();
  if (!value) return getDeveloperId();
  localStorage.setItem(KEY, value);
  return value;
};
