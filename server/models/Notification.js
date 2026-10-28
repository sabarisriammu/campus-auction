const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "NEW_BID",
  "OUTBID",
  "AUCTION_WON",
  "AUCTION_SOLD",
  "AUCTION_UNSOLD",
  "HANDOVER_STARTED",
  "HANDOVER_SELLER_CONFIRMED",
  "HANDOVER_BUYER_CONFIRMED",
  "HANDOVER_COMPLETED",
  "HANDOVER_DISPUTED",
  "HANDOVER_RESOLVED",
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient reference is required."],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: NOTIFICATION_TYPES,
        message: "{VALUE} is not a valid notification type.",
      },
      required: [true, "Notification type is required."],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Notification title is required."],
      trim: true,
      maxlength: [120, "Title cannot exceed 120 characters."],
    },
    message: {
      type: String,
      required: [true, "Notification message is required."],
      trim: true,
      maxlength: [500, "Message cannot exceed 500 characters."],
    },
    // Optional contextual entity references
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      default: null,
    },
    bid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bid",
      default: null,
    },
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// High-performance compound indexes for user feed & badge counts
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
