const express = require("express");
const { authenticate, authorizeRoles } = require("../middleware/authMiddleware");
const aiService = require("../services/aiService");

const router = express.Router();

// Sliding-window in-memory rate limiter for AI generation endpoints
const aiRateLimitMap = new Map();
const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const AI_RATE_LIMIT_MAX = 20; // 20 requests per minute

function aiRateLimiter(req, res, next) {
  const identifier = req.user?.id || req.ip;
  const now = Date.now();
  const entry = aiRateLimitMap.get(identifier) || {
    count: 0,
    resetTime: now + AI_RATE_LIMIT_WINDOW_MS,
  };

  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + AI_RATE_LIMIT_WINDOW_MS;
  } else {
    entry.count++;
  }
  aiRateLimitMap.set(identifier, entry);

  if (entry.count > AI_RATE_LIMIT_MAX) {
    return res.status(429).json({
      message: "Too many AI assistant requests. Please wait a moment before trying again.",
    });
  }
  next();
}

/**
 * POST /api/ai/seller/draft
 * Generates an AI-assisted draft for seller listing creation
 * Requires authenticated seller or admin
 */
router.post(
  "/seller/draft",
  authenticate,
  authorizeRoles("seller", "admin"),
  aiRateLimiter,
  async (req, res) => {
    try {
      const { notes, category, condition, startingPrice } = req.body;
      const result = await aiService.generateSellerListingDraft({
        notes,
        category,
        condition,
        startingPrice,
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      const status = err.statusCode || 500;
      return res.status(status).json({
        message: err.message || "Failed to generate listing draft.",
      });
    }
  }
);

/**
 * POST /api/ai/buyer/ask
 * Answers buyer questions regarding an active listing
 */
router.post("/buyer/ask", aiRateLimiter, async (req, res) => {
  try {
    const { listingId, question } = req.body;
    const result = await aiService.answerBuyerQuestion({
      listingId,
      question,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      message: err.message || "Failed to answer question.",
    });
  }
});

/**
 * POST /api/ai/shop
 * Natural language Smart Shopping assistant query
 */
router.post("/shop", aiRateLimiter, async (req, res) => {
  try {
    const { query } = req.body;
    const result = await aiService.executeSmartShopping({ query });
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      message: err.message || "Failed to process smart shopping search.",
    });
  }
});

module.exports = router;
