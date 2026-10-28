import React, { useState } from "react";

const CATEGORIES = [
  "Textbooks",
  "Electronics",
  "Furniture",
  "Clothing",
  "Vehicles & Scooters",
  "Supplies",
  "Other",
];

const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"];

export default function CreateListingModal({
  isOpen,
  onClose,
  onSubmit,
  user,
  onOpenAuth,
}) {
  const getDefaultEndTime = () => {
    const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const getMinEndTime = () => {
    const d = new Date(Date.now() + 10 * 60 * 1000); // at least 10 minutes from now
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "Textbooks",
    condition: "Good",
    startingPrice: "",
    minBidIncrement: "1.00",
    auctionEndTime: getDefaultEndTime(),
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const isBuyer = user && (user.role === "buyer" || !user.role);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Client validation
    if (!formData.title.trim() || formData.title.trim().length < 3) {
      setError("Title must be at least 3 characters long.");
      return;
    }

    if (!formData.description.trim() || formData.description.trim().length < 5) {
      setError("Description must be at least 5 characters long.");
      return;
    }

    const price = Number(formData.startingPrice);
    if (isNaN(price) || price <= 0) {
      setError("Starting price must be a valid number greater than $0.00.");
      return;
    }

    const increment = Number(formData.minBidIncrement);
    if (isNaN(increment) || increment <= 0) {
      setError("Minimum bid increment must be greater than $0.00.");
      return;
    }

    const selectedEndTime = new Date(formData.auctionEndTime);
    if (isNaN(selectedEndTime.getTime()) || selectedEndTime <= new Date()) {
      setError("Auction end time must be a future date and time.");
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        condition: formData.condition,
        startingPrice: price,
        minBidIncrement: increment,
        auctionEndTime: selectedEndTime.toISOString(),
      });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create listing. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">List an Item for Auction</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {!user ? (
          <div className="modal-body auth-prompt-box">
            <span className="auth-prompt-icon">🔒</span>
            <h3>Authentication Required</h3>
            <p>You need to sign in to your campus account to create an auction listing.</p>
            <div className="auth-prompt-buttons">
              <button
                className="btn btn-primary"
                onClick={() => {
                  onClose();
                  onOpenAuth("login");
                }}
              >
                Sign In
              </button>
              <button
                className="btn btn-outline"
                onClick={() => {
                  onClose();
                  onOpenAuth("register");
                }}
              >
                Create Account
              </button>
            </div>
          </div>
        ) : isBuyer ? (
          <div className="modal-body auth-prompt-box">
            <span className="auth-prompt-icon">🏷️</span>
            <h3>Seller Role Required</h3>
            <p>
              You are currently signed in with a <strong>Buyer</strong> account.
              Only users registered as a <strong>Seller</strong> or <strong>Admin</strong> can list items and host auctions on campus.
            </p>
            <div className="auth-prompt-buttons">
              <button className="btn btn-outline" onClick={onClose}>
                Continue Browsing
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  onClose();
                  onOpenAuth("register");
                }}
              >
                Register as Seller
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="alert alert-danger mb-3">{error}</div>}

              <div className="form-group">
                <label className="form-label" htmlFor="title">
                  Item Title *
                </label>
                <input
                  id="title"
                  type="text"
                  name="title"
                  className="form-control"
                  placeholder="e.g. Organic Chemistry 6th Ed + Solutions Manual"
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group col-half">
                  <label className="form-label" htmlFor="category">
                    Category *
                  </label>
                  <select
                    id="category"
                    name="category"
                    className="form-control"
                    value={formData.category}
                    onChange={handleChange}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group col-half">
                  <label className="form-label" htmlFor="condition">
                    Condition *
                  </label>
                  <select
                    id="condition"
                    name="condition"
                    className="form-control"
                    value={formData.condition}
                    onChange={handleChange}
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="description">
                  Description *
                </label>
                <textarea
                  id="description"
                  name="description"
                  className="form-control"
                  rows="3"
                  placeholder="Describe condition, pickup locations on campus, included accessories..."
                  value={formData.description}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group col-half">
                  <label className="form-label" htmlFor="startingPrice">
                    Starting Price ($) *
                  </label>
                  <input
                    id="startingPrice"
                    type="number"
                    name="startingPrice"
                    className="form-control"
                    placeholder="10.00"
                    step="0.01"
                    min="0.01"
                    value={formData.startingPrice}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group col-half">
                  <label className="form-label" htmlFor="minBidIncrement">
                    Min Bid Increment ($)
                  </label>
                  <input
                    id="minBidIncrement"
                    type="number"
                    name="minBidIncrement"
                    className="form-control"
                    placeholder="1.00"
                    step="0.01"
                    min="0.01"
                    value={formData.minBidIncrement}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="auctionEndTime">
                  Auction End Date & Time *
                </label>
                <input
                  id="auctionEndTime"
                  type="datetime-local"
                  name="auctionEndTime"
                  className="form-control"
                  min={getMinEndTime()}
                  value={formData.auctionEndTime}
                  onChange={handleChange}
                  required
                />
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
                {loading ? "Publishing Listing..." : "Publish Auction"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
