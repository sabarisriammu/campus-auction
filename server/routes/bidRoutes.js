const express = require("express");
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const Bid = require("../models/Bid");
const ProxyBid = require("../models/ProxyBid");
const { authenticate, authorizeRoles } = require("../middleware/authMiddleware");
const { placeBidCore, evaluateProxyBids, normalizeAmount } = require("../services/biddingService");

const router = express.Router();

// In-memory sliding-window rate limiter for proxy configuration endpoints
const proxyRateLimitMap = new Map();
const PROXY_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const PROXY_RATE_LIMIT_MAX = 20; // 20 actions per minute

function proxyRateLimiter(req, res, next) {
  const identifier = req.user?.id || req.ip;
  const now = Date.now();
  const entry = proxyRateLimitMap.get(identifier) || {
    count: 0,
    resetTime: now + PROXY_RATE_LIMIT_WINDOW_MS,
  };

  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + PROXY_RATE_LIMIT_WINDOW_MS;
  } else {
    entry.count++;
  }
  proxyRateLimitMap.set(identifier, entry);

  if (entry.count > PROXY_RATE_LIMIT_MAX) {
    return res.status(429).json({
      message: "Too many automatic bidding requests. Please wait a moment before trying again.",
    });
  }
  next();
}

/**
 * Core handler to place a manual bid on a listing with concurrency control
 */
const handlePlaceBid = async (req, res) => {
  const listingId = req.params.id || req.body.listingId;
  const { amount } = req.body;

  try {
    const result = await placeBidCore({
      listingId,
      bidderId: req.user.id,
      amount,
      isAutomatic: false,
    });

    // Evaluate active proxy bids to respond to the manual bid
    try {
      await evaluateProxyBids(listingId);
    } catch (proxyErr) {
      console.error("evaluateProxyBids error post manual bid:", proxyErr.message);
    }

    return res.status(201).json({
      message: "Bid placed successfully!",
      currentPrice: result.listing.currentPrice,
      nextMinBid: result.nextMinBid,
      bid: result.bid,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: error.message || "Failed to place bid due to a server error.",
    });
  }
};

/**
 * Core handler to retrieve a listing's bid history
 */
const handleGetBidHistory = async (req, res) => {
  try {
    const listingId = req.params.id || req.params.listingId;

    if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({
        message: "A valid listing ID format is required.",
      });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    const bids = await Bid.find({ listing: listingId })
      .populate("bidder", "name")
      .sort({ amount: -1, createdAt: -1 })
      .lean();

    return res.status(200).json({
      count: bids.length,
      currentPrice: listing.currentPrice,
      startingPrice: listing.startingPrice,
      minBidIncrement: listing.minBidIncrement,
      bids: bids.map((b) => ({
        _id: b._id,
        amount: b.amount,
        createdAt: b.createdAt,
        bidder: {
          id: b.bidder?._id,
          name: b.bidder?.name || "Campus Buyer",
        },
      })),
    });
  } catch (error) {
    console.error("Get bid history error:", error.message);
    return res.status(500).json({
      message: "Failed to retrieve bid history due to a server error.",
    });
  }
};

/**
 * Handler to create or update an automatic proxy bid limit for an active auction
 */
