const mongoose = require("mongoose");

const listingQuestionSchema = new mongoose.Schema(
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
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Seller reference is required."],
      index: true,
    },
    question: {
      type: String,
      required: [true, "Question text is required."],
      trim: true,
      minlength: [3, "Question must be at least 3 characters."],
      maxlength: [500, "Question cannot exceed 500 characters."],
    },
    answer: {
      type: String,
      trim: true,
      default: null,
      maxlength: [1000, "Answer cannot exceed 1000 characters."],
    },
    status: {
      type: String,
      enum: {
        values: ["PENDING", "ANSWERED", "CLOSED"],
        message: "{VALUE} is not a valid question status.",
      },
      default: "PENDING",
      index: true,
    },
    isReadBySeller: {
      type: Boolean,
      default: false,
      index: true,
    },
    isReadByBuyer: {
      type: Boolean,
      default: true,
      index: true,
    },
    askedAt: {
      type: Date,
      default: Date.now,
    },
    answeredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

listingQuestionSchema.index({ seller: 1, status: 1, createdAt: -1 });
listingQuestionSchema.index({ buyer: 1, status: 1, createdAt: -1 });
listingQuestionSchema.index({ listing: 1, createdAt: -1 });

module.exports = mongoose.model("ListingQuestion", listingQuestionSchema);
