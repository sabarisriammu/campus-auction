const express = require("express");
const mongoose = require("mongoose");
const Watchlist = require("../models/Watchlist");
const Listing = require("../models/Listing");
const authenticate = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * GET /api/watchlist
 * Retrieve authenticated user's saved watchlist items
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const entries = await Watchlist.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .populate({
        path: "listing",
        populate: [
          { path: "seller", select: "name email role" },
          { path: "winner", select: "name email role" },
        ],
      });

    // Filter out entries where the listing document was physically removed
    const validEntries = entries.filter((entry) => entry.listing !== null);

    return res.status(200).json({
      count: validEntries.length,
      watchlist: validEntries.map((e) => ({
        _id: e._id,
        savedAt: e.createdAt,
        listing: e.listing,
      })),
    });
  } catch (err) {
    console.error("GET /api/watchlist error:", err.message);
    return res.status(500).json({ message: "Failed to retrieve saved listings." });
  }
});

/**
 * GET /api/watchlist/ids
 * Lightweight retrieval of just the listing IDs saved by current user
 */
router.get("/ids", authenticate, async (req, res) => {
  try {
    const entries = await Watchlist.find({ user: req.user.id }, "listing");
    const savedIds = entries.map((e) => e.listing.toString());
    return res.status(200).json({ savedIds });
  } catch (err) {
    return res.status(500).json({ message: "Failed to retrieve saved listing IDs." });
  }
});

/**
 * GET /api/watchlist/check/:listingId
 * Check if a specific listing is saved in the user's watchlist
 */
router.get("/check/:listingId", authenticate, async (req, res) => {
  try {
    const { listingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({ message: "Invalid listing ID format." });
    }

    const exists = await Watchlist.exists({ user: req.user.id, listing: listingId });
    return res.status(200).json({ isSaved: Boolean(exists) });
  } catch (err) {
    return res.status(500).json({ message: "Failed to check watchlist status." });
  }
});

/**
 * POST /api/watchlist/:listingId
 * Save a listing to the user's watchlist (idempotent)
 */
router.post("/:listingId", authenticate, async (req, res) => {
  try {
    const { listingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({ message: "Invalid listing ID format." });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found." });
    }

    await Watchlist.findOneAndUpdate(
      { user: req.user.id, listing: listingId },
      { $setOnInsert: { user: req.user.id, listing: listingId } },
      { upsert: true, new: true }
    );

    return res.status(201).json({
      message: `"${listing.title}" saved to your watchlist!`,
      isSaved: true,
      listingId,
    });
  } catch (err) {
    console.error("POST /api/watchlist/:listingId error:", err.message);
    return res.status(500).json({ message: "Failed to save listing to watchlist." });
  }
});

/**
 * DELETE /api/watchlist/:listingId
 * Remove a listing from the user's watchlist
 */
router.delete("/:listingId", authenticate, async (req, res) => {
  try {
    const { listingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({ message: "Invalid listing ID format." });
    }

    await Watchlist.findOneAndDelete({ user: req.user.id, listing: listingId });

    return res.status(200).json({
      message: "Listing removed from your watchlist.",
      isSaved: false,
      listingId,
    });
  } catch (err) {
    console.error("DELETE /api/watchlist/:listingId error:", err.message);
    return res.status(500).json({ message: "Failed to remove listing from watchlist." });
  }
});

module.exports = router;
