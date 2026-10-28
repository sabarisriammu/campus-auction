import React, { useState, useEffect, useCallback } from "react";
import Navbar from "./components/Navbar";
import ListingsView from "./components/ListingsView";
import ListingDetailsModal from "./components/ListingDetailsModal";
import CreateListingModal from "./components/CreateListingModal";
import EditListingModal from "./components/EditListingModal";
import AuthModal from "./components/AuthModal";
import TransactionsView from "./components/TransactionsView";
import { api } from "./services/api";
import { getSocket, disconnectSocket } from "./services/socket";

export default function App() {
  // Authentication State
  const [token, setToken] = useState(() => localStorage.getItem("campus_token") || null);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("campus_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Listings & Filter State
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Navigation & Modals State
  const [activeTab, setActiveTab] = useState("browse");
  const [selectedListing, setSelectedListing] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingListing, setEditingListing] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [isCancelling, setIsCancelling] = useState(false);

  // Notifications State (Module 8)
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Fetch Notifications from REST API
  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    setLoadingNotifications(true);
    try {
      const data = await api.getNotifications(token, { limit: 25 });
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      console.warn("Failed to fetch notifications:", err.message);
    } finally {
      setLoadingNotifications(false);
    }
  }, [token]);

  // Fetch Unread Notification Count
  const fetchUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.getUnreadNotificationCount(token);
      setUnreadCount(data.count || 0);
    } catch (err) {
      console.warn("Failed to fetch unread count:", err.message);
    }
  }, [token]);

  // Real-Time Socket.IO Notification Subscriptions
  useEffect(() => {
    if (!token || !user) {
      disconnectSocket();
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    // Initial load
    fetchNotifications();
    fetchUnreadCount();

    // Establish WebSocket connection
    const socket = getSocket(token);
    if (!socket) return;

    const handleNewNotification = (newNotif) => {
      setNotifications((prev) => [newNotif, ...prev.filter((n) => n._id !== newNotif._id)]);
      setUnreadCount((prev) => prev + 1);
      showToast(`📢 ${newNotif.title}: ${newNotif.message}`, "info");
    };

    const handleUnreadCountUpdate = (data) => {
      if (typeof data?.count === "number") {
        setUnreadCount(data.count);
      }
    };

    socket.on("notification:new", handleNewNotification);
    socket.on("notification:unread-count", handleUnreadCountUpdate);

    return () => {
      socket.off("notification:new", handleNewNotification);
      socket.off("notification:unread-count", handleUnreadCountUpdate);
    };
  }, [token, user, fetchNotifications, fetchUnreadCount]);

  // Notification Navigation Handler
  const handleNotificationNavigate = (destination, targetId) => {
    if (destination === "transactions") {
      setActiveTab("transactions");
    } else if (destination === "listing" && targetId) {
      handleSelectListing(targetId);
    }
  };

  // Auth Handlers
  const handleLogin = async (credentials) => {
    const data = await api.login(credentials);
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("campus_token", data.token);
    localStorage.setItem("campus_user", JSON.stringify(data.user));
    showToast(`Welcome back, ${data.user.name}!`);
  };

  const handleRegister = async (userData) => {
    await api.register(userData);
    // Automatically log in after registration
    const loginData = await api.login({
      email: userData.email,
      password: userData.password,
    });
    setToken(loginData.token);
    setUser(loginData.user);
    localStorage.setItem("campus_token", loginData.token);
    localStorage.setItem("campus_user", JSON.stringify(loginData.user));
    setIsAuthOpen(false);
    showToast(`Account created! Welcome, ${loginData.user.name}!`);
  };

  const handleLogout = () => {
    disconnectSocket();
    setToken(null);
    setUser(null);
    setNotifications([]);
    setUnreadCount(0);
    localStorage.removeItem("campus_token");
    localStorage.removeItem("campus_user");
    showToast("You have been signed out.", "info");
  };

  const handleAuthError = (err) => {
    if (err.status === 401) {
      handleLogout();
      showToast("Session expired. Please sign in again.", "danger");
      setIsAuthOpen(true);
      setAuthMode("login");
    }
  };

  // Load Listings
  const loadListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getListings({
        search: searchQuery,
        category: selectedCategory,
        status: "active",
      });
      setListings(data.listings || []);
    } catch (err) {
      setError(err.message || "Failed to load listings from server.");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    // Debounce search slightly for responsive typing
    const timer = setTimeout(() => {
      loadListings();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadListings]);

  // View Listing Details
  const handleSelectListing = async (id) => {
    setDetailsLoading(true);
    try {
      const data = await api.getListingById(id);
      setSelectedListing(data.listing);
    } catch (err) {
      showToast(err.message || "Failed to load listing details.", "danger");
    } finally {
      setDetailsLoading(false);
    }
  };

  // Create Listing
  const handleCreateListing = async (formData) => {
    try {
      const data = await api.createListing(formData, token);
      showToast("Listing created successfully!");
      loadListings();
      setSelectedListing(data.listing);
    } catch (err) {
      handleAuthError(err);
      throw err;
    }
  };

  // Update Listing
  const handleUpdateListing = async (id, updateData) => {
    try {
      const data = await api.updateListing(id, updateData, token);
      showToast("Listing updated successfully!");
      setSelectedListing(data.listing);
      loadListings();
    } catch (err) {
      handleAuthError(err);
      throw err;
    }
  };

  // Cancel Listing
  const handleCancelListing = async (id) => {
    setIsCancelling(true);
    try {
      const data = await api.cancelListing(id, token);
      showToast("Listing has been cancelled.", "info");
      setSelectedListing(data.listing);
      loadListings();
    } catch (err) {
      handleAuthError(err);
      showToast(err.message || "Failed to cancel listing.", "danger");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="app-container">
      {/* Toast Alert */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span>{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Main Navigation */}
      <Navbar
        user={user}
        token={token}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenCreate={() => setIsCreateOpen(true)}
        onOpenAuth={(mode) => {
          setAuthMode(mode);
          setIsAuthOpen(true);
        }}
        onLogout={handleLogout}
        unreadCount={unreadCount}
        setUnreadCount={setUnreadCount}
        notifications={notifications}
        setNotifications={setNotifications}
        loadingNotifications={loadingNotifications}
        fetchNotifications={fetchNotifications}
        onNavigate={handleNotificationNavigate}
      />

      {/* Main Content Body */}
      <main className="main-content">
        {activeTab === "transactions" ? (
          <TransactionsView
            user={user}
            token={token}
            onSwitchToBrowse={() => setActiveTab("browse")}
            showToast={showToast}
          />
        ) : (
          <ListingsView
            listings={listings}
            loading={loading}
            error={error}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            onSelectListing={handleSelectListing}
            onRefresh={loadListings}
            user={user}
            onOpenCreate={() => setIsCreateOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-brand-row">
            <span className="footer-brand-title">Campus Auction Exchange</span>
            <span className="footer-badge">Collegiate P2P Network</span>
          </div>
          <p className="footer-text">
            All auctions are peer-to-peer student transactions conducted on university grounds. Zero listing fees, transparent live bidding in ₹ (INR), and physical handover verification.
          </p>
          <div className="footer-bottom-row">
            <span>© 2026 Campus Auction Platform</span>
            <span>•</span>
            <span>Secure Student Handover Protocol</span>
          </div>
        </div>
      </footer>

      {/* Details Modal */}
      {selectedListing && (
        <ListingDetailsModal
          listing={selectedListing}
          user={user}
          token={token}
          onClose={() => setSelectedListing(null)}
          onEdit={(item) => setEditingListing(item)}
          onCancel={handleCancelListing}
          isCancelling={isCancelling}
          onOpenTransactions={() => {
            setSelectedListing(null);
            setActiveTab("transactions");
          }}
          onBidSuccess={(listingId, newPrice) => {
            setSelectedListing((prev) => (prev ? { ...prev, currentPrice: newPrice } : null));
            setListings((prev) =>
              prev.map((l) => (l._id === listingId ? { ...l, currentPrice: newPrice } : l))
            );
          }}
          onOpenAuth={(mode) => {
            setAuthMode(mode);
            setIsAuthOpen(true);
          }}
        />
      )}

      {/* Create Modal */}
      <CreateListingModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateListing}
        user={user}
        token={token}
        onOpenAuth={(mode) => {
          setAuthMode(mode);
          setIsAuthOpen(true);
        }}
      />

      {/* Edit Modal */}
      {editingListing && (
        <EditListingModal
          listing={editingListing}
          isOpen={!!editingListing}
          onClose={() => setEditingListing(null)}
          onSubmit={handleUpdateListing}
          token={token}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authMode}
        onClose={() => setIsAuthOpen(false)}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    </div>
  );
}
