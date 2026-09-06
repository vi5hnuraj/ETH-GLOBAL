import React, { useState, useEffect } from 'react';
import { FiBell, FiUserPlus, FiCheckCircle, FiXCircle, FiRefreshCw, FiLoader, FiClock } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import developerApi from '../../utils/developerApi';
import Card from '../../components/dev/Card';
import Skeleton from '../../components/dev/Skeleton';
import ErrorBanner from '../../components/dev/ErrorBanner';
import EmptyState from '../../components/dev/EmptyState';
import useApi from '../../hooks/useApi';

const DevNotifications = () => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null); // notification id being acted on

  const notifRes = useApi({ fetcher: () => developerApi.notifications() });
  const notifications = notifRes.data?.notifications || [];
  const unread = notifRes.data?.unread || 0;

  const markRead = async (id) => {
    try {
      await developerApi.markNotificationRead(id);
      notifRes.refresh();
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      await developerApi.markAllNotificationsRead();
      notifRes.refresh();
    } catch { /* silent */ }
  };

  const handleAccept = async (notif) => {
    const { orgId, token, orgName } = notif.data || {};
    if (!orgId || !token) return toast.error('Invalid invitation');
    setBusy(notif.id);
    try {
      await developerApi.acceptInvitation(orgId, token);
      toast.success(`You joined ${orgName || 'the organization'}!`);
      notifRes.refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to accept');
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async (notif) => {
    const { orgId, token } = notif.data || {};
    if (!orgId || !token) return;
    setBusy(notif.id);
    try {
      await developerApi.declineInvitation(orgId, token);
      toast.success('Invitation declined');
      notifRes.refresh();
    } catch (err) {
      toast.error(err.message || 'Failed to decline');
    } finally {
      setBusy(null);
    }
  };

  if (notifRes.loading && !notifRes.data) {
    return (
      <div>
        <Skeleton className="h-8 w-48 rounded mb-6" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (notifRes.error && !notifRes.data) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Notifications</h1>
        <ErrorBanner message={notifRes.error.message} onRetry={notifRes.refresh} />
      </div>
    );
  }

  const invitations = notifications.filter((n) => n.type === 'org_invitation');
  const others = notifications.filter((n) => n.type !== 'org_invitation');

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {unread > 0 ? `${unread} unread notification${unread > 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>
        <div className="flex gap-2">
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700"
            >
              <FiCheckCircle size={14} /> Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={() => notifRes.refresh()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700"
          >
            <FiRefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      {/* Invitation Notifications */}
      {invitations.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Team Invitations</h2>
          <div className="space-y-3">
            {invitations.map((n) => {
              const data = n.data || {};
              const isPending = n.action_url && !n.read;
              return (
                <div
                  key={n.id}
                  className={`rounded-xl border p-4 ${
                    !n.read ? 'border-blue-800/60 bg-blue-500/5' : 'border-zinc-800 bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-700/50 flex items-center justify-center shrink-0">
                      <FiUserPlus size={18} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100">{n.title}</p>
                      {n.body && <p className="text-xs text-zinc-500 mt-1 whitespace-pre-line">{n.body}</p>}
                      <p className="text-[11px] text-zinc-600 mt-2 flex items-center gap-1">
                        <FiClock size={10} /> {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                    {isPending && data.orgId && data.token && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busy === n.id}
                          onClick={async () => {
                            setBusy(n.id);
                            try {
                              await developerApi.acceptInvitation(data.orgId, data.token);
                              toast.success(`Joined ${data.orgName || 'organization'}!`);
                              markRead(n.id);
                              notifRes.refresh();
                            } catch (err) {
                              toast.error(err.message || 'Failed to accept');
                            } finally {
                              setBusy(null);
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                        >
                          {busy === n.id ? <FiLoader size={12} className="animate-spin" /> : <FiCheckCircle size={12} />}
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={busy === n.id}
                          onClick={async () => {
                            setBusy(n.id);
                            try {
                              await developerApi.declineInvitation(data.orgId, data.token);
                              toast.success('Invitation declined');
                              markRead(n.id);
                              notifRes.refresh();
                            } catch (err) {
                              toast.error(err.message || 'Failed to decline');
                            } finally {
                              setBusy(null);
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-50"
                        >
                          <FiXCircle size={12} /> Decline
                        </button>
                      </div>
                    )}
                    {!isPending && (
                      <span className="text-[10px] text-zinc-600 shrink-0 mt-1">
                        {n.read ? '✓ Read' : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Other Notifications */}
      {others.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Other</h2>
          <div className="space-y-3">
            {others.map((n) => (
              <div
                key={n.id}
                onClick={() => markRead(n.id)}
                className={`rounded-xl border p-4 cursor-pointer ${
                  !n.read ? 'border-zinc-700 bg-zinc-800/50' : 'border-zinc-800 bg-zinc-900/30'
                } hover:bg-zinc-800/50`}
              >
                <p className="text-sm text-zinc-200">{n.title}</p>
                {n.body && <p className="text-xs text-zinc-500 mt-1">{n.body}</p>}
                <p className="text-[11px] text-zinc-600 mt-2">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {notifications.length === 0 && (
        <EmptyState
          icon={<FiBell size={26} />}
          title="No notifications yet"
          description="When someone invites you to an organization, you'll see the invitation here. You can accept or decline directly from this page."
        />
      )}
    </div>
  );
};

export default DevNotifications;
