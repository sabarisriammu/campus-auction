import React, { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { formatCurrency } from "../utils/formatters";
import { useCountdown } from "../hooks/useCountdown";
import { getSocket } from "../services/socket";
import RelistModal from "./RelistModal";
import {
  XIcon,
  ClockIcon,
  FlameIcon,
  GavelIcon,
  TrophyIcon,
  PackageIcon,
  HandshakeIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  EditIcon,
  BanIcon,
  CheckCircleIcon,
  UserIcon,
  BookmarkIcon,
  RotateCcwIcon,
} from "./Icons";

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
  onOpenTransactions,
  isSaved = false,
  onToggleWatchlist,
  onRelistSuccess,
}) {
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showRelistModal, setShowRelistModal] = useState(false);
  const [bids, setBids] = useState([]);
  const [loadingBids, setLoadingBids] = useState(true);
  const [bidAmount, setBidAmount] = useState("");
  const [submittingBid, setSubmittingBid] = useState(false);
  const [closingAuction, setClosingAuction] = useState(false);
  const [bidError, setBidError] = useState("");
  const [bidSuccess, setBidSuccess] = useState("");
  const [currentListing, setCurrentListing] = useState(listing);
  const [currentPrice, setCurrentPrice] = useState(
    listing?.currentPrice || listing?.startingPrice || 0
  );
  const [socketStatus, setSocketStatus] = useState("connecting");
  const [priceFlash, setPriceFlash] = useState(false);
  const [proxyData, setProxyData] = useState(null);
  const [proxyMaxAmount, setProxyMaxAmount] = useState("");
  const [submittingProxy, setSubmittingProxy] = useState(false);
  const [disablingProxy, setDisablingProxy] = useState(false);
  const [proxyError, setProxyError] = useState("");
  const [proxySuccess, setProxySuccess] = useState("");

  const fetchProxy = useCallback(async () => {
    if (!currentListing?._id || !token || !user || user.role !== "buyer") return;
    try {
      const data = await api.getProxyBid(currentListing._id, token);
      if (data?.proxy) {
        setProxyData(data.proxy);
        if (data.proxy.maxAmount) {
          setProxyMaxAmount(data.proxy.maxAmount.toString());
        }
      } else {
        setProxyData(null);
      }
    } catch (err) {
      // Ignore
    }
  }, [currentListing?._id, token, user]);

  const fetchBids = useCallback(async () => {
    if (!currentListing?._id) return;
    try {
      setLoadingBids(true);
      const data = await api.getListingBids(currentListing._id);
      setBids(data.bids || []);
      if (data.currentPrice) {
        setCurrentPrice(data.currentPrice);
      }
    } catch (err) {
      console.error("Failed to fetch bids:", err);
    } finally {
      setLoadingBids(false);
    }
  }, [currentListing?._id]);

  const refreshListing = useCallback(async () => {
    if (!currentListing?._id) return;
    try {
      const data = await api.getListingById(currentListing._id);
      if (data?.listing) {
        setCurrentListing(data.listing);
        if (data.listing.currentPrice) {
          setCurrentPrice(data.listing.currentPrice);
        }
      }
    } catch (err) {
      console.warn("Failed to refresh listing details:", err.message);
    }
  }, [currentListing?._id]);

  useEffect(() => {
    fetchBids();
    fetchProxy();
  }, [fetchBids, fetchProxy]);

  // Real-time Socket.IO Live Bidding Room Subscription
  useEffect(() => {
    const listingId = currentListing?._id;
    if (!listingId) return;

    const socket = getSocket(token);
    if (!socket) return;

    // Join room for this specific listing
    socket.emit("auction:join", { listingId });

    const handleConnect = () => {
      setSocketStatus("connected");
      // Authoritative resynchronization on reconnect
      fetchBids();
      refreshListing();
      fetchProxy();
    };

    const handleDisconnect = () => setSocketStatus("disconnected");

    if (socket.connected) {
      setSocketStatus("connected");
    } else {
      setSocketStatus("connecting");
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    // Live bid broadcast event handler
    const handleBidUpdated = (payload) => {
      if (payload?.listingId !== listingId) return;

      if (payload.currentPrice !== undefined) {
        setCurrentPrice(payload.currentPrice);
        setPriceFlash(true);
        setTimeout(() => setPriceFlash(false), 2000);
      }

      if (payload.latestBid) {
        setBids((prev) => {
          const exists = prev.some((b) => b._id === payload.latestBid._id);
          if (exists) return prev;
          return [payload.latestBid, ...prev];
        });
      }

      fetchProxy();

      if (onBidSuccess) {
        onBidSuccess(listingId, payload.currentPrice);
      }
    };

    // Live auction lifecycle status event handler
    const handleStatusUpdated = (payload) => {
      if (payload?.listingId !== listingId) return;
      setCurrentListing((prev) => ({
        ...prev,
        status: payload.status,
        outcome: payload.outcome !== undefined ? payload.outcome : prev.outcome,
        winner: payload.winner !== undefined ? payload.winner : prev.winner,
        finalPrice: payload.finalPrice !== undefined ? payload.finalPrice : prev.finalPrice,
        completionTime: payload.completionTime || prev.completionTime,
      }));
    };

    socket.on("auction:bid-updated", handleBidUpdated);
    socket.on("auction:status-updated", handleStatusUpdated);

    // Cleanup: leave auction room and unbind event listeners cleanly
    return () => {
      socket.emit("auction:leave", { listingId });
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("auction:bid-updated", handleBidUpdated);
      socket.off("auction:status-updated", handleStatusUpdated);
    };
  }, [currentListing?._id, token, fetchBids, refreshListing, onBidSuccess]);

  if (!currentListing) return null;

  const {
    _id,
    title,
    description,
    category,
    condition,
    startingPrice,
    finalPrice,
    minBidIncrement,
    auctionEndTime,
    seller,
    winner,
    status,
    outcome,
    imageUrl,
    completionTime,
    createdAt,
    isRelisted,
  } = currentListing;

  const isCancelled = status === "cancelled";
  const isCompleted = status === "completed";
  const isSold = isCompleted && outcome === "sold";
  const isUnsold = isCompleted && outcome === "unsold";

  // Real-time second-by-second countdown hook
  const countdown = useCountdown(auctionEndTime, () => {
    fetchBids();
    refreshListing();
  });
  const isExpired = isCompleted || countdown.isEnded;

  const sellerId = typeof seller === "object" ? seller?._id : seller;
  const isOwner = user && sellerId && user.id === sellerId.toString();
  const isAdmin = user && user.role === "admin";
  const isSeller = user && user.role === "seller";
  const isBuyer = user && user.role === "buyer";

  const canManage = (isOwner && isSeller) || isAdmin;

  // Next required bid amount calculation
  const minIncrement = Number(minBidIncrement) || 1.0;
  const nextMinBid =
    bids.length === 0
      ? Number(startingPrice)
      : Number((currentPrice + minIncrement).toFixed(2));

  const canBid =
    isBuyer && !isOwner && status === "active" && !countdown.isEnded && !isCompleted && !isCancelled;

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

  const formattedCompletionDate = completionTime
    ? new Date(completionTime).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const imageSrc = imageUrl
    ? imageUrl.startsWith("http")
      ? imageUrl
      : `http://localhost:5000${imageUrl}`
    : null;

  const handleBidSubmit = async (e) => {
    e.preventDefault();
    setBidError("");
    setBidSuccess("");

    if (countdown.isEnded) {
      setBidError("Bidding is closed because the auction deadline has passed.");
      return;
    }

    const val = Number(bidAmount);
    if (isNaN(val) || val <= 0) {
      setBidError("Please enter a valid positive bid amount.");
      return;
    }

    if (val < nextMinBid) {
      setBidError(
        bids.length === 0
          ? `First bid must be at least the starting price of ${formatCurrency(nextMinBid)}.`
          : `Bid must be at least ${formatCurrency(nextMinBid)} (current bid ${formatCurrency(currentPrice)} + min increment ${formatCurrency(minIncrement)}).`
      );
      return;
    }

    setSubmittingBid(true);
    try {
      const data = await api.placeBid(_id, val, token);
      setBidSuccess(`🎉 Bid of ${formatCurrency(val)} placed successfully!`);
      setCurrentPrice(data.currentPrice);
      setBidAmount("");
      fetchBids();
      if (onBidSuccess) {
        onBidSuccess(_id, data.currentPrice);
      }
    } catch (err) {
      setBidError(err.message || "Failed to place bid. Please try again.");
      fetchBids();
    } finally {
      setSubmittingBid(false);
    }
  };

  const handleCloseAuction = async () => {
    setClosingAuction(true);
    try {
      const data = await api.closeAuction(_id, token);
      setCurrentListing(data.listing);
      if (onBidSuccess) {
        onBidSuccess(_id, data.listing.currentPrice);
      }
    } catch (err) {
      setBidError(err.message || "Failed to close auction.");
    } finally {
      setClosingAuction(false);
    }
  };

  // Quick Bid Increment Pill Handler
  const handleQuickBid = (increment) => {
    const calculated = nextMinBid + increment;
    setBidAmount(calculated.toFixed(2));
    setBidError("");
  };

  const isCurrentLeader = Boolean(
    user &&
    bids.length > 0 &&
    (bids[0].bidder?.id === user.id || bids[0].bidder?._id === user.id)
  );

  const handleSetProxy = async (e) => {
    e.preventDefault();
    setProxyError("");
    setProxySuccess("");

    const val = Number(proxyMaxAmount);
    if (isNaN(val) || val <= 0) {
      setProxyError("Please enter a valid positive maximum amount.");
      return;
    }

    const minRequired = isCurrentLeader
      ? Number(currentPrice)
      : Number(nextMinBid);

    if (val < minRequired) {
      setProxyError(
        isCurrentLeader
          ? `Your maximum limit cannot be less than your current winning bid of ${formatCurrency(minRequired)}.`
          : `Maximum amount must be at least ${formatCurrency(minRequired)}.`
      );
      return;
    }

    setSubmittingProxy(true);
    try {
      const res = await api.setProxyBid(currentListing._id, val, token);
      setProxyData(res.proxy);
      setProxySuccess(`🎯 Automatic bidding active up to ${formatCurrency(val)}!`);
      fetchBids();
      refreshListing();
      if (onBidSuccess) {
        onBidSuccess(currentListing._id, res.currentPrice || currentPrice);
      }
    } catch (err) {
      setProxyError(err.message || "Failed to configure automatic bidding.");
    } finally {
      setSubmittingProxy(false);
    }
  };

  const handleDisableProxy = async () => {
    setProxyError("");
    setProxySuccess("");
    setDisablingProxy(true);
    try {
      const res = await api.disableProxyBid(currentListing._id, token);
      setProxyData(res.proxy);
      setProxySuccess("Automatic bidding disabled. Previous bids remain active.");
    } catch (err) {
      setProxyError(err.message || "Failed to disable automatic bidding.");
    } finally {
      setDisablingProxy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Bar */}
        <div className="modal-header">
          <div className="modal-header-titles">
            <span className="listing-category-pill">{category}</span>
            <h2 className="modal-title">{title}</h2>
          </div>
          <div className="flex items-center gap-2">
            {onToggleWatchlist && (
              <button
                type="button"
                className={`btn btn-sm ${isSaved ? "btn-primary" : "btn-outline"}`}
                onClick={() => onToggleWatchlist(_id)}
                title={isSaved ? "Remove from Watchlist" : "Save to Watchlist"}
              >
                <BookmarkIcon size={14} filled={isSaved} />
                <span>{isSaved ? "Saved" : "Save"}</span>
              </button>
            )}
            <button className="btn-close" onClick={onClose} aria-label="Close modal">
              <XIcon size={18} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          {/* Relisted lineage badge */}
          {isRelisted && (
            <div className="alert alert-info mb-4">
              <div className="flex items-center gap-2">
                <RotateCcwIcon size={15} />
                <strong>Relisted Item</strong>
              </div>
              <p className="text-sm mt-1 mb-0">
                This item is an active relisting of a previous auction listing.
              </p>
            </div>
          )}

          {/* Lifecycle Status Banners */}
          {isSold && (
            <div className="alert alert-success mb-4 outcome-banner">
              <div className="outcome-icon-circle success">
                <TrophyIcon size={20} />
              </div>
              <div className="outcome-text-area">
                <h4 className="outcome-title">Auction Concluded — Sold!</h4>
                <p className="outcome-desc">
                  Won by <strong>{winner?.name || "Winning Bidder"}</strong> for{" "}
                  <strong className="font-mono">{formatCurrency(finalPrice || currentPrice)}</strong> on{" "}
                  {formattedCompletionDate}.
                </p>
                {user &&
                  (user.id === (seller?._id || seller) ||
                    user.id === (winner?._id || winner) ||
                    user.role === "admin") &&
                  onOpenTransactions && (
                    <button
                      className="btn btn-primary btn-sm mt-3"
                      onClick={onOpenTransactions}
                    >
                      <HandshakeIcon size={15} />
                      <span>Proceed to Handover & Coordination</span>
                    </button>
                  )}
              </div>
            </div>
          )}

          {isUnsold && (
            <div className="alert alert-warning mb-4 outcome-banner">
              <div className="outcome-icon-circle warning">
                <PackageIcon size={20} />
              </div>
              <div className="outcome-text-area">
                <h4 className="outcome-title">Auction Ended — Unsold</h4>
                <p className="outcome-desc">
                  This auction concluded without receiving any valid bids before its deadline.
                </p>
              </div>
            </div>
          )}

          {isCancelled && (
            <div className="alert alert-danger mb-4 outcome-banner">
              <div className="outcome-icon-circle danger">
                <BanIcon size={20} />
              </div>
              <div className="outcome-text-area">
                <h4 className="outcome-title">Auction Cancelled</h4>
                <p className="outcome-desc">
                  This listing was withdrawn by the seller and is no longer accepting bids.
                </p>
              </div>
            </div>
          )}

          {!isCompleted && !isCancelled && isExpired && (
            <div className="alert alert-warning mb-4 outcome-banner">
              <div className="outcome-icon-circle warning">
                <ClockIcon size={20} />
              </div>
              <div className="outcome-text-area">
                <h4 className="outcome-title">Auction Deadline Passed</h4>
                <p className="outcome-desc">
                  The bidding window has ended. Outcome is ready to be settled.
                </p>
              </div>
            </div>
          )}

          {/* Split-Screen Details Grid */}
          <div className="details-grid">
            {/* Left Column: Visual Showcase & Specifications */}
            <div className="details-main">
              {/* Product Image / Placeholder */}
              <div className="details-hero-image-wrapper">
                {imageSrc ? (
                  <img src={imageSrc} alt={title} className="details-hero-image" />
                ) : (
                  <div className="details-image-placeholder">
                    <PackageIcon size={48} className="details-placeholder-icon" />
                    <span className="details-placeholder-text">
                      No photo attached • Verified Campus Item
                    </span>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="details-section">
                <h4 className="section-title">Item Description</h4>
                <p className="description-text">{description}</p>
              </div>

              {/* Specifications */}
              <div className="details-section">
                <h4 className="section-title">Specifications & Details</h4>
                <div className="specs-grid">
                  <div className="spec-item">
                    <span className="spec-label">Category</span>
                    <span className="spec-value">{category}</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Condition</span>
                    <span className="spec-value font-semibold">{condition}</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Listed On</span>
                    <span className="spec-value">{formattedCreatedDate}</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Total Bids Placed</span>
                    <span className="spec-value font-mono font-bold">{bids.length}</span>
                  </div>
                </div>
              </div>

              {/* Seller Trust Profile */}
              <div className="details-section">
                <h4 className="section-title">Verified Seller</h4>
                <div className="seller-box">
                  <div className="seller-avatar-large">
                    {seller?.name ? seller.name.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div className="seller-profile-details">
                    <div className="seller-name-large">
                      <span>{seller?.name || "Campus Seller"}</span>
                      {seller?.role && (
                        <span className="seller-role-tag">{seller.role}</span>
                      )}
                    </div>
                    <div className="seller-email">{seller?.email || "Verified Student Member"}</div>
                  </div>
                  <div className="seller-verification-chip">
                    <ShieldCheckIcon size={14} />
                    <span>Campus Verified</span>
                  </div>
                </div>
              </div>

              {/* Bid History Ledger */}
              <div className="details-section">
                <div className="bid-history-header">
                  <h4 className="section-title">Bid History</h4>
                  <span className="bid-count-badge font-mono">{bids.length} bids</span>
                </div>

                {loadingBids ? (
                  <div className="bid-loading">
                    <div className="spinner-sm"></div>
                    <span>Loading bid ledger...</span>
                  </div>
                ) : bids.length === 0 ? (
                  <div className="bid-history-empty">
                    <GavelIcon size={24} className="empty-gavel" />
                    <p>No bids placed yet. You can be the first to bid!</p>
                  </div>
                ) : (
                  <div className="bid-history-list">
                    {bids.map((b, index) => (
                      <div
                        key={b._id}
                        className={`bid-history-row ${index === 0 ? "bid-row-highest" : ""}`}
                      >
                        <div className="bid-row-left">
                          <div className="bid-avatar">
                            {b.bidder?.name ? b.bidder.name.charAt(0).toUpperCase() : "B"}
                          </div>
                          <div>
                            <div className="bid-name-line">
                              <span className="bid-row-name">
                                {b.bidder?.name || "Campus Buyer"}
                              </span>
                              {index === 0 && (
                                <span className="leader-badge">
                                  {isSold ? "Winner" : "Highest Bidder"}
                                </span>
                              )}
                            </div>
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

                        <div className="bid-row-amount font-mono">
                          {formatCurrency(b.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Countdown Console & Bidding Panel */}
            <div className="details-sidebar">
              {/* Real-Time Live Countdown Console */}
              {!isCompleted && !isCancelled && (
                <div className="countdown-widget-box mb-4">
                  <div className="countdown-widget-header">
                    <span className="countdown-widget-title">
                      <ClockIcon size={15} />
                      <span>Auction Clock</span>
                    </span>
                    <span
                      className={`countdown-chip ${
                        countdown.isEnded
                          ? "chip-ended"
                          : countdown.urgent
                          ? "chip-urgent"
                          : "chip-live"
                      }`}
                    >
                      {countdown.isEnded ? (
                        "Ended"
                      ) : countdown.urgent ? (
                        <>
                          <FlameIcon size={12} />
                          <span>Ending Soon</span>
                        </>
                      ) : (
                        "Live"
                      )}
                    </span>
                  </div>
                  <div className="countdown-widget-timer font-mono">
                    {countdown.isEnded ? "Auction ended" : countdown.formatted}
                  </div>
                </div>
              )}

              {/* Price Spotlight Card */}
              <div className={`price-card ${priceFlash ? "price-card-flash" : ""}`}>
                {/* Live Socket Stream Indicator */}
                <div className="live-stream-header-row mb-2">
                  {socketStatus === "connected" ? (
                    <span className="live-stream-pill live-online">
                      <span className="pulse-indicator-dot"></span>
                      <span>Live Bidding Active</span>
                    </span>
                  ) : socketStatus === "reconnecting" ? (
                    <span className="live-stream-pill live-reconnecting">
                      <span className="reconnecting-dot"></span>
                      <span>Reconnecting stream...</span>
                    </span>
                  ) : (
                    <span className="live-stream-pill live-offline">
                      <span className="offline-dot"></span>
                      <span>Offline Mode</span>
                    </span>
                  )}
                </div>

                <div className="price-card-header">
                  <span className="price-label">
                    {isSold ? "Final Winning Price" : "Current Bid"}
                  </span>
                  <div className={`price-highlight font-mono ${priceFlash ? "price-flash-pulse" : ""}`}>
                    <span className="currency-prefix">₹</span>
                    <span>
                      {Number(
                        isSold ? finalPrice || currentPrice : currentPrice
                      ).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>

                <div className="price-card-details">
                  <div className="price-detail-row">
                    <span className="detail-name">Starting Price:</span>
                    <span className="font-mono">{formatCurrency(startingPrice)}</span>
                  </div>
                  <div className="price-detail-row">
                    <span className="detail-name">Min Bid Increment:</span>
                    <span className="font-mono">+{formatCurrency(minIncrement)}</span>
                  </div>
                  {!isCompleted && !isCancelled && !countdown.isEnded && (
                    <div className="price-detail-row highlight-row">
                      <span className="detail-name">Next Required Bid:</span>
                      <span className="font-mono text-primary font-bold">
                        {formatCurrency(nextMinBid)}
                      </span>
                    </div>
                  )}
                  <div className="price-detail-row">
                    <span className="detail-name">Deadline:</span>
                    <span className="detail-value-small">{formattedEndDate}</span>
                  </div>
                </div>

                {/* Bidding Engine Form for Authenticated Buyers */}
                {canBid && (
                  <div className="bid-form-container">
                    <div className="bid-form-header">
                      <GavelIcon size={15} />
                      <span>Place Your Bid</span>
                    </div>

                    {bidError && (
                      <div className="alert alert-danger mb-3 text-sm">{bidError}</div>
                    )}
                    {bidSuccess && (
                      <div className="alert alert-success mb-3 text-sm">{bidSuccess}</div>
                    )}

                    {/* Quick Bid Increment Buttons */}
                    <div className="quick-bid-wrapper">
                      <span className="quick-bid-label">Quick Bid:</span>
                      <div className="quick-bid-pills">
                        <button
                          type="button"
                          className="quick-bid-pill"
                          onClick={() => setBidAmount(nextMinBid.toFixed(2))}
                        >
                          Min (₹{nextMinBid.toFixed(0)})
                        </button>
                        <button
                          type="button"
                          className="quick-bid-pill"
                          onClick={() => handleQuickBid(50)}
                        >
                          +₹50
                        </button>
                        <button
                          type="button"
                          className="quick-bid-pill"
                          onClick={() => handleQuickBid(100)}
                        >
                          +₹100
                        </button>
                        <button
                          type="button"
                          className="quick-bid-pill"
                          onClick={() => handleQuickBid(250)}
                        >
                          +₹250
                        </button>
                      </div>
                    </div>

                    <form onSubmit={handleBidSubmit}>
                      <div className="form-group mb-3">
                        <label className="form-label text-sm" htmlFor="bid-amount-input">
                          Custom Bid Amount
                        </label>
                        <div className="bid-input-wrapper">
                          <span className="bid-currency-symbol">₹</span>
                          <input
                            id="bid-amount-input"
                            type="number"
                            className="form-control bid-input font-mono"
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
                          Must be at least {formatCurrency(nextMinBid)}
                        </span>
                      </div>

                      <button
                        type="submit"
                        className="btn btn-primary btn-block btn-bid-submit"
                        disabled={submittingBid}
                      >
                        {submittingBid ? (
                          "Confirming Bid..."
                        ) : (
                          <>
                            <GavelIcon size={16} />
                            <span>
                              Place Bid for {formatCurrency(bidAmount || nextMinBid)}
                            </span>
                          </>
                        )}
                      </button>
                    </form>

                    {/* Automatic Bidding (Proxy) Section */}
                    <div className="proxy-bidding-card">
                      <div className="proxy-card-header">
                        <div className="proxy-header-title">
                          <ShieldCheckIcon size={16} />
                          <span>Automatic Bidding (Proxy)</span>
                        </div>
                        {proxyData?.isActive && (
                          <span className="proxy-active-badge">
                            Active (Max {formatCurrency(proxyData.maxAmount)})
                          </span>
                        )}
                      </div>

                      <p className="proxy-card-desc">
                        Set your maximum willing price. Campus Auction automatically submits minimum incremental bids to keep you ahead, up to your limit. Your ceiling remains 100% private.
                      </p>

                      {/* Live proxy status indicator */}
                      {proxyData?.isActive && (
                        <div className="proxy-status-banner">
                          {isCurrentLeader ? (
                            <div className="proxy-status-leading">
                              <TrophyIcon size={15} />
                              <span>You are currently the leading bidder!</span>
                            </div>
                          ) : currentPrice >= proxyData.maxAmount ? (
                            <div className="proxy-status-exhausted">
                              <AlertTriangleIcon size={15} />
                              <span>Limit reached ({formatCurrency(proxyData.maxAmount)}). Increase to resume automatic bidding.</span>
                            </div>
                          ) : (
                            <div className="proxy-status-active">
                              <RotateCcwIcon size={15} />
                              <span>Proxy is ready to counter competing bids up to {formatCurrency(proxyData.maxAmount)}.</span>
                            </div>
                          )}
                        </div>
                      )}

                      {proxyError && (
                        <div className="alert alert-danger mb-2 text-sm">{proxyError}</div>
                      )}
                      {proxySuccess && (
                        <div className="alert alert-success mb-2 text-sm">{proxySuccess}</div>
                      )}

                      <form onSubmit={handleSetProxy} className="proxy-form mt-2">
                        <div className="form-group mb-2">
                          <label className="form-label text-xs font-semibold text-muted">
                            {proxyData?.isActive ? "Update Maximum Limit" : "Your Maximum Amount (₹)"}
                          </label>
                          <div className="bid-input-wrapper">
                            <span className="bid-currency-symbol">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              min={isCurrentLeader ? currentPrice : nextMinBid}
                              placeholder={(isCurrentLeader ? currentPrice : nextMinBid).toFixed(2)}
                              className="form-control bid-input font-mono"
                              value={proxyMaxAmount}
                              onChange={(e) => {
                                setProxyMaxAmount(e.target.value);
                                if (proxyError) setProxyError("");
                              }}
                              required
                            />
                          </div>
                          <span className="bid-hint">
                            {isCurrentLeader
                              ? `Must be at least your current winning bid of ${formatCurrency(currentPrice)}`
                              : `Must be at least ${formatCurrency(nextMinBid)}`}
                          </span>
                        </div>

                        <div className="proxy-actions-row">
                          <button
                            type="submit"
                            className="btn btn-outline-primary btn-sm flex-1"
                            disabled={submittingProxy}
                          >
                            {submittingProxy
                              ? "Saving..."
                              : proxyData?.isActive
                              ? "Update Limit"
                              : "Enable Automatic Bidding"}
                          </button>

                          {proxyData?.isActive && (
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm"
                              onClick={handleDisableProxy}
                              disabled={disablingProxy}
                            >
                              {disablingProxy ? "Disabling..." : "Disable Proxy"}
                            </button>
                          )}
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* Role & Auth Notices */}
                {!user && status === "active" && !isExpired && (
                  <div className="bidding-placeholder-box">
                    <div className="placeholder-icon-circle">
                      <UserIcon size={20} />
                    </div>
                    <p className="placeholder-title">Sign in to Bid</p>
                    <p className="placeholder-sub mb-3">
                      Register or sign in with a Buyer account to participate in campus auctions.
                    </p>
                    <button
                      className="btn btn-primary btn-sm btn-block"
                      onClick={() => {
                        onClose();
                        if (onOpenAuth) onOpenAuth("login");
                      }}
                    >
                      Sign In to Place Bid
                    </button>
                  </div>
                )}

                {user && isSeller && !isOwner && status === "active" && !isExpired && (
                  <div className="bidding-placeholder-box">
                    <p className="placeholder-title">Seller Account Notice</p>
                    <p className="placeholder-sub">
                      You are signed in as a Seller. Only registered Buyers can place bids on campus auctions.
                    </p>
                  </div>
                )}

                {/* Settle Action for Expired Active Auction (Owner or Admin) */}
                {canManage && status === "active" && isExpired && (
                  <div className="close-auction-box mt-3">
                    <p className="text-sm font-semibold mb-2">
                      Auction deadline has expired. Finalize outcome and declare winner.
                    </p>
                    <button
                      className="btn btn-primary btn-block"
                      onClick={handleCloseAuction}
                      disabled={closingAuction}
                    >
                      {closingAuction ? "Settling Auction..." : "🏁 Settle & Finalize Auction"}
                    </button>
                  </div>
                )}

                {/* Owner & Admin Management Controls */}
                {canManage && status === "active" && !isExpired && (
                  <div className="owner-actions-box">
                    <div className="owner-header">
                      <span>{isAdmin ? "🛡️ Admin Controls" : "⚙️ Seller Controls"}</span>
                    </div>

                    <button
                      className="btn btn-primary btn-block mb-2"
                      onClick={() => onEdit(currentListing)}
                    >
                      <EditIcon size={14} />
                      <span>Edit Listing Details</span>
                    </button>

                    {!showConfirmCancel ? (
                      <button
                        className="btn btn-danger-outline btn-block"
                        onClick={() => setShowConfirmCancel(true)}
                      >
                        <BanIcon size={14} />
                        <span>Withdraw / Cancel Listing</span>
                      </button>
                    ) : (
                      <div className="confirm-cancel-box">
                        <p className="confirm-text">
                          Are you sure you want to cancel this auction? This action cannot be undone.
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
                  </div>
                )}

                {/* Relist Action for Concluded or Cancelled items (Owner or Admin) */}
                {canManage && (isCompleted || isCancelled) && (
                  <div className="owner-actions-box mt-3">
                    <div className="owner-header">
                      <span>{isAdmin ? "🛡️ Admin Operations" : "⚙️ Seller Operations"}</span>
                    </div>
                    <button
                      className="btn btn-outline btn-block"
                      onClick={() => setShowRelistModal(true)}
                    >
                      <RotateCcwIcon size={14} />
                      <span>Relist This Item for Auction</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Back to Marketplace
          </button>
        </div>

        {/* Relist Modal */}
        {showRelistModal && (
          <RelistModal
            listing={currentListing}
            isOpen={showRelistModal}
            onClose={() => setShowRelistModal(false)}
            token={token}
            onSuccess={(newListing, msg) => {
              setShowRelistModal(false);
              if (onRelistSuccess) {
                onRelistSuccess(newListing, msg);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
