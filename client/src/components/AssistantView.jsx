import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { formatCurrency } from "../utils/formatters";
import {
  GavelIcon,
  ShieldCheckIcon,
  ClockIcon,
  PackageIcon,
  UserIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  RotateCcwIcon,
  TrophyIcon,
} from "./Icons";

export default function AssistantView({
  user,
  token,
  onSelectListing,
  onOpenAuth,
  showToast,
  allListings = [],
}) {
  const [activeSubTab, setActiveSubTab] = useState("shopping"); // "shopping" | "qa" | "bidding"

  // -------------------------------------------------------------
  // 1. SMART SHOPPING STATE
  // -------------------------------------------------------------
  const [shoppingQuery, setShoppingQuery] = useState("");
  const [searchingAi, setSearchingAi] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState("");

  const samplePrompts = [
    "Find me a cycle under ₹2,000",
    "Show used laptops below ₹15,000",
    "Find a calculator with working display",
    "Show auctions ending within the next hour",
    "Compare these matching listings",
  ];

  const handleSmartSearch = async (queryToRun) => {
    const q = (typeof queryToRun === "string" ? queryToRun : shoppingQuery).trim();
    if (!q || q.length < 2) {
      setSearchError("Please enter a search request (e.g. 'cycle under ₹2,000').");
      return;
    }

    setSearchError("");
    setSearchingAi(true);
    try {
      const res = await api.smartShopping(q);
      setSearchResult(res);
      setShoppingQuery(q);
    } catch (err) {
      setSearchError(err.message || "Failed to process smart shopping search.");
    } finally {
      setSearchingAi(false);
    }
  };

  // -------------------------------------------------------------
  // 2. PRODUCT Q&A STATE
  // -------------------------------------------------------------
  const [selectedListingForQuestion, setSelectedListingForQuestion] = useState("");
  const [buyerQuestionText, setBuyerQuestionText] = useState("");
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [questionSuccess, setQuestionSuccess] = useState("");
  const [questionError, setQuestionError] = useState("");

  // Seller Inbox & Buyer Questions
  const [sellerInbox, setSellerInbox] = useState([]);
  const [buyerQuestions, setBuyerQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Seller Manual Reply State
  const [replyingToId, setReplyingToId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  const isSeller = user && user.role === "seller";

  const loadQuestions = async () => {
    if (!token) return;
    setLoadingQuestions(true);
    try {
      if (isSeller) {
        const data = await api.getSellerQuestionsInbox(token);
        setSellerInbox(data.questions || []);
      }
      const myData = await api.getMySubmittedQuestions(token);
      setBuyerQuestions(myData.questions || []);
    } catch (err) {
      console.warn("Failed to load questions:", err.message);
    } finally {
      setLoadingQuestions(false);
    }
  };

  useEffect(() => {
    if (token && (isSeller || activeSubTab === "qa")) {
      loadQuestions();
    }
  }, [activeSubTab, token, isSeller]);

  const handleSubmitQuestion = async (e) => {
    e.preventDefault();
    if (!token) {
      if (onOpenAuth) onOpenAuth("login");
      return;
    }
    if (!selectedListingForQuestion) {
      setQuestionError("Please select an item listing to ask about.");
      return;
    }
    if (!buyerQuestionText.trim() || buyerQuestionText.trim().length < 3) {
      setQuestionError("Please enter a question at least 3 characters long.");
      return;
    }

    setQuestionError("");
    setQuestionSuccess("");
    setSubmittingQuestion(true);
    try {
      await api.submitProductQuestion(selectedListingForQuestion, buyerQuestionText.trim(), token);
      setQuestionSuccess("🎉 Question sent to the seller! You will be notified when they reply.");
      setBuyerQuestionText("");
      loadQuestions();
      if (showToast) showToast("Question sent to seller!", "success");
    } catch (err) {
      setQuestionError(err.message || "Failed to submit question.");
    } finally {
      setSubmittingQuestion(false);
    }
  };

  const handleSendReply = async (questionId) => {
    if (!replyText.trim() || replyText.trim().length < 2) {
      if (showToast) showToast("Reply must be at least 2 characters.", "error");
      return;
    }

    setSubmittingReply(true);
    try {
      await api.replyToQuestion(questionId, replyText.trim(), token);
      if (showToast) showToast("Reply sent to buyer!", "success");
      setReplyingToId(null);
      setReplyText("");
      loadQuestions();
    } catch (err) {
      if (showToast) showToast(err.message || "Failed to send reply.", "error");
    } finally {
      setSubmittingReply(false);
    }
  };

  // -------------------------------------------------------------
  // 3. PERMISSION-BASED AUTOMATIC BIDDING STATE
  // -------------------------------------------------------------
  const [selectedListingForProxy, setSelectedListingForProxy] = useState(null);
  const [proxyMaxAmount, setProxyMaxAmount] = useState("");
  const [userConfirmedConsent, setUserConfirmedConsent] = useState(false);
  const [enablingProxy, setEnablingProxy] = useState(false);
  const [proxySuccess, setProxySuccess] = useState("");
  const [proxyError, setProxyError] = useState("");

  const handleSelectListingForBidding = (item) => {
    setSelectedListingForProxy(item);
    setActiveSubTab("bidding");
    const nextMin = Number(item.currentPrice || item.startingPrice) + Number(item.minBidIncrement || 1);
    setProxyMaxAmount(nextMin.toFixed(2));
    setProxySuccess("");
    setProxyError("");
    setUserConfirmedConsent(false);
  };

  const handleAuthorizeProxyBidding = async (e) => {
    e.preventDefault();
    if (!token) {
      if (onOpenAuth) onOpenAuth("login");
      return;
    }
    if (!selectedListingForProxy) {
      setProxyError("Please select an auction listing first.");
      return;
    }
    if (!userConfirmedConsent) {
      setProxyError("You must explicitly check the confirmation box to authorize automatic bidding.");
      return;
    }

    const val = Number(proxyMaxAmount);
    if (isNaN(val) || val <= 0) {
      setProxyError("Please enter a valid positive maximum amount.");
      return;
    }

    const minRequired = Number(selectedListingForProxy.currentPrice || selectedListingForProxy.startingPrice);
    if (val < minRequired) {
      setProxyError(`Maximum authorized limit must be at least ${formatCurrency(minRequired)}.`);
      return;
    }

    setProxyError("");
    setProxySuccess("");
    setEnablingProxy(true);
    try {
      const res = await api.setProxyBid(selectedListingForProxy._id, val, token);
      setProxySuccess(`🎯 Automatic proxy bidding authorized up to ${formatCurrency(val)}! The engine will maintain your lead automatically.`);
      if (showToast) showToast(`Automatic bidding active up to ${formatCurrency(val)}`, "success");
    } catch (err) {
      setProxyError(err.message || "Failed to configure automatic bidding.");
    } finally {
      setEnablingProxy(false);
    }
  };

  const handleDisableProxy = async (listingId) => {
    if (!token) return;
    try {
      await api.disableProxyBid(listingId, token);
      setProxySuccess("Automatic bidding disabled. Previous bids remain active.");
      if (showToast) showToast("Automatic bidding disabled.", "info");
    } catch (err) {
      setProxyError(err.message || "Failed to disable automatic bidding.");
    }
  };

  // -------------------------------------------------------------
  // SELLER INTERFACE: Dedicated Purely Manual Buyer Q&A Inbox
  // Completely free of AI branding, AI drafts, or AI features.
  // -------------------------------------------------------------
  if (isSeller) {
    return (
      <div className="assistant-view-container">
        <div className="card-box mb-4">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h2 className="pane-section-title text-xl mb-1">Buyer Questions & Answers Inbox</h2>
              <p className="text-xs text-muted mb-0">
                Direct questions from campus students regarding your active auction listings. Reply manually to help prospective buyers.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-outline-secondary btn-xs"
              onClick={loadQuestions}
            >
              🔄 Refresh Inbox
            </button>
          </div>

          {loadingQuestions ? (
            <div className="p-4 text-center text-sm text-muted">Loading questions...</div>
          ) : sellerInbox.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted bg-slate-50 rounded">
              <PackageIcon size={32} className="text-muted mb-2 mx-auto" />
              <p className="font-semibold mb-1">No incoming buyer questions yet</p>
              <p className="text-xs text-muted mb-0">
                When campus students ask questions about your listings, they will appear here for you to manually answer.
              </p>
            </div>
          ) : (
            <div className="qa-threads-list">
              {sellerInbox.map((thread) => (
                <div key={thread._id} className="qa-thread-card">
                  <div className="qa-thread-header">
                    <div>
                      <span className="qa-item-title font-semibold text-sm">
                        {thread.listing?.title || "Auction Item"}
                      </span>
                      <span className="text-xs text-muted ml-2">
                        From: {thread.buyer?.name || "Campus Buyer"} • {new Date(thread.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <span className={`badge ${thread.status === "ANSWERED" ? "badge-success" : "badge-warning"}`}>
                      {thread.status}
                    </span>
                  </div>

                  <div className="qa-question-bubble mt-2">
                    <strong className="text-xs text-primary">Buyer Asked:</strong>
                    <p className="text-sm mb-0 mt-1">{thread.question}</p>
                  </div>

                  {thread.status === "ANSWERED" ? (
                    <div className="qa-answer-bubble mt-2">
                      <strong className="text-xs text-success">Your Confirmed Reply:</strong>
                      <p className="text-sm mb-0 mt-1">{thread.answer}</p>
                      <span className="text-xs text-muted">
                        Answered on {new Date(thread.answeredAt).toLocaleString()}
                      </span>
                    </div>
                  ) : (
                    <div className="qa-reply-composer mt-3">
                      {replyingToId === thread._id ? (
                        <div className="composer-box">
                          <div className="form-group mb-2">
                            <label className="form-label text-xs font-semibold">
                              Your Answer:
                            </label>
                            <textarea
                              className="form-control text-sm"
                              rows="3"
                              placeholder="Type your answer to the buyer..."
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              disabled={submittingReply}
                              maxLength={1000}
                            />
                          </div>

                          <div className="d-flex gap-2">
                            <button
                              type="button"
                              className="btn btn-primary btn-xs"
                              onClick={() => handleSendReply(thread._id)}
                              disabled={submittingReply || !replyText.trim()}
                            >
                              {submittingReply ? "Sending..." : "Reply"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-xs"
                              onClick={() => {
                                setReplyingToId(null);
                                setReplyText("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-xs"
                          onClick={() => {
                            setReplyingToId(thread._id);
                            setReplyText("");
                          }}
                        >
                          ✍️ Reply to Buyer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // BUYER INTERFACE: Dedicated Campus AI Assistant
  // Smart Shopping, Product Q&A, and Permission-Based Auto-Bidding
  // -------------------------------------------------------------
  return (
    <div className="assistant-view-container">
      {/* Top Hero Banner */}
      <div className="assistant-hero">
        <div className="assistant-hero-content">
          <div className="d-flex align-items-center gap-2 mb-1">
            <span className="hero-sparkle">✨</span>
            <h1 className="assistant-title">Campus AI Assistant</h1>
            <span className="ai-badge-pill">Groq Llama-3.3 Powered</span>
          </div>
          <p className="assistant-subtitle">
            Smart Shopping search, buyer–seller product Q&A, and permission-based automatic bidding.
          </p>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div className="assistant-subtabs">
          <button
            className={`subtab-pill ${activeSubTab === "shopping" ? "active" : ""}`}
            onClick={() => setActiveSubTab("shopping")}
          >
            <span>🛍️ Smart Shopping</span>
          </button>
          <button
            className={`subtab-pill ${activeSubTab === "qa" ? "active" : ""}`}
            onClick={() => setActiveSubTab("qa")}
          >
            <span>💬 Product Q&A</span>
          </button>
          <button
            className={`subtab-pill ${activeSubTab === "bidding" ? "active" : ""}`}
            onClick={() => setActiveSubTab("bidding")}
          >
            <span>🎯 Automatic Bidding</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* CAPABILITY 1: SMART SHOPPING ASSISTANT                         */}
      {/* ============================================================== */}
      {activeSubTab === "shopping" && (
        <div className="assistant-tab-pane">
          <div className="card-box mb-4">
            <h3 className="pane-section-title">Natural Language Marketplace Search</h3>
            <p className="text-sm text-muted mb-3">
              Type what you need in plain English. The AI parses your budget, category, and preferences to find verified campus auctions.
            </p>

            {/* Quick Prompts */}
            <div className="sample-prompts-bar mb-3">
              <span className="sample-prompts-label">Try asking:</span>
              <div className="sample-prompts-list">
                {samplePrompts.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="prompt-chip"
                    onClick={() => handleSmartSearch(p)}
                    disabled={searchingAi}
                  >
                    "{p}"
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSmartSearch();
              }}
              className="smart-search-form"
            >
              <div className="smart-search-input-wrapper">
                <input
                  type="text"
                  className="form-control smart-search-input"
                  placeholder="e.g. Find me a cycle under ₹2,000 with working brakes..."
                  value={shoppingQuery}
                  onChange={(e) => {
                    setShoppingQuery(e.target.value);
                    if (searchError) setSearchError("");
                  }}
                  disabled={searchingAi}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-search-ai"
                  disabled={searchingAi || !shoppingQuery.trim()}
                >
                  {searchingAi ? "Analyzing with Groq..." : "✨ Search AI"}
                </button>
              </div>
            </form>

            {searchError && (
              <div className="alert alert-danger text-sm mt-3">{searchError}</div>
            )}
          </div>

          {/* Search Results Display */}
          {searchResult && (
            <div className="search-results-section">
              {/* Intent Summary Box */}
              <div className="ai-summary-card mb-4">
                <div className="ai-summary-header">
                  <div className="d-flex align-items-center gap-2">
                    <span className="ai-summary-sparkle">✨</span>
                    <span className="font-semibold text-sm">AI Shopping Analysis</span>
                  </div>
                  {searchResult.isAiGenerated ? (
                    <span className="badge badge-success text-xs">
                      Groq {searchResult.model}
                    </span>
                  ) : (
                    <span className="badge badge-warning text-xs">
                      Deterministic Match
                    </span>
                  )}
                </div>

                {searchResult.intent && (
                  <div className="intent-tags-row mt-2 mb-2">
                    {searchResult.intent.category && (
                      <span className="intent-tag">Category: {searchResult.intent.category}</span>
                    )}
                    {searchResult.intent.maxPrice && (
                      <span className="intent-tag intent-tag-budget">
                        Budget Limit: ≤ {formatCurrency(searchResult.intent.maxPrice)}
                      </span>
                    )}
                    {searchResult.intent.condition && (
                      <span className="intent-tag">Condition: {searchResult.intent.condition}</span>
                    )}
                    {searchResult.intent.endingWithinMinutes && (
                      <span className="intent-tag">Ending: ≤ {searchResult.intent.endingWithinMinutes}m</span>
                    )}
                  </div>
                )}

                <p className="ai-summary-text text-sm mb-0">
                  {searchResult.aiSummary}
                </p>
              </div>

              {/* Matching Listing Cards */}
              <div className="results-grid-header mb-3">
                <h4 className="font-semibold text-md">
                  Matching Campus Auctions ({searchResult.listings?.length || 0})
                </h4>
                {searchResult.intent?.maxPrice && (
                  <span className="text-xs text-muted">
                    Strictly enforcing budget ≤ {formatCurrency(searchResult.intent.maxPrice)}
                  </span>
                )}
              </div>

              {searchResult.listings && searchResult.listings.length > 0 ? (
                <div className="results-cards-grid">
                  {searchResult.listings.map((item) => (
                    <div key={item._id} className="assistant-listing-card">
                      <div
                        className="card-clickable-area"
                        onClick={() => onSelectListing && onSelectListing(item)}
                      >
                        <div className="card-top-row">
                          <span className="category-pill-sm">{item.category}</span>
                          <span className="condition-pill-sm">{item.condition}</span>
                        </div>
                        <h4 className="card-item-title">{item.title}</h4>
                        <p className="card-item-desc">{item.description?.slice(0, 90)}...</p>

                        <div className="card-pricing-row">
                          <div>
                            <span className="price-label">Current Bid</span>
                            <span className="price-val font-bold font-mono">
                              {formatCurrency(item.currentPrice)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="price-label">Min Increment</span>
                            <span className="price-sub font-mono">
                              +{formatCurrency(item.minBidIncrement || 1)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="card-actions-row">
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-xs flex-1"
                          onClick={() => onSelectListing && onSelectListing(item)}
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-xs"
                          onClick={() => {
                            setSelectedListingForQuestion(item._id);
                            setActiveSubTab("qa");
                          }}
                          title="Ask seller a question about this item"
                        >
                          💬 Ask Seller
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          onClick={() => handleSelectListingForBidding(item)}
                          title="Setup permission-based proxy bidding for this item"
                        >
                          🎯 Auto-Bid
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-matches-box">
                  <PackageIcon size={36} className="text-muted mb-2" />
                  <p className="font-semibold mb-1">No exact matches currently in the marketplace</p>
                  <p className="text-xs text-muted mb-3">
                    We strictly enforce your price ceiling and do not silently display items that exceed your budget.
                  </p>

                  {/* Closest Alternatives */}
                  {searchResult.alternatives && searchResult.alternatives.length > 0 && (
                    <div className="alternatives-wrapper mt-3">
                      <h5 className="text-xs font-semibold uppercase text-muted mb-2">
                        Closest Available Alternatives (Prices Disclosed)
                      </h5>
                      <div className="results-cards-grid">
                        {searchResult.alternatives.map((item) => (
                          <div key={item._id} className="assistant-listing-card">
                            <div
                              className="card-clickable-area"
                              onClick={() => onSelectListing && onSelectListing(item)}
                            >
                              <div className="card-top-row">
                                <span className="category-pill-sm">{item.category}</span>
                                <span className="condition-pill-sm">{item.condition}</span>
                              </div>
                              <h4 className="card-item-title">{item.title}</h4>
                              <div className="card-pricing-row">
                                <div>
                                  <span className="price-label">Real Price</span>
                                  <span className="price-val font-bold font-mono">
                                    {formatCurrency(item.currentPrice)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="card-actions-row">
                              <button
                                type="button"
                                className="btn btn-outline-primary btn-xs btn-block"
                                onClick={() => onSelectListing && onSelectListing(item)}
                              >
                                View Listing
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* CAPABILITY 2: BUYER–SELLER PRODUCT QUESTIONS & ANSWERS          */}
      {/* ============================================================== */}
      {activeSubTab === "qa" && (
        <div className="assistant-tab-pane">
          {/* BUYER QUESTION SUBMISSION & HISTORY */}
          <div className="card-box mb-4">
            <h3 className="pane-section-title">Ask the Seller a Question</h3>
            <p className="text-xs text-muted mb-3">
              Need to know about brakes, condition, battery health, or included accessories? Ask the student selling the item directly.
            </p>

            <form onSubmit={handleSubmitQuestion} className="buyer-question-form mb-4">
              <div className="form-group mb-2">
                <label className="form-label text-xs">Select Auction Item:</label>
                <select
                  className="form-control text-sm"
                  value={selectedListingForQuestion}
                  onChange={(e) => setSelectedListingForQuestion(e.target.value)}
                  required
                >
                  <option value="">-- Choose an active campus listing --</option>
                  {allListings.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.title} ({formatCurrency(item.currentPrice)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group mb-2">
                <label className="form-label text-xs">Your Question for the Seller:</label>
                <textarea
                  className="form-control text-sm"
                  rows="2"
                  placeholder="e.g. Does the cycle's gear shifter work smoothly? Are any textbook pages highlighted?"
                  value={buyerQuestionText}
                  onChange={(e) => setBuyerQuestionText(e.target.value)}
                  required
                  maxLength={500}
                />
              </div>

              {questionError && <div className="alert alert-danger text-xs mb-2">{questionError}</div>}
              {questionSuccess && <div className="alert alert-success text-xs mb-2">{questionSuccess}</div>}

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={submittingQuestion || !buyerQuestionText.trim() || !selectedListingForQuestion}
              >
                {submittingQuestion ? "Sending..." : "Submit Question to Seller"}
              </button>
            </form>

            <hr className="my-4" />

            <h4 className="font-semibold text-sm mb-3">My Submitted Questions & Replies</h4>
            {buyerQuestions.length === 0 ? (
              <p className="text-xs text-muted">You have not asked any product questions yet.</p>
            ) : (
              <div className="qa-threads-list">
                {buyerQuestions.map((q) => (
                  <div key={q._id} className="qa-thread-card">
                    <div className="qa-thread-header">
                      <div>
                        <span className="font-semibold text-sm">{q.listing?.title || "Item"}</span>
                        <span className="text-xs text-muted ml-2">
                          Seller: {q.seller?.name || "Campus Seller"} • {new Date(q.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <span className={`badge ${q.status === "ANSWERED" ? "badge-success" : "badge-warning"}`}>
                        {q.status}
                      </span>
                    </div>

                    <div className="qa-question-bubble mt-2">
                      <strong className="text-xs text-primary">Your Question:</strong>
                      <p className="text-sm mb-0 mt-1">{q.question}</p>
                    </div>

                    {q.answer ? (
                      <div className="qa-answer-bubble mt-2">
                        <strong className="text-xs text-success">Seller Reply:</strong>
                        <p className="text-sm mb-0 mt-1">{q.answer}</p>
                        <span className="text-xs text-muted">
                          Answered on {new Date(q.answeredAt).toLocaleString()}
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted mt-2 italic">
                        ⏳ Awaiting seller reply. You will receive an in-app notification once answered.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CAPABILITY 3: PERMISSION-BASED AUTOMATIC BIDDING                */}
      {/* ============================================================== */}
      {activeSubTab === "bidding" && (
        <div className="assistant-tab-pane">
          <div className="card-box mb-4">
            <h3 className="pane-section-title">Permission-Based Automatic Bidding</h3>
            <p className="text-sm text-muted mb-3">
              The AI Assistant does not make unapproved financial decisions. Upon your explicit confirmation, your ceiling is registered with the existing secure proxy-bidding engine. The engine counters competing bids in minimum increments and will never exceed your confirmed limit.
            </p>

            {/* Selected Listing or Selector */}
            {selectedListingForProxy ? (
              <div className="proxy-target-card mb-4">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="font-semibold text-sm">Selected Auction Item</span>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-xs"
                    onClick={() => setSelectedListingForProxy(null)}
                  >
                    Change Selection
                  </button>
                </div>
                <div className="d-flex gap-3 align-items-center">
                  <div className="flex-1">
                    <h4 className="font-bold text-md mb-1">{selectedListingForProxy.title}</h4>
                    <span className="category-pill-sm mr-2">{selectedListingForProxy.category}</span>
                    <span className="condition-pill-sm">{selectedListingForProxy.condition}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted block">Current Price</span>
                    <span className="font-bold text-lg font-mono text-primary">
                      {formatCurrency(selectedListingForProxy.currentPrice)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="form-group mb-4">
                <label className="form-label text-xs">Choose an Auction to Configure Auto-Bidding:</label>
                <select
                  className="form-control text-sm"
                  onChange={(e) => {
                    const found = allListings.find((l) => l._id === e.target.value);
                    if (found) handleSelectListingForBidding(found);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>-- Select from active campus auctions --</option>
                  {allListings.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.title} — Current Bid: {formatCurrency(item.currentPrice)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Authorization & Confirmation Form */}
            {selectedListingForProxy && (
              <form onSubmit={handleAuthorizeProxyBidding} className="proxy-auth-form">
                <div className="form-group mb-3">
                  <label className="form-label text-xs font-semibold">
                    Set Authorized Maximum Limit (₹):
                  </label>
                  <div className="bid-input-wrapper">
                    <span className="bid-currency-symbol">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min={selectedListingForProxy.currentPrice}
                      className="form-control bid-input font-mono"
                      value={proxyMaxAmount}
                      onChange={(e) => {
                        setProxyMaxAmount(e.target.value);
                        if (proxyError) setProxyError("");
                      }}
                      required
                    />
                  </div>
                  <span className="bid-hint">
                    Must be at least the current winning bid of {formatCurrency(selectedListingForProxy.currentPrice)}
                  </span>
                </div>

                {/* Explicit Permission Checkbox */}
                <div className="permission-consent-box mb-3">
                  <label className="consent-label">
                    <input
                      type="checkbox"
                      checked={userConfirmedConsent}
                      onChange={(e) => {
                        setUserConfirmedConsent(e.target.checked);
                        if (proxyError) setProxyError("");
                      }}
                      className="consent-checkbox"
                    />
                    <span className="consent-text text-xs">
                      <strong>Explicit Authorization:</strong> I authorize the Campus Auction automatic bidding engine to place incremental bids on my behalf up to a maximum of{" "}
                      <span className="font-mono font-bold text-primary">
                        {proxyMaxAmount ? formatCurrency(Number(proxyMaxAmount)) : "₹0.00"}
                      </span>
                      . I understand that bids cannot be retracted and that the engine will never exceed this limit.
                    </span>
                  </label>
                </div>

                {proxyError && <div className="alert alert-danger text-xs mb-3">{proxyError}</div>}
                {proxySuccess && <div className="alert alert-success text-xs mb-3">{proxySuccess}</div>}

                <div className="d-flex gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={enablingProxy || !userConfirmedConsent}
                  >
                    {enablingProxy ? "Registering Authorization..." : "Confirm & Enable Automatic Bidding"}
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => handleDisableProxy(selectedListingForProxy._id)}
                  >
                    Disable Auto-Bidding
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
