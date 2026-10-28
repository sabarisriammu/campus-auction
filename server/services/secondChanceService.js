const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const Bid = require("../models/Bid");
const Transaction = require("../models/Transaction");
const SecondChanceOffer = require("../models/SecondChanceOffer");
const notificationService = require("./notificationService");

/**
 * Retrieve ranked eligible candidates for second-chance offers.
 * Excludes:
 * - Original winner
 * - Seller
 * - Bidders who have already received an offer for this listing
 * @param {string} listingId
 * @returns {Promise<{ listing: Listing, candidates: Array, activeOffer: SecondChanceOffer|null }>}
 */
async function getRankedEligibleBidders(listingId) {
  if (!mongoose.Types.ObjectId.isValid(listingId)) {
    const err = new Error("Invalid listing ID format.");
    err.status = 400;
    throw err;
  }

  const listing = await Listing.findById(listingId)
    .populate("seller", "name email role")
    .populate("winner", "name email role");

  if (!listing) {
    const err = new Error("Listing not found.");
    err.status = 404;
    throw err;
  }

  // Check and clean up expired active offers
  await checkAndExpireOffers(listingId);

  // Find active offer if any
  const activeOffer = await SecondChanceOffer.findOne({
    listing: listingId,
    status: "OFFERED",
    expiresAt: { $gt: new Date() },
  })
    .populate("candidateBidder", "name email role")
    .populate("offeredBy", "name email role");

  // Fetch all prior offers for this listing to identify excluded bidders
  const priorOffers = await SecondChanceOffer.find({ listing: listingId });
  const excludedBidderIds = new Set(
    priorOffers.map((o) => o.candidateBidder.toString())
  );

  // Also exclude original winner and seller
  if (listing.winner) {
    const winnerId = listing.winner._id ? listing.winner._id.toString() : listing.winner.toString();
    excludedBidderIds.add(winnerId);
  }
  const sellerId = listing.seller._id ? listing.seller._id.toString() : listing.seller.toString();
  excludedBidderIds.add(sellerId);

  // Retrieve all bids for this listing in descending order
  const allBids = await Bid.find({ listing: listingId })
    .sort({ amount: -1, createdAt: -1 })
    .populate("bidder", "name email role");

  // Group by bidder to obtain each bidder's highest valid bid
  const bidderMap = new Map();
  for (const b of allBids) {
    if (!b.bidder) continue;
    const bId = b.bidder._id.toString();

    if (excludedBidderIds.has(bId)) {
      continue;
    }

    if (!bidderMap.has(bId)) {
      bidderMap.set(bId, {
        bidder: {
          _id: b.bidder._id,
          name: b.bidder.name,
          email: b.bidder.email,
          role: b.bidder.role,
        },
        highestBid: b.amount,
        bidId: b._id,
        createdAt: b.createdAt,
      });
    }
  }

  const candidates = Array.from(bidderMap.values()).sort(
    (a, b) => b.highestBid - a.highestBid
  );

  return {
    listing,
    candidates,
    activeOffer,
    priorOffersCount: priorOffers.length,
  };
}

/**
 * Clean up expired offers for a listing
 */
async function checkAndExpireOffers(listingId = null) {
  const query = {
    status: "OFFERED",
    expiresAt: { $lte: new Date() },
  };
  if (listingId) query.listing = listingId;

  await SecondChanceOffer.updateMany(query, {
    $set: { status: "EXPIRED" },
  });
}

/**
 * Create a new Second-Chance Offer for an eligible candidate bidder
 * @param {string} listingId
 * @param {object} user - req.user (must be seller of listing or admin)
 * @param {object} params - { candidateBidderId, durationHours }
 * @returns {Promise<SecondChanceOffer>}
 */
