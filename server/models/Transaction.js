const mongoose = require("mongoose");

const TRANSACTION_STATUSES = [
  "PENDING",
  "HANDOVER_IN_PROGRESS",
  "COMPLETED",
  "DISPUTED",
  "CANCELLED",
  "FAILED",
];

const OUTCOME_TYPES = [
  "BUYER_NO_SHOW",
  "SELLER_CANCELLED",
  "ITEM_MISMATCH",
  "ITEM_DAMAGED",
  "MUTUAL_CANCEL",
  "OTHER",
  "CANCELLED",
  "FAILED",
  null,
];

const transactionHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    previousStatus: {
      type: String,
      default: null,
    },
    newStatus: {
      type: String,
      default: null,
    },
    notes: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const transactionSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: [true, "Listing reference is required."],
      index: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Seller reference is required."],
      index: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Buyer reference is required."],
      index: true,
    },
    finalPrice: {
      type: Number,
      required: [true, "Final price is required."],
      min: [0.01, "Final price must be positive."],
    },
    status: {
      type: String,
      enum: {
        values: TRANSACTION_STATUSES,
        message:
          "{VALUE} is not a valid transaction status. Allowed: " +
          TRANSACTION_STATUSES.join(", "),
      },
      default: "PENDING",
      index: true,
    },
    // Coordination details
    handoverLocation: {
      type: String,
      trim: true,
      maxlength: [200, "Handover location cannot exceed 200 characters."],
      default: null,
    },
    handoverNotes: {
      type: String,
      trim: true,
      maxlength: [1000, "Handover notes cannot exceed 1000 characters."],
      default: null,
    },
    handoverStartedAt: {
      type: Date,
      default: null,
    },
    // Confirmations
    sellerConfirmed: {
      type: Boolean,
      default: false,
    },
    sellerConfirmedAt: {
      type: Date,
      default: null,
    },
    buyerConfirmed: {
      type: Boolean,
      default: false,
    },
    buyerConfirmedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    // Dispute Tracking
    disputeReason: {
      type: String,
      trim: true,
      maxlength: [1000, "Dispute reason cannot exceed 1000 characters."],
      default: null,
    },
    disputedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    disputedAt: {
      type: Date,
      default: null,
    },
    // Unsuccessful Outcome Tracking (Part 1)
    outcomeType: {
      type: String,
      enum: {
        values: OUTCOME_TYPES,
        message: "{VALUE} is not a valid outcome type.",
      },
      default: null,
    },
    outcomeReason: {
      type: String,
      trim: true,
      maxlength: [1000, "Outcome reason cannot exceed 1000 characters."],
      default: null,
    },
    outcomeInitiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    outcomeAt: {
      type: Date,
      default: null,
    },
    // Persistent Audit History Log
    history: [transactionHistorySchema],
  },
  {
    timestamps: true,
  }
);

transactionSchema.index({ seller: 1, status: 1 });
transactionSchema.index({ buyer: 1, status: 1 });
transactionSchema.index({ listing: 1, status: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
module.exports.TRANSACTION_STATUSES = TRANSACTION_STATUSES;
module.exports.OUTCOME_TYPES = OUTCOME_TYPES;
