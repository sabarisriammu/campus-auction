const mongoose = require("mongoose");

const proxyBidSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: [true, "Listing reference is required."],
      index: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Buyer reference is required."],
      index: true,
    },
    maxAmount: {
      type: Number,
      required: [true, "Maximum proxy amount is required."],
      min: [0.01, "Maximum proxy amount must be greater than 0."],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastBidAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Enforce strictly ONE proxy configuration per buyer per listing
proxyBidSchema.index({ listing: 1, buyer: 1 }, { unique: true });

// Optimize query for active proxies sorted by maximum amount descending, then earliest activation
proxyBidSchema.index({ listing: 1, isActive: 1, maxAmount: -1, createdAt: 1 });

module.exports = mongoose.model("ProxyBid", proxyBidSchema);