async function createSecondChanceOffer(listingId, user, { candidateBidderId, durationHours = 24 }) {
  if (!mongoose.Types.ObjectId.isValid(listingId)) {
    const err = new Error("Invalid listing ID format.");
    err.status = 400;
    throw err;
  }

  const listing = await Listing.findById(listingId);
  if (!listing) {
    const err = new Error("Listing not found.");
    err.status = 404;
    throw err;
  }

  // Authorization: Seller of item or admin
  const isOwner = listing.seller.toString() === user.id.toString();
  const isAdmin = user.role === "admin";
  if (!isOwner && !isAdmin) {
    const err = new Error("Only the seller or an admin can initiate a second-chance offer.");
    err.status = 403;
    throw err;
  }

  // Verify listing transaction status: must be CANCELLED, FAILED, or no completed successful transaction
  const activeTx = await Transaction.findOne({
    listing: listingId,
    status: { $in: ["PENDING", "HANDOVER_IN_PROGRESS", "COMPLETED"] },
  });

  if (activeTx && activeTx.status === "COMPLETED") {
    const err = new Error("Cannot offer second chance for a successfully completed handover.");
    err.status = 400;
    throw err;
  }

  if (activeTx && ["PENDING", "HANDOVER_IN_PROGRESS"].includes(activeTx.status)) {
    const err = new Error("Cannot offer second chance while original handover transaction is still active. Mark original handover failed or cancelled first.");
    err.status = 400;
    throw err;
  }

  // Ensure expired offers are marked expired
  await checkAndExpireOffers(listingId);

  // Check if an active offer already exists
  const existingActiveOffer = await SecondChanceOffer.findOne({
    listing: listingId,
    status: "OFFERED",
    expiresAt: { $gt: new Date() },
  });

  if (existingActiveOffer) {
    const err = new Error("An active second-chance offer already exists for this listing. Wait for it to be accepted, declined, or expired before making another offer.");
    err.status = 409;
    throw err;
  }

  // Retrieve ranked candidates
  const { candidates } = await getRankedEligibleBidders(listingId);

  if (candidates.length === 0) {
    const err = new Error("No eligible bidders remaining for a second-chance offer on this auction.");
    err.status = 400;
    throw err;
  }

  // Select target candidate (if candidateBidderId supplied, verify eligibility; otherwise pick #1)
  let targetCandidate = null;
  if (candidateBidderId) {
    targetCandidate = candidates.find(
      (c) => c.bidder._id.toString() === candidateBidderId.toString()
    );
    if (!targetCandidate) {
      const err = new Error("Selected bidder is not eligible for a second-chance offer on this item.");
      err.status = 400;
      throw err;
    }
  } else {
    targetCandidate = candidates[0];
  }

  const hours = Math.max(1, Math.min(72, parseInt(durationHours, 10) || 24));
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  const offer = await SecondChanceOffer.create({
    listing: listingId,
    candidateBidder: targetCandidate.bidder._id,
    candidateBid: targetCandidate.bidId,
    offerPrice: targetCandidate.highestBid,
    status: "OFFERED",
    offeredBy: user.id,
    offeredAt: new Date(),
    expiresAt,
  });

  const populatedOffer = await SecondChanceOffer.findById(offer._id)
    .populate("candidateBidder", "name email role")
    .populate("listing", "title startingPrice currentPrice imageUrl")
    .populate("offeredBy", "name email role");

  // Send notification to candidate bidder
  try {
    await notificationService.createNotification({
      recipient: targetCandidate.bidder._id,
      type: "SECOND_CHANCE_OFFER",
      title: "Second-Chance Offer Received!",
      message: `Great news! You received a second-chance offer to buy "${listing.title}" for your previous bid of ₹${targetCandidate.highestBid.toFixed(2)}.`,
      listing: listingId,
    });
  } catch (notifErr) {
    console.error("Second chance notification error:", notifErr.message);
  }

  return populatedOffer;
}

/**
 * Candidate bidder accepts the second chance offer
 * @param {string} offerId
 * @param {object} user - req.user (must be candidateBidder)
 * @returns {Promise<{ offer: SecondChanceOffer, transaction: Transaction, listing: Listing }>}
 */
