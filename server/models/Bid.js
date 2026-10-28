const mongoose = require("mongoose");

const bidSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: [true, "Listing reference is required."],
      index: true,
    },
    bidder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Bidder reference is required."],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Bid amount is required."],
      min: [0.01, "Bid amount must be greater than 0."],
    },
  },
  {
    timestamps: true,
  }
);

bidSchema.index({ listing: 1, amount: -1 });
bidSchema.index({ listing: 1, createdAt: -1 });

module.exports = mongoose.model("Bid", bidSchema);
