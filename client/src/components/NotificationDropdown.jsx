import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import {
  BellIcon,
  GavelIcon,
  TrophyIcon,
  PackageIcon,
  HandshakeIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  RefreshIcon,
} from "./Icons";

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

  const renderNotifIcon = (type) => {
    switch (type) {
      case "NEW_BID":
      case "OUTBID":
        return (
          <div className="notif-avatar notif-avatar-amber">
            <GavelIcon size={14} />
          </div>
        );
      case "AUCTION_WON":
        return (
          <div className="notif-avatar notif-avatar-emerald">
            <TrophyIcon size={14} />
          </div>
        );
      case "AUCTION_SOLD":
      case "HANDOVER_COMPLETED":
        return (
          <div className="notif-avatar notif-avatar-emerald">
            <CheckCircleIcon size={14} />
          </div>
        );
      case "HANDOVER_STARTED":
      case "HANDOVER_SELLER_CONFIRMED":
      case "HANDOVER_BUYER_CONFIRMED":
        return (
          <div className="notif-avatar notif-avatar-blue">
            <HandshakeIcon size={14} />
          </div>
        );
      case "HANDOVER_DISPUTED":
        return (
          <div className="notif-avatar notif-avatar-red">
            <AlertTriangleIcon size={14} />
          </div>
        );
      default:
        return (
          <div className="notif-avatar notif-avatar-slate">
            <PackageIcon size={14} />
          </div>
        );
    }
  };

  const displayedNotifications = filterUnread
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  return (
    <div className="notification-wrapper" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        className={`notification-bell-btn ${isOpen ? "active" : ""}`}
        onClick={handleToggle}
        aria-label="View notifications"
        title="Notifications"
      >
        <BellIcon size={18} />
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
              <h4>Activity & Alerts</h4>
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
                <span>Checking live updates...</span>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="notification-empty">
                <div className="empty-bell-icon">
                  <BellIcon size={28} />
                </div>
                <p className="empty-title">All caught up</p>
                <p className="empty-desc">
                  {filterUnread
                    ? "You have no unread notifications right now."
                    : "Activity on your bids, auctions, and handovers will appear here in real time."}
                </p>
              </div>
            ) : (
              displayedNotifications.map((notif) => (
                <div
                  key={notif._id}
                  className={`notification-item ${!notif.isRead ? "unread" : ""}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="notif-icon-col">
                    {renderNotifIcon(notif.type)}
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
                        <span className="unread-dot"></span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="notification-footer">
            <button
              className="btn-refresh-notifs"
              onClick={fetchNotifications}
              disabled={loading}
            >
              <RefreshIcon size={13} />
              <span>Refresh Feed</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
