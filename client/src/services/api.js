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

  // Handover & Transaction endpoints (Module 7)
  async getTransactions(token, status = "") {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    const url = `${API_BASE_URL}/transactions${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(url, {
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async getTransactionById(id, token) {
    const response = await fetch(`${API_BASE_URL}/transactions/${id}`, {
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async getTransactionByListing(listingId, token) {
    const response = await fetch(`${API_BASE_URL}/transactions/listing/${listingId}`, {
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async startHandover(id, details, token) {
    const response = await fetch(`${API_BASE_URL}/transactions/${id}/start`, {
      method: "PATCH",
      headers: getAuthHeaders(token),
      body: JSON.stringify(details),
    });
    return handleResponse(response);
  },

  async confirmSellerHandover(id, token) {
    const response = await fetch(`${API_BASE_URL}/transactions/${id}/confirm-handover`, {
      method: "PATCH",
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async confirmBuyerReceipt(id, token) {
    const response = await fetch(`${API_BASE_URL}/transactions/${id}/confirm-receipt`, {
      method: "PATCH",
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async reportDispute(id, reason, token) {
    const response = await fetch(`${API_BASE_URL}/transactions/${id}/dispute`, {
      method: "PATCH",
      headers: getAuthHeaders(token),
      body: JSON.stringify({ reason }),
    });
    return handleResponse(response);
  },

  async resolveDispute(id, token) {
    const response = await fetch(`${API_BASE_URL}/transactions/${id}/resolve`, {
      method: "PATCH",
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  // Notification endpoints (Module 8)
  async getNotifications(token, { page = 1, limit = 20, unreadOnly = false } = {}) {
    const params = new URLSearchParams();
    if (page) params.append("page", page);
    if (limit) params.append("limit", limit);
    if (unreadOnly) params.append("unreadOnly", "true");

    const url = `${API_BASE_URL}/notifications${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(url, {
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async getUnreadNotificationCount(token) {
    const response = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async markNotificationAsRead(id, token) {
    const response = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
      method: "PATCH",
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async markAllNotificationsAsRead(token) {
    const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
      method: "PATCH",
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  // Transaction Outcomes (Advanced Module)
  async recordTransactionOutcome(id, { outcomeType, outcomeReason, notes }, token) {
    const response = await fetch(`${API_BASE_URL}/transactions/${id}/outcome`, {
      method: "PATCH",
      headers: getAuthHeaders(token),
      body: JSON.stringify({ outcomeType, outcomeReason, notes }),
    });
    return handleResponse(response);
  },

  // Relisting endpoints (Advanced Module)
  async relistListing(id, relistData, token) {
    const response = await fetch(`${API_BASE_URL}/listings/${id}/relist`, {
      method: "POST",
      headers: getAuthHeaders(token),
      body: JSON.stringify(relistData),
    });
    return handleResponse(response);
  },

  // Watchlist endpoints (Advanced Module)
  async getWatchlist(token) {
    const response = await fetch(`${API_BASE_URL}/watchlist`, {
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async getWatchlistIds(token) {
    const response = await fetch(`${API_BASE_URL}/watchlist/ids`, {
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async checkWatchlist(listingId, token) {
    const response = await fetch(`${API_BASE_URL}/watchlist/check/${listingId}`, {
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async addToWatchlist(listingId, token) {
    const response = await fetch(`${API_BASE_URL}/watchlist/${listingId}`, {
      method: "POST",
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async removeFromWatchlist(listingId, token) {
    const response = await fetch(`${API_BASE_URL}/watchlist/${listingId}`, {
      method: "DELETE",
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  // Second Chance Fallback endpoints (Advanced Module)
  async getSecondChanceCandidates(listingId, token) {
    const response = await fetch(`${API_BASE_URL}/listings/${listingId}/second-chance/candidates`, {
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async createSecondChanceOffer(listingId, offerData, token) {
    const response = await fetch(`${API_BASE_URL}/listings/${listingId}/second-chance`, {
      method: "POST",
      headers: getAuthHeaders(token),
      body: JSON.stringify(offerData),
    });
    return handleResponse(response);
  },

  async getMySecondChanceOffers(token) {
    const response = await fetch(`${API_BASE_URL}/second-chance/my-offers`, {
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async acceptSecondChanceOffer(offerId, token) {
    const response = await fetch(`${API_BASE_URL}/second-chance/${offerId}/accept`, {
      method: "PATCH",
      headers: getAuthHeaders(token),
    });
    return handleResponse(response);
  },

  async declineSecondChanceOffer(offerId, reason, token) {
    const response = await fetch(`${API_BASE_URL}/second-chance/${offerId}/decline`, {
      method: "PATCH",
      headers: getAuthHeaders(token),
      body: JSON.stringify({ reason }),
    });
    return handleResponse(response);
  },
};
