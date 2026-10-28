const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: [true, "Listing reference is required."],
      unique: true,
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
        values: ["PENDING", "HANDOVER_IN_PROGRESS", "COMPLETED", "DISPUTED"],
        message: "{VALUE} is not a valid transaction status. Allowed: PENDING, HANDOVER_IN_PROGRESS, COMPLETED, DISPUTED.",
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
  },
  {
    timestamps: true,
  }
);

transactionSchema.index({ seller: 1, status: 1 });
transactionSchema.index({ buyer: 1, status: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
