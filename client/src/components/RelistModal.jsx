import React, { useState } from "react";
import { api } from "../services/api";
import { formatCurrency } from "../utils/formatters";
import { XIcon, RotateCcwIcon, AlertTriangleIcon } from "./Icons";

export default function RelistModal({ listing, isOpen, onClose, onSuccess, token }) {
  if (!isOpen || !listing) return null;

  const [startingPrice, setStartingPrice] = useState(
    listing.startingPrice || listing.currentPrice || 100
  );
  const [minBidIncrement, setMinBidIncrement] = useState(
    listing.minBidIncrement || 10
  );
  const [durationHours, setDurationHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const price = Number(startingPrice);
    const inc = Number(minBidIncrement);
    const hours = Number(durationHours);

    if (isNaN(price) || price < 1) {
      setError("Starting price must be at least ₹1.00");
      return;
    }
    if (isNaN(inc) || inc < 1) {
      setError("Minimum increment must be at least ₹1.00");
      return;
    }
    if (isNaN(hours) || hours < 1) {
      setError("Auction duration must be at least 1 hour.");
      return;
    }

    setLoading(true);
    try {
      const data = await api.relistListing(
        listing._id,
        {
          startingPrice: price,
          minBidIncrement: inc,
          durationHours: hours,
        },
        token
      );
      if (onSuccess) {
        onSuccess(data.relistedListing, data.message);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Failed to relist auction.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-titles">
            <span className="listing-category-pill">Relist Auction</span>
            <h3 className="modal-title">Relist "{listing.title}"</h3>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-body">
            <p className="modal-subtitle mb-4">
              Create a fresh auction listing for this item with a new bidding deadline and starting price. The original auction and its bid history remain preserved in archive.
            </p>

            {error && (
              <div className="alert alert-danger mb-3">
                <AlertTriangleIcon size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group mb-3">
              <label className="form-label">New Starting Price (₹) *</label>
              <div className="input-group">
                <span className="input-prefix font-mono">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  className="form-control font-mono"
                  value={startingPrice}
                  onChange={(e) => setStartingPrice(e.target.value)}
                  required
                />
              </div>
              <small className="form-text text-muted">
                Original starting price was ₹{Number(listing.startingPrice).toFixed(2)}.
              </small>
            </div>

            <div className="form-group mb-3">
              <label className="form-label">Minimum Bid Increment (₹) *</label>
              <div className="input-group">
                <span className="input-prefix font-mono">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  className="form-control font-mono"
                  value={minBidIncrement}
                  onChange={(e) => setMinBidIncrement(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group mb-3">
              <label className="form-label">New Auction Duration *</label>
              <select
                className="form-control"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
              >
                <option value={12}>12 Hours</option>
                <option value={24}>24 Hours (1 Day)</option>
                <option value={48}>48 Hours (2 Days)</option>
                <option value={72}>72 Hours (3 Days)</option>
                <option value={168}>7 Days (1 Week)</option>
              </select>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              <RotateCcwIcon size={14} />
              <span>{loading ? "Relisting..." : "Publish Relisted Auction"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
