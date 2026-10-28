const Listing = require("../models/Listing");
const mongoose = require("mongoose");

let ioInstance = null;

/**
 * Configure active Socket.IO instance
 * @param {object} io
 */
function setIo(io) {
  ioInstance = io;
}

/**
 * Retrieve active Socket.IO instance
 * @returns {object|null}
 */
function getIo() {
  return ioInstance;
}

/**
 * Broadcast an accepted bid update to the auction room and marketplace
 * @param {string} listingId
 * @param {object} payload
 * payload: {
 *   listingId: string,
 *   currentPrice: number,
 *   nextMinBid: number,
 *   latestBid: { _id, amount, createdAt, bidder: { id, name } },
 *   status: string,
 *   auctionEndTime: Date|string,
 *   totalBidsCount: number,
 * }
 */
function broadcastBidUpdate(listingId, payload) {
  if (!ioInstance) return;
  const room = `auction:${listingId}`;

  // Broadcast to all clients actively viewing this auction details room
  ioInstance.to(room).emit("auction:bid-updated", payload);

  // Broadcast lightweight price update to all connected clients on the marketplace
  ioInstance.emit("listing:price-updated", {
    listingId: payload.listingId,
    currentPrice: payload.currentPrice,
    totalBidsCount: payload.totalBidsCount,
  });
}

/**
 * Broadcast an auction status transition (completed, cancelled, sold, unsold)
 * @param {string} listingId
 * @param {object} payload
 * payload: {
 *   listingId: string,
 *   status: string,
 *   outcome: string|null,
 *   winner: { _id, name }|null,
 *   finalPrice: number|null,
 *   completionTime: Date|null,
 * }
 */
function broadcastStatusUpdate(listingId, payload) {
  if (!ioInstance) return;
  const room = `auction:${listingId}`;

  // Broadcast to room
  ioInstance.to(room).emit("auction:status-updated", payload);

  // Broadcast to marketplace
  ioInstance.emit("listing:status-updated", payload);
}

module.exports = {
  setIo,
  getIo,
  broadcastBidUpdate,
  broadcastStatusUpdate,
};
