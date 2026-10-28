import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api";

const NOTIFICATION_ICONS = {
  NEW_BID: "🏷️",
  OUTBID: "⚡",
  AUCTION_WON: "🏆",
  AUCTION_SOLD: "💰",
  AUCTION_UNSOLD: "📦",
  HANDOVER_STARTED: "📍",
  HANDOVER_SELLER_CONFIRMED: "🚚",
  HANDOVER_BUYER_CONFIRMED: "📦",
  HANDOVER_COMPLETED: "🎉",
  HANDOVER_DISPUTED: "⚠️",
  HANDOVER_RESOLVED: "✅",
};

export default function NotificationDropdown({
  token,
  unreadCount,
  setUnreadCount,
  notifications,
  setNotifications,
  loading,
  fetchNotifications,
  onNavigate,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      fetchNotifications();
    }
  };

  const handleMarkAsRead = async (e, notif) => {
    e.stopPropagation();
    if (notif.isRead) return;
    try {
      await api.markNotificationAsRead(notif._id, token);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notif._id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark notification as read:", err.message);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsAsRead(token);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err.message);
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.isRead) {
      try {
        await api.markNotificationAsRead(notif._id, token);
        setNotifications((prev) =>
          prev.map((n) => (n._id === notif._id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error("Failed to mark notification as read:", err.message);
      }
    }
    setIsOpen(false);

    // Contextual navigation
    if (onNavigate) {
      if (
        notif.type.startsWith("HANDOVER_") ||
        notif.transaction ||
        notif.type === "AUCTION_WON" ||
        notif.type === "AUCTION_SOLD"
      ) {
        onNavigate("transactions", notif.transaction?._id || notif.transaction);
      } else if (notif.listing) {
        const listingId = notif.listing._id || notif.listing;
        onNavigate("listing", listingId);
      }
    }
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const displayedNotifications = filterUnread
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        className="notification-bell-btn"
        onClick={handleToggle}
        aria-label="View notifications"
        title="Notifications"
      >
        <span className="bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <div className="notification-header-title">
              <h4>Notifications</h4>
              {unreadCount > 0 && (
                <span className="header-count-pill">{unreadCount} new</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                className="btn-mark-all"
                onClick={handleMarkAllRead}
                title="Mark all as read"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="notification-filter-bar">
            <button
              className={`filter-pill ${!filterUnread ? "active" : ""}`}
              onClick={() => setFilterUnread(false)}
            >
              All ({notifications.length})
            </button>
            <button
              className={`filter-pill ${filterUnread ? "active" : ""}`}
              onClick={() => setFilterUnread(true)}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notification List */}
          <div className="notification-list">
            {loading && notifications.length === 0 ? (
              <div className="notification-loading">
                <div className="spinner-sm"></div>
                <span>Loading notifications...</span>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="notification-empty">
                <span className="empty-bell">🔕</span>
                <p>
                  {filterUnread
                    ? "No unread notifications."
                    : "No notifications yet. Activity on your bids, listings, and handovers will appear here."}
                </p>
              </div>
            ) : (
              displayedNotifications.map((notif) => {
                const icon = NOTIFICATION_ICONS[notif.type] || "📢";
                return (
                  <div
                    key={notif._id}
                    className={`notification-item ${!notif.isRead ? "unread" : ""}`}
                    onClick={() => handleNotificationClick(notif)}
                  >
                    <div className="notif-icon-col">
                      <span className="notif-type-icon">{icon}</span>
                    </div>

                    <div className="notif-content-col">
                      <div className="notif-title-row">
                        <span className="notif-title">{notif.title}</span>
                        <span className="notif-time">{formatTimeAgo(notif.createdAt)}</span>
                      </div>
                      <p className="notif-message">{notif.message}</p>
                    </div>

                    {!notif.isRead && (
                      <div className="notif-action-col">
                        <button
                          className="btn-mark-single"
                          title="Mark as read"
                          onClick={(e) => handleMarkAsRead(e, notif)}
                        >
                          ●
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="notification-footer">
            <button
              className="btn-refresh-notifs"
              onClick={fetchNotifications}
              disabled={loading}
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
