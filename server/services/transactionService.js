const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const Listing = require("../models/Listing");

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

  let transaction = await Transaction.findOne({ listing: listingId })
    .populate("listing")
    .populate("seller", "name email role")
    .populate("buyer", "name email role")
    .populate("disputedBy", "name email role");

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
    transaction = await Transaction.findOneAndUpdate(
      { listing: listing._id },
      {
        $setOnInsert: {
          listing: listing._id,
          seller: listing.seller,
          buyer: listing.winner,
          finalPrice: listing.finalPrice || listing.currentPrice,
          status: "PENDING",
        },
      },
      { upsert: true, new: true }
    )
      .populate("listing")
      .populate("seller", "name email role")
      .populate("buyer", "name email role")
      .populate("disputedBy", "name email role");

    return transaction;
  } catch (err) {
    // If concurrent insert occurred, retrieve the existing transaction
    return await Transaction.findOne({ listing: listing._id })
      .populate("listing")
      .populate("seller", "name email role")
      .populate("buyer", "name email role")
      .populate("disputedBy", "name email role");
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

  if (statusFilter && ["PENDING", "HANDOVER_IN_PROGRESS", "COMPLETED", "DISPUTED"].includes(statusFilter)) {
    query.status = statusFilter;
  }

  return await Transaction.find(query)
    .sort({ updatedAt: -1 })
    .populate("listing")
    .populate("seller", "name email role")
    .populate("buyer", "name email role")
    .populate("disputedBy", "name email role");
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
    .populate("disputedBy", "name email role");

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

  if (transaction.status === "COMPLETED") {
    const err = new Error("Cannot update handover for an already completed transaction.");
    err.status = 400;
    throw err;
  }

  if (transaction.status === "DISPUTED") {
    const err = new Error("Cannot update handover details while transaction is in disputed status.");
    err.status = 400;
    throw err;
  }

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

  await transaction.save();
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
    // Idempotent: return transaction as-is
    return transaction;
  }

  if (transaction.status === "DISPUTED") {
    const err = new Error("Cannot confirm handover while transaction is in disputed status.");
    err.status = 400;
    throw err;
  }

  transaction.sellerConfirmed = true;
  transaction.sellerConfirmedAt = new Date();

  // If currently pending, transition to in progress
  if (transaction.status === "PENDING") {
    transaction.status = "HANDOVER_IN_PROGRESS";
    if (!transaction.handoverStartedAt) {
      transaction.handoverStartedAt = new Date();
    }
  }

  // Complete if and only if both parties confirmed
  if (transaction.buyerConfirmed) {
    transaction.status = "COMPLETED";
    transaction.completedAt = new Date();
  }

  await transaction.save();
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
    // Idempotent: return transaction as-is
    return transaction;
  }

  if (transaction.status === "DISPUTED") {
    const err = new Error("Cannot confirm receipt while transaction is in disputed status.");
    err.status = 400;
    throw err;
  }

  transaction.buyerConfirmed = true;
  transaction.buyerConfirmedAt = new Date();

  // If currently pending, transition to in progress
  if (transaction.status === "PENDING") {
    transaction.status = "HANDOVER_IN_PROGRESS";
    if (!transaction.handoverStartedAt) {
      transaction.handoverStartedAt = new Date();
    }
  }

  // Complete if and only if both parties confirmed
  if (transaction.sellerConfirmed) {
    transaction.status = "COMPLETED";
    transaction.completedAt = new Date();
  }

  await transaction.save();
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

  if (transaction.status === "COMPLETED") {
    const err = new Error("Cannot dispute an already completed transaction.");
    err.status = 400;
    throw err;
  }

  if (!reason || String(reason).trim().length < 5) {
    const err = new Error("A valid dispute reason of at least 5 characters is required.");
    err.status = 400;
    throw err;
  }

  transaction.status = "DISPUTED";
  transaction.disputeReason = String(reason).trim();
  transaction.disputedBy = user.id;
  transaction.disputedAt = new Date();

  await transaction.save();
  return await Transaction.findById(transaction._id)
    .populate("listing")
    .populate("seller", "name email role")
    .populate("buyer", "name email role")
    .populate("disputedBy", "name email role");
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

  transaction.status = "HANDOVER_IN_PROGRESS";
  transaction.disputeReason = null;
  transaction.disputedBy = null;
  transaction.disputedAt = null;

  await transaction.save();
  return await Transaction.findById(transaction._id)
    .populate("listing")
    .populate("seller", "name email role")
    .populate("buyer", "name email role");
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
};
