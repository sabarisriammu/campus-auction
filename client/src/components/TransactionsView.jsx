import React, { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { formatCurrency } from "../utils/formatters";

export default function TransactionsView({ user, token, onSwitchToBrowse, showToast }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Coordination Modal State
  const [coordinatingTx, setCoordinatingTx] = useState(null);
  const [meetupLocation, setMeetupLocation] = useState("");
  const [meetupNotes, setMeetupNotes] = useState("");
  const [savingCoordination, setSavingCoordination] = useState(false);

  // Dispute Modal State
  const [disputingTx, setDisputingTx] = useState(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [submittingDispute, setSubmittingDispute] = useState(false);

  // Action Loading tracking
  const [actionTxId, setActionTxId] = useState(null);

  const fetchTransactions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const filter = statusFilter === "ALL" ? "" : statusFilter;
      const data = await api.getTransactions(token, filter);
      setTransactions(data.transactions || []);
    } catch (err) {
      setError(err.message || "Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleOpenCoordination = (tx) => {
    setCoordinatingTx(tx);
    setMeetupLocation(tx.handoverLocation || "");
    setMeetupNotes(tx.handoverNotes || "");
  };

  const handleSaveCoordination = async (e) => {
    e.preventDefault();
    if (!coordinatingTx) return;
    setSavingCoordination(true);
    try {
      const res = await api.startHandover(
        coordinatingTx._id,
        { handoverLocation: meetupLocation, handoverNotes: meetupNotes },
        token
      );
      showToast(res.message || "Handover coordination details saved!");
      setCoordinatingTx(null);
      fetchTransactions();
    } catch (err) {
      showToast(err.message || "Failed to save coordination details.", "danger");
    } finally {
      setSavingCoordination(false);
    }
  };

  const handleConfirmHandover = async (txId) => {
    setActionTxId(txId);
    try {
      const res = await api.confirmSellerHandover(txId, token);
      showToast(res.message);
      fetchTransactions();
    } catch (err) {
      showToast(err.message || "Failed to confirm handover.", "danger");
    } finally {
      setActionTxId(null);
    }
  };

  const handleConfirmReceipt = async (txId) => {
    setActionTxId(txId);
    try {
      const res = await api.confirmBuyerReceipt(txId, token);
      showToast(res.message);
      fetchTransactions();
    } catch (err) {
      showToast(err.message || "Failed to confirm receipt.", "danger");
    } finally {
      setActionTxId(null);
    }
  };

  const handleOpenDispute = (tx) => {
    setDisputingTx(tx);
    setDisputeReason("");
  };

  const handleSubmitDispute = async (e) => {
    e.preventDefault();
    if (!disputingTx) return;
    if (!disputeReason.trim() || disputeReason.trim().length < 5) {
      showToast("Please provide a dispute explanation of at least 5 characters.", "danger");
      return;
    }
    setSubmittingDispute(true);
    try {
      const res = await api.reportDispute(disputingTx._id, disputeReason, token);
      showToast(res.message, "warning");
      setDisputingTx(null);
      fetchTransactions();
    } catch (err) {
      showToast(err.message || "Failed to report dispute.", "danger");
    } finally {
      setSubmittingDispute(false);
    }
  };

  const handleResolveDispute = async (txId) => {
    setActionTxId(txId);
    try {
      const res = await api.resolveDispute(txId, token);
      showToast(res.message);
      fetchTransactions();
    } catch (err) {
      showToast(err.message || "Failed to resolve dispute.", "danger");
    } finally {
      setActionTxId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "COMPLETED":
        return <span className="status-pill status-pill-completed">Completed</span>;
      case "HANDOVER_IN_PROGRESS":
        return <span className="status-pill status-pill-active">In Progress</span>;
      case "DISPUTED":
        return <span className="status-pill status-pill-cancelled">Disputed</span>;
      default:
        return <span className="status-pill status-pill-pending">Pending</span>;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="transactions-view container">
      {/* View Header */}
      <div className="transactions-header-section">
        <div>
          <h2 className="section-title">🤝 Handover & Transaction Status</h2>
          <p className="section-subtitle">
            Track item handovers, exchange confirmations, and dispute resolution for won and sold auctions.
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={fetchTransactions} disabled={loading}>
          🔄 Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="transaction-filter-tabs">
        {[
          { key: "ALL", label: "All Transactions" },
          { key: "PENDING", label: "Pending" },
          { key: "HANDOVER_IN_PROGRESS", label: "In Progress" },
          { key: "COMPLETED", label: "Completed" },
          { key: "DISPUTED", label: "Disputed" },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`filter-tab ${statusFilter === tab.key ? "active" : ""}`}
            onClick={() => setStatusFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading transactions and handover records...</p>
        </div>
      )}

      {!loading && error && (
        <div className="alert alert-danger mb-4">
          <span>⚠️ {error}</span>
          <button className="btn btn-sm btn-outline ml-3" onClick={fetchTransactions}>
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && transactions.length === 0 && (
        <div className="empty-state-card">
          <span className="empty-icon">📦</span>
          <h3>No Handover Transactions Found</h3>
          <p>
            {statusFilter === "ALL"
              ? "You do not have any sold auctions or items won yet. Once an auction concludes with a winning bid, the handover record will appear here."
              : `No transactions matching the status "${statusFilter}".`}
          </p>
          <button className="btn btn-primary mt-3" onClick={onSwitchToBrowse}>
            Browse Active Auctions
          </button>
        </div>
      )}

      {/* Transaction List */}
      {!loading && !error && transactions.length > 0 && (
        <div className="transactions-list">
          {transactions.map((tx) => {
            const isSeller = tx.seller?._id === user?.id || tx.seller === user?.id;
            const isBuyer = tx.buyer?._id === user?.id || tx.buyer === user?.id;
            const isAdmin = user?.role === "admin";
            const isBusy = actionTxId === tx._id;

            const listing = tx.listing || {};
            const itemImage = listing.imageUrl
              ? listing.imageUrl.startsWith("http")
                ? listing.imageUrl
                : `http://localhost:5000${listing.imageUrl}`
              : null;

            return (
              <div key={tx._id} className={`transaction-card ${tx.status.toLowerCase()}`}>
                {/* Card Top: Item & Overall Status */}
                <div className="transaction-card-top">
                  <div className="tx-item-info">
                    {itemImage ? (
                      <img src={itemImage} alt={listing.title} className="tx-thumbnail" />
                    ) : (
                      <div className="tx-thumbnail-placeholder">📦</div>
                    )}
                    <div>
                      <h3 className="tx-item-title">{listing.title || "Auction Item"}</h3>
                      <div className="tx-meta-pills">
                        {listing.category && <span className="meta-pill">{listing.category}</span>}
                        {listing.condition && <span className="meta-pill">{listing.condition}</span>}
                        <span className="tx-price-pill font-mono">
                          Final Price: <strong>{formatCurrency(tx.finalPrice)}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="tx-status-col">
                    {getStatusBadge(tx.status)}
                    <span className="tx-role-badge">
                      {isSeller ? "🏷️ You are the Seller" : isBuyer ? "🛍️ You are the Winning Buyer" : "🛡️ Admin View"}
                    </span>
                  </div>
                </div>

                {/* Dispute Alert Box */}
                {tx.status === "DISPUTED" && (
                  <div className="alert alert-danger tx-dispute-box">
                    <div className="tx-dispute-header">
                      <strong>⚠️ Handover Problem Reported</strong>
                      <span className="tx-dispute-time">{formatDate(tx.disputedAt)}</span>
                    </div>
                    <p className="tx-dispute-reason">
                      <strong>Reason:</strong> "{tx.disputeReason}"
                    </p>
                    <p className="tx-dispute-sub">
                      Reported by {tx.disputedBy?.name || "a party to this handover"}. Normal completion is paused until resolved.
                    </p>
                    <div className="mt-2">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleResolveDispute(tx._id)}
                        disabled={isBusy}
                      >
                        {isBusy ? "Resolving..." : "✅ Resolve Dispute & Resume Handover"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Meetup Coordination Details */}
                <div className="tx-details-grid">
                  <div className="tx-detail-block">
                    <span className="detail-label">Counterparty</span>
                    <span className="detail-value">
                      {isSeller
                        ? `Buyer: ${tx.buyer?.name || "Winning Buyer"} (${tx.buyer?.email || ""})`
                        : `Seller: ${tx.seller?.name || "Campus Seller"} (${tx.seller?.email || ""})`}
                    </span>
                  </div>

                  <div className="tx-detail-block">
                    <span className="detail-label">Handover Meetup Location</span>
                    <span className="detail-value">
                      {tx.handoverLocation ? `📍 ${tx.handoverLocation}` : "Location not coordinated yet"}
                    </span>
                  </div>

                  {tx.handoverNotes && (
                    <div className="tx-detail-block full-width">
                      <span className="detail-label">Coordination Notes</span>
                      <span className="detail-value note-text">💬 {tx.handoverNotes}</span>
                    </div>
                  )}
                </div>

                {/* Confirmation Progress Indicators */}
                <div className="tx-confirmations-wrapper">
                  <h4 className="confirmations-title">Handover Confirmations</h4>
                  <div className="confirmations-grid">
                    {/* Seller Confirmation Box */}
                    <div className={`confirmation-box ${tx.sellerConfirmed ? "confirmed" : "pending"}`}>
                      <div className="confirmation-header">
                        <span className="conf-icon">{tx.sellerConfirmed ? "✅" : "⏳"}</span>
                        <strong>1. Seller Handover</strong>
                      </div>
                      <p className="conf-status">
                        {tx.sellerConfirmed
                          ? `Handed over on ${formatDate(tx.sellerConfirmedAt)}`
                          : "Awaiting seller confirmation that the item has been given."}
                      </p>
                      {/* Seller Action Button */}
                      {(isSeller || isAdmin) && !tx.sellerConfirmed && tx.status !== "DISPUTED" && tx.status !== "COMPLETED" && (
                        <button
                          className="btn btn-primary btn-sm btn-block mt-2"
                          onClick={() => handleConfirmHandover(tx._id)}
                          disabled={isBusy}
                        >
                          {isBusy ? "Confirming..." : "✓ Confirm Item Handed Over"}
                        </button>
                      )}
                    </div>

                    {/* Buyer Confirmation Box */}
                    <div className={`confirmation-box ${tx.buyerConfirmed ? "confirmed" : "pending"}`}>
                      <div className="confirmation-header">
                        <span className="conf-icon">{tx.buyerConfirmed ? "✅" : "⏳"}</span>
                        <strong>2. Buyer Receipt</strong>
                      </div>
                      <p className="conf-status">
                        {tx.buyerConfirmed
                          ? `Received on ${formatDate(tx.buyerConfirmedAt)}`
                          : "Awaiting winning buyer confirmation of item receipt."}
                      </p>
                      {/* Buyer Action Button */}
                      {(isBuyer || isAdmin) && !tx.buyerConfirmed && tx.status !== "DISPUTED" && tx.status !== "COMPLETED" && (
                        <button
                          className="btn btn-primary btn-sm btn-block mt-2"
                          onClick={() => handleConfirmReceipt(tx._id)}
                          disabled={isBusy}
                        >
                          {isBusy ? "Confirming..." : "✓ Confirm Item Received"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Completion Notice */}
                  {tx.status === "COMPLETED" && (
                    <div className="alert alert-success mt-3 tx-completed-banner">
                      <span>🎉 <strong>Transaction Completed!</strong> Both parties confirmed item handover on {formatDate(tx.completedAt)}.</span>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="tx-card-actions">
                  {tx.status !== "COMPLETED" && tx.status !== "DISPUTED" && (
                    <>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleOpenCoordination(tx)}
                      >
                        📍 {tx.handoverLocation ? "Update Meetup / Notes" : "Coordinate Meetup"}
                      </button>

                      <button
                        className="btn btn-danger-outline btn-sm"
                        onClick={() => handleOpenDispute(tx)}
                      >
                        ⚠️ Report Issue
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Coordination Modal */}
      {coordinatingTx && (
        <div className="modal-backdrop">
          <div className="modal modal-md">
            <div className="modal-header">
              <h3 className="modal-title">📍 Coordinate Handover</h3>
              <button className="modal-close" onClick={() => setCoordinatingTx(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveCoordination}>
              <div className="modal-body">
                <p className="modal-subtitle mb-3">
                  Agree on a safe, public campus location and time to exchange the item.
                </p>

                <div className="form-group mb-3">
                  <label className="form-label">Campus Meetup Location</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Student Union 1st Floor, Campus Library Lobby"
                    value={meetupLocation}
                    onChange={(e) => setMeetupLocation(e.target.value)}
                    maxLength={200}
                  />
                  <small className="form-text text-muted">
                    Choose a well-lit, public location on campus.
                  </small>
                </div>

                <div className="form-group mb-3">
                  <label className="form-label">Coordination Notes / Availability</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    placeholder="e.g. Available Tuesday between 2pm-4pm. I'll wear a blue jacket."
                    value={meetupNotes}
                    onChange={(e) => setMeetupNotes(e.target.value)}
                    maxLength={1000}
                  ></textarea>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCoordinatingTx(null)}
                  disabled={savingCoordination}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingCoordination}
                >
                  {savingCoordination ? "Saving Details..." : "Save Coordination"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {disputingTx && (
        <div className="modal-backdrop">
          <div className="modal modal-md">
            <div className="modal-header">
              <h3 className="modal-title text-danger">⚠️ Report Handover Issue</h3>
              <button className="modal-close" onClick={() => setDisputingTx(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmitDispute}>
              <div className="modal-body">
                <p className="modal-subtitle mb-3">
                  If the item was not as described, the counterparty failed to show up, or an issue occurred during handover, document it below.
                </p>

                <div className="form-group mb-3">
                  <label className="form-label">Explain the Issue *</label>
                  <textarea
                    className="form-control"
                    rows="4"
                    placeholder="Please describe the issue in detail (minimum 5 characters)..."
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    required
                    minLength={5}
                    maxLength={1000}
                  ></textarea>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setDisputingTx(null)}
                  disabled={submittingDispute}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={submittingDispute}
                >
                  {submittingDispute ? "Submitting Issue..." : "Submit Dispute"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
