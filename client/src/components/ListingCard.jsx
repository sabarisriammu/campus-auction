import React from "react";
import { formatCurrency } from "../utils/formatters";
import { useCountdown } from "../hooks/useCountdown";

export default function ListingCard({ listing, onSelect, isOwner }) {
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
  } = listing;

  const displayPrice =
    status === "completed" && finalPrice
      ? finalPrice
      : currentPrice || startingPrice || 0;

  const isCancelled = status === "cancelled";
  const isCompleted = status === "completed";
  const isSold = isCompleted && outcome === "sold";
  const isUnsold = isCompleted && outcome === "unsold";

  // Real-time second-by-second countdown hook
  const countdown = useCountdown(auctionEndTime);
  const isEnded = isCompleted || countdown.isEnded;

  // Category Icon helper for placeholder
  const getCategoryIcon = (cat) => {
    switch (cat) {
      case "Textbooks":
        return "📚";
      case "Electronics":
        return "💻";
      case "Furniture":
        return "🪑";
      case "Clothing":
        return "👕";
      case "Vehicles & Scooters":
        return "🚲";
      case "Supplies":
        return "✏️";
      default:
        return "📦";
    }
  };

  const conditionColors = {
    New: "badge-green",
    "Like New": "badge-teal",
    Good: "badge-blue",
    Fair: "badge-yellow",
    Poor: "badge-gray",
  };

  const imageSrc = imageUrl
    ? imageUrl.startsWith("http")
      ? imageUrl
      : `http://localhost:5000${imageUrl}`
    : null;

  return (
    <div
      className={`listing-card ${isCancelled ? "listing-card-cancelled" : ""} ${
        isCompleted ? "listing-card-completed" : ""
      }`}
    >
      {/* Product Image or Category Placeholder */}
      <div className="listing-card-media" onClick={() => onSelect(_id)}>
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={title}
            className="listing-image"
            loading="lazy"
          />
        ) : (
          <div className="listing-image-placeholder">
            <span className="placeholder-cat-icon">{getCategoryIcon(category)}</span>
            <span className="placeholder-cat-name">{category}</span>
          </div>
        )}

        {/* Floating status badge over image */}
        <div className="media-overlay-badge">
          {isSold && <span className="badge badge-green">Sold</span>}
          {isUnsold && <span className="badge badge-gray">Unsold</span>}
          {isCancelled && <span className="badge badge-red">Cancelled</span>}
          {!isCompleted && !isCancelled && countdown.isEnded && (
            <span className="badge badge-yellow">Ended</span>
          )}
          {!isCompleted && !isCancelled && !countdown.isEnded && countdown.urgent && (
            <span className="badge badge-urgent-pulse">⚡ Ending Soon</span>
          )}
        </div>
      </div>

      <div className="listing-card-header">
        <span className="listing-category">{category}</span>
        <div className="listing-badges">
          {condition && (
            <span className={`badge ${conditionColors[condition] || "badge-blue"}`}>
              {condition}
            </span>
          )}
          {isOwner && <span className="badge badge-purple">Your Listing</span>}
        </div>
      </div>

      <div className="listing-card-body">
        <h3 className="listing-title" title={title} onClick={() => onSelect(_id)}>
          {title}
        </h3>
        <p className="listing-desc">
          {description.length > 80 ? `${description.slice(0, 80)}...` : description}
        </p>
      </div>

      <div className="listing-price-row">
        <div>
          <span className="price-label">
            {isSold ? "Final Price" : "Current Bid"}
          </span>
          <div className="price-amount font-mono">
            {formatCurrency(displayPrice)}
          </div>
        </div>

        <div className="time-remaining">
          <span className="time-label">Time Remaining</span>
          {isCompleted ? (
            <span className={`time-pill ${isSold ? "status-sold" : "status-ended"}`}>
              {isSold ? "🏆 Sold" : "📦 Ended"}
            </span>
          ) : isCancelled ? (
            <span className="time-pill status-cancelled">🚫 Cancelled</span>
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
              {countdown.isEnded
                ? "⌛ Auction ended"
                : countdown.urgent
                ? `⚡ ${countdown.formatted}`
                : `⏱️ ${countdown.formatted}`}
            </span>
          )}
        </div>
      </div>

      <div className="listing-card-footer">
        <div className="seller-info" title={seller?.email || ""}>
          <span className="seller-icon">👤</span>
          <span className="seller-name">{seller?.name || "Campus Member"}</span>
        </div>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => onSelect(_id)}
        >
          View Details →
        </button>
      </div>
    </div>
  );
}
