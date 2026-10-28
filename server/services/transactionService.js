const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const Listing = require("../models/Listing");
const notificationService = require("./notificationService");

/**
 * Helper to record persistent audit entry into transaction history
 */
function recordHistory(transaction, action, userId, previousStatus, newStatus, notes = null) {
  if (!transaction.history) {
    transaction.history = [];
  }
  transaction.history.push({
    action,
    performedBy: userId || null,
    timestamp: new Date(),
    previousStatus: previousStatus || transaction.status,
    newStatus: newStatus || transaction.status,
    notes: notes ? String(notes).trim() : null,
  });
}

/**
 * Ensures a Transaction record exists for a completed, sold listing.
 * Guarantees that only sold listings with a valid winner can have a transaction.
 * @param {string|mongoose.Types.ObjectId} listingId
 * @returns {Promise<Transaction|null>}
 */
async function getOrCreateTransactionForListing(listingId) {
  if (!mongoose.Types.ObjectId.isValid(listingId)) {
    return null;
  }

  // Find active (non-cancelled, non-failed) transaction first, or most recent
  let transaction = await Transaction.findOne({
    listing: listingId,
    status: { $in: ["PENDING", "HANDOVER_IN_PROGRESS", "COMPLETED", "DISPUTED"] },
  })
    .populate("listing")
    .populate("seller", "name email role")
    .populate("buyer", "name email role")
    .populate("disputedBy", "name email role")
    .populate("outcomeInitiatedBy", "name email role");

  if (transaction) {
    return transaction;
  }

  // Check if any terminal transaction exists
  transaction = await Transaction.findOne({ listing: listingId })
    .sort({ createdAt: -1 })
    .populate("listing")
    .populate("seller", "name email role")
    .populate("buyer", "name email role")
    .populate("disputedBy", "name email role")
    .populate("outcomeInitiatedBy", "name email role");

  if (transaction) {
    return transaction;
  }

  // If not found, inspect listing
  const listing = await Listing.findById(listingId);
  if (!listing) return null;

  // Integrity rule: only completed auctions with outcome "sold" and a valid winner
  if (listing.status !== "completed" || listing.outcome !== "sold" || !listing.winner) {
    return null;
  }

  try {
    const createdTx = await Transaction.create({
      listing: listing._id,
      seller: listing.seller,
      buyer: listing.winner,
      finalPrice: listing.finalPrice || listing.currentPrice,
      status: "PENDING",
      history: [
        {
          action: "CREATED",
          performedBy: listing.seller,
          timestamp: new Date(),
          previousStatus: null,
          newStatus: "PENDING",
          notes: "Handover record initialized upon auction completion.",
        },
      ],
    });

    return await Transaction.findById(createdTx._id)
      .populate("listing")
      .populate("seller", "name email role")
      .populate("buyer", "name email role")
      .populate("disputedBy", "name email role")
      .populate("outcomeInitiatedBy", "name email role");
  } catch (err) {
    return await Transaction.findOne({ listing: listing._id })
      .sort({ createdAt: -1 })
      .populate("listing")
      .populate("seller", "name email role")
      .populate("buyer", "name email role")
      .populate("disputedBy", "name email role")
      .populate("outcomeInitiatedBy", "name email role");
  }
}

/**
 * Retrieves all eligible transactions for the requesting user.
 * - Admins can view all transactions.
 * - Sellers and Buyers can only view transactions they are a party to.
 * @param {object} user - The authenticated req.user { id, role }
 * @param {string} [statusFilter] - Optional status filter
 * @returns {Promise<Transaction[]>}
 */
async function getUserTransactions(user, statusFilter = null) {
  const query = {};

  if (user.role !== "admin") {
    query.$or = [{ seller: user.id }, { buyer: user.id }];
  }

  if (statusFilter && Transaction.schema.path("status").enumValues.includes(statusFilter)) {
    query.status = statusFilter;
  }

  return await Transaction.find(query)
    .sort({ updatedAt: -1 })
    .populate("listing")
    .populate("seller", "name email role")
    .populate("buyer", "name email role")
    .populate("disputedBy", "name email role")
    .populate("outcomeInitiatedBy", "name email role")
    .populate("history.performedBy", "name role");
}

/**
 * Retrieves a single transaction by ID and verifies user access.
 * @param {string} transactionId
 * @param {object} user - req.user
 * @returns {Promise<Transaction>}
 */
