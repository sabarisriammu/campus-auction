import React, { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { formatCurrency } from "../utils/formatters";
import { XIcon, TrophyIcon, ClockIcon, UserIcon, AlertTriangleIcon, CheckCircleIcon } from "./Icons";

export default function SecondChanceModal({ listingId, listingTitle, isOpen, onClose, token, onOfferCreated }) {
  if (!isOpen || !listingId) return null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [activeOffer, setActiveOffer] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [durationHours, setDurationHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState("");

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getSecondChanceCandidates(listingId, token);
      setCandidates(data.candidates || []);
      setActiveOffer(data.activeOffer || null);
      if (data.candidates && data.candidates.length > 0 && !selectedCandidateId) {
        setSelectedCandidateId(data.candidates[0].bidder._id);
      }
    } catch (err) {
      setError(err.message || "Failed to load candidate bidders.");
    } finally {
      setLoading(false);
    }
  }, [listingId, token, selectedCandidateId]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const handleSendOffer = async (e) => {
    e.preventDefault();
    setError("");
    setActionSuccess("");

    if (!selectedCandidateId) {
      setError("Please select an eligible bidder to send an offer.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createSecondChanceOffer(
        listingId,
        {
          candidateBidderId: selectedCandidateId,
          durationHours: Number(durationHours) || 24,
        },
        token
      );
      setActionSuccess(res.message || "Second-chance offer dispatched successfully!");
      if (onOfferCreated) {
        onOfferCreated(res.offer);
      }
      fetchCandidates();
    } catch (err) {
      setError(err.message || "Failed to send second-chance offer.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-titles">
            <span className="listing-category-pill">Fallback Coordination</span>
            <h3 className="modal-title">Second-Chance Fallback — "{listingTitle}"</h3>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-subtitle mb-4">
            If the primary winning buyer failed to complete the campus handover, you can offer the item directly to the next-highest legitimate bidder at their highest bid price.
          </p>

          {error && (
            <div className="alert alert-danger mb-3">
              <AlertTriangleIcon size={16} />
              <span>{error}</span>
            </div>
          )}

          {actionSuccess && (
            <div className="alert alert-success mb-3">
              <CheckCircleIcon size={16} />
              <span>{actionSuccess}</span>
            </div>
          )}

          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Analyzing eligible runner-up bidders...</p>
            </div>
          ) : (
            <>
              {/* Active Offer Banner */}
              {activeOffer && (
                <div className="alert alert-info mb-4 second-chance-active-box">
                  <div className="flex items-center gap-2 mb-1">
                    <ClockIcon size={16} />
                    <strong>Active Offer Pending Response</strong>
                  </div>
                  <p className="mb-1">
                    Offered to <strong>{activeOffer.candidateBidder?.name || "Candidate"}</strong> for{" "}
                    <strong className="font-mono">₹{Number(activeOffer.offerPrice).toFixed(2)}</strong>.
                  </p>
                  <small className="text-muted">
                    Expires on {new Date(activeOffer.expiresAt).toLocaleString()}. You cannot issue another offer until this one is accepted, declined, or expired.
                  </small>
                </div>
              )}

              {/* Candidate Bidders Table */}
              <div className="candidates-section mb-4">
                <h4 className="section-title mb-2">Ranked Runner-Up Bidders ({candidates.length})</h4>
                {candidates.length === 0 ? (
                  <div className="empty-candidates-box">
                    <p className="text-muted">
                      No additional runner-up bidders found for this auction (or all runner-ups have already received offers).
                    </p>
                  </div>
                ) : (
                  <div className="candidates-list">
                    {candidates.map((cand, idx) => {
                      const isSelected = selectedCandidateId === cand.bidder._id;
                      return (
                        <div
                          key={cand.bidder._id}
                          className={`candidate-row ${isSelected ? "selected" : ""}`}
                          onClick={() => !activeOffer && setSelectedCandidateId(cand.bidder._id)}
                        >
                          <div className="candidate-left">
                            <span className="candidate-rank font-mono">#{idx + 1}</span>
                            <div className="candidate-info">
                              <span className="candidate-name font-semibold">{cand.bidder.name}</span>
                              <span className="candidate-email text-muted">{cand.bidder.email}</span>
                            </div>
                          </div>

                          <div className="candidate-right">
                            <div className="candidate-bid-pill font-mono">
                              ₹{Number(cand.highestBid).toFixed(2)}
                            </div>
                            {!activeOffer && (
                              <input
                                type="radio"
                                name="candidateSelection"
                                checked={isSelected}
                                onChange={() => setSelectedCandidateId(cand.bidder._id)}
                                className="candidate-radio"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Offer Creation Form */}
              {!activeOffer && candidates.length > 0 && (
                <form onSubmit={handleSendOffer} className="second-chance-form">
                  <div className="form-group mb-3">
                    <label className="form-label">Response Time Window *</label>
                    <select
                      className="form-control"
                      value={durationHours}
                      onChange={(e) => setDurationHours(e.target.value)}
                    >
                      <option value={12}>12 Hours</option>
                      <option value={24}>24 Hours (Standard)</option>
                      <option value={48}>48 Hours (2 Days)</option>
                      <option value={72}>72 Hours (3 Days)</option>
                    </select>
                    <small className="form-text text-muted">
                      The candidate buyer will be notified immediately via app notifications. If they accept, a new handover ledger opens. If they decline or let it expire, you can advance to candidate #{candidates.length > 1 ? 2 : 1}.
                    </small>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary btn-block"
                    disabled={submitting || !selectedCandidateId}
                  >
                    <TrophyIcon size={16} />
                    <span>{submitting ? "Sending Offer..." : "Dispatch Second-Chance Offer"}</span>
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
