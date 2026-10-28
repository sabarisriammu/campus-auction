import React, { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { formatCurrency } from "../utils/formatters";
import { useCountdown } from "../hooks/useCountdown";
import {
  BookmarkIcon,
  ClockIcon,
  FlameIcon,
  TrophyIcon,
  PackageIcon,
  ArrowRightIcon,
  RefreshIcon,
} from "./Icons";

// Sub-component for individual watchlist item card with live countdown
function WatchlistCard({ item, onSelect, onRemove }) {
  const listing = item.listing || {};
  const {
    _id,
    title,
    description,
    category,
    condition,
    currentPrice,
    startingPrice,
    finalPrice,
    auctionEndTime,
    seller,
    status,
    outcome,
    imageUrl,
    isRelisted,
  } = listing;

  const displayPrice =
    status === "completed" && finalPrice
      ? finalPrice
      : currentPrice || startingPrice || 0;

  const isCompleted = status === "completed";
  const isCancelled = status === "cancelled";
  const isSold = isCompleted && outcome === "sold";
  const countdown = useCountdown(auctionEndTime);

  const imageSrc = imageUrl
    ? imageUrl.startsWith("http")
      ? imageUrl
      : `http://localhost:5000${imageUrl}`
    : null;

  return (
    <article className="watchlist-card">
      <div className="watchlist-card-media" onClick={() => onSelect(_id)}>
        {imageSrc ? (
          <img src={imageSrc} alt={title} className="watchlist-img" loading="lazy" />
        ) : (
          <div className="watchlist-placeholder">
            <PackageIcon size={32} />
          </div>
        )}
        <div className="watchlist-badges">
          {category && <span className="category-pill">{category}</span>}
          {isRelisted && <span className="badge badge-relisted">Relisted</span>}
        </div>
      </div>

      <div className="watchlist-card-content">
        <div className="watchlist-header-row">
          <div className="watchlist-tags">
            {condition && <span className="condition-tag">{condition}</span>}
            <span className="saved-date">
              {item.savedAt ? `Saved ${new Date(item.savedAt).toLocaleDateString()}` : "Saved"}
            </span>
          </div>
          <button
            className="btn-remove-saved"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(_id);
            }}
            title="Remove from watchlist"
            aria-label="Remove item"
          >
            ✕
          </button>
        </div>

        <h3
          className="watchlist-title"
          onClick={() => onSelect(_id)}
          title={title}
        >
          {title}
        </h3>
        <p className="watchlist-desc">
          {description?.length > 90 ? `${description.slice(0, 90)}...` : description}
        </p>

        <div className="watchlist-bottom-row">
          <div className="watchlist-price">
            <span className="price-label">
              {isSold ? "Final Bid" : "Current Bid"}
            </span>
            <span className="price-val font-mono">
              {formatCurrency(displayPrice)}
            </span>
          </div>

          <div className="watchlist-timer">
            {isCompleted ? (
              <span className={`time-pill ${isSold ? "status-sold" : "status-ended"}`}>
                {isSold ? "Concluded • Sold" : "Concluded"}
              </span>
            ) : isCancelled ? (
              <span className="time-pill status-cancelled">Cancelled</span>
            ) : (
              <span
                className={`time-pill countdown-pill font-mono ${
                  countdown.isEnded
                    ? "countdown-ended"
                    : countdown.urgent
                    ? "countdown-urgent"
                    : "countdown-active"
                }`}
              >
                {countdown.isEnded ? (
                  <>
                    <ClockIcon size={12} />
                    <span>Ended</span>
                  </>
                ) : countdown.urgent ? (
                  <>
                    <FlameIcon size={12} />
                    <span>{countdown.formatted}</span>
                  </>
                ) : (
                  <>
                    <ClockIcon size={12} />
                    <span>{countdown.formatted}</span>
                  </>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="watchlist-actions">
          <button
            className="btn btn-outline btn-sm btn-block"
            onClick={() => onSelect(_id)}
          >
            <span>View Auction & Bid</span>
            <ArrowRightIcon size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function WatchlistView({
  user,
  token,
  onSelectListing,
  onSwitchToBrowse,
  showToast,
  onItemRemoved,
}) {
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ALL"); // ALL, ACTIVE, ENDED

  const fetchWatchlist = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getWatchlist(token);
      setWatchlist(data.watchlist || []);
    } catch (err) {
      setError(err.message || "Failed to load saved items.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const handleRemove = async (listingId) => {
    try {
      await api.removeFromWatchlist(listingId, token);
      setWatchlist((prev) => prev.filter((item) => item.listing?._id !== listingId));
      if (showToast) {
        showToast("Item removed from your watchlist.", "info");
      }
      if (onItemRemoved) {
        onItemRemoved(listingId);
      }
    } catch (err) {
      if (showToast) {
        showToast(err.message || "Failed to remove item.", "danger");
      }
    }
  };

  const filteredWatchlist = watchlist.filter((item) => {
    const listing = item.listing;
    if (!listing) return false;
    if (filter === "ACTIVE") {
      return listing.status === "active";
    }
    if (filter === "ENDED") {
      return listing.status === "completed" || listing.status === "cancelled";
    }
    return true;
  });

  return (
    <div className="watchlist-view container">
      {/* Header */}
      <div className="watchlist-header-section">
        <div>
          <div className="header-badge-row">
            <span className="badge badge-purple">
              <BookmarkIcon size={13} filled />
              <span>Saved Auctions</span>
            </span>
          </div>
          <h2 className="section-title">My Saved Watchlist</h2>
          <p className="section-subtitle">
            Items you are watching on campus. You will receive automated 15-minute and 5-minute countdown reminders before these auctions end.
          </p>
        </div>

        <button
          className="btn btn-outline btn-sm"
          onClick={fetchWatchlist}
          disabled={loading}
        >
          <RefreshIcon size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="watchlist-filter-tabs">
        <button
          className={`filter-tab ${filter === "ALL" ? "active" : ""}`}
          onClick={() => setFilter("ALL")}
        >
          All Saved ({watchlist.length})
        </button>
        <button
          className={`filter-tab ${filter === "ACTIVE" ? "active" : ""}`}
          onClick={() => setFilter("ACTIVE")}
        >
          Active Auctions ({watchlist.filter((w) => w.listing?.status === "active").length})
        </button>
        <button
          className={`filter-tab ${filter === "ENDED" ? "active" : ""}`}
          onClick={() => setFilter("ENDED")}
        >
          Concluded / Ended ({watchlist.filter((w) => w.listing?.status !== "active").length})
        </button>
      </div>

      {/* Loading & Error */}
      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading your saved watchlist...</p>
        </div>
      )}

      {!loading && error && (
        <div className="alert alert-danger mb-4">
          <span>{error}</span>
          <button className="btn btn-sm btn-outline ml-3" onClick={fetchWatchlist}>
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredWatchlist.length === 0 && (
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <BookmarkIcon size={44} />
          </div>
          <h3>{watchlist.length === 0 ? "Your Watchlist is Empty" : "No Items Match This Filter"}</h3>
          <p>
            {watchlist.length === 0
              ? "Bookmark interesting items while browsing the campus marketplace. We will keep track of them here and send you 15m and 5m live alerts before bidding closes."
              : "Try switching to 'All Saved' to view all your bookmarked listings."}
          </p>
          <button className="btn btn-primary mt-3" onClick={onSwitchToBrowse}>
            Browse Active Auctions
          </button>
        </div>
      )}

      {/* Grid of Cards */}
      {!loading && !error && filteredWatchlist.length > 0 && (
        <div className="watchlist-grid">
          {filteredWatchlist.map((item) => (
            <WatchlistCard
              key={item._id}
              item={item}
              onSelect={onSelectListing}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