async function getTransactionById(transactionId, user) {
  if (!mongoose.Types.ObjectId.isValid(transactionId)) {
    const err = new Error("Invalid transaction ID format.");
    err.status = 400;
    throw err;
  }

  const transaction = await Transaction.findById(transactionId)
    .populate("listing")
    .populate("seller", "name email role")
    .populate("buyer", "name email role")
    .populate("disputedBy", "name email role")
    .populate("outcomeInitiatedBy", "name email role")
    .populate("history.performedBy", "name role");

  if (!transaction) {
    const err = new Error("Transaction not found.");
    err.status = 404;
    throw err;
  }

  const sellerId = transaction.seller?._id?.toString() || transaction.seller?.toString();
  const buyerId = transaction.buyer?._id?.toString() || transaction.buyer?.toString();

  // Access check: only seller, buyer, or admin
  if (user.role !== "admin" && sellerId !== user.id && buyerId !== user.id) {
    const err = new Error("Access denied. You are not a party to this transaction.");
    err.status = 403;
    throw err;
  }

  return transaction;
}

/**
 * Starts or updates handover coordination details (meetup location and notes).
 * @param {string} transactionId
 * @param {object} user - req.user
 * @param {object} details - { handoverLocation, handoverNotes }
 * @returns {Promise<Transaction>}
 */
async function startHandover(transactionId, user, { handoverLocation, handoverNotes }) {
  const transaction = await getTransactionById(transactionId, user);

  if (["COMPLETED", "CANCELLED", "FAILED"].includes(transaction.status)) {
    const err = new Error(`Cannot update handover for a ${transaction.status.toLowerCase()} transaction.`);
    err.status = 400;
    throw err;
  }

  if (transaction.status === "DISPUTED") {
    const err = new Error("Cannot update handover details while transaction is in disputed status.");
    err.status = 400;
    throw err;
  }

  const previousStatus = transaction.status;

  if (handoverLocation !== undefined) {
    transaction.handoverLocation = handoverLocation ? String(handoverLocation).trim() : null;
  }
  if (handoverNotes !== undefined) {
    transaction.handoverNotes = handoverNotes ? String(handoverNotes).trim() : null;
  }

  if (transaction.status === "PENDING") {
    transaction.status = "HANDOVER_IN_PROGRESS";
    transaction.handoverStartedAt = new Date();
  }

  recordHistory(
    transaction,
    "COORDINATION_UPDATED",
    user.id,
    previousStatus,
    transaction.status,
    `Location: ${transaction.handoverLocation || "None"}. Notes: ${transaction.handoverNotes || "None"}`
  );

  await transaction.save();

  // Notify counterparty about coordination update
  try {
    const sellerId = transaction.seller?._id?.toString() || transaction.seller?.toString();
    const buyerId = transaction.buyer?._id?.toString() || transaction.buyer?.toString();
    const otherPartyId = user.id === sellerId ? buyerId : sellerId;

    await notificationService.createNotification({
      recipient: otherPartyId,
      type: "HANDOVER_STARTED",
      title: "Handover Coordination",
      message: `Meetup coordination details updated for "${transaction.listing?.title || "your item"}".`,
      listing: transaction.listing?._id || transaction.listing,
      transaction: transaction._id,
    });
  } catch (notifErr) {
    console.error("Handover coordination notification error:", notifErr.message);
  }

  return transaction;
}

/**
 * Seller confirms item has been handed over.
 * Completes transaction only if buyer has also confirmed.
 * @param {string} transactionId
 * @param {object} user - req.user
 * @returns {Promise<Transaction>}
 */
