const mongoose = require("mongoose");

const watchlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required."],
      index: true,
    },
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: [true, "Listing reference is required."],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate saves per user + listing
watchlistSchema.index({ user: 1, listing: 1 }, { unique: true });
watchlistSchema.index({ listing: 1, createdAt: -1 });

module.exports = mongoose.model("Watchlist", watchlistSchema);
