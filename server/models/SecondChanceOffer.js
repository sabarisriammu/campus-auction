const mongoose = require("mongoose");

const OFFER_STATUSES = ["OFFERED", "ACCEPTED", "DECLINED", "EXPIRED", "REVOKED"];

const secondChanceOfferSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: [true, "Listing reference is required."],
      index: true,
    },
    candidateBidder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Candidate bidder is required."],
      index: true,
    },
    candidateBid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bid",
      required: [true, "Candidate bid reference is required."],
    },
    offerPrice: {
      type: Number,
      required: [true, "Offer price is required."],
      min: [0.01, "Offer price must be greater than zero."],
    },
    status: {
      type: String,
      enum: {
        values: OFFER_STATUSES,
        message: "{VALUE} is not a valid offer status. Allowed: " + OFFER_STATUSES.join(", "),
      },
      default: "OFFERED",
      index: true,
    },
    offeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Offer initiator is required."],
    },
    offeredAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: [true, "Offer expiration date is required."],
      index: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    declineReason: {
      type: String,
      trim: true,
      maxlength: [500, "Decline reason cannot exceed 500 characters."],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
secondChanceOfferSchema.index({ listing: 1, status: 1 });
secondChanceOfferSchema.index({ candidateBidder: 1, status: 1 });

module.exports = mongoose.model("SecondChanceOffer", secondChanceOfferSchema);
module.exports.OFFER_STATUSES = OFFER_STATUSES;
