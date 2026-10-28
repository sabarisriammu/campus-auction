const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required."],
      trim: true,
      minlength: [3, "Title must be at least 3 characters long."],
      maxlength: [100, "Title cannot exceed 100 characters."],
    },

    description: {
      type: String,
      required: [true, "Description is required."],
      trim: true,
      minlength: [5, "Description must be at least 5 characters long."],
      maxlength: [2000, "Description cannot exceed 2000 characters."],
    },

    category: {
      type: String,
      required: [true, "Category is required."],
      trim: true,
      maxlength: [50, "Category cannot exceed 50 characters."],
    },

    condition: {
      type: String,
      required: [true, "Condition is required."],
      trim: true,
      enum: {
        values: ["New", "Like New", "Good", "Fair", "Poor"],
        message: "{VALUE} is not a valid condition. Allowed: New, Like New, Good, Fair, Poor.",
      },
    },

    startingPrice: {
      type: Number,
      required: [true, "Starting price is required."],
      min: [0.01, "Starting price must be greater than 0."],
    },

    currentPrice: {
      type: Number,
      default: function () {
        return this.startingPrice;
      },
      min: [0.01, "Current price must be greater than 0."],
    },

    minBidIncrement: {
      type: Number,
      default: 1.0,
      min: [0.01, "Minimum bid increment must be greater than 0."],
    },

    auctionEndTime: {
      type: Date,
      required: [true, "Auction end time is required."],
      validate: {
        validator: function (value) {
          if (this.isNew || this.isModified("auctionEndTime")) {
            return value instanceof Date && !isNaN(value.getTime()) && value > new Date();
          }
          return true;
        },
        message: "Auction end time must be a valid future date.",
      },
    },

    status: {
      type: String,
      enum: ["active", "cancelled", "completed"],
      default: "active",
    },

    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Seller is required."],
    },

    // Lifecycle Outcome Fields (Module 6)
    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    finalPrice: {
      type: Number,
      default: null,
    },

    completionTime: {
      type: Date,
      default: null,
    },

    outcome: {
      type: String,
      enum: ["sold", "unsold", null],
      default: null,
    },

    // Product Image URL (Module 6)
    imageUrl: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

listingSchema.index({ status: 1, auctionEndTime: 1 });
listingSchema.index({ seller: 1 });
listingSchema.index({ winner: 1 });

module.exports = mongoose.model("Listing", listingSchema);
