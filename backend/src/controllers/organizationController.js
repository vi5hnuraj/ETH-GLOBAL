/**
 * OrganizationController — multi-tenant organizations, members, invitations,
 * roles, permissions, settings and org audit logs.
 *
 * Authorization is enforced declaratively in the routes via
 * requirePermission(permission); handlers assume the request already passed
 * membership + role + scope checks.
 */

import {
  listMyOrganizations,
  ensurePersonalOrg,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  listMembers,
  changeMemberRole,
   removeMember as removeOrgMember,
  leaveOrganization,
  transferOwnership,
  inviteMember,
  listInvitations,
  cancelInvitation,
  acceptInvitation,
  declineInvitation,
  myInvitations,
  getOrgSettings,
  updateOrgSettings,
  listOrgAuditLogs,
  createNotification,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  unreadNotificationCount,
  searchByTag,
  inviteByTag
} from '../services/organizationService.js';
import { ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, PERMISSIONS, permissionsForRole } from '../config/roles.js';
import { ok, handleError } from '../utils/respond.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const listMyOrgs = async (req, res) => {
  try {
    // Always prefer JWT user ID over dev_xxxxx browser IDs
    const jwtId = req.user?.id;
    const devId = req.developerId;

    // If we have a JWT user ID that differs from the dev ID, query BOTH
    // and merge (the JWT path finds real orgs, the dev_id path finds legacy ones)
    let orgs = [];
    if (jwtId && UUID_RE.test(jwtId)) {
      orgs = await listMyOrganizations(jwtId);
    }
    // Also check devId path for any legacy orgs not linked via JWT
    if (devId && devId !== jwtId) {
      const legacyOrgs = await listMyOrganizations(devId);
      // Merge without duplicates
      const existingIds = new Set(orgs.map((o) => o.id));
      for (const o of (legacyOrgs || [])) {
        if (!existingIds.has(o.id)) orgs.push(o);
      }
    }
    if (!orgs || orgs.length === 0) {
      // Only create personal org for valid UUID users
      const creatorId = (jwtId && UUID_RE.test(jwtId)) ? jwtId : devId;
      if (UUID_RE.test(creatorId)) {
        await ensurePersonalOrg(creatorId);
        orgs = await listMyOrganizations(creatorId);
      }
    }
    ok(res, { organizations: orgs });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const create = async (req, res) => {
  try {
    const { name, slug, avatarUrl, metadata } = req.body || {};
    ok(res, { organization: await createOrganization({ developerId: req.user?.id || req.developerId, name, slug, avatarUrl, metadata }) }, 201);
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const current = async (req, res) => {
  try {
    if (req.orgResolutionError) {
      // Stale/deleted org — auto-recover by returning the user's first valid org
      const jwtId = req.user?.id;
      if (jwtId) {
        const fallbackOrgs = await listMyOrganizations(jwtId);
        if (fallbackOrgs && fallbackOrgs.length > 0) {
          const first = fallbackOrgs[0];
          return ok(res, {
            organization: { id: first.id, slug: first.slug, name: first.name, avatarUrl: first.avatarUrl, metadata: first.metadata },
            membership: first.membership || { role: 'owner' }
          });
        }
      }
      const e = req.orgResolutionError;
      return res.status(e.status).json({ success: false, message: e.message, code: e.code });
    }
    if (!req.organization || !req.membership) {
      return res.status(403).json({ success: false, message: 'Organization membership required.', code: 'ORG_REQUIRED' });
    }
    ok(res, {
      organization: {
        id: req.organization.id,
        slug: req.organization.slug,
        name: req.organization.name,
        avatarUrl: req.organization.avatar_url,
        metadata: req.organization.metadata,
        isPersonal: req.organization.is_personal
      },
      membership: {
        role: req.membership.role,
        joinedAt: req.membership.joined_at
      },
      permissions: permissionsForRole(req.membership.role)
    });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const update = async (req, res) => {
  try {
    ok(res, await updateOrganization({ orgId: req.params.orgId, actorId: req.developerId, patch: req.body || {} }));
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const remove = async (req, res) => {
  try {
    ok(res, await deleteOrganization({ orgId: req.params.orgId, actorId: req.developerId }));
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const members = async (req, res) => {
  try {
    ok(res, { members: await listMembers(req.params.orgId) });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const changeRole = async (req, res) => {
  try {
    const { role } = req.body || {};
    ok(res, await changeMemberRole({ orgId: req.params.orgId, actorId: req.developerId, memberId: req.params.memberId, role }));
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const removeMember = async (req, res) => {
  try {
    ok(res, await removeOrgMember({ orgId: req.params.orgId, actorId: req.developerId, memberId: req.params.memberId }));
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const leave = async (req, res) => {
  try {
    ok(res, await leaveOrganization({ orgId: req.params.orgId, developerId: req.developerId }));
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const transfer = async (req, res) => {
  try {
    const { toDeveloperId, memberId } = req.body || {};
    ok(res, await transferOwnership({ orgId: req.params.orgId, actorId: req.developerId, toDeveloperId, memberId }));
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const invitations = async (req, res) => {
  try {
    // Pass the current user's email so invites addressed TO them are excluded
    // (those appear in the Notifications page instead)
    const userEmail = req.user?.email || req.userEmail || null;
    ok(res, { invitations: await listInvitations(req.params.orgId, userEmail) });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const invite = async (req, res) => {
  try {
    const { email, role } = req.body || {};
    ok(res, { invitation: await inviteMember({ orgId: req.params.orgId, actorId: req.developerId, email, role }) }, 201);
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const cancelInvite = async (req, res) => {
  try {
    ok(res, await cancelInvitation({ orgId: req.params.orgId, actorId: req.developerId, token: req.params.token }));
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const acceptInvite = async (req, res) => {
  try {
    ok(res, await acceptInvitation({ orgId: req.params.orgId, token: req.params.token, developerId: req.developerId }));
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const declineInvite = async (req, res) => {
  try {
    ok(res, await declineInvitation({ orgId: req.params.orgId, token: req.params.token, developerId: req.developerId }));
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const myInvites = async (req, res) => {
  try {
    // Prefer JWT email over query param (query may contain dev_xxxxx ID)
    const email = req.user?.email || req.query.email;
    if (!email) return ok(res, { invitations: [] });
    ok(res, { invitations: await myInvitations({ email }) });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const settings = async (req, res) => {
  try {
    ok(res, { settings: await getOrgSettings(req.params.orgId) });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const updateSettings = async (req, res) => {
  try {
    ok(res, { settings: await updateOrgSettings({ orgId: req.params.orgId, actorId: req.developerId, patch: req.body || {} }) });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const auditLogs = async (req, res) => {
  try {
    ok(res, { auditLogs: await listOrgAuditLogs(req.params.orgId, req.query.limit) });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const rolesCatalog = async (_req, res) => {
  ok(res, {
    roles: ROLES.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      description: ROLE_DESCRIPTIONS[role],
      permissions: permissionsForRole(role)
    }))
  });
};

export const permissions = async (req, res) => {
  try {
    if (req.orgResolutionError) {
      const e = req.orgResolutionError;
      return res.status(e.status).json({ success: false, message: e.message, code: e.code });
    }
    if (!req.organization || !req.membership) {
      return res.status(403).json({ success: false, message: 'Organization membership required.', code: 'ORG_REQUIRED' });
    }
    ok(res, {
      catalog: PERMISSIONS,
      role: req.membership.role,
      myPermissions: permissionsForRole(req.membership.role)
    });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

// ==================== Notifications ====================

const isValidUUID = (v) => v && UUID_RE.test(v);

export const getNotifications = async (req, res) => {
  try {
    const recipientId = req.user?.id || req.developerId;
    if (!recipientId || !isValidUUID(recipientId)) return ok(res, { notifications: [], unread: 0 });
    const notifications = await listNotifications({ recipientId, unreadOnly: req.query.unread === 'true' });
    const unread = await unreadNotificationCount({ recipientId });
    ok(res, { notifications, unread });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const markNotification = async (req, res) => {
  try {
    const recipientId = req.user?.id || req.developerId;
    if (!recipientId || !isValidUUID(recipientId)) return ok(res, { read: true });
    await markNotificationRead({ notificationId: req.params.id, recipientId });
    ok(res, { read: true });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const markAllNotifications = async (req, res) => {
  try {
    const recipientId = req.user?.id || req.developerId;
    if (!recipientId || !isValidUUID(recipientId)) return ok(res, { read: true });
    await markAllNotificationsRead({ recipientId });
    ok(res, { read: true });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

// ==================== Tag-based search & invite ====================

export const searchUsersByTag = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return ok(res, { users: [] });
    const users = await searchByTag({ query: q });
    ok(res, { users });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};

export const inviteByTagHandler = async (req, res) => {
  try {
    const { tag, role } = req.body;
    const actorId = req.user?.id || req.developerId;
    const orgId = req.params.orgId;
    const result = await inviteByTag({ orgId, actorId, tag, role });
    ok(res, { invitation: result });
  } catch (err) {
    handleError(res, err, 'orgs');
  }
};
