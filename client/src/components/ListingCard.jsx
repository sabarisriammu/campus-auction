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
    auctionEndTime,
    seller,
    status,
  } = listing;

  const displayPrice = currentPrice || startingPrice || 0;
  const isCancelled = status === "cancelled";

  // Calculate remaining time
  const getTimeRemaining = (endTimeStr) => {
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

  return (
    <div className={`listing-card ${isCancelled ? "listing-card-cancelled" : ""}`}>
      <div className="listing-card-header">
        <span className="listing-category">{category}</span>
        <div className="listing-badges">
          {condition && (
            <span className={`badge ${conditionColors[condition] || "badge-blue"}`}>
              {condition}
            </span>
          )}
          {isCancelled && <span className="badge badge-red">Cancelled</span>}
          {isOwner && <span className="badge badge-purple">Your Listing</span>}
        </div>
      </div>

      <div className="listing-card-body">
        <h3 className="listing-title" title={title}>
          {title}
        </h3>
        <p className="listing-desc">
          {description.length > 90 ? `${description.slice(0, 90)}...` : description}
        </p>
      </div>

      <div className="listing-price-row">
        <div>
          <span className="price-label">Current Bid</span>
          <div className="price-amount">${Number(displayPrice).toFixed(2)}</div>
        </div>
        <div className="time-remaining">
          <span className="time-label">Ending</span>
          <span className={`time-value ${isCancelled ? "text-muted" : ""}`}>
            {isCancelled ? "Cancelled" : getTimeRemaining(auctionEndTime)}
          </span>
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
          View Details
        </button>
      </div>
    </div>
  );
}
