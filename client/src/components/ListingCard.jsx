import React from "react";
import { formatCurrency } from "../utils/formatters";
import { useCountdown } from "../hooks/useCountdown";
import {
  ClockIcon,
  FlameIcon,
  TrophyIcon,
  PackageIcon,
  UserIcon,
  ArrowRightIcon,
  TagIcon,
  BookmarkIcon,
  RotateCcwIcon,
} from "./Icons";

export default function ListingCard({ listing, onSelect, isOwner, isSaved = false, onToggleWatchlist }) {
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

  const isCancelled = status === "cancelled";
  const isCompleted = status === "completed";
  const isSold = isCompleted && outcome === "sold";
  const isUnsold = isCompleted && outcome === "unsold";

  // Real-time second-by-second countdown hook
  const countdown = useCountdown(auctionEndTime);

  const conditionClassMap = {
    New: "condition-new",
    "Like New": "condition-likenew",
    Good: "condition-good",
    Fair: "condition-fair",
    Poor: "condition-poor",
  };

  const imageSrc = imageUrl
    ? imageUrl.startsWith("http")
      ? imageUrl
      : `http://localhost:5000${imageUrl}`
    : null;

  return (
    <article
      className={`listing-card ${isCancelled ? "listing-card-cancelled" : ""} ${
        isCompleted ? "listing-card-completed" : ""
      }`}
      onClick={() => onSelect(_id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onSelect(_id);
        }
      }}
    >
      {/* Product Image or Category Geometric Graphic */}
      <div className="listing-card-media">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={title}
            className="listing-image"
            loading="lazy"
          />
        ) : (
          <div className="listing-image-placeholder">
            <div className="placeholder-crest">
              <PackageIcon size={32} className="placeholder-icon" />
            </div>
            <span className="placeholder-cat-name">{category}</span>
          </div>
        )}

        {/* Floating status badges */}
        <div className="media-overlay-badge">
          {isSold && (
            <span className="badge badge-sold">
              <TrophyIcon size={12} />
              <span>Sold</span>
            </span>
          )}
          {isUnsold && <span className="badge badge-unsold">Unsold</span>}
          {isCancelled && <span className="badge badge-cancelled">Cancelled</span>}
          {isRelisted && (
            <span className="badge badge-relisted">
              <RotateCcwIcon size={11} />
              <span>Relisted</span>
            </span>
          )}
          {!isCompleted && !isCancelled && countdown.isEnded && (
            <span className="badge badge-ended">Ended</span>
          )}
          {!isCompleted && !isCancelled && !countdown.isEnded && countdown.urgent && (
            <span className="badge badge-urgent-pulse">
              <FlameIcon size={12} />
              <span>Ending Soon</span>
            </span>
          )}
        </div>

        {/* Watchlist Bookmark Button */}
        {onToggleWatchlist && (
          <button
            type="button"
            className={`card-bookmark-btn ${isSaved ? "saved" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleWatchlist(_id);
            }}
            title={isSaved ? "Remove from Watchlist" : "Save to Watchlist"}
            aria-label="Toggle Watchlist"
          >
            <BookmarkIcon size={16} filled={isSaved} />
          </button>
        )}

        {/* Category Pill Tag */}
        <div className="media-overlay-category">
          <span className="card-category-tag">{category}</span>
        </div>
      </div>

      {/* Card Content Body */}
      <div className="listing-card-content">
        <div className="listing-card-header">
          <div className="listing-badges">
            {condition && (
              <span className={`condition-tag ${conditionClassMap[condition] || "condition-good"}`}>
                {condition}
              </span>
            )}
            {isOwner && <span className="badge badge-owner">Your Listing</span>}
          </div>
        </div>

        <div className="listing-card-body">
          <h3 className="listing-title" title={title}>
            {title}
          </h3>
          <p className="listing-desc">
            {description.length > 80 ? `${description.slice(0, 80)}...` : description}
          </p>
        </div>

        {/* Price & Countdown Spotlight */}
        <div className="listing-price-row">
          <div className="price-column">
            <span className="price-label">
              {isSold ? "Winning Bid" : "Current Bid"}
            </span>
            <div className="price-amount font-mono">
              <span className="currency-symbol">₹</span>
              <span>{Number(displayPrice).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="countdown-column">
            <span className="time-label">Auction Time</span>
            {isCompleted ? (
              <span className={`time-pill ${isSold ? "status-sold" : "status-ended"}`}>
                {isSold ? "Finalized" : "Closed"}
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

        {/* Card Footer: Seller info & Action */}
        <div className="listing-card-footer">
          <div className="seller-info" title={seller?.email || ""}>
            <div className="seller-avatar-mini">
              {seller?.name ? seller.name.charAt(0).toUpperCase() : "U"}
            </div>
            <span className="seller-name">{seller?.name || "Campus Member"}</span>
          </div>

          <button
            className="card-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(_id);
            }}
          >
            <span>View</span>
            <ArrowRightIcon size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}
