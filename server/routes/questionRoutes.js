const express = require("express");
const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const ListingQuestion = require("../models/ListingQuestion");
const { authenticate, authorizeRoles } = require("../middleware/authMiddleware");
const notificationService = require("../services/notificationService");
const socketService = require("../services/socketService");

const router = express.Router();

/**
 * POST /api/questions
 * Submit a product question to a seller for a specific listing
 */
router.post("/", authenticate, async (req, res) => {
  const { listingId, question } = req.body;

  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    return res.status(400).json({ message: "A valid listing ID is required." });
  }

  const cleanQuestion = String(question || "").trim();
  if (cleanQuestion.length < 3) {
    return res.status(400).json({ message: "Question must be at least 3 characters long." });
  }

  if (cleanQuestion.length > 500) {
    return res.status(400).json({ message: "Question cannot exceed 500 characters." });
  }

  try {
    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found." });
    }

    // A seller cannot ask questions on their own listing
    if (listing.seller.toString() === req.user.id.toString()) {
      return res.status(403).json({
        message: "You cannot ask questions on your own listing.",
      });
    }

    // Persist question in MongoDB
    const createdQuestion = await ListingQuestion.create({
      listing: listing._id,
      buyer: req.user.id,
      seller: listing.seller,
      question: cleanQuestion,
      status: "PENDING",
      isReadBySeller: false,
      isReadByBuyer: true,
      askedAt: new Date(),
    });

    const populated = await ListingQuestion.findById(createdQuestion._id)
      .populate("listing", "title category currentPrice startingPrice imageUrl status")
      .populate("buyer", "name")
      .populate("seller", "name");

    // Create persistent notification for the seller
    try {
      await notificationService.createNotification({
        recipient: listing.seller,
        type: "NEW_QUESTION",
        title: "New Product Question",
        message: `A buyer asked: "${cleanQuestion.slice(0, 80)}..." on your listing "${listing.title}".`,
        listing: listing._id,
        question: createdQuestion._id,
      });

      // Real-time socket event to the seller's secure private room
      socketService.emitToUser(listing.seller, "question:new", populated);
    } catch (notifErr) {
      console.error("Question notification error:", notifErr.message);
    }

    return res.status(201).json({
      message: "Question submitted successfully to the seller.",
      question: populated,
    });
  } catch (err) {
    console.error("Submit question error:", err.message);
    return res.status(500).json({ message: "Failed to submit question." });
  }
});

/**
 * GET /api/questions/inbox
 * Retrieve questions received by the authenticated seller for their listings
 */
router.get("/inbox", authenticate, authorizeRoles("seller", "admin"), async (req, res) => {
  try {
    const questions = await ListingQuestion.find({ seller: req.user.id })
      .populate("listing", "title category currentPrice startingPrice imageUrl status auctionEndTime")
      .populate("buyer", "name")
      .sort({ createdAt: -1 })
      .lean();

    // Mark questions as read by seller
    await ListingQuestion.updateMany(
      { seller: req.user.id, isReadBySeller: false },
      { $set: { isReadBySeller: true } }
    );

    return res.status(200).json({
      count: questions.length,
      questions,
    });
  } catch (err) {
    console.error("Get seller questions inbox error:", err.message);
    return res.status(500).json({ message: "Failed to retrieve questions inbox." });
  }
});

/**
 * GET /api/questions/my-questions
 * Retrieve questions submitted by the authenticated buyer
 */
router.get("/my-questions", authenticate, async (req, res) => {
  try {
    const questions = await ListingQuestion.find({ buyer: req.user.id })
      .populate("listing", "title category currentPrice startingPrice imageUrl status auctionEndTime")
      .populate("seller", "name")
      .sort({ createdAt: -1 })
      .lean();

    // Mark as read by buyer
    await ListingQuestion.updateMany(
      { buyer: req.user.id, isReadByBuyer: false },
      { $set: { isReadByBuyer: true } }
    );

    return res.status(200).json({
      count: questions.length,
      questions,
    });
  } catch (err) {
    console.error("Get my questions error:", err.message);
    return res.status(500).json({ message: "Failed to retrieve your questions." });
  }
});

/**
 * GET /api/questions/listing/:listingId
 * Retrieve questions for a specific listing (authorized to buyer or seller)
 */
router.get("/listing/:listingId", authenticate, async (req, res) => {
  const { listingId } = req.params;
  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    return res.status(400).json({ message: "A valid listing ID is required." });
  }

  try {
    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: "Listing not found." });
    }

    const isSeller = listing.seller.toString() === req.user.id.toString();
    const isAdmin = req.user.role === "admin";

    const query = { listing: listingId };
    if (!isSeller && !isAdmin) {
      // Buyer can only view their own questions on this listing
      query.buyer = req.user.id;
    }

    const questions = await ListingQuestion.find(query)
      .populate("buyer", "name")
      .populate("seller", "name")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      count: questions.length,
      questions,
    });
  } catch (err) {
    console.error("Get listing questions error:", err.message);
    return res.status(500).json({ message: "Failed to retrieve questions." });
  }
});

/**
 * POST /api/questions/:id/reply
 * Seller submits an explicit reply to a buyer's question
 */
router.post("/:id/reply", authenticate, async (req, res) => {
  const { id } = req.params;
  const { answer } = req.body;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "A valid question ID is required." });
  }

  const cleanAnswer = String(answer || "").trim();
  if (cleanAnswer.length < 2) {
    return res.status(400).json({ message: "Reply answer must be at least 2 characters long." });
  }

  if (cleanAnswer.length > 1000) {
    return res.status(400).json({ message: "Reply answer cannot exceed 1000 characters." });
  }

  try {
    const question = await ListingQuestion.findById(id).populate("listing", "title seller");
    if (!question) {
      return res.status(404).json({ message: "Question not found." });
    }

    // Only the authorized seller or admin can reply
    const isSeller = question.seller.toString() === req.user.id.toString();
    const isAdmin = req.user.role === "admin";
    if (!isSeller && !isAdmin) {
      return res.status(403).json({
        message: "You are not authorized to reply to questions for this listing.",
      });
    }

    question.answer = cleanAnswer;
    question.status = "ANSWERED";
    question.answeredAt = new Date();
    question.isReadByBuyer = false;
    await question.save();

    const populated = await ListingQuestion.findById(question._id)
      .populate("listing", "title category currentPrice startingPrice imageUrl status")
      .populate("buyer", "name")
      .populate("seller", "name");

    // Notify the original buyer
    try {
      await notificationService.createNotification({
        recipient: question.buyer,
        type: "QUESTION_ANSWERED",
        title: "Seller Replied to Your Question",
        message: `Seller replied on "${question.listing?.title || "item"}": "${cleanAnswer.slice(0, 80)}..."`,
        listing: question.listing?._id,
        question: question._id,
      });

      // Emit real-time event to buyer's secure private room
      socketService.emitToUser(question.buyer, "question:answered", populated);
    } catch (notifErr) {
      console.error("Reply notification error:", notifErr.message);
    }

    return res.status(200).json({
      message: "Reply sent successfully.",
      question: populated,
    });
  } catch (err) {
    console.error("Reply question error:", err.message);
    return res.status(500).json({ message: "Failed to reply to question." });
  }
});

module.exports = router;
