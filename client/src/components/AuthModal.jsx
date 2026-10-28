import React, { useState } from "react";
import { XIcon, UserIcon, TagIcon, ShieldCheckIcon, PackageIcon } from "./Icons";

export default function AuthModal({
  isOpen,
  initialMode = "login",
  onClose,
  onLogin,
  onRegister,
}) {
  const [mode, setMode] = useState(initialMode); // "login" | "register"
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "buyer",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError("");
  };

  const handleTabSwitch = (newMode) => {
    setMode(newMode);
    setError("");
    setSuccessMessage("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!formData.email || !formData.password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (mode === "register") {
      if (!formData.name.trim()) {
        setError("Name is required.");
        return;
      }
      if (formData.password.length < 8) {
        setError("Password must be at least 8 characters long.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await onLogin({
          email: formData.email.trim(),
          password: formData.password,
        });
        onClose();
      } else {
        await onRegister({
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          role: formData.role,
        });
        setSuccessMessage("Account created successfully! Signing you in...");
      }
    } catch (err) {
      setError(err.message || "Authentication failed. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => handleTabSwitch("login")}
              type="button"
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${mode === "register" ? "active" : ""}`}
              onClick={() => handleTabSwitch("register")}
              type="button"
            >
              Register
            </button>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-body">
            {error && <div className="alert alert-danger mb-3">{error}</div>}
            {successMessage && <div className="alert alert-success mb-3">{successMessage}</div>}

            {mode === "register" && (
              <>
                <div className="form-group mb-3">
                  <label className="form-label" htmlFor="auth-name">
                    Full Name *
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    name="name"
                    className="form-control"
                    placeholder="e.g. Alex Sharma"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group mb-3">
                  <label className="form-label">Account Role *</label>
                  <div className="role-selector-cards">
                    <label
                      className={`role-card ${formData.role === "buyer" ? "active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value="buyer"
                        checked={formData.role === "buyer"}
                        onChange={handleChange}
                        className="role-radio"
                      />
                      <div className="role-card-content">
                        <div className="role-header-line">
                          <PackageIcon size={16} />
                          <span className="role-title">Buyer</span>
                        </div>
                        <span className="role-desc">Browse listings, bid on auctions & receive items</span>
                      </div>
                    </label>

                    <label
                      className={`role-card ${formData.role === "seller" ? "active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value="seller"
                        checked={formData.role === "seller"}
                        onChange={handleChange}
                        className="role-radio"
                      />
                      <div className="role-card-content">
                        <div className="role-header-line">
                          <TagIcon size={16} />
                          <span className="role-title">Seller</span>
                        </div>
                        <span className="role-desc">Post items, host auctions & coordinate handovers</span>
                      </div>
                    </label>
                  </div>
                </div>
              </>
            )}

            <div className="form-group mb-3">
              <label className="form-label" htmlFor="auth-email">
                Campus Email *
              </label>
              <input
                id="auth-email"
                type="email"
                name="email"
                className="form-control"
                placeholder="student@campus.edu"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group mb-3">
              <label className="form-label" htmlFor="auth-password">
                Password {mode === "register" && "(min. 8 characters)"} *
              </label>
              <input
                id="auth-password"
                type="password"
                name="password"
                className="form-control"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
            >
              {loading
                ? mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "login"
                ? "Sign In to Account"
                : "Create Campus Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
