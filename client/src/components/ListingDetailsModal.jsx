import React, { useState } from "react";

export default function ListingDetailsModal({
  listing,
  user,
  onClose,
  onEdit,
  onCancel,
  isCancelling,
}) {
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  if (!listing) return null;

  const {
    _id,
    title,
    description,
    category,
    condition,
    startingPrice,
    currentPrice,
    minBidIncrement,
    auctionEndTime,
    seller,
    status,
    createdAt,
  } = listing;

  const isCancelled = status === "cancelled";
  const sellerId = typeof seller === "object" ? seller?._id : seller;
  const isOwner = user && sellerId && user.id === sellerId.toString();

  const isExpired = new Date(auctionEndTime) <= new Date();

  const formattedEndDate = new Date(auctionEndTime).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const formattedCreatedDate = new Date(createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-titles">
            <span className="listing-category">{category}</span>
            <h2 className="modal-title">{title}</h2>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Status Banners */}
          {isCancelled && (
            <div className="alert alert-danger">
              ⚠️ This listing has been cancelled by the seller and is no longer accepting bids.
            </div>
          )}

          {isExpired && !isCancelled && (
            <div className="alert alert-warning">
              ⏳ This auction has ended.
            </div>
          )}

          {/* Core Info Grid */}
          <div className="details-grid">
            <div className="details-main">
              <div className="details-section">
                <h4 className="section-title">Item Description</h4>
                <p className="description-text">{description}</p>
              </div>

              <div className="details-section">
                <h4 className="section-title">Item Specifications</h4>
                <div className="specs-grid">
                  <div className="spec-item">
                    <span className="spec-label">Category</span>
                    <span className="spec-value">{category}</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Condition</span>
                    <span className="spec-value">{condition}</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Listed On</span>
                    <span className="spec-value">{formattedCreatedDate}</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Listing ID</span>
                    <span className="spec-value font-mono">{_id.slice(-6)}</span>
                  </div>
                </div>
              </div>

              <div className="details-section">
                <h4 className="section-title">Seller Information</h4>
                <div className="seller-box">
                  <span className="seller-avatar-large">👤</span>
                  <div>
                    <div className="seller-name-large">{seller?.name || "Campus Seller"}</div>
                    <div className="seller-email">{seller?.email || "Verified Campus Member"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="details-sidebar">
              <div className="price-card">
                <div className="price-card-header">
                  <span className="price-label">Current Price</span>
                  <span className="price-highlight">
                    ${Number(currentPrice || startingPrice).toFixed(2)}
                  </span>
                </div>

                <div className="price-card-details">
                  <div className="price-detail-row">
                    <span>Starting Price:</span>
                    <span>${Number(startingPrice).toFixed(2)}</span>
                  </div>
                  <div className="price-detail-row">
                    <span>Min Bid Increment:</span>
                    <span>${Number(minBidIncrement || 1).toFixed(2)}</span>
                  </div>
                  <div className="price-detail-row">
                    <span>Auction Ends:</span>
                    <span>{formattedEndDate}</span>
                  </div>
                </div>

                {/* Non-owner notice */}
                {!isOwner && (
                  <div className="bidding-placeholder-box">
                    <span className="placeholder-icon">🔨</span>
                    <p className="placeholder-title">Live Bidding Coming Soon</p>
                    <p className="placeholder-sub">
                      Bidding features are currently in development. Keep this item saved!
                    </p>
                  </div>
                )}

                {/* Owner controls */}
                {isOwner && (
                  <div className="owner-actions-box">
                    <div className="owner-header">
                      <span>⚙️ Owner Controls</span>
                    </div>

                    {!isCancelled && !isExpired ? (
                      <>
                        <button
                          className="btn btn-primary btn-block mb-2"
                          onClick={() => onEdit(listing)}
                        >
                          ✏️ Edit Listing
                        </button>

                        {!showConfirmCancel ? (
                          <button
                            className="btn btn-danger-outline btn-block"
                            onClick={() => setShowConfirmCancel(true)}
                          >
                            🚫 Cancel Listing
                          </button>
                        ) : (
                          <div className="confirm-cancel-box">
                            <p className="confirm-text">
                              Are you sure you want to cancel this auction?
                            </p>
                            <div className="confirm-buttons">
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => onCancel(_id)}
                                disabled={isCancelling}
                              >
                                {isCancelling ? "Cancelling..." : "Yes, Cancel"}
                              </button>
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => setShowConfirmCancel(false)}
                                disabled={isCancelling}
                              >
                                Keep Active
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-muted text-center text-sm">
                        No actions available for {isCancelled ? "cancelled" : "ended"} auctions.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Back to Listings
          </button>
        </div>
      </div>
    </div>
  );
}