async function confirmSellerHandover(transactionId, user) {
  const transaction = await getTransactionById(transactionId, user);

  const sellerId = transaction.seller?._id?.toString() || transaction.seller?.toString();
  if (user.role !== "admin" && sellerId !== user.id) {
    const err = new Error("Only the seller can confirm that the item has been handed over.");
    err.status = 403;
    throw err;
  }

  if (transaction.status === "COMPLETED") {
    return transaction;
  }

  if (["CANCELLED", "FAILED"].includes(transaction.status)) {
    const err = new Error(`Cannot confirm handover on a ${transaction.status.toLowerCase()} transaction.`);
    err.status = 400;
    throw err;
  }

  if (transaction.status === "DISPUTED") {
    const err = new Error("Cannot confirm handover while transaction is in disputed status.");
    err.status = 400;
    throw err;
  }

  const previousStatus = transaction.status;
  transaction.sellerConfirmed = true;
  transaction.sellerConfirmedAt = new Date();

  recordHistory(transaction, "SELLER_CONFIRMED", user.id, previousStatus, transaction.status, "Seller confirmed physical handover.");

  if (transaction.status === "PENDING") {
    transaction.status = "HANDOVER_IN_PROGRESS";
    if (!transaction.handoverStartedAt) {
      transaction.handoverStartedAt = new Date();
    }
  }

  // Complete if and only if both parties confirmed
  const wasCompleted = transaction.buyerConfirmed;
  if (wasCompleted) {
    transaction.status = "COMPLETED";
    transaction.completedAt = new Date();
    recordHistory(transaction, "COMPLETED", user.id, previousStatus, "COMPLETED", "Both parties verified handover. Transaction completed.");
  }

  await transaction.save();

  try {
    const buyerId = transaction.buyer?._id?.toString() || transaction.buyer?.toString();
    const listingTitle = transaction.listing?.title || "your item";
    const listingId = transaction.listing?._id || transaction.listing;

    if (transaction.status === "COMPLETED") {
      await Promise.all([
        notificationService.createNotification({
          recipient: sellerId,
          type: "HANDOVER_COMPLETED",
          title: "Handover Completed!",
          message: `Item handover confirmed and completed for "${listingTitle}".`,
          listing: listingId,
          transaction: transaction._id,
          deduplicate: true,
        }),
        notificationService.createNotification({
          recipient: buyerId,
          type: "HANDOVER_COMPLETED",
          title: "Handover Completed!",
          message: `Item handover confirmed and completed for "${listingTitle}".`,
          listing: listingId,
          transaction: transaction._id,
          deduplicate: true,
        }),
      ]);
    } else {
      await notificationService.createNotification({
        recipient: buyerId,
        type: "HANDOVER_SELLER_CONFIRMED",
        title: "Item Handed Over by Seller",
        message: `The seller confirmed delivery of "${listingTitle}". Please confirm receipt once you inspect the item.`,
        listing: listingId,
        transaction: transaction._id,
      });
    }
  } catch (notifErr) {
    console.error("Seller confirmation notification error:", notifErr.message);
  }

  return transaction;
}

/**
 * Buyer confirms receipt of item.
 * Completes transaction only if seller has also confirmed.
 * @param {string} transactionId
 * @param {object} user - req.user
 * @returns {Promise<Transaction>}
 */
async function confirmBuyerReceipt(transactionId, user) {
  const transaction = await getTransactionById(transactionId, user);

  const buyerId = transaction.buyer?._id?.toString() || transaction.buyer?.toString();
  if (user.role !== "admin" && buyerId !== user.id) {
    const err = new Error("Only the winning buyer can confirm item receipt.");
    err.status = 403;
    throw err;
  }

  if (transaction.status === "COMPLETED") {
    return transaction;
  }

  if (["CANCELLED", "FAILED"].includes(transaction.status)) {
    const err = new Error(`Cannot confirm receipt on a ${transaction.status.toLowerCase()} transaction.`);
    err.status = 400;
    throw err;
  }

  if (transaction.status === "DISPUTED") {
    const err = new Error("Cannot confirm receipt while transaction is in disputed status.");
    err.status = 400;
    throw err;
  }

  const previousStatus = transaction.status;
  transaction.buyerConfirmed = true;
  transaction.buyerConfirmedAt = new Date();

  recordHistory(transaction, "BUYER_CONFIRMED", user.id, previousStatus, transaction.status, "Buyer confirmed receipt and inspection.");

  if (transaction.status === "PENDING") {
    transaction.status = "HANDOVER_IN_PROGRESS";
    if (!transaction.handoverStartedAt) {
      transaction.handoverStartedAt = new Date();
    }
  }

  // Complete if and only if both parties confirmed
  const wasCompleted = transaction.sellerConfirmed;
  if (wasCompleted) {
    transaction.status = "COMPLETED";
    transaction.completedAt = new Date();
    recordHistory(transaction, "COMPLETED", user.id, previousStatus, "COMPLETED", "Both parties verified handover. Transaction completed.");
  }

  await transaction.save();

  try {
    const sellerId = transaction.seller?._id?.toString() || transaction.seller?.toString();
    const listingTitle = transaction.listing?.title || "your item";
    const listingId = transaction.listing?._id || transaction.listing;

    if (transaction.status === "COMPLETED") {
      await Promise.all([
        notificationService.createNotification({
          recipient: sellerId,
          type: "HANDOVER_COMPLETED",
          title: "Handover Completed!",
          message: `Item handover confirmed and completed for "${listingTitle}".`,
          listing: listingId,
          transaction: transaction._id,
          deduplicate: true,
        }),
        notificationService.createNotification({
          recipient: buyerId,
          type: "HANDOVER_COMPLETED",
          title: "Handover Completed!",
          message: `Item handover confirmed and completed for "${listingTitle}".`,
          listing: listingId,
          transaction: transaction._id,
          deduplicate: true,
        }),
      ]);
    } else {
      await notificationService.createNotification({
        recipient: sellerId,
        type: "HANDOVER_BUYER_CONFIRMED",
        title: "Buyer Confirmed Receipt",
        message: `The winning buyer confirmed receipt of "${listingTitle}".`,
        listing: listingId,
        transaction: transaction._id,
      });
    }
  } catch (notifErr) {
    console.error("Buyer confirmation notification error:", notifErr.message);
  }

  return transaction;
}

