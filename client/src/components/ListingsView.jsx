import React from "react";
import ListingCard from "./ListingCard";

const CATEGORIES = [
  "All",
  "Textbooks",
  "Electronics",
  "Furniture",
  "Clothing",
  "Vehicles & Scooters",
  "Supplies",
  "Other",
];

export default function ListingsView({
  listings,
  loading,
  error,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  onSelectListing,
  onRefresh,
  user,
  onOpenCreate,
}) {
  const hasActiveFilters = searchQuery.trim() !== "" || selectedCategory !== "All";

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("All");
  };

  return (
    <div className="listings-view">
      {/* Hero Banner */}
      <section className="hero-banner">
        <div className="hero-content">
          <span className="hero-pill">🎓 Student Campus Exchange • 🇮🇳 All Bids in ₹ (INR)</span>
          <h1 className="hero-title">Discover, Bid & Sell on Campus</h1>
          <p className="hero-subtitle">
            Find peer-to-peer deals on textbooks, tech, dorm essentials, and campus gear with transparent timed auctions.
          </p>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <section className="toolbar-section">
        <div className="search-bar-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by title or description (e.g., calculus, ipad, chair)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="search-clear-btn"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="category-pills">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`category-pill ${selectedCategory === cat ? "active" : ""}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Active Filters Bar */}
        <div className="filter-summary">
          <span className="results-count">
            {loading ? "Searching auctions..." : `${listings.length} auction${listings.length === 1 ? "" : "s"} found`}
          </span>

          {hasActiveFilters && (
            <button className="btn-link" onClick={handleClearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      </section>

      {/* Main Content Area */}
      <section className="listings-grid-section">
        {loading && (
          <div className="state-container">
            <div className="spinner"></div>
            <p className="state-text">Loading campus auctions...</p>
          </div>
        )}

        {error && !loading && (
          <div className="state-container state-error">
            <span className="state-icon">⚠️</span>
            <h3>Unable to load auctions</h3>
            <p className="state-text">{error}</p>
            <button className="btn btn-primary btn-sm" onClick={onRefresh}>
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && listings.length === 0 && (
          <div className="state-container state-empty">
            <span className="state-icon">📦</span>
            <h3>No auctions found</h3>
            <p className="state-text">
              {hasActiveFilters
                ? "No listings match your current search or category filter."
                : "There are currently no active auctions on campus."}
            </p>
            <div className="state-buttons">
              {hasActiveFilters && (
                <button className="btn btn-outline" onClick={handleClearFilters}>
                  Clear Filters
                </button>
              )}
              <button className="btn btn-primary" onClick={onOpenCreate}>
                + Create the First Listing
              </button>
            </div>
          </div>
        )}

        {!loading && !error && listings.length > 0 && (
          <div className="listings-grid">
            {listings.map((item) => (
              <ListingCard
                key={item._id}
                listing={item}
                onSelect={onSelectListing}
                isOwner={user && item.seller && (user.id === (item.seller._id || item.seller))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
