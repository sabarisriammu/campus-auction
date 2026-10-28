const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const secondChanceService = require("../services/secondChanceService");

/**
 * GET /api/listings/:id/second-chance/candidates
 * Retrieve ranked eligible bidders for a listing
 */
router.get("/listings/:id/second-chance/candidates", authenticate, async (req, res) => {
  try {
    const data = await secondChanceService.getRankedEligibleBidders(req.params.id);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

/**
 * POST /api/listings/:id/second-chance
 * Create a second-chance offer for a candidate bidder
 */
router.post("/listings/:id/second-chance", authenticate, async (req, res) => {
  try {
    const { candidateBidderId, durationHours } = req.body;
    const offer = await secondChanceService.createSecondChanceOffer(
      req.params.id,
      req.user,
      { candidateBidderId, durationHours }
    );
    return res.status(201).json({
      message: "Second-chance offer created and candidate notified successfully!",
      offer,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

/**
 * GET /api/second-chance/my-offers
 * Retrieve active offers for the authenticated user
 */
router.get("/second-chance/my-offers", authenticate, async (req, res) => {
  try {
    const offers = await secondChanceService.getBuyerOffers(req.user.id);
    return res.status(200).json({ count: offers.length, offers });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

/**
 * PATCH /api/second-chance/:id/accept
 * Candidate accepts the second-chance offer
 */
router.patch("/second-chance/:id/accept", authenticate, async (req, res) => {
  try {
    const result = await secondChanceService.acceptSecondChanceOffer(req.params.id, req.user);
    return res.status(200).json({
      message: "Second-chance offer accepted! Handover coordination is now open.",
      ...result,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

/**
 * PATCH /api/second-chance/:id/decline
 * Candidate declines the second-chance offer
 */
router.patch("/second-chance/:id/decline", authenticate, async (req, res) => {
  try {
    const { reason } = req.body;
    const offer = await secondChanceService.declineSecondChanceOffer(req.params.id, req.user, reason);
    return res.status(200).json({
      message: "Second-chance offer declined.",
      offer,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

module.exports = router;
