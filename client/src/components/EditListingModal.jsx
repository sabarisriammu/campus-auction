import React, { useState, useRef } from "react";
import { api } from "../services/api";

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
  token,
}) {
  if (!isOpen || !listing) return null;

  const formatDatetimeForInput = (isoDate) => {
    try {
      const d = new Date(isoDate);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    } catch {
      return "";
    }
  };

  const initialImageUrl = listing.imageUrl
    ? listing.imageUrl.startsWith("http")
      ? listing.imageUrl
      : `http://localhost:5000${listing.imageUrl}`
    : null;

  const [formData, setFormData] = useState({
    title: listing.title || "",
    description: listing.description || "",
    category: listing.category || "Other",
    condition: listing.condition || "Good",
    startingPrice: listing.startingPrice?.toString() || "",
    minBidIncrement: listing.minBidIncrement?.toString() || "1.00",
    auctionEndTime: formatDatetimeForInput(listing.auctionEndTime),
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(initialImageUrl);
  const [imageChanged, setImageChanged] = useState(false);
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError("");
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please select a JPEG, PNG, or WebP image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image size exceeds 5MB limit. Please choose a smaller image.");
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageChanged(true);
    setError("");
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageChanged(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
    let finalImageUrl = listing.imageUrl;

    try {
      if (imageChanged) {
        if (imageFile) {
          setUploadStatus("Uploading new image...");
          const uploadRes = await api.uploadImage(imageFile, token);
          finalImageUrl = uploadRes.imageUrl;
        } else {
          finalImageUrl = null; // Image was explicitly removed
        }
      }

      setUploadStatus("Saving listing changes...");
      await onSubmit(listing._id, {
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        condition: formData.condition,
        startingPrice: price,
        minBidIncrement: increment,
        auctionEndTime: selectedEndTime.toISOString(),
        imageUrl: finalImageUrl,
      });

      onClose();
    } catch (err) {
      setError(err.message || "Failed to update listing.");
    } finally {
      setLoading(false);
      setUploadStatus("");
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

            {/* Product Image Edit Section */}
            <div className="form-group">
              <label className="form-label">Product Image</label>
              <div className="image-upload-wrapper">
                {imagePreview ? (
                  <div className="image-preview-box">
                    <img
                      src={imagePreview}
                      alt="Product Preview"
                      className="uploaded-image-preview"
                    />
                    <div className="image-preview-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Replace Image
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger-outline btn-sm"
                        onClick={handleRemoveImage}
                      >
                        Remove Image
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="image-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <span className="dropzone-icon">📷</span>
                    <p className="dropzone-text">Click to attach a product photo</p>
                    <span className="dropzone-sub">Supports JPEG, PNG, WebP (Max 5MB)</span>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden-file-input"
                  onChange={handleImageChange}
                />
              </div>
            </div>

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
              {loading ? uploadStatus || "Saving Changes..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
