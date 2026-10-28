import React from "react";
import NotificationDropdown from "./NotificationDropdown";
import { GavelIcon, HandshakeIcon, PlusIcon, UserIcon, ShieldCheckIcon, BookmarkIcon } from "./Icons";

export default function Navbar({
  user,
  token,
  onOpenAuth,
  onLogout,
  onOpenCreate,
  activeTab,
  setActiveTab,
  unreadCount,
  setUnreadCount,
  notifications,
  setNotifications,
  loadingNotifications,
  fetchNotifications,
  onNavigate,
  watchlistCount = 0,
}) {
  const getRoleBadge = (role) => {
    switch (role) {
      case "admin":
        return (
          <span className="role-pill role-pill-admin">
            <ShieldCheckIcon size={12} />
            <span>Admin</span>
          </span>
        );
      case "seller":
        return (
          <span className="role-pill role-pill-seller">
            <span>Seller</span>
          </span>
        );
      default:
        return (
          <span className="role-pill role-pill-buyer">
            <span>Buyer</span>
          </span>
        );
    }
  };

  return (
    <header className="navbar">
      <div className="navbar-container">
        {/* Brand Crest & Identity */}
        <div
          className="navbar-brand"
          onClick={() => setActiveTab("browse")}
          role="button"
          tabIndex={0}
          title="Campus Auction - Home"
        >
          <div className="brand-crest">
            <GavelIcon size={22} className="brand-crest-icon" />
          </div>
          <div className="brand-text">
            <span className="brand-title">
              Campus<span className="brand-accent">Auction</span>
            </span>
            <span className="brand-subtitle">Verified College Exchange</span>
          </div>
        </div>

        {/* Center / Navigation Links */}
        <nav className="navbar-links">
          <button
            className={`nav-link ${activeTab === "browse" ? "active" : ""}`}
            onClick={() => setActiveTab("browse")}
          >
            <span>Live Marketplace</span>
          </button>

          {user?.role === "seller" ? (
            <button
              className={`nav-link ${activeTab === "assistant" ? "active" : ""}`}
              onClick={() => setActiveTab("assistant")}
              title="Buyer Questions & Answers Inbox"
            >
              <span style={{ marginRight: "0.35rem" }}>💬</span>
              <span>Buyer Q&A</span>
            </button>
          ) : (
            <button
              className={`nav-link ${activeTab === "assistant" ? "active" : ""}`}
              onClick={() => setActiveTab("assistant")}
              title="Campus AI Assistant: Smart Shopping, Q&A & Automatic Bidding"
            >
              <span className="nav-sparkle">✨</span>
              <span>AI Assistant</span>
            </button>
          )}

          {user && (
            <button
              className={`nav-link ${activeTab === "transactions" ? "active" : ""}`}
              onClick={() => setActiveTab("transactions")}
            >
              <HandshakeIcon size={16} className="nav-link-icon" />
              <span>My Handover</span>
            </button>
          )}

          {user && (
            <button
              className={`nav-link ${activeTab === "watchlist" ? "active" : ""}`}
              onClick={() => setActiveTab("watchlist")}
              title="My Watchlist / Saved Products"
            >
              <BookmarkIcon size={16} className="nav-link-icon" filled={activeTab === "watchlist"} />
              <span>Saved</span>
              {watchlistCount > 0 && <span className="nav-badge font-mono">{watchlistCount}</span>}
            </button>
          )}

          <button
            className="btn btn-primary btn-create"
            onClick={onOpenCreate}
            title={user?.role === "buyer" ? "Sellers only" : "Create new auction listing"}
          >
            <PlusIcon size={16} />
            <span>List Item</span>
          </button>
        </nav>

        {/* User Profile & Actions */}
        <div className="navbar-user">
          {user ? (
            <div className="user-profile-wrapper">
              <NotificationDropdown
                token={token}
                unreadCount={unreadCount}
                setUnreadCount={setUnreadCount}
                notifications={notifications}
                setNotifications={setNotifications}
                loading={loadingNotifications}
                fetchNotifications={fetchNotifications}
                onNavigate={onNavigate}
              />

              <div className="user-profile-card">
                <div className="user-avatar-badge" title={`${user.email} (${user.role || "buyer"})`}>
                  <div className="user-avatar-circle">
                    {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div className="user-info-col">
                    <span className="user-name">{user.name}</span>
                    {getRoleBadge(user.role)}
                  </div>
                </div>

                <button
                  className="btn-signout"
                  onClick={onLogout}
                  title="Sign out of your account"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <div className="auth-buttons">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onOpenAuth("login")}
              >
                Sign In
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onOpenAuth("register")}
              >
                Join Campus
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
