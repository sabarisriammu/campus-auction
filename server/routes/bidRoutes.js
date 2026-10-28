const express = require("express");
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const Bid = require("../models/Bid");
const { authenticate, authorizeRoles } = require("../middleware/authMiddleware");
const notificationService = require("../services/notificationService");
const socketService = require("../services/socketService");

const router = express.Router();

/**
 * Core handler to place a bid on a listing with concurrency control
 */
const handlePlaceBid = async (req, res) => {
  const listingId = req.params.id || req.body.listingId;
  const { amount } = req.body;

  // 1. Validate listing ID format
  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    return res.status(400).json({
      message: "A valid listing ID format is required.",
    });
  }

  // 2. Validate numeric bid amount
  const parsedAmount = Number(amount);
  if (
    amount === undefined ||
    amount === null ||
    isNaN(parsedAmount) ||
    !isFinite(parsedAmount) ||
    parsedAmount <= 0
  ) {
    return res.status(400).json({
      message: "Bid amount must be a valid positive number greater than ₹0.00.",
    });
  }

  // Round to two decimal places
  const normalizedAmount = Math.round(parsedAmount * 100) / 100;

  let session = null;
  try {
    // Attempt to start a MongoDB session for transactional ACID execution
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch {
      // In non-replica environments, fallback to document-level atomic operations
      session = null;
    }

    // 3. Find the listing (under session if available)
    const listingQuery = Listing.findById(listingId);
    if (session) listingQuery.session(session);
    const listing = await listingQuery;

    if (!listing) {
      if (session) await session.abortTransaction();
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    // 4. Listing status and expiration checks
    if (listing.status !== "active") {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        message: `Cannot bid on a ${listing.status} listing.`,
      });
    }

    if (new Date(listing.auctionEndTime) <= new Date()) {
      if (session) await session.abortTransaction();
      return res.status(400).json({
        message: "This auction has already ended. No new bids can be accepted.",
      });
    }

    // 5. Rule: Buyer cannot bid on their own listing
    if (listing.seller.toString() === req.user.id.toString()) {
      if (session) await session.abortTransaction();
      return res.status(403).json({
        message: "You cannot bid on your own listing.",
      });
    }

    // 6. Check existing bids to determine minimum required amount
    const countQuery = Bid.countDocuments({ listing: listingId });
    if (session) countQuery.session(session);
    const existingBidsCount = await countQuery;

    const minIncrement = Number(listing.minBidIncrement) || 1.0;
    let minRequiredPrice = 0;

    if (existingBidsCount === 0) {
      // First bid must satisfy the listing's starting price
      minRequiredPrice = Number(listing.startingPrice.toFixed(2));
      if (normalizedAmount < minRequiredPrice) {
        if (session) await session.abortTransaction();
        return res.status(400).json({
          message: `First bid must be at least the starting price of ₹${minRequiredPrice.toFixed(2)}.`,
        });
      }
    } else {
      // Subsequent bids must meet currentPrice + minBidIncrement
      minRequiredPrice = Number((listing.currentPrice + minIncrement).toFixed(2));
      if (normalizedAmount < minRequiredPrice) {
        if (session) await session.abortTransaction();
        return res.status(400).json({
          message: `Bid must be at least ₹${minRequiredPrice.toFixed(2)} (current bid ₹${listing.currentPrice.toFixed(2)} + min increment ₹${minIncrement.toFixed(2)}).`,
        });
      }
    }

    // Find the previous highest bid before applying the new bid
    const previousHighestBid = await Bid.findOne({ listing: listingId }).sort({
      amount: -1,
      createdAt: -1,
    });

    // 7. Atomic Conditional Update (Optimistic Concurrency Control)
    // Only update currentPrice if it STILL matches listing.currentPrice at this exact moment
    const updateQuery = Listing.findOneAndUpdate(
      {
        _id: listingId,
        status: "active",
        auctionEndTime: { $gt: new Date() },
        currentPrice: listing.currentPrice, // Concurrency guard
      },
      {
        $set: { currentPrice: normalizedAmount },
      },
      {
        new: true,
      }
    );
    if (session) updateQuery.session(session);
    const updatedListing = await updateQuery;

    if (!updatedListing) {
      if (session) await session.abortTransaction();
      return res.status(409).json({
        message: "A competing bid was placed just before yours. Please check the updated price and try again.",
      });
    }

    // 8. Create the Bid record - bidder identity is derived strictly from verified JWT
    const bidPayload = {
      listing: listingId,
      bidder: req.user.id,
      amount: normalizedAmount,
    };

    let createdBid = null;
    if (session) {
      const [bidDoc] = await Bid.create([bidPayload], { session });
      createdBid = bidDoc;
      await session.commitTransaction();
    } else {
      createdBid = await Bid.create(bidPayload);
    }

    // 9. Asynchronously send notifications (safe: will not rollback or throw)
    try {
      // Notify seller of new bid
      await notificationService.createNotification({
        recipient: listing.seller,
        type: "NEW_BID",
        title: "New Bid Placed",
        message: `A new bid of ₹${normalizedAmount.toFixed(2)} was placed on "${listing.title}".`,
        listing: listing._id,
        bid: createdBid._id,
      });

      // Notify previous highest bidder if outbid
      if (
        previousHighestBid &&
        previousHighestBid.bidder.toString() !== req.user.id.toString()
      ) {
        await notificationService.createNotification({
          recipient: previousHighestBid.bidder,
          type: "OUTBID",
          title: "You Have Been Outbid",
          message: `You were outbid on "${listing.title}". The new highest bid is ₹${normalizedAmount.toFixed(2)}.`,
          listing: listing._id,
          bid: createdBid._id,
        });
      }
    } catch (notifErr) {
      console.error("Bid notification trigger error:", notifErr.message);
    }

    // 10. Populate bid and broadcast live real-time update
    const populatedBid = await Bid.findById(createdBid._id).populate("bidder", "name");

    const totalBidsCount = await Bid.countDocuments({ listing: listingId });
    const nextMinBid = Number((updatedListing.currentPrice + minIncrement).toFixed(2));

    const publicBidEntry = {
      _id: populatedBid._id,
      amount: populatedBid.amount,
      createdAt: populatedBid.createdAt,
      bidder: {
        _id: populatedBid.bidder?._id || req.user.id,
        id: populatedBid.bidder?._id || req.user.id,
        name: populatedBid.bidder?.name || req.user.name || "Campus Buyer",
      },
    };

    // Broadcast authoritative live update to all clients in auction room and marketplace
    try {
      socketService.broadcastBidUpdate(listingId, {
        listingId,
        currentPrice: updatedListing.currentPrice,
        nextMinBid,
        latestBid: publicBidEntry,
        status: updatedListing.status,
        auctionEndTime: updatedListing.auctionEndTime,
        totalBidsCount,
      });
    } catch (broadcastErr) {
      console.error("Live bid broadcast error:", broadcastErr.message);
    }

    return res.status(201).json({
      message: "Bid placed successfully!",
      currentPrice: updatedListing.currentPrice,
      nextMinBid,
      bid: publicBidEntry,
    });
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {
        // Ignore abort error if already rolled back
      }
    }

    // Handle MongoDB transaction write conflicts / transient transaction errors
    const isWriteConflict =
      error.code === 112 ||
      (error.hasErrorLabel && error.hasErrorLabel("TransientTransactionError")) ||
      (typeof error.message === "string" && error.message.includes("WriteConflict"));

    if (isWriteConflict) {
      return res.status(409).json({
        message: "A competing bid was placed just before yours. Please check the updated price and try again.",
      });
    }

    console.error("Place bid error:", error.message);
    return res.status(500).json({
      message: "Failed to place bid due to a server error.",
    });
  } finally {
    if (session) {
      session.endSession();
    }
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

// Route definitions supporting both /api/listings/:id/bids and /api/bids conventions
router.post("/:id/bids", authenticate, authorizeRoles("buyer"), handlePlaceBid);
router.get("/:id/bids", handleGetBidHistory);

router.post("/", authenticate, authorizeRoles("buyer"), handlePlaceBid);
router.get("/:listingId", handleGetBidHistory);

module.exports = router;
