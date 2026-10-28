const mongoose = require("mongoose");
const Notification = require("../models/Notification");

let ioInstance = null;

/**
 * Configure the active Socket.IO server instance
 * @param {object} io
 */
function setIo(io) {
  ioInstance = io;
}

/**
 * Retrieve the active Socket.IO instance
 * @returns {object|null}
 */
function getIo() {
  return ioInstance;
}

/**
 * Creates and persists a notification in MongoDB, then emits live Socket.IO events to the recipient.
 * Safe execution: errors are logged and never throw to the business caller.
 * @param {object} params
 * @param {string|mongoose.Types.ObjectId} params.recipient - User ID of recipient
 * @param {string} params.type - Notification enum type
 * @param {string} params.title - Short title
 * @param {string} params.message - Content message
 * @param {string|mongoose.Types.ObjectId} [params.listing] - Optional related listing ID
 * @param {string|mongoose.Types.ObjectId} [params.bid] - Optional related bid ID
 * @param {string|mongoose.Types.ObjectId} [params.transaction] - Optional related transaction ID
 * @param {boolean} [params.deduplicate=false] - If true, prevents duplicate (type + recipient + listing/transaction)
 * @returns {Promise<Notification|null>}
 */
async function createNotification({
  recipient,
  type,
  title,
  message,
  listing = null,
  bid = null,
  transaction = null,
  deduplicate = false,
  threshold = null,
}) {
  try {
    if (!recipient) return null;

    const recipientId = recipient._id ? recipient._id.toString() : recipient.toString();
    if (!mongoose.Types.ObjectId.isValid(recipientId)) return null;

    // Optional deduplication guard for idempotent auction lifecycle runs
    if (deduplicate && listing) {
      const existingQuery = {
        recipient: recipientId,
        type,
        listing,
      };
      if (threshold) {
        existingQuery.threshold = threshold;
      }
      const existing = await Notification.findOne(existingQuery);
      if (existing) return existing;
    }

    const notification = await Notification.create({
      recipient: recipientId,
      type,
      title: String(title).trim(),
      message: String(message).trim(),
      listing: listing || null,
      bid: bid || null,
      transaction: transaction || null,
      threshold: threshold || null,
      isRead: false,
    });

    // Populate listing / transaction reference for rich payload
    const populated = await Notification.findById(notification._id)
      .populate("listing", "title imageUrl currentPrice status")
      .populate("transaction", "status finalPrice");

    // Real-time Socket.IO emission to the recipient's secure private room
    if (ioInstance) {
      const unreadCount = await Notification.countDocuments({
        recipient: recipientId,
        isRead: false,
      });

      const safePayload = {
        _id: populated._id,
        type: populated.type,
        title: populated.title,
        message: populated.message,
        listing: populated.listing,
        transaction: populated.transaction,
        isRead: populated.isRead,
        createdAt: populated.createdAt,
      };

      ioInstance.to(`user:${recipientId}`).emit("notification:new", safePayload);
      ioInstance.to(`user:${recipientId}`).emit("notification:unread-count", { count: unreadCount });
    }

    return populated;
  } catch (err) {
    console.error("Failed to create/emit notification:", err.message);
    return null;
  }
}

/**
 * Retrieve paginated notifications for the authenticated user
 * @param {string} userId
 * @param {object} options - { page, limit, unreadOnly }
 * @returns {Promise<{ notifications: Notification[], total: number, page: number, totalPages: number, unreadCount: number }>}
 */
async function getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  const query = { recipient: userId };
  if (unreadOnly === true || unreadOnly === "true") {
    query.isRead = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate("listing", "title imageUrl currentPrice status")
      .populate("transaction", "status finalPrice"),
    Notification.countDocuments(query),
    Notification.countDocuments({ recipient: userId, isRead: false }),
  ]);

  return {
    notifications,
    total,
    page: parsedPage,
    totalPages: Math.ceil(total / parsedLimit) || 1,
    unreadCount,
  };
}

/**
 * Retrieve unread count for user badge
 * @param {string} userId
 * @returns {Promise<number>}
 */
async function getUnreadCount(userId) {
  return await Notification.countDocuments({ recipient: userId, isRead: false });
}

/**
 * Mark a single notification as read, verifying ownership
 * @param {string} notificationId
 * @param {string} userId
 * @returns {Promise<Notification>}
 */
async function markNotificationAsRead(notificationId, userId) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    const err = new Error("Invalid notification ID format.");
    err.status = 400;
    throw err;
  }

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    const err = new Error("Notification not found.");
    err.status = 404;
    throw err;
  }

  if (notification.recipient.toString() !== userId.toString()) {
    const err = new Error("Access denied. You cannot modify another user's notification.");
    err.status = 403;
    throw err;
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    // Emit updated unread count
    if (ioInstance) {
      const count = await getUnreadCount(userId);
      ioInstance.to(`user:${userId}`).emit("notification:unread-count", { count });
    }
  }

  return notification;
}

/**
 * Mark all notifications as read for the user
 * @param {string} userId
 * @returns {Promise<{ updatedCount: number }>}
 */
async function markAllNotificationsAsRead(userId) {
  const result = await Notification.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  // Emit 0 unread count
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit("notification:unread-count", { count: 0 });
  }

  return { updatedCount: result.modifiedCount };
}

module.exports = {
  setIo,
  getIo,
  createNotification,
  getUserNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};
