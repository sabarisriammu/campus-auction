import React, { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";

export default function ListingDetailsModal({
  listing,
  user,
  token,
  onClose,
  onEdit,
  onCancel,
  isCancelling,
  onBidSuccess,
  onOpenAuth,
}) {
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [bids, setBids] = useState([]);
  const [loadingBids, setLoadingBids] = useState(true);
  const [bidAmount, setBidAmount] = useState("");
  const [submittingBid, setSubmittingBid] = useState(false);
  const [bidError, setBidError] = useState("");
  const [bidSuccess, setBidSuccess] = useState("");
  const [currentPrice, setCurrentPrice] = useState(
    listing?.currentPrice || listing?.startingPrice || 0
  );

  const fetchBids = useCallback(async () => {
    if (!listing?._id) return;
    try {
      setLoadingBids(true);
      const data = await api.getListingBids(listing._id);
      setBids(data.bids || []);
      if (data.currentPrice) {
        setCurrentPrice(data.currentPrice);
      }
    } catch (err) {
      console.error("Failed to fetch bids:", err);
    } finally {
      setLoadingBids(false);
    }
  }, [listing?._id]);

  useEffect(() => {
    fetchBids();
  }, [fetchBids]);

  if (!listing) return null;

  const {
    _id,
    title,
    description,
    category,
    condition,
    startingPrice,
    minBidIncrement,
    auctionEndTime,
    seller,
    status,
    createdAt,
  } = listing;

  const isCancelled = status === "cancelled";
  const sellerId = typeof seller === "object" ? seller?._id : seller;
  const isOwner = user && sellerId && user.id === sellerId.toString();
  const isAdmin = user && user.role === "admin";
  const isSeller = user && user.role === "seller";
  const isBuyer = user && user.role === "buyer";

  const canManage = (isOwner && isSeller) || isAdmin;
  const isExpired = new Date(auctionEndTime) <= new Date();

  // Next required bid amount calculation
  const minIncrement = Number(minBidIncrement) || 1.0;
  const nextMinBid =
    bids.length === 0
      ? Number(startingPrice)
      : Number((currentPrice + minIncrement).toFixed(2));

  const canBid = isBuyer && !isOwner && !isCancelled && !isExpired;

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

  const handleBidSubmit = async (e) => {
    e.preventDefault();
    setBidError("");
    setBidSuccess("");

    const val = Number(bidAmount);
    if (isNaN(val) || val <= 0) {
      setBidError("Please enter a valid positive bid amount.");
      return;
    }

    if (val < nextMinBid) {
      setBidError(
        bids.length === 0
          ? `First bid must be at least the starting price of $${nextMinBid.toFixed(2)}.`
          : `Bid must be at least $${nextMinBid.toFixed(2)} (current bid $${currentPrice.toFixed(2)} + min increment $${minIncrement.toFixed(2)}).`
      );
      return;
    }

    setSubmittingBid(true);
    try {
      const data = await api.placeBid(_id, val, token);
      setBidSuccess(`🎉 Bid of $${val.toFixed(2)} placed successfully!`);
      setCurrentPrice(data.currentPrice);
      setBidAmount("");
      fetchBids();
      if (onBidSuccess) {
        onBidSuccess(_id, data.currentPrice);
      }
    } catch (err) {
      setBidError(err.message || "Failed to place bid. Please try again.");
      fetchBids(); // Refresh latest state on error
    } finally {
      setSubmittingBid(false);
    }
  };

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
            <div className="alert alert-danger mb-3">
              ⚠️ This listing has been cancelled by the seller and is no longer accepting bids.
            </div>
          )}

          {isExpired && !isCancelled && (
            <div className="alert alert-warning mb-3">
              ⏳ This auction has ended. No new bids can be accepted.
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
                    <span className="spec-label">Total Bids</span>
                    <span className="spec-value font-mono">{bids.length}</span>
                  </div>
                </div>
              </div>

              <div className="details-section">
                <h4 className="section-title">Seller Information</h4>
                <div className="seller-box">
                  <span className="seller-avatar-large">👤</span>
                  <div>
                    <div className="seller-name-large">
                      {seller?.name || "Campus Seller"} {seller?.role ? `(${seller.role})` : ""}
                    </div>
                    <div className="seller-email">{seller?.email || "Verified Campus Member"}</div>
                  </div>
                </div>
              </div>

              {/* Bid History Section */}
              <div className="details-section">
                <h4 className="section-title">Bid History ({bids.length})</h4>
                {loadingBids ? (
                  <p className="text-muted text-sm">Loading bid history...</p>
                ) : bids.length === 0 ? (
                  <div className="bid-history-empty">
                    <span>🔨</span>
                    <p>No bids have been placed yet. Be the first to bid!</p>
                  </div>
                ) : (
                  <div className="bid-history-list">
                    {bids.map((b, index) => (
                      <div
                        key={b._id}
                        className={`bid-history-row ${index === 0 ? "bid-row-highest" : ""}`}
                      >
                        <div className="bid-row-left">
                          <span className="bid-row-avatar">👤</span>
                          <div>
                            <span className="bid-row-name">
                              {b.bidder?.name || "Campus Buyer"}
                            </span>
                            {index === 0 && (
                              <span className="badge badge-green ml-2">Highest Bidder</span>
                            )}
                            <div className="bid-row-time">
                              {new Date(b.createdAt).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="bid-row-amount">
                          ${Number(b.amount).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="details-sidebar">
              <div className="price-card">
                <div className="price-card-header">
                  <span className="price-label">Current Bid</span>
                  <span className="price-highlight">
                    ${Number(currentPrice).toFixed(2)}
                  </span>
                </div>

                <div className="price-card-details">
                  <div className="price-detail-row">
                    <span>Starting Price:</span>
                    <span>${Number(startingPrice).toFixed(2)}</span>
                  </div>
                  <div className="price-detail-row">
                    <span>Min Bid Increment:</span>
                    <span>+${Number(minIncrement).toFixed(2)}</span>
                  </div>
                  <div className="price-detail-row">
                    <span>Next Minimum Bid:</span>
                    <span className="text-primary font-bold">
                      ${Number(nextMinBid).toFixed(2)}
                    </span>
                  </div>
                  <div className="price-detail-row">
                    <span>Auction Ends:</span>
                    <span>{formattedEndDate}</span>
                  </div>
                </div>

                {/* Bidding Engine Form for Authenticated Buyers */}
                {canBid && (
                  <div className="bid-form-container">
                    <div className="bid-form-header">
                      <span>🔨 Place a Bid</span>
                    </div>

                    {bidError && <div className="alert alert-danger mb-2 text-sm">{bidError}</div>}
                    {bidSuccess && <div className="alert alert-success mb-2 text-sm">{bidSuccess}</div>}

                    <form onSubmit={handleBidSubmit}>
                      <div className="form-group mb-2">
                        <label className="form-label text-sm" htmlFor="bid-amount-input">
                          Your Bid Amount ($)
                        </label>
                        <div className="bid-input-wrapper">
                          <span className="bid-currency-symbol">$</span>
                          <input
                            id="bid-amount-input"
                            type="number"
                            className="form-control bid-input"
                            step="0.01"
                            min={nextMinBid}
                            placeholder={nextMinBid.toFixed(2)}
                            value={bidAmount}
                            onChange={(e) => {
                              setBidAmount(e.target.value);
                              if (bidError) setBidError("");
                            }}
                            required
                          />
                        </div>
                        <span className="bid-hint">
                          Minimum required: ${nextMinBid.toFixed(2)}
                        </span>
                      </div>

                      <button
                        type="submit"
                        className="btn btn-primary btn-block"
                        disabled={submittingBid}
                      >
                        {submittingBid ? "Submitting Bid..." : `Place Bid ($${bidAmount || nextMinBid.toFixed(2)})`}
                      </button>
                    </form>
                  </div>
                )}

                {/* Role & Auth Notices */}
                {!user && !isCancelled && !isExpired && (
                  <div className="bidding-placeholder-box">
                    <span className="placeholder-icon">🔒</span>
                    <p className="placeholder-title">Sign in to Bid</p>
                    <p className="placeholder-sub mb-3">
                      You must be signed in with a Buyer account to place bids.
                    </p>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        onClose();
                        if (onOpenAuth) onOpenAuth("login");
                      }}
                    >
                      Sign In to Bid
                    </button>
                  </div>
                )}

                {user && isSeller && !isOwner && !isCancelled && !isExpired && (
                  <div className="bidding-placeholder-box">
                    <span className="placeholder-icon">🏷️</span>
                    <p className="placeholder-title">Seller Account</p>
                    <p className="placeholder-sub">
                      You are signed in as a Seller. Only registered Buyers can place bids on campus auctions.
                    </p>
                  </div>
                )}

                {user && isAdmin && (
                  <div className="bidding-placeholder-box">
                    <span className="placeholder-icon">🛡️</span>
                    <p className="placeholder-title">Administrator View</p>
                    <p className="placeholder-sub">
                      Admins monitor auctions and enforce community standards.
                    </p>
                  </div>
                )}

                {/* Owner & Admin controls */}
                {canManage && (
                  <div className="owner-actions-box">
                    <div className="owner-header">
                      <span>{isAdmin ? "🛡️ Admin Controls" : "⚙️ Owner Controls"}</span>
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
