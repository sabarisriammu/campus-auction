import React, { useState, useRef } from "react";
import { api } from "../services/api";
import {
  XIcon,
  CameraIcon,
  PlusIcon,
  PackageIcon,
  TagIcon,
  UserIcon,
} from "./Icons";

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
  token,
  onOpenAuth,
}) {
  const getDefaultEndTime = () => {
    const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
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

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const isBuyer = user && (user.role === "buyer" || !user.role);

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
    setError("");
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
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
      setError("Starting price must be a valid number greater than ₹0.00.");
      return;
    }

    const increment = Number(formData.minBidIncrement);
    if (isNaN(increment) || increment <= 0) {
      setError("Minimum bid increment must be greater than ₹0.00.");
      return;
    }

    const selectedEndTime = new Date(formData.auctionEndTime);
    if (isNaN(selectedEndTime.getTime()) || selectedEndTime <= new Date()) {
      setError("Auction end time must be a future date and time.");
      return;
    }

    setLoading(true);
    let uploadedImageUrl = null;

    try {
      if (imageFile) {
        setUploadStatus("Uploading item photo...");
        const uploadResult = await api.uploadImage(imageFile, token);
        uploadedImageUrl = uploadResult.imageUrl;
      }

      setUploadStatus("Creating auction listing...");
      await onSubmit({
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        condition: formData.condition,
        startingPrice: price,
        minBidIncrement: increment,
        auctionEndTime: selectedEndTime.toISOString(),
        imageUrl: uploadedImageUrl,
      });

      handleRemoveImage();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create listing. Please try again.");
    } finally {
      setLoading(false);
      setUploadStatus("");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-titles">
            <span className="listing-category-pill">Seller Console</span>
            <h2 className="modal-title">List an Item for Auction</h2>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">
            <XIcon size={18} />
          </button>
        </div>

        {!user ? (
          <div className="modal-body auth-prompt-box">
            <div className="auth-prompt-icon-wrapper">
              <UserIcon size={32} />
            </div>
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
            <div className="auth-prompt-icon-wrapper warning">
              <TagIcon size={32} />
            </div>
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
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="modal-body">
              {error && <div className="alert alert-danger mb-3">{error}</div>}

              {/* Product Image Upload Section */}
              <div className="form-group mb-3">
                <label className="form-label">Item Photo (Optional)</label>
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
                          Replace Photo
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger-outline btn-sm"
                          onClick={handleRemoveImage}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="image-dropzone"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <CameraIcon size={28} className="dropzone-icon" />
                      <p className="dropzone-text">Click to upload an item photo</p>
                      <span className="dropzone-sub">JPEG, PNG, WebP up to 5MB</span>
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

              <div className="form-group mb-3">
                <label className="form-label" htmlFor="title">
                  Item Title *
                </label>
                <input
                  id="title"
                  type="text"
                  name="title"
                  className="form-control"
                  placeholder="e.g. iPad Air 5th Gen (64GB, Space Gray)"
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group mb-3">
                <label className="form-label" htmlFor="description">
                  Description & Condition Notes *
                </label>
                <textarea
                  id="description"
                  name="description"
                  className="form-control"
                  rows="3"
                  placeholder="Describe the item condition, accessories included, and campus pickup details..."
                  value={formData.description}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-row-2 mb-3">
                <div className="form-group">
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
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
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
                    {CONDITIONS.map((cond) => (
                      <option key={cond} value={cond}>
                        {cond}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row-2 mb-3">
                <div className="form-group">
                  <label className="form-label" htmlFor="startingPrice">
                    Starting Price (₹) *
                  </label>
                  <div className="bid-input-wrapper">
                    <span className="bid-currency-symbol">₹</span>
                    <input
                      id="startingPrice"
                      type="number"
                      name="startingPrice"
                      className="form-control bid-input font-mono"
                      step="0.01"
                      min="0.01"
                      placeholder="500.00"
                      value={formData.startingPrice}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="minBidIncrement">
                    Min Increment (₹) *
                  </label>
                  <div className="bid-input-wrapper">
                    <span className="bid-currency-symbol">₹</span>
                    <input
                      id="minBidIncrement"
                      type="number"
                      name="minBidIncrement"
                      className="form-control bid-input font-mono"
                      step="0.01"
                      min="0.01"
                      placeholder="10.00"
                      value={formData.minBidIncrement}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="form-group mb-3">
                <label className="form-label" htmlFor="auctionEndTime">
                  Auction End Deadline *
                </label>
                <input
                  id="auctionEndTime"
                  type="datetime-local"
                  name="auctionEndTime"
                  className="form-control"
                  value={formData.auctionEndTime}
                  onChange={handleChange}
                  required
                />
                <small className="form-text text-muted">
                  Bids are locked and the highest bidder wins automatically at this deadline.
                </small>
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
                {loading ? uploadStatus || "Publishing..." : "Publish Auction"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
