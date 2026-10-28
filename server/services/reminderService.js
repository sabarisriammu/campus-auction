const Listing = require("../models/Listing");
const Bid = require("../models/Bid");
const Watchlist = require("../models/Watchlist");
const Notification = require("../models/Notification");
const notificationService = require("./notificationService");

/**
 * Check active auctions and dispatch 15-minute and 5-minute ending reminders
 * to watching users and active bidders.
 * Deduplication is strictly enforced via Notification threshold field and compound index.
 */
async function processAuctionReminders() {
  try {
    const now = new Date();
    // Look ahead up to 16 minutes for active auctions
    const sixteenMinutesFromNow = new Date(now.getTime() + 16 * 60 * 1000);

    const activeListings = await Listing.find({
      status: "active",
      auctionEndTime: { $gt: now, $lte: sixteenMinutesFromNow },
    });

    if (!activeListings || activeListings.length === 0) {
      return;
    }

    for (const listing of activeListings) {
      const remainingMs = new Date(listing.auctionEndTime).getTime() - now.getTime();
      const remainingMinutes = remainingMs / (60 * 1000);

      let threshold = null;
      let timeLabel = "";

      if (remainingMinutes <= 5.0 && remainingMinutes > 0) {
        threshold = "5m";
        timeLabel = "5 minutes";
      } else if (remainingMinutes <= 15.0 && remainingMinutes > 5.0) {
        threshold = "15m";
        timeLabel = "15 minutes";
      }

      if (!threshold) continue;

      // Identify watching buyers
      const watchlistEntries = await Watchlist.find({ listing: listing._id }, "user");
      const watchlistUserIds = watchlistEntries.map((w) => w.user.toString());

      // Identify active bidders
      const bidderIds = await Bid.find({ listing: listing._id }).distinct("bidder");
      const bidderStringIds = bidderIds.map((b) => b.toString());

      // Combine unique interested users, excluding the seller
      const sellerId = listing.seller ? listing.seller.toString() : "";
      const interestedUsers = Array.from(
        new Set([...watchlistUserIds, ...bidderStringIds])
      ).filter((userId) => userId && userId !== sellerId);

      for (const userId of interestedUsers) {
        // Strict deduplication check:
        // Has this user already received this threshold reminder for this listing?
        const alreadyNotified = await Notification.exists({
          recipient: userId,
          type: "AUCTION_REMINDER",
          listing: listing._id,
          threshold,
        });

        if (alreadyNotified) {
          continue;
        }

        try {
          await notificationService.createNotification({
            recipient: userId,
            type: "AUCTION_REMINDER",
            threshold,
            title: `⏳ Auction Ending in ${timeLabel}!`,
            message: `Hurry! The auction for "${listing.title}" ends in less than ${timeLabel}. Current high bid: ₹${(listing.currentPrice || listing.startingPrice).toFixed(2)}.`,
            listing: listing._id,
          });
        } catch (dispatchErr) {
          // If a duplicate key race occurs on the compound unique index, safely ignore
          if (dispatchErr.code !== 11000) {
            console.error("Reminder notification error:", dispatchErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error("Error in processAuctionReminders:", err.message);
  }
}

module.exports = {
  processAuctionReminders,
};