/**
 * Reports a dispute for the transaction.
 * @param {string} transactionId
 * @param {object} user - req.user
 * @param {string} reason
 * @returns {Promise<Transaction>}
 */
async function reportDispute(transactionId, user, reason) {
  const transaction = await getTransactionById(transactionId, user);

  if (["COMPLETED", "CANCELLED", "FAILED"].includes(transaction.status)) {
    const err = new Error(`Cannot dispute a ${transaction.status.toLowerCase()} transaction.`);
    err.status = 400;
    throw err;
  }

  if (!reason || String(reason).trim().length < 5) {
    const err = new Error("A valid dispute reason of at least 5 characters is required.");
    err.status = 400;
    throw err;
  }

  const previousStatus = transaction.status;
  transaction.status = "DISPUTED";
  transaction.disputeReason = String(reason).trim();
  transaction.disputedBy = user.id;
  transaction.disputedAt = new Date();

  recordHistory(transaction, "DISPUTED", user.id, previousStatus, "DISPUTED", `Dispute reported: ${transaction.disputeReason}`);

  await transaction.save();

  try {
    const sellerId = transaction.seller?._id?.toString() || transaction.seller?.toString();
    const buyerId = transaction.buyer?._id?.toString() || transaction.buyer?.toString();
    const otherPartyId = user.id === sellerId ? buyerId : sellerId;
    const listingTitle = transaction.listing?.title || "your item";

    await notificationService.createNotification({
      recipient: otherPartyId,
      type: "HANDOVER_DISPUTED",
      title: "Handover Issue Reported",
      message: `A dispute was reported regarding "${listingTitle}": ${String(reason).trim().slice(0, 80)}`,
      listing: transaction.listing?._id || transaction.listing,
      transaction: transaction._id,
    });
  } catch (notifErr) {
    console.error("Dispute report notification error:", notifErr.message);
  }

  return await Transaction.findById(transaction._id)
    .populate("listing")
    .populate("seller", "name email role")
    .populate("buyer", "name email role")
    .populate("disputedBy", "name email role")
    .populate("history.performedBy", "name role");
}

/**
 * Resolves a dispute and returns the transaction to HANDOVER_IN_PROGRESS.
 * Allowed for Admin or either participant party.
 * @param {string} transactionId
 * @param {object} user - req.user
 * @returns {Promise<Transaction>}
 */
async function resolveDispute(transactionId, user) {
  const transaction = await getTransactionById(transactionId, user);

  if (transaction.status !== "DISPUTED") {
    const err = new Error("Transaction is not currently in disputed status.");
    err.status = 400;
    throw err;
  }

  const previousStatus = transaction.status;
  transaction.status = "HANDOVER_IN_PROGRESS";
  transaction.disputeReason = null;
  transaction.disputedBy = null;
  transaction.disputedAt = null;

  recordHistory(transaction, "DISPUTE_RESOLVED", user.id, previousStatus, "HANDOVER_IN_PROGRESS", "Dispute marked resolved. Handover resumed.");

  await transaction.save();

  try {
    const sellerId = transaction.seller?._id?.toString() || transaction.seller?.toString();
    const buyerId = transaction.buyer?._id?.toString() || transaction.buyer?.toString();
    const otherPartyId = user.id === sellerId ? buyerId : sellerId;

    await notificationService.createNotification({
      recipient: otherPartyId,
      type: "HANDOVER_RESOLVED",
      title: "Handover Dispute Resolved",
      message: `The handover issue for "${transaction.listing?.title || "your item"}" has been marked resolved.`,
      listing: transaction.listing?._id || transaction.listing,
      transaction: transaction._id,
    });
  } catch (notifErr) {
    console.error("Dispute resolve notification error:", notifErr.message);
  }

  return transaction;
}

