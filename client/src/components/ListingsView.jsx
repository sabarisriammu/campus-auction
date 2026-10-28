import React, { useState, useMemo } from "react";
import ListingCard from "./ListingCard";
import {
  SearchIcon,
  XIcon,
  SortIcon,
  PlusIcon,
  PackageIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  ClockIcon,
  HandshakeIcon,
} from "./Icons";

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
  savedListingIds = new Set(),
  onToggleWatchlist,
}) {
  const [sortBy, setSortBy] = useState("endingSoon");

  const hasActiveFilters = searchQuery.trim() !== "" || selectedCategory !== "All";

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("All");
  };

  // Dynamic Category Counts
  const categoryCounts = useMemo(() => {
    const counts = { All: listings.length };
    CATEGORIES.forEach((cat) => {
      if (cat !== "All") {
        counts[cat] = listings.filter((item) => item.category === cat).length;
      }
    });
    return counts;
  }, [listings]);

  // Client-side Sort Ordering
  const sortedListings = useMemo(() => {
    const list = [...listings];
    switch (sortBy) {
      case "endingSoon":
        return list.sort((a, b) => new Date(a.auctionEndTime) - new Date(b.auctionEndTime));
      case "priceAsc":
        return list.sort(
          (a, b) =>
            (a.currentPrice || a.startingPrice || 0) -
            (b.currentPrice || b.startingPrice || 0)
        );
      case "priceDesc":
        return list.sort(
          (a, b) =>
            (b.currentPrice || b.startingPrice || 0) -
            (a.currentPrice || a.startingPrice || 0)
        );
      case "newest":
        return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      default:
        return list;
    }
  }, [listings, sortBy]);

  return (
    <div className="listings-view">
      {/* Live Campus Ticker Bar */}
      <div className="campus-ticker-bar">
        <div className="ticker-item">
          <span className="live-indicator-dot"></span>
          <span>Live Bidding Active</span>
        </div>
        <div className="ticker-divider">•</div>
        <div className="ticker-item">
          <ShieldCheckIcon size={14} className="ticker-icon" />
          <span>Verified Student Community</span>
        </div>
        <div className="ticker-divider">•</div>
        <div className="ticker-item">
          <HandshakeIcon size={14} className="ticker-icon" />
          <span>Secure In-Person Handover</span>
        </div>
        <div className="ticker-divider">•</div>
        <div className="ticker-item">
          <span>Zero Platform Fees</span>
        </div>
      </div>

      {/* Hero Section */}
      <section className="hero-banner">
        <div className="hero-content">
          <div className="hero-tag-wrapper">
            <span className="hero-tag">Official Campus Marketplace</span>
          </div>
          <h1 className="hero-title">
            The collegiate marketplace for <span className="text-highlight">timed auctions.</span>
          </h1>
          <p className="hero-subtitle">
            Bid on textbooks, laptops, dorm furniture, and campus essentials from verified students. Every transaction concludes with an on-campus handover.
          </p>

          <div className="hero-stats-row">
            <div className="hero-stat-card">
              <span className="hero-stat-number font-mono">{listings.length}</span>
              <span className="hero-stat-label">Active Auctions</span>
            </div>
            <div className="hero-stat-card">
              <span className="hero-stat-number font-mono">₹ INR</span>
              <span className="hero-stat-label">Campus Currency</span>
            </div>
            <div className="hero-stat-card">
              <span className="hero-stat-number font-mono">100%</span>
              <span className="hero-stat-label">Local Handover</span>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Filter Toolbar */}
      <section className="toolbar-section">
        <div className="toolbar-top-row">
          {/* Command-Bar Search */}
          <div className="search-bar-wrapper">
            <SearchIcon size={18} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search items by title, brand, or model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="search-clear-btn"
                onClick={() => setSearchQuery("")}
                title="Clear search query"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>

          {/* Sort Controls */}
          <div className="sort-controls-wrapper">
            <div className="sort-label">
              <SortIcon size={14} />
              <span>Sort:</span>
            </div>
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort listings"
            >
              <option value="endingSoon">Ending Soonest</option>
              <option value="priceAsc">Price: Low to High</option>
              <option value="priceDesc">Price: High to Low</option>
              <option value="newest">Recently Listed</option>
            </select>
          </div>
        </div>

        {/* Category Pills with Dynamic Counts */}
        <div className="category-pills">
          {CATEGORIES.map((cat) => {
            const count = categoryCounts[cat] || 0;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                className={`category-pill ${isSelected ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                <span>{cat}</span>
                <span className="category-pill-count font-mono">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Filter Summary Row */}
        <div className="filter-summary">
          <div className="summary-left">
            <span className="results-count">
              {loading
                ? "Refreshing auctions..."
                : `${sortedListings.length} ${
                    sortedListings.length === 1 ? "listing" : "listings"
                  } available`}
            </span>
            {hasActiveFilters && (
              <span className="active-filter-indicator">
                Filtered by: {selectedCategory !== "All" && `"${selectedCategory}"`}
                {selectedCategory !== "All" && searchQuery && " + "}
                {searchQuery && `"${searchQuery}"`}
              </span>
            )}
          </div>

          {hasActiveFilters && (
            <button className="btn-clear-filters" onClick={handleClearFilters}>
              <XIcon size={13} />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </section>

      {/* Main Content Area */}
      <section className="listings-grid-section">
        {loading && (
          <div className="state-container">
            <div className="spinner"></div>
            <p className="state-text">Loading live campus auctions...</p>
          </div>
        )}

        {error && !loading && (
          <div className="state-container state-error">
            <div className="state-icon-wrapper error">
              <AlertTriangleIcon size={32} />
            </div>
            <h3>Unable to load auctions</h3>
            <p className="state-text">{error}</p>
            <button className="btn btn-primary btn-sm" onClick={onRefresh}>
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && sortedListings.length === 0 && (
          <div className="state-container state-empty">
            <div className="state-icon-wrapper">
              <PackageIcon size={32} />
            </div>
            <h3>No auctions found</h3>
            <p className="state-text">
              {hasActiveFilters
                ? "No active listings match your selected search terms or category filter."
                : "There are currently no active listings on the campus exchange."}
            </p>
            <div className="state-buttons">
              {hasActiveFilters && (
                <button className="btn btn-outline" onClick={handleClearFilters}>
                  Clear Filters
                </button>
              )}
              <button className="btn btn-primary" onClick={onOpenCreate}>
                <PlusIcon size={16} />
                <span>Create First Listing</span>
              </button>
            </div>
          </div>
        )}

        {!loading && !error && sortedListings.length > 0 && (
          <div className="listings-grid">
            {sortedListings.map((item) => (
              <ListingCard
                key={item._id}
                listing={item}
                onSelect={onSelectListing}
                isOwner={user && item.seller && user.id === (item.seller._id || item.seller)}
                isSaved={savedListingIds && savedListingIds.has(item._id)}
                onToggleWatchlist={onToggleWatchlist}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
