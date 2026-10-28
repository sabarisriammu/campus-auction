import React, { useState } from "react";
import { api } from "../services/api";
import { XIcon, AlertTriangleIcon, BanIcon } from "./Icons";

const OUTCOME_REASONS = [
  { value: "BUYER_NO_SHOW", label: "Buyer did not show up to scheduled meetup" },
  { value: "SELLER_CANCELLED", label: "Seller cancelled the transaction" },
  { value: "ITEM_MISMATCH", label: "Item condition or model did not match description" },
  { value: "ITEM_DAMAGED", label: "Item was damaged, defective, or unusable" },
  { value: "MUTUAL_CANCEL", label: "Both buyer and seller mutually agreed to cancel" },
  { value: "OTHER", label: "Other campus handover issue" },
];

export default function TransactionOutcomeModal({ transaction, isOpen, onClose, token, onSuccess }) {
  if (!isOpen || !transaction) return null;

  const [outcomeType, setOutcomeType] = useState("CANCELLED");
  const [outcomeReason, setOutcomeReason] = useState("BUYER_NO_SHOW");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (outcomeReason === "OTHER" && (!notes.trim() || notes.trim().length < 5)) {
      setError("Please describe the specific reason in notes when selecting 'Other'.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.recordTransactionOutcome(
        transaction._id,
        {
          outcomeType,
          outcomeReason,
          notes: notes.trim(),
        },
        token
      );
      if (onSuccess) {
        onSuccess(res.transaction, res.message);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Failed to record transaction outcome.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-titles">
            <span className="listing-category-pill text-danger">Handover Resolution</span>
            <h3 className="modal-title">Conclude Handover as Cancelled or Failed</h3>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-body">
            <p className="modal-subtitle mb-4">
              If the physical handover could not be completed, record the verified outcome below. This permanently closes this handover ledger and unlocks Second-Chance or Relisting options for the seller.
            </p>

            {error && (
              <div className="alert alert-danger mb-3">
                <AlertTriangleIcon size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Outcome Type Radio Buttons */}
            <div className="form-group mb-3">
              <label className="form-label font-semibold">Outcome Status *</label>
              <div className="outcome-type-options">
                <label className={`outcome-type-card ${outcomeType === "CANCELLED" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="outcomeType"
                    value="CANCELLED"
                    checked={outcomeType === "CANCELLED"}
                    onChange={(e) => setOutcomeType(e.target.value)}
                  />
                  <div>
                    <span className="outcome-type-title">Cancelled</span>
                    <span className="outcome-type-sub">Mutually stopped or withdrawn before exchange</span>
                  </div>
                </label>

                <label className={`outcome-type-card ${outcomeType === "FAILED" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="outcomeType"
                    value="FAILED"
                    checked={outcomeType === "FAILED"}
                    onChange={(e) => setOutcomeType(e.target.value)}
                  />
                  <div>
                    <span className="outcome-type-title">Failed</span>
                    <span className="outcome-type-sub">Attempted meetup failed (no-show, defects, refusal)</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Outcome Reason Dropdown */}
            <div className="form-group mb-3">
              <label className="form-label">Primary Reason *</label>
              <select
                className="form-control"
                value={outcomeReason}
                onChange={(e) => setOutcomeReason(e.target.value)}
                required
              >
                {OUTCOME_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes Textarea */}
            <div className="form-group mb-3">
              <label className="form-label">Additional Documentation / Details</label>
              <textarea
                className="form-control"
                rows="3"
                placeholder="Optional notes or details regarding why the handover was cancelled or failed..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
              ></textarea>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={loading}
            >
              Back
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={loading}
            >
              <BanIcon size={14} />
              <span>{loading ? "Recording..." : `Confirm Handover ${outcomeType === "CANCELLED" ? "Cancellation" : "Failure"}`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