/**
 * Record an unsuccessful transaction outcome (CANCELLED or FAILED) - Part 1
 * Scenarios:
 * - BUYER_NO_SHOW: Buyer failed to show up for meetup -> FAILED
 * - SELLER_CANCELLED: Seller cancelled handover -> CANCELLED
 * - ITEM_MISMATCH: Buyer rejects item because it does not match listing -> FAILED
 * - ITEM_DAMAGED: Item damaged or broken during inspection -> FAILED
 * - MUTUAL_CANCEL: Both parties agree to cancel -> CANCELLED
 * - OTHER: Custom cancellation or failure
 *
 * @param {string} transactionId
 * @param {object} user - req.user
 * @param {object} params - { outcomeType, reason, targetStatus }
 * @returns {Promise<Transaction>}
 */
async function recordOutcome(transactionId, user, { outcomeType = "OTHER", reason, targetStatus }) {
  const transaction = await getTransactionById(transactionId, user);

  if (transaction.status === "COMPLETED") {
    const err = new Error("Cannot cancel or fail an already completed transaction.");
    err.status = 400;
    throw err;
  }

  if (["CANCELLED", "FAILED"].includes(transaction.status)) {
    const err = new Error(`Transaction is already marked as ${transaction.status.toLowerCase()}.`);
    err.status = 400;
    throw err;
  }

  if (!reason || String(reason).trim().length < 5) {
    const err = new Error("A specific reason of at least 5 characters is required to cancel or fail a handover.");
    err.status = 400;
    throw err;
  }

  // Determine final status
  let finalStatus = targetStatus;
  if (!finalStatus || !["CANCELLED", "FAILED"].includes(finalStatus)) {
    if (outcomeType === "FAILED" || outcomeType === "CANCELLED") {
      finalStatus = outcomeType;
    } else if (["BUYER_NO_SHOW", "ITEM_MISMATCH", "ITEM_DAMAGED"].includes(outcomeType)) {
      finalStatus = "FAILED";
    } else {
      finalStatus = "CANCELLED";
    }
  }

  const sellerId = transaction.seller?._id?.toString() || transaction.seller?.toString();
  const buyerId = transaction.buyer?._id?.toString() || transaction.buyer?.toString();
  const isAdmin = user.role === "admin";
  const isSeller = user.id === sellerId;
  const isBuyer = user.id === buyerId;

  // Role validation on outcome types
  if (!isAdmin) {
    if ((outcomeType === "ITEM_MISMATCH" || String(reason).includes("ITEM_MISMATCH")) && !isBuyer) {
      const err = new Error("Only the buyer can reject an item for listing mismatch.");
      err.status = 403;
      throw err;
    }
    if ((outcomeType === "BUYER_NO_SHOW" || String(reason).includes("BUYER_NO_SHOW")) && !isSeller) {
      const err = new Error("Only the seller can report a buyer no-show.");
      err.status = 403;
      throw err;
    }
  }

  const previousStatus = transaction.status;
  transaction.status = finalStatus;
  transaction.outcomeType = outcomeType;
  transaction.outcomeReason = String(reason).trim();
  transaction.outcomeInitiatedBy = user.id;
  transaction.outcomeAt = new Date();

  recordHistory(
    transaction,
    "OUTCOME_RECORDED",
    user.id,
    previousStatus,
    finalStatus,
    `[${outcomeType}] ${transaction.outcomeReason}`
  );

  await transaction.save();

  // Notify counterparty
  try {
    const otherPartyId = user.id === sellerId ? buyerId : sellerId;
    const notifType = finalStatus === "CANCELLED" ? "HANDOVER_CANCELLED" : "HANDOVER_FAILED";
    const notifTitle = finalStatus === "CANCELLED" ? "Handover Cancelled" : "Handover Failed";

    await notificationService.createNotification({
      recipient: otherPartyId,
      type: notifType,
      title: notifTitle,
      message: `Handover for "${transaction.listing?.title || "your item"}" was marked ${finalStatus.toLowerCase()}. Reason: ${transaction.outcomeReason.slice(0, 100)}`,
      listing: transaction.listing?._id || transaction.listing,
      transaction: transaction._id,
    });
  } catch (notifErr) {
    console.error("Outcome notification error:", notifErr.message);
  }

  return await Transaction.findById(transaction._id)
    .populate("listing")
    .populate("seller", "name email role")
    .populate("buyer", "name email role")
    .populate("disputedBy", "name email role")
    .populate("outcomeInitiatedBy", "name email role")
    .populate("history.performedBy", "name role");
}

module.exports = {
  getOrCreateTransactionForListing,
  getUserTransactions,
  getTransactionById,
  startHandover,
  confirmSellerHandover,
  confirmBuyerReceipt,
  reportDispute,
  resolveDispute,
  recordOutcome,
};
