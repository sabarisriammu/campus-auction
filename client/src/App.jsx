import React, { useState, useEffect, useCallback } from "react";
import Navbar from "./components/Navbar";
import ListingsView from "./components/ListingsView";
import ListingDetailsModal from "./components/ListingDetailsModal";
import CreateListingModal from "./components/CreateListingModal";
import EditListingModal from "./components/EditListingModal";
import AuthModal from "./components/AuthModal";
import { api } from "./services/api";

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

  // Toast Notification
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
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
    setToken(null);
    setUser(null);
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
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenCreate={() => setIsCreateOpen(true)}
        onOpenAuth={(mode) => {
          setAuthMode(mode);
          setIsAuthOpen(true);
        }}
        onLogout={handleLogout}
      />

      {/* Main Content Body */}
      <main className="main-content">
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
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <p className="footer-text">
            🎓 Campus Auction • A peer-to-peer student marketplace. All items sold locally on campus.
          </p>
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
