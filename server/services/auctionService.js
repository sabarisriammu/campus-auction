const Listing = require("../models/Listing");
const Bid = require("../models/Bid");
const Transaction = require("../models/Transaction");

/**
 * Idempotently closes a single expired listing.
 * - Requires status === 'active' and auctionEndTime <= now.
 * - Selects the highest valid bid as the winner.
 * - Sets outcome to 'sold' (with winner and finalPrice) or 'unsold'.
 * - Atomically transitions status to 'completed'.
 * - Guarantees that cancelled or already completed auctions are never altered.
 * @param {string} listingId
 * @returns {Promise<Listing|null>}
 */
async function closeExpiredAuction(listingId) {
  const now = new Date();

  // Find listing to verify existence and check deadline
  const listing = await Listing.findById(listingId);
  if (!listing) return null;

  // Cannot close before deadline
  if (new Date(listing.auctionEndTime) > now) {
    const error = new Error("Cannot close an auction before its deadline.");
    error.status = 400;
    throw error;
  }

  // If already completed or cancelled, return listing as is (idempotent)
  if (listing.status !== "active") {
    return await Listing.findById(listingId)
      .populate("seller", "name email role")
      .populate("winner", "name email role");
  }

  // Find the highest valid bid
  const highestBid = await Bid.findOne({ listing: listingId }).sort({
    amount: -1,
    createdAt: -1,
  });

  const updateFields = {
    status: "completed",
    completionTime: now,
  };

  if (highestBid) {
    updateFields.outcome = "sold";
    updateFields.winner = highestBid.bidder;
    updateFields.finalPrice = highestBid.amount;
    updateFields.currentPrice = highestBid.amount;
  } else {
    updateFields.outcome = "unsold";
    updateFields.winner = null;
    updateFields.finalPrice = null;
  }

  // Atomic conditional update ensures only active auctions past deadline transition
  const closedListing = await Listing.findOneAndUpdate(
    {
      _id: listingId,
      status: "active",
      auctionEndTime: { $lte: now },
    },
    {
      $set: updateFields,
    },
    {
      new: true,
    }
  )
    .populate("seller", "name email role")
    .populate("winner", "name email role");

  const finalListing =
    closedListing ||
    (await Listing.findById(listingId)
      .populate("seller", "name email role")
      .populate("winner", "name email role"));

  // If the auction resulted in a sale, initialize the Handover Transaction record
  if (finalListing && finalListing.status === "completed" && finalListing.outcome === "sold" && finalListing.winner) {
    try {
      await Transaction.findOneAndUpdate(
        { listing: finalListing._id },
        {
          $setOnInsert: {
            listing: finalListing._id,
            seller: finalListing.seller._id || finalListing.seller,
            buyer: finalListing.winner._id || finalListing.winner,
            finalPrice: finalListing.finalPrice || finalListing.currentPrice,
            status: "PENDING",
          },
        },
        { upsert: true, new: true }
      );
    } catch (txErr) {
      // Transaction already exists or concurrent insert
    }
  }

  return finalListing;
}

/**
 * Batch processes all active auctions whose deadline has passed.
 * @returns {Promise<{ processedCount: number, closedIds: string[] }>}
 */
async function processExpiredAuctions() {
  const now = new Date();
  const expiredActiveListings = await Listing.find(
    {
      status: "active",
      auctionEndTime: { $lte: now },
    },
    "_id"
  );

  const closedIds = [];
  for (const item of expiredActiveListings) {
    try {
      const closed = await closeExpiredAuction(item._id);
      if (closed && closed.status === "completed") {
        closedIds.push(item._id.toString());
      }
    } catch (err) {
      console.error(`Error closing auction ${item._id}:`, err.message);
    }
  }

  return {
    processedCount: closedIds.length,
    closedIds,
  };
}

module.exports = {
  closeExpiredAuction,
  processExpiredAuctions,
};
