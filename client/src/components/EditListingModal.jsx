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

export default function EditListingModal({
  listing,
  isOpen,
  onClose,
  onSubmit,
}) {
  if (!isOpen || !listing) return null;

  // Format existing end time for datetime-local
  const formatDatetimeForInput = (isoDate) => {
    try {
      const d = new Date(isoDate);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    } catch {
      return "";
    }
  };

  const [formData, setFormData] = useState({
    title: listing.title || "",
    description: listing.description || "",
    category: listing.category || "Other",
    condition: listing.condition || "Good",
    startingPrice: listing.startingPrice?.toString() || "",
    minBidIncrement: listing.minBidIncrement?.toString() || "1.00",
    auctionEndTime: formatDatetimeForInput(listing.auctionEndTime),
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

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
      setError("Starting price must be a positive number.");
      return;
    }

    const increment = Number(formData.minBidIncrement);
    if (isNaN(increment) || increment <= 0) {
      setError("Minimum bid increment must be a positive number.");
      return;
    }

    const selectedEndTime = new Date(formData.auctionEndTime);
    if (isNaN(selectedEndTime.getTime()) || selectedEndTime <= new Date()) {
      setError("Auction end time must be in the future.");
      return;
    }

    setLoading(true);
    try {
      await onSubmit(listing._id, {
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
      setError(err.message || "Failed to update listing.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Edit Auction Listing</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-danger mb-3">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="edit-title">
                Item Title *
              </label>
              <input
                id="edit-title"
                type="text"
                name="title"
                className="form-control"
                value={formData.title}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group col-half">
                <label className="form-label" htmlFor="edit-category">
                  Category *
                </label>
                <select
                  id="edit-category"
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
                <label className="form-label" htmlFor="edit-condition">
                  Condition *
                </label>
                <select
                  id="edit-condition"
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
              <label className="form-label" htmlFor="edit-description">
                Description *
              </label>
              <textarea
                id="edit-description"
                name="description"
                className="form-control"
                rows="3"
                value={formData.description}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group col-half">
                <label className="form-label" htmlFor="edit-startingPrice">
                  Starting Price ($) *
                </label>
                <input
                  id="edit-startingPrice"
                  type="number"
                  name="startingPrice"
                  className="form-control"
                  step="0.01"
                  min="0.01"
                  value={formData.startingPrice}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group col-half">
                <label className="form-label" htmlFor="edit-minBidIncrement">
                  Min Bid Increment ($)
                </label>
                <input
                  id="edit-minBidIncrement"
                  type="number"
                  name="minBidIncrement"
                  className="form-control"
                  step="0.01"
                  min="0.01"
                  value={formData.minBidIncrement}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-auctionEndTime">
                Auction End Date & Time *
              </label>
              <input
                id="edit-auctionEndTime"
                type="datetime-local"
                name="auctionEndTime"
                className="form-control"
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
              {loading ? "Saving Changes..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
