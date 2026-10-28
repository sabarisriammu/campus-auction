const API_BASE_URL = "http://localhost:5000/api";

/**
 * Helper to get authorization headers when a token is present
 */
const getAuthHeaders = (token) => {
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

/**
 * Handle API responses and throw informative errors
 */
const handleResponse = async (response) => {
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

export const api = {
  // Auth endpoints
  async login(credentials) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    return handleResponse(response);
  },

  async register(userData) {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });
    return handleResponse(response);
  },

  // Listings endpoints
  async getListings({ search = "", category = "", status = "active" } = {}) {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (category && category !== "All") params.append("category", category);
    if (search.trim()) params.append("search", search.trim());

    const url = `${API_BASE_URL}/listings${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(url);
    return handleResponse(response);
  },

  async getListingById(id) {
    const response = await fetch(`${API_BASE_URL}/listings/${id}`);
    return handleResponse(response);
  },

  async createListing(listingData, token) {
    const response = await fetch(`${API_BASE_URL}/listings`, {
      method: "POST",
      headers: getAuthHeaders(token),
      body: JSON.stringify(listingData),
    });
    return handleResponse(response);
  },

  async updateListing(id, updateData, token) {
    const response = await fetch(`${API_BASE_URL}/listings/${id}`, {
      method: "PUT",
      headers: getAuthHeaders(token),
      body: JSON.stringify(updateData),
    });
    return handleResponse(response);
  },

  async cancelListing(id, token) {
    const response = await fetch(`${API_BASE_URL}/listings/${id}/cancel`, {
      method: "PATCH",
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  // Lifecycle closure endpoint (Module 6)
  async closeAuction(listingId, token) {
    const response = await fetch(`${API_BASE_URL}/listings/${listingId}/close`, {
      method: "POST",
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  // Product Image Upload endpoint (Module 6)
  async uploadImage(file, token) {
    const formData = new FormData();
    formData.append("image", file);

    const headers = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    // Do NOT set Content-Type header so the browser automatically computes boundary

    const response = await fetch(`${API_BASE_URL}/listings/upload-image`, {
      method: "POST",
      headers,
      body: formData,
    });
    return handleResponse(response);
  },

  // Bidding endpoints
  async placeBid(listingId, amount, token) {
    const response = await fetch(`${API_BASE_URL}/listings/${listingId}/bids`, {
      method: "POST",
      headers: getAuthHeaders(token),
      body: JSON.stringify({ amount }),
    });
    return handleResponse(response);
  },

  async getListingBids(listingId) {
    const response = await fetch(`${API_BASE_URL}/listings/${listingId}/bids`);
    return handleResponse(response);
  },
};