async function acceptSecondChanceOffer(offerId, user) {
  if (!mongoose.Types.ObjectId.isValid(offerId)) {
    const err = new Error("Invalid offer ID format.");
    err.status = 400;
    throw err;
  }

  const offer = await SecondChanceOffer.findById(offerId).populate("listing");
  if (!offer) {
    const err = new Error("Second-chance offer not found.");
    err.status = 404;
    throw err;
  }

  if (offer.candidateBidder.toString() !== user.id.toString()) {
    const err = new Error("You are not authorized to accept this offer.");
    err.status = 403;
    throw err;
  }

  if (offer.status !== "OFFERED") {
    const err = new Error(`Cannot accept an offer that is already ${offer.status.toLowerCase()}.`);
    err.status = 400;
    throw err;
  }

  if (new Date(offer.expiresAt) <= new Date()) {
    offer.status = "EXPIRED";
    await offer.save();
    const err = new Error("This second-chance offer has expired.");
    err.status = 400;
    throw err;
  }

  // Update offer to ACCEPTED
  offer.status = "ACCEPTED";
  offer.respondedAt = new Date();
  await offer.save();

  // Update listing winner & price
  const listing = await Listing.findById(offer.listing._id);
  listing.winner = user.id;
  listing.finalPrice = offer.offerPrice;
  listing.currentPrice = offer.offerPrice;
  listing.outcome = "sold";
  listing.status = "completed";
  listing.completionTime = new Date();
  await listing.save();

  // Create or reset Handover Transaction for the new winner
  const newTransaction = await Transaction.create({
    listing: listing._id,
    seller: listing.seller,
    buyer: user.id,
    finalPrice: offer.offerPrice,
    status: "PENDING",
    history: [
      {
        action: "CREATED",
        performedBy: user.id,
        timestamp: new Date(),
        previousStatus: null,
        newStatus: "PENDING",
        notes: `Handover initiated via Second-Chance Offer acceptance for ₹${offer.offerPrice.toFixed(2)}.`,
      },
    ],
  });

  // Notify seller
  try {
    await notificationService.createNotification({
      recipient: listing.seller,
      type: "SECOND_CHANCE_ACCEPTED",
      title: "Second-Chance Offer Accepted!",
      message: `${user.name || "A buyer"} accepted your second-chance offer for "${listing.title}" at ₹${offer.offerPrice.toFixed(2)}. Meetup coordination is now open.`,
      listing: listing._id,
      transaction: newTransaction._id,
    });
  } catch (notifErr) {
    console.error("Second chance accept notification error:", notifErr.message);
  }

  return {
    offer,
    transaction: newTransaction,
    listing,
  };
}

/**
 * Candidate bidder declines the second chance offer
 * @param {string} offerId
 * @param {object} user - req.user
 * @param {string} reason
 * @returns {Promise<SecondChanceOffer>}
 */
async function declineSecondChanceOffer(offerId, user, reason = null) {
  if (!mongoose.Types.ObjectId.isValid(offerId)) {
    const err = new Error("Invalid offer ID format.");
    err.status = 400;
    throw err;
  }

  const offer = await SecondChanceOffer.findById(offerId).populate("listing");
  if (!offer) {
    const err = new Error("Second-chance offer not found.");
    err.status = 404;
    throw err;
  }

  if (offer.candidateBidder.toString() !== user.id.toString()) {
    const err = new Error("You are not authorized to decline this offer.");
    err.status = 403;
    throw err;
  }

  if (offer.status !== "OFFERED") {
    const err = new Error(`Cannot decline an offer that is already ${offer.status.toLowerCase()}.`);
    err.status = 400;
    throw err;
  }

  offer.status = "DECLINED";
  offer.respondedAt = new Date();
  offer.declineReason = reason ? String(reason).trim() : "Declined by bidder";
  await offer.save();

  // Notify seller so they can offer to the next bidder
  try {
    await notificationService.createNotification({
      recipient: offer.listing.seller,
      type: "SECOND_CHANCE_DECLINED",
      title: "Second-Chance Offer Declined",
      message: `A bidder declined your second-chance offer on "${offer.listing.title}". You can now offer the item to the next eligible bidder or relist the auction.`,
      listing: offer.listing._id,
    });
  } catch (notifErr) {
    console.error("Second chance decline notification error:", notifErr.message);
  }

  return offer;
}

/**
 * Retrieve active offers directed to the logged-in buyer
 * @param {string} userId
 * @returns {Promise<SecondChanceOffer[]>}
 */
async function getBuyerOffers(userId) {
  await checkAndExpireOffers();
  return await SecondChanceOffer.find({
    candidateBidder: userId,
    status: "OFFERED",
    expiresAt: { $gt: new Date() },
  })
    .populate("listing", "title category condition startingPrice currentPrice imageUrl status")
    .populate("offeredBy", "name email");
}

module.exports = {
  getRankedEligibleBidders,
  createSecondChanceOffer,
  acceptSecondChanceOffer,
  declineSecondChanceOffer,
  getBuyerOffers,
  checkAndExpireOffers,
};
