import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../services/api";
import { formatCurrency } from "../utils/formatters";
import {
  HandshakeIcon,
  CheckCircleIcon,
  ClockIcon,
  AlertTriangleIcon,
  LocationIcon,
  PackageIcon,
  RefreshIcon,
  XIcon,
  UserIcon,
} from "./Icons";

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

  // Metric aggregates
  const metrics = useMemo(() => {
    const total = transactions.length;
    const completed = transactions.filter((t) => t.status === "COMPLETED").length;
    const inProgress = transactions.filter(
      (t) => t.status === "HANDOVER_IN_PROGRESS" || t.status === "PENDING"
    ).length;
    const disputed = transactions.filter((t) => t.status === "DISPUTED").length;
    return { total, completed, inProgress, disputed };
  }, [transactions]);

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
          <div className="header-badge-row">
            <span className="badge badge-purple">
              <HandshakeIcon size={13} />
              <span>Campus Handover Hub</span>
            </span>
          </div>
          <h2 className="section-title">Handover & Settlement Console</h2>
          <p className="section-subtitle">
            Coordinate safe on-campus meeting locations, execute mutual exchange confirmations, and resolve disputes.
          </p>
        </div>

        <button className="btn btn-outline btn-sm" onClick={fetchTransactions} disabled={loading}>
          <RefreshIcon size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Handover Metrics Overview */}
      <div className="tx-metrics-grid">
        <div className="tx-metric-card">
          <span className="metric-number font-mono">{metrics.total}</span>
          <span className="metric-label">Total Transactions</span>
        </div>
        <div className="tx-metric-card">
          <span className="metric-number font-mono text-primary">{metrics.inProgress}</span>
          <span className="metric-label">In Handover</span>
        </div>
        <div className="tx-metric-card">
          <span className="metric-number font-mono text-success">{metrics.completed}</span>
          <span className="metric-label">Completed</span>
        </div>
        <div className="tx-metric-card">
          <span className="metric-number font-mono text-danger">{metrics.disputed}</span>
          <span className="metric-label">Disputed</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="transaction-filter-tabs">
        {[
          { key: "ALL", label: "All Records" },
          { key: "PENDING", label: "Pending Setup" },
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
          <p>Retrieving campus handover records...</p>
        </div>
      )}

      {!loading && error && (
        <div className="alert alert-danger mb-4">
          <AlertTriangleIcon size={18} />
          <span>{error}</span>
          <button className="btn btn-sm btn-outline ml-3" onClick={fetchTransactions}>
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && transactions.length === 0 && (
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <HandshakeIcon size={40} />
          </div>
          <h3>No Handover Records Found</h3>
          <p>
            {statusFilter === "ALL"
              ? "You do not have any won or sold auctions in your handover log yet. Once an auction closes with a winner, the handover coordination ledger will automatically appear here."
              : `No transactions found under status "${statusFilter}".`}
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

            // Handover Progress Steps
            const step1Done = true; // Auction Won / Created
            const step2Done = Boolean(tx.handoverLocation); // Coordinated
            const step3Done = Boolean(tx.sellerConfirmed); // Seller Delivered
            const step4Done = Boolean(tx.buyerConfirmed); // Buyer Confirmed

            return (
              <div key={tx._id} className={`transaction-card ${tx.status.toLowerCase()}`}>
                {/* Card Top: Item & Overall Status */}
                <div className="transaction-card-top">
                  <div className="tx-item-info">
                    {itemImage ? (
                      <img src={itemImage} alt={listing.title} className="tx-thumbnail" />
                    ) : (
                      <div className="tx-thumbnail-placeholder">
                        <PackageIcon size={24} />
                      </div>
                    )}
                    <div>
                      <h3 className="tx-item-title">{listing.title || "Auction Item"}</h3>
                      <div className="tx-meta-pills">
                        {listing.category && <span className="meta-pill">{listing.category}</span>}
                        {listing.condition && <span className="meta-pill">{listing.condition}</span>}
                        <span className="tx-price-pill font-mono">
                          Winning Bid: <strong>{formatCurrency(tx.finalPrice)}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="tx-status-col">
                    {getStatusBadge(tx.status)}
                    <span className="tx-role-badge">
                      {isSeller ? "Seller Role" : isBuyer ? "Winning Buyer" : "Admin Oversight"}
                    </span>
                  </div>
                </div>

                {/* 4-Step Handover Stepper */}
                <div className="handover-stepper">
                  <div className={`stepper-step ${step1Done ? "completed" : "active"}`}>
                    <div className="step-circle">
                      <CheckCircleIcon size={12} />
                    </div>
                    <span className="step-label">Auction Won</span>
                  </div>
                  <div className={`stepper-line ${step2Done ? "completed" : ""}`}></div>

                  <div
                    className={`stepper-step ${
                      step2Done ? "completed" : step1Done ? "active" : ""
                    }`}
                  >
                    <div className="step-circle">
                      {step2Done ? <CheckCircleIcon size={12} /> : "2"}
                    </div>
                    <span className="step-label">Meetup Set</span>
                  </div>
                  <div className={`stepper-line ${step3Done ? "completed" : ""}`}></div>

                  <div
                    className={`stepper-step ${
                      step3Done ? "completed" : step2Done ? "active" : ""
                    }`}
                  >
                    <div className="step-circle">
                      {step3Done ? <CheckCircleIcon size={12} /> : "3"}
                    </div>
                    <span className="step-label">Item Handed</span>
                  </div>
                  <div className={`stepper-line ${step4Done ? "completed" : ""}`}></div>

                  <div
                    className={`stepper-step ${
                      step4Done ? "completed" : step3Done ? "active" : ""
                    }`}
                  >
                    <div className="step-circle">
                      {step4Done ? <CheckCircleIcon size={12} /> : "4"}
                    </div>
                    <span className="step-label">Received & Complete</span>
                  </div>
                </div>

                {/* Dispute Alert Box */}
                {tx.status === "DISPUTED" && (
                  <div className="alert alert-danger tx-dispute-box">
                    <div className="tx-dispute-header">
                      <div className="dispute-title-row">
                        <AlertTriangleIcon size={18} />
                        <strong>Handover Issue Reported</strong>
                      </div>
                      <span className="tx-dispute-time">{formatDate(tx.disputedAt)}</span>
                    </div>
                    <p className="tx-dispute-reason">
                      <strong>Reason:</strong> "{tx.disputeReason}"
                    </p>
                    <p className="tx-dispute-sub">
                      Reported by {tx.disputedBy?.name || "a transaction party"}. Normal settlement is paused until resolved.
                    </p>
                    <div className="mt-3">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleResolveDispute(tx._id)}
                        disabled={isBusy}
                      >
                        <CheckCircleIcon size={14} />
                        <span>{isBusy ? "Resolving..." : "Resolve Dispute & Resume Handover"}</span>
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
                    <span className="detail-label">Campus Meetup Location</span>
                    <span className="detail-value flex items-center gap-1">
                      <LocationIcon size={14} />
                      <span>{tx.handoverLocation || "Location not set yet"}</span>
                    </span>
                  </div>

                  {tx.handoverNotes && (
                    <div className="tx-detail-block full-width">
                      <span className="detail-label">Coordination Notes</span>
                      <span className="detail-value note-text">{tx.handoverNotes}</span>
                    </div>
                  )}
                </div>

                {/* Confirmation Progress Indicators */}
                <div className="tx-confirmations-wrapper">
                  <h4 className="confirmations-title">Dual Handover Verification</h4>
                  <div className="confirmations-grid">
                    {/* Seller Confirmation Box */}
                    <div className={`confirmation-box ${tx.sellerConfirmed ? "confirmed" : "pending"}`}>
                      <div className="confirmation-header">
                        <div className="conf-icon-circle">
                          {tx.sellerConfirmed ? (
                            <CheckCircleIcon size={16} />
                          ) : (
                            <ClockIcon size={16} />
                          )}
                        </div>
                        <strong>1. Seller Handover</strong>
                      </div>
                      <p className="conf-status">
                        {tx.sellerConfirmed
                          ? `Handed over on ${formatDate(tx.sellerConfirmedAt)}`
                          : "Awaiting seller confirmation that the item has been physically transferred."}
                      </p>
                      {/* Seller Action Button */}
                      {(isSeller || isAdmin) &&
                        !tx.sellerConfirmed &&
                        tx.status !== "DISPUTED" &&
                        tx.status !== "COMPLETED" && (
                          <button
                            className="btn btn-primary btn-sm btn-block mt-3"
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
                        <div className="conf-icon-circle">
                          {tx.buyerConfirmed ? (
                            <CheckCircleIcon size={16} />
                          ) : (
                            <ClockIcon size={16} />
                          )}
                        </div>
                        <strong>2. Buyer Receipt</strong>
                      </div>
                      <p className="conf-status">
                        {tx.buyerConfirmed
                          ? `Received on ${formatDate(tx.buyerConfirmedAt)}`
                          : "Awaiting winning buyer confirmation of item receipt and inspection."}
                      </p>
                      {/* Buyer Action Button */}
                      {(isBuyer || isAdmin) &&
                        !tx.buyerConfirmed &&
                        tx.status !== "DISPUTED" &&
                        tx.status !== "COMPLETED" && (
                          <button
                            className="btn btn-primary btn-sm btn-block mt-3"
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
                      <CheckCircleIcon size={18} />
                      <span>
                        <strong>Transaction Completed!</strong> Both parties verified item handover on{" "}
                        {formatDate(tx.completedAt)}.
                      </span>
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
                        <LocationIcon size={14} />
                        <span>{tx.handoverLocation ? "Update Meetup Location" : "Set Meetup Location"}</span>
                      </button>

                      <button
                        className="btn btn-danger-outline btn-sm"
                        onClick={() => handleOpenDispute(tx)}
                      >
                        <AlertTriangleIcon size={14} />
                        <span>Report Issue</span>
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
        <div className="modal-overlay" onClick={() => setCoordinatingTx(null)}>
          <div className="modal-content modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-titles">
                <span className="listing-category-pill">Meetup Setup</span>
                <h3 className="modal-title">Coordinate Campus Handover</h3>
              </div>
              <button
                className="btn-close"
                onClick={() => setCoordinatingTx(null)}
                aria-label="Close"
              >
                <XIcon size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveCoordination} className="modal-form">
              <div className="modal-body">
                <p className="modal-subtitle mb-4">
                  Agree on a safe, well-lit campus location and time window to inspect and exchange the item.
                </p>

                <div className="form-group mb-3">
                  <label className="form-label">Campus Meeting Spot *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Student Center Lobby, Main Library Entrance"
                    value={meetupLocation}
                    onChange={(e) => setMeetupLocation(e.target.value)}
                    maxLength={200}
                    required
                  />
                  <small className="form-text text-muted">
                    Always choose a public, busy location on campus.
                  </small>
                </div>

                <div className="form-group mb-3">
                  <label className="form-label">Coordination Notes / Time Slot</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    placeholder="e.g. Free after 3 PM Wednesday. Wearing a blue hoodie near the cafe counter."
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
                  {savingCoordination ? "Saving..." : "Save Coordination"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {disputingTx && (
        <div className="modal-overlay" onClick={() => setDisputingTx(null)}>
          <div className="modal-content modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-titles">
                <span className="listing-category-pill text-danger">Issue Resolution</span>
                <h3 className="modal-title text-danger">Report Handover Problem</h3>
              </div>
              <button
                className="btn-close"
                onClick={() => setDisputingTx(null)}
                aria-label="Close"
              >
                <XIcon size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmitDispute} className="modal-form">
              <div className="modal-body">
                <p className="modal-subtitle mb-4">
                  If the item differs significantly from the listing, the counterparty failed to attend the meetup, or an issue arose, document it here.
                </p>

                <div className="form-group mb-3">
                  <label className="form-label">Explanation of the Issue *</label>
                  <textarea
                    className="form-control"
                    rows="4"
                    placeholder="Describe what occurred with as much detail as possible (minimum 5 characters)..."
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
                  {submittingDispute ? "Submitting..." : "Report Issue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
