const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authMiddleware");
const notificationService = require("../services/notificationService");

/**
 * GET /api/notifications
 * Retrieve paginated notifications for the authenticated user (newest first).
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const { page, limit, unreadOnly } = req.query;
    const result = await notificationService.getUserNotifications(req.user.id, {
      page,
      limit,
      unreadOnly,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error("GET /api/notifications error:", error.message);
    return res.status(error.status || 500).json({
      message: error.message || "Failed to retrieve notifications.",
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Retrieve current unread notifications badge count.
 */
router.get("/unread-count", authenticate, async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    return res.status(200).json({ count });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Failed to retrieve unread notification count.",
    });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications for the authenticated user as read.
 */
router.patch("/read-all", authenticate, async (req, res) => {
  try {
    const { updatedCount } = await notificationService.markAllNotificationsAsRead(req.user.id);
    return res.status(200).json({
      message: "All notifications marked as read.",
      updatedCount,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Failed to mark all notifications as read.",
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
router.patch("/:id/read", authenticate, async (req, res) => {
  try {
    const notification = await notificationService.markNotificationAsRead(
      req.params.id,
      req.user.id
    );
    return res.status(200).json({
      message: "Notification marked as read.",
      notification,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Failed to mark notification as read.",
    });
  }
});

module.exports = router;
