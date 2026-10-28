const express = require("express");
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const authenticate = require("../middleware/authMiddleware");

const router = express.Router();

const ALLOWED_CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"];

// POST /api/listings - Create a new listing (Protected)
router.post("/", authenticate, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      condition,
      startingPrice,
      minBidIncrement,
      auctionEndTime,
    } = req.body;

    // 1. Validate required fields
    if (
      !title ||
      !description ||
      !category ||
      !condition ||
      startingPrice === undefined ||
      startingPrice === null ||
      !auctionEndTime
    ) {
      return res.status(400).json({
        message:
          "title, description, category, condition, startingPrice, and auctionEndTime are required.",
      });
    }

    // 2. Validate condition
    if (!ALLOWED_CONDITIONS.includes(condition)) {
      return res.status(400).json({
        message: `Invalid condition. Allowed values: ${ALLOWED_CONDITIONS.join(", ")}.`,
      });
    }

    // 3. Validate numerical price and increment
    const parsedStartingPrice = Number(startingPrice);
    if (isNaN(parsedStartingPrice) || parsedStartingPrice <= 0) {
      return res.status(400).json({
        message: "Starting price must be a positive number greater than 0.",
      });
    }

    let parsedMinIncrement = 1.0;
    if (minBidIncrement !== undefined && minBidIncrement !== null) {
      parsedMinIncrement = Number(minBidIncrement);
      if (isNaN(parsedMinIncrement) || parsedMinIncrement <= 0) {
        return res.status(400).json({
          message: "Minimum bid increment must be a positive number greater than 0.",
        });
      }
    }

    // 4. Validate auction end time is in the future
    const parsedEndTime = new Date(auctionEndTime);
    if (isNaN(parsedEndTime.getTime()) || parsedEndTime <= new Date()) {
      return res.status(400).json({
        message: "Auction end time must be a valid future date and time.",
      });
    }

    // 5. Create listing - seller is derived strictly from verified JWT
    const newListing = await Listing.create({
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      condition,
      startingPrice: parsedStartingPrice,
      currentPrice: parsedStartingPrice,
      minBidIncrement: parsedMinIncrement,
      auctionEndTime: parsedEndTime,
      seller: req.user.id,
      status: "active",
    });

    const populatedListing = await Listing.findById(newListing._id).populate(
      "seller",
      "name email"
    );

    return res.status(201).json({
      message: "Listing created successfully!",
      listing: populatedListing,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        message: messages.join(" "),
      });
    }

    console.error("Create listing error:", error.message);
    return res.status(500).json({
      message: "Failed to create listing due to a server error.",
    });
  }
});

// GET /api/listings - Retrieve all listings (Public)
router.get("/", async (req, res) => {
  try {
    const { status, category, search } = req.query;

    const query = {};

    if (status && status !== "all") {
      query.status = status;
    } else if (!status) {
      // Default to active listings if status query parameter is omitted
      query.status = "active";
    }

    if (category) {
      query.category = { $regex: new RegExp(`^${category.trim()}$`, "i") };
    }

    if (search) {
      query.$or = [
        { title: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const listings = await Listing.find(query)
      .populate("seller", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      count: listings.length,
      listings,
    });
  } catch (error) {
    console.error("Get listings error:", error.message);
    return res.status(500).json({
      message: "Failed to retrieve listings due to a server error.",
    });
  }
});

// GET /api/listings/:id - Retrieve a single listing by ID (Public)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid listing ID format.",
      });
    }

    const listing = await Listing.findById(id).populate("seller", "name email");

    if (!listing) {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    return res.status(200).json({
      listing,
    });
  } catch (error) {
    console.error("Get listing by ID error:", error.message);
    return res.status(500).json({
      message: "Failed to retrieve listing due to a server error.",
    });
  }
});

