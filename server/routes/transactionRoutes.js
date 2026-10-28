const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const transactionService = require("../services/transactionService");

/**
 * GET /api/transactions
 * Retrieve all transactions accessible to the authenticated user.
 * - Admin sees all transactions.
 * - Seller/Buyer sees only transactions they are a party to.
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const { status } = req.query;
    const transactions = await transactionService.getUserTransactions(req.user, status);
    return res.status(200).json({
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    console.error("GET /api/transactions error:", error.message);
    return res.status(error.status || 500).json({
      message: error.message || "Failed to retrieve transactions.",
    });
  }
});

/**
 * GET /api/transactions/listing/:listingId
 * Retrieve or initialize the handover transaction for a completed sold listing.
 */
router.get("/listing/:listingId", authenticate, async (req, res) => {
  try {
    const { listingId } = req.params;
    const transaction = await transactionService.getOrCreateTransactionForListing(listingId);

    if (!transaction) {
      return res.status(404).json({
        message: "No eligible handover transaction exists for this listing. Only completed sold auctions have handover tracking.",
      });
    }

    // Access control
    const sellerId = transaction.seller?._id?.toString() || transaction.seller?.toString();
    const buyerId = transaction.buyer?._id?.toString() || transaction.buyer?.toString();

    if (req.user.role !== "admin" && sellerId !== req.user.id && buyerId !== req.user.id) {
      return res.status(403).json({
        message: "Access denied. You are not a party to this transaction.",
      });
    }

    return res.status(200).json({ transaction });
  } catch (error) {
    console.error("GET /api/transactions/listing/:listingId error:", error.message);
    return res.status(error.status || 500).json({
      message: error.message || "Failed to retrieve listing transaction.",
    });
  }
});

/**
 * GET /api/transactions/:id
 * Retrieve single transaction details by transaction ID.
 */
router.get("/:id", authenticate, async (req, res) => {
  try {
    const transaction = await transactionService.getTransactionById(req.params.id, req.user);
    return res.status(200).json({ transaction });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Failed to retrieve transaction.",
    });
  }
});

/**
 * PATCH /api/transactions/:id/start
 * Start or update handover coordination (location and notes).
 * Transitions PENDING -> HANDOVER_IN_PROGRESS.
 */
router.patch("/:id/start", authenticate, async (req, res) => {
  try {
    const { handoverLocation, handoverNotes } = req.body;
    const transaction = await transactionService.startHandover(req.params.id, req.user, {
      handoverLocation,
      handoverNotes,
    });

    return res.status(200).json({
      message: "Handover coordination details updated successfully.",
      transaction,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Failed to start handover.",
    });
  }
});

/**
 * PATCH /api/transactions/:id/confirm-handover
 * Seller confirms item has been handed over.
 */
router.patch("/:id/confirm-handover", authenticate, async (req, res) => {
  try {
    const transaction = await transactionService.confirmSellerHandover(req.params.id, req.user);
    const isCompleted = transaction.status === "COMPLETED";

    return res.status(200).json({
      message: isCompleted
        ? "Handover complete! Both parties have confirmed delivery and receipt."
        : "Item delivery confirmed by seller. Awaiting buyer receipt confirmation.",
      transaction,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Failed to confirm handover.",
    });
  }
});

/**
 * PATCH /api/transactions/:id/confirm-receipt
 * Buyer confirms receipt of the item.
 */
router.patch("/:id/confirm-receipt", authenticate, async (req, res) => {
  try {
    const transaction = await transactionService.confirmBuyerReceipt(req.params.id, req.user);
    const isCompleted = transaction.status === "COMPLETED";

    return res.status(200).json({
      message: isCompleted
        ? "Handover complete! Both parties have confirmed delivery and receipt."
        : "Item receipt confirmed by buyer. Awaiting seller handover confirmation.",
      transaction,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Failed to confirm receipt.",
    });
  }
});

/**
 * PATCH /api/transactions/:id/dispute
 * Report an issue with the handover.
 */
router.patch("/:id/dispute", authenticate, async (req, res) => {
  try {
    const { reason } = req.body;
    const transaction = await transactionService.reportDispute(req.params.id, req.user, reason);

    return res.status(200).json({
      message: "Handover dispute reported successfully. Transaction is marked as disputed.",
      transaction,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Failed to report dispute.",
    });
  }
});

/**
 * PATCH /api/transactions/:id/resolve
 * Resolve a dispute and return transaction to HANDOVER_IN_PROGRESS.
 */
router.patch("/:id/resolve", authenticate, async (req, res) => {
  try {
    const transaction = await transactionService.resolveDispute(req.params.id, req.user);

    return res.status(200).json({
      message: "Dispute resolved successfully. Handover coordination has been resumed.",
      transaction,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Failed to resolve dispute.",
    });
  }
});

module.exports = router;