const handleSetProxyBid = async (req, res) => {
  const listingId = req.params.id || req.params.listingId;
  const { maxAmount } = req.body;

  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    return res.status(400).json({ message: "A valid listing ID format is required." });
  }

  const parsedMax = Number(maxAmount);
  if (
    maxAmount === undefined ||
    maxAmount === null ||
    isNaN(parsedMax) ||
    !isFinite(parsedMax) ||
    parsedMax <= 0
  ) {
    return res.status(400).json({
      message: "Maximum proxy amount must be a valid positive number greater than ₹0.00.",
    });
  }

  const normalizedMax = normalizeAmount(parsedMax);

  try {
    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (listing.status !== "active") {
      return res.status(400).json({
        message: `Cannot configure automatic bidding for a ${listing.status} auction.`,
      });
    }

    if (new Date(listing.auctionEndTime) <= new Date()) {
      return res.status(400).json({
        message: "This auction has already ended. Automatic bidding cannot be configured.",
      });
    }

    if (listing.seller.toString() === req.user.id.toString()) {
      return res.status(403).json({
        message: "You cannot configure automatic bidding on your own listing.",
      });
    }

    // Calculate minimum required limit
    const existingBidsCount = await Bid.countDocuments({ listing: listingId });
    const minIncrement = Number(listing.minBidIncrement) || 1.0;
    const nextMinBid =
      existingBidsCount === 0
        ? normalizeAmount(listing.startingPrice)
        : normalizeAmount(listing.currentPrice + minIncrement);

    // If buyer is currently winning, allow maintaining or increasing limit down to currentPrice
    const currentHighestBid = await Bid.findOne({ listing: listingId }).sort({
      amount: -1,
      createdAt: -1,
    });
    const isCurrentLeader =
      currentHighestBid && currentHighestBid.bidder.toString() === req.user.id.toString();

    const requiredFloor = isCurrentLeader
      ? normalizeAmount(listing.currentPrice)
      : nextMinBid;

    if (normalizedMax < requiredFloor) {
      return res.status(400).json({
        message: isCurrentLeader
          ? `Your maximum limit cannot be lower than your current winning bid of ₹${requiredFloor.toFixed(2)}.`
          : `Maximum proxy amount must be at least the minimum valid bid of ₹${nextMinBid.toFixed(2)}.`,
      });
    }

    // Upsert the buyer's proxy configuration
    const proxy = await ProxyBid.findOneAndUpdate(
      { listing: listingId, buyer: req.user.id },
      {
        $set: {
          maxAmount: normalizedMax,
          isActive: true,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    // Immediately trigger proxy evaluation to place bids if eligible
    await evaluateProxyBids(listingId);

    // Fetch refreshed auction state
    const refreshedListing = await Listing.findById(listingId);
    const updatedLeader = await Bid.findOne({ listing: listingId }).sort({
      amount: -1,
      createdAt: -1,
    });
    const isLeading =
      updatedLeader && updatedLeader.bidder.toString() === req.user.id.toString();

    return res.status(200).json({
      message: "Automatic bidding configured successfully.",
      proxy: {
        listingId: proxy.listing,
        maxAmount: proxy.maxAmount,
        isActive: proxy.isActive,
        isLeading,
        createdAt: proxy.createdAt,
        updatedAt: proxy.updatedAt,
      },
      currentPrice: refreshedListing.currentPrice,
    });
  } catch (err) {
    console.error("Set proxy bid error:", err.message);
    return res.status(500).json({
      message: "Failed to configure automatic bidding due to a server error.",
    });
  }
};

/**
 * Handler to get authenticated buyer's own proxy configuration
 * Strictly private: NEVER exposes other users' proxies or max limits
 */
const handleGetProxyBid = async (req, res) => {
  const listingId = req.params.id || req.params.listingId;

  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    return res.status(400).json({ message: "A valid listing ID format is required." });
  }

  try {
    const proxy = await ProxyBid.findOne({
      listing: listingId,
      buyer: req.user.id,
    });

    if (!proxy) {
      return res.status(200).json({ proxy: null });
    }

    const currentHighestBid = await Bid.findOne({ listing: listingId }).sort({
      amount: -1,
      createdAt: -1,
    });
    const isLeading =
      currentHighestBid && currentHighestBid.bidder.toString() === req.user.id.toString();

    return res.status(200).json({
      proxy: {
        listingId: proxy.listing,
        maxAmount: proxy.maxAmount,
        isActive: proxy.isActive,
        lastBidAmount: proxy.lastBidAmount,
        isLeading,
        createdAt: proxy.createdAt,
        updatedAt: proxy.updatedAt,
      },
    });
  } catch (err) {
    console.error("Get proxy bid error:", err.message);
    return res.status(500).json({
      message: "Failed to retrieve automatic bidding settings.",
    });
  }
};

/**
 * Handler to disable an active proxy bid
 * Note: Does NOT delete or retract already placed bids!
 */
const handleDisableProxyBid = async (req, res) => {
  const listingId = req.params.id || req.params.listingId;

  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    return res.status(400).json({ message: "A valid listing ID format is required." });
  }

  try {
    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found." });
    }

    if (listing.status !== "active" || new Date(listing.auctionEndTime) <= new Date()) {
      return res.status(400).json({
        message: "Cannot modify automatic bidding for an ended or completed auction.",
      });
    }

    const proxy = await ProxyBid.findOneAndUpdate(
      { listing: listingId, buyer: req.user.id },
      { $set: { isActive: false } },
      { new: true }
    );

    if (!proxy) {
      return res.status(404).json({
        message: "No automatic bidding configuration found for this listing.",
      });
    }

    return res.status(200).json({
      message: "Automatic bidding has been disabled. Any previously placed bids remain active.",
      proxy: {
        listingId: proxy.listing,
        isActive: false,
        maxAmount: proxy.maxAmount,
      },
    });
  } catch (err) {
    console.error("Disable proxy bid error:", err.message);
    return res.status(500).json({
      message: "Failed to disable automatic bidding.",
    });
  }
};

// Route definitions supporting both /api/listings/:id/bids and /api/bids conventions
router.post("/:id/bids", authenticate, authorizeRoles("buyer"), handlePlaceBid);
router.get("/:id/bids", handleGetBidHistory);

router.post("/", authenticate, authorizeRoles("buyer"), handlePlaceBid);
router.get("/:listingId", handleGetBidHistory);

// Proxy bid routes
router.post("/:id/proxy", authenticate, authorizeRoles("buyer"), proxyRateLimiter, handleSetProxyBid);
router.get("/:id/proxy", authenticate, authorizeRoles("buyer"), handleGetProxyBid);
router.delete("/:id/proxy", authenticate, authorizeRoles("buyer"), proxyRateLimiter, handleDisableProxyBid);
router.patch("/:id/proxy/disable", authenticate, authorizeRoles("buyer"), proxyRateLimiter, handleDisableProxyBid);

router.post("/proxy/:id", authenticate, authorizeRoles("buyer"), proxyRateLimiter, handleSetProxyBid);
router.get("/proxy/:id", authenticate, authorizeRoles("buyer"), handleGetProxyBid);
router.delete("/proxy/:id", authenticate, authorizeRoles("buyer"), proxyRateLimiter, handleDisableProxyBid);

module.exports = router;