// Handler for editing a listing (Supports both PUT and PATCH)
const handleUpdateListing = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid listing ID format.",
      });
    }

    const listing = await Listing.findById(id);

    if (!listing) {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    // Ownership check: only the seller can edit
    if (listing.seller.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        message: "You are not authorized to edit this listing.",
      });
    }

    // Check status: cannot edit a cancelled or expired listing
    if (listing.status === "cancelled") {
      return res.status(400).json({
        message: "Cannot edit a cancelled listing.",
      });
    }

    if (new Date(listing.auctionEndTime) <= new Date()) {
      return res.status(400).json({
        message: "Cannot edit an auction that has already ended.",
      });
    }

    const {
      title,
      description,
      category,
      condition,
      startingPrice,
      minBidIncrement,
      auctionEndTime,
    } = req.body;

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length < 3) {
        return res.status(400).json({
          message: "Title must be at least 3 characters long.",
        });
      }
      listing.title = title.trim();
    }

    if (description !== undefined) {
      if (typeof description !== "string" || description.trim().length < 5) {
        return res.status(400).json({
          message: "Description must be at least 5 characters long.",
        });
      }
      listing.description = description.trim();
    }

    if (category !== undefined) {
      if (typeof category !== "string" || category.trim().length === 0) {
        return res.status(400).json({
          message: "Category cannot be empty.",
        });
      }
      listing.category = category.trim();
    }

    if (condition !== undefined) {
      if (!ALLOWED_CONDITIONS.includes(condition)) {
        return res.status(400).json({
          message: `Invalid condition. Allowed values: ${ALLOWED_CONDITIONS.join(", ")}.`,
        });
      }
      listing.condition = condition;
    }

    if (startingPrice !== undefined) {
      const parsedStartingPrice = Number(startingPrice);
      if (isNaN(parsedStartingPrice) || parsedStartingPrice <= 0) {
        return res.status(400).json({
          message: "Starting price must be a positive number greater than 0.",
        });
      }
      // If current price was untouched (equals original starting price), update it as well
      if (listing.currentPrice === listing.startingPrice) {
        listing.currentPrice = parsedStartingPrice;
      }
      listing.startingPrice = parsedStartingPrice;
    }

    if (minBidIncrement !== undefined) {
      const parsedIncrement = Number(minBidIncrement);
      if (isNaN(parsedIncrement) || parsedIncrement <= 0) {
        return res.status(400).json({
          message: "Minimum bid increment must be a positive number greater than 0.",
        });
      }
      listing.minBidIncrement = parsedIncrement;
    }

    if (auctionEndTime !== undefined) {
      const parsedEndTime = new Date(auctionEndTime);
      if (isNaN(parsedEndTime.getTime()) || parsedEndTime <= new Date()) {
        return res.status(400).json({
          message: "Auction end time must be a valid future date and time.",
        });
      }
      listing.auctionEndTime = parsedEndTime;
    }

    await listing.save();

    const updatedListing = await Listing.findById(listing._id).populate(
      "seller",
      "name email"
    );

    return res.status(200).json({
      message: "Listing updated successfully!",
      listing: updatedListing,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        message: messages.join(" "),
      });
    }

    console.error("Update listing error:", error.message);
    return res.status(500).json({
      message: "Failed to update listing due to a server error.",
    });
  }
};

router.put("/:id", authenticate, handleUpdateListing);
router.patch("/:id", authenticate, handleUpdateListing);

// Handler for cancelling a listing (Supports PATCH /:id/cancel and DELETE /:id)
const handleCancelListing = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid listing ID format.",
      });
    }

    const listing = await Listing.findById(id);

    if (!listing) {
      return res.status(404).json({
        message: "Listing not found.",
      });
    }

    // Ownership check: only the seller can cancel
    if (listing.seller.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        message: "You are not authorized to cancel this listing.",
      });
    }

    if (listing.status === "cancelled") {
      return res.status(400).json({
        message: "Listing is already cancelled.",
      });
    }

    if (new Date(listing.auctionEndTime) <= new Date()) {
      return res.status(400).json({
        message: "Cannot cancel an auction that has already ended.",
      });
    }

    listing.status = "cancelled";
    await listing.save();

    const cancelledListing = await Listing.findById(listing._id).populate(
      "seller",
      "name email"
    );

    return res.status(200).json({
      message: "Listing cancelled successfully!",
      listing: cancelledListing,
    });
  } catch (error) {
    console.error("Cancel listing error:", error.message);
    return res.status(500).json({
      message: "Failed to cancel listing due to a server error.",
    });
  }
};

router.patch("/:id/cancel", authenticate, handleCancelListing);
router.delete("/:id", authenticate, handleCancelListing);

module.exports = router;
