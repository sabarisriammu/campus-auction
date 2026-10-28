import React from "react";

export default function Navbar({
  user,
  onOpenAuth,
  onLogout,
  onOpenCreate,
  activeTab,
  setActiveTab,
}) {
  const getRoleBadge = (role) => {
    switch (role) {
      case "admin":
        return <span className="role-pill role-pill-admin">Admin</span>;
      case "seller":
        return <span className="role-pill role-pill-seller">Seller</span>;
      default:
        return <span className="role-pill role-pill-buyer">Buyer</span>;
    }
  };

  return (
    <header className="navbar">
      <div className="navbar-container">
        <div
          className="navbar-brand"
          onClick={() => setActiveTab("browse")}
          role="button"
          tabIndex={0}
        >
          <span className="brand-icon">🎓</span>
          <div className="brand-text">
            <span className="brand-title">Campus Auction</span>
            <span className="brand-subtitle">Student Marketplace</span>
          </div>
        </div>

        <nav className="navbar-links">
          <button
            className={`nav-link ${activeTab === "browse" ? "active" : ""}`}
            onClick={() => setActiveTab("browse")}
          >
            Browse Auctions
          </button>

          <button
            className="btn btn-primary btn-create"
            onClick={onOpenCreate}
            title={user?.role === "buyer" ? "Sellers only" : "Create new auction"}
          >
            <span>+</span> List an Item
          </button>
        </nav>

        <div className="navbar-user">
          {user ? (
            <div className="user-profile">
              <div className="user-badge" title={`${user.email} (${user.role || "buyer"})`}>
                <span className="user-avatar">
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </span>
                <span className="user-name">{user.name}</span>
                {getRoleBadge(user.role)}
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={onLogout}
                title="Sign out of your account"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="auth-buttons">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => onOpenAuth("login")}
              >
                Sign In
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onOpenAuth("register")}
              >
                Register
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
