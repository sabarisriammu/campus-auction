import React from "react";

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
  const isExpired = new Date(auctionEndTime) <= new Date();

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

  // Calculate remaining time
  const getTimeRemaining = (endTimeStr) => {
    if (isCompleted) {
      return isSold ? "Sold" : "Ended Unsold";
    }
    if (isCancelled) return "Cancelled";

    const totalMs = new Date(endTimeStr) - new Date();
    if (totalMs <= 0) return "Auction Ended";

    const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((totalMs / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((totalMs / 1000 / 60) % 60);

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
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
          {!isCompleted && !isCancelled && isExpired && (
            <span className="badge badge-yellow">Ended</span>
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
          <div className="price-amount">${Number(displayPrice).toFixed(2)}</div>
        </div>
        <div className="time-remaining">
          <span className="time-label">Status</span>
          <span
            className={`time-value ${
              isSold ? "text-success" : isCancelled || isUnsold ? "text-muted" : ""
            }`}
          >
            {getTimeRemaining(auctionEndTime)}
          </span>
        </div>
      </div>

      <div className="listing-card-footer">
        <div className="seller-info" title={seller?.email || ""}>
          <span className="seller-icon">👤</span>
          <span className="seller-name">{seller?.name || "Campus Member"}</span>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => onSelect(_id)}>
          View Details
        </button>
      </div>
    </div>
  );
}
