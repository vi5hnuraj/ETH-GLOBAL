import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiBell, FiCheck, FiUserPlus, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import developerApi from '../../utils/developerApi';

const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);
  const navigate = useNavigate();

  const fetchNotifications = useCallback(async () => {
    try {
      const { notifications: items, unread: count } = await developerApi.notifications();
      setNotifications(items);
      setUnread(count);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleMarkAllRead = async () => {
    try {
      await developerApi.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch { /* silent */ }
  };

  const handleClick = async (notif) => {
    if (!notif.read) {
      try { await developerApi.markNotificationRead(notif.id); } catch { /* silent */ }
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n));
      setUnread((u) => Math.max(0, u - 1));
    }
    if (notif.action_url) {
      navigate(notif.action_url);
    }
    setOpen(false);
  };

  const notifIcon = (type) => {
    if (type === 'org_invitation') return <FiUserPlus size={14} className="text-blue-400" />;
    return <FiBell size={14} className="text-zinc-400" />;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        title="Notifications"
      >
        <FiBell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 max-h-[480px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Notifications</h3>
              {unread > 0 && (
                <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-full">{unread}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                >
                  <FiCheck size={11} /> Mark all read
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <FiX size={14} />
              </button>
            </div>
          </div>

          {/* Notifications list */}
          <div className="overflow-y-auto max-h-[400px]">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <FiBell size={24} className="text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-zinc-800/60 hover:bg-zinc-800/50 transition-colors ${
                    !n.read ? 'bg-blue-500/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 mt-0.5">{notifIcon(n.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.read ? 'font-medium text-zinc-100' : 'text-zinc-300'} truncate`}>{n.title}</p>
                      {n.body && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-zinc-600 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                    {!n.read && <span className="shrink-0 h-2 w-2 rounded-full bg-blue-500 mt-1.5" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
