const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const path = require("path");
const { io: ClientSocket } = require("socket.io-client");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const User = require("./models/User");
const Listing = require("./models/Listing");
const Bid = require("./models/Bid");
const Transaction = require("./models/Transaction");
const Notification = require("./models/Notification");

const notificationService = require("./services/notificationService");
const socketService = require("./services/socketService");
const { closeExpiredAuction } = require("./services/auctionService");
const bidRoutes = require("./routes/bidRoutes");
const listingRoutes = require("./routes/listingRoutes");

const TEST_PORT = 5055;
const TEST_URL = `http://localhost:${TEST_PORT}`;

async function runSocketBiddingTests() {
  console.log("=========================================================");
  console.log("   CAMPUS AUCTION - REAL-TIME LIVE BIDDING TEST SUITE   ");
  console.log("=========================================================\n");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✓ Connected to MongoDB Atlas");

  // Setup test Express and Socket.IO server
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: { origin: "*" },
  });

  notificationService.setIo(io);
  socketService.setIo(io);

  // Authenticate WebSocket connections using JWT
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        socket.user = null;
        return next();
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");
      if (!user) {
        return next(new Error("Authentication error: User not found."));
      }
      socket.user = {
        id: user._id.toString(),
        name: user.name,
        role: user.role,
      };
      next();
    } catch (err) {
      return next(new Error("Authentication error: Invalid or expired token."));
    }
  });

  io.on("connection", (socket) => {
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }

    socket.on("auction:join", async (data, callback) => {
      try {
        const listingId = data?.listingId || data;
        if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
          if (typeof callback === "function") callback({ success: false, error: "Invalid listing ID format." });
          return;
        }
        const exists = await Listing.exists({ _id: listingId });
        if (!exists) {
          if (typeof callback === "function") callback({ success: false, error: "Auction listing not found." });
          return;
        }
        socket.join(`auction:${listingId}`);
        if (typeof callback === "function") callback({ success: true, room: `auction:${listingId}` });
      } catch (e) {
        if (typeof callback === "function") callback({ success: false, error: e.message });
      }
    });

    socket.on("auction:leave", (data, callback) => {
      const listingId = data?.listingId || data;
      if (listingId && mongoose.Types.ObjectId.isValid(listingId)) {
        socket.leave(`auction:${listingId}`);
        if (typeof callback === "function") callback({ success: true });
      }
    });

    socket.on("bid:place", (_, callback) => {
      if (typeof callback === "function") {
        callback({
          success: false,
          error: "Bids cannot be submitted via Socket.IO. Use the authoritative POST /api/listings/:id/bids REST endpoint.",
        });
      }
    });
  });

  app.use("/api/listings", bidRoutes);
  app.use("/api/listings", listingRoutes);

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test Socket.IO + Express server listening on ${TEST_URL}`);

  const timestamp = Date.now();
  let sellerUser, buyer1User, buyer2User, observerUser;
  let sellerToken, buyer1Token, buyer2Token, observerToken;
  let testListing, cancelTestListing;
  const activeSockets = [];

  try {
    // -----------------------------------------------------------------
    // SETUP: Test Users, JWT Tokens, and Auction Listings
    // -----------------------------------------------------------------
    console.log("\n[1/7] Creating test accounts & JWT credentials...");
    sellerUser = await User.create({
      name: `Seller ${timestamp}`,
      email: `seller_${timestamp}@campus.edu`,
      password: "Password123!",
      role: "seller",
    });

    buyer1User = await User.create({
      name: `Buyer One ${timestamp}`,
      email: `buyer1_${timestamp}@campus.edu`,
      password: "Password123!",
      role: "buyer",
    });

    buyer2User = await User.create({
      name: `Buyer Two ${timestamp}`,
      email: `buyer2_${timestamp}@campus.edu`,
      password: "Password123!",
      role: "buyer",
    });

    observerUser = await User.create({
      name: `Observer ${timestamp}`,
      email: `observer_${timestamp}@campus.edu`,
      password: "Password123!",
      role: "buyer",
    });

    sellerToken = jwt.sign({ id: sellerUser._id, role: sellerUser.role }, process.env.JWT_SECRET);
    buyer1Token = jwt.sign({ id: buyer1User._id, role: buyer1User.role }, process.env.JWT_SECRET);
    buyer2Token = jwt.sign({ id: buyer2User._id, role: buyer2User.role }, process.env.JWT_SECRET);
    observerToken = jwt.sign({ id: observerUser._id, role: observerUser.role }, process.env.JWT_SECRET);

    console.log("✓ Users and verified JWT tokens ready.");

    testListing = await Listing.create({
      title: `iPad Air 5th Gen (Test ${timestamp})`,
      description: "64GB Space Gray in mint condition with box.",
      category: "Electronics",
      condition: "Like New",
      startingPrice: 100,
      currentPrice: 100,
      minBidIncrement: 10,
      auctionEndTime: new Date(Date.now() + 1000 * 60 * 60), // 1 hour future
      seller: sellerUser._id,
      status: "active",
      outcome: null,
    });

    console.log(`✓ Active auction created: "${testListing.title}" (Start: ₹100, Min Inc: ₹10)`);

    // -----------------------------------------------------------------
    // TEST 1: Socket Authentication & Rejection of Malformed Tokens
    // -----------------------------------------------------------------
    console.log("\n[2/7] Testing Socket Connection & JWT Handshake Security...");

    // Test rejection of forged token
    let authFailed = false;
    await new Promise((resolve) => {
      const badSocket = ClientSocket(TEST_URL, {
        auth: { token: "forged.or.invalid.jwt.token" },
        reconnection: false,
      });
      badSocket.on("connect_error", (err) => {
        if (err.message.includes("Authentication error")) {
          authFailed = true;
        }
        badSocket.disconnect();
        resolve();
      });
      badSocket.on("connect", () => {
        badSocket.disconnect();
        resolve();
      });
    });

    if (!authFailed) {
      throw new Error("Socket connection with invalid token was unexpectedly allowed!");
    }
    console.log("✓ Invalid/forged JWT correctly rejected with 'Authentication error'.");

    // Connect authenticated client sockets
    const socketBuyer1 = ClientSocket(TEST_URL, { auth: { token: buyer1Token } });
    const socketBuyer2 = ClientSocket(TEST_URL, { auth: { token: buyer2Token } });
    const socketObserver = ClientSocket(TEST_URL, { auth: { token: observerToken } });
    const socketSeller = ClientSocket(TEST_URL, { auth: { token: sellerToken } });
    activeSockets.push(socketBuyer1, socketBuyer2, socketObserver, socketSeller);

    await Promise.all([
      new Promise((res) => socketBuyer1.on("connect", res)),
      new Promise((res) => socketBuyer2.on("connect", res)),
      new Promise((res) => socketObserver.on("connect", res)),
      new Promise((res) => socketSeller.on("connect", res)),
    ]);
    console.log("✓ All 4 authenticated client sockets connected successfully.");

    // -----------------------------------------------------------------
    // TEST 2: Auction Room Join Validation
    // -----------------------------------------------------------------
    console.log("\n[3/7] Testing Room Subscription & ID Validation...");

    // Try joining with invalid ID
    const badJoinRes = await new Promise((res) => {
      socketBuyer1.emit("auction:join", { listingId: "invalid-id-format" }, res);
    });
    if (badJoinRes.success !== false) {
      throw new Error("Invalid listing ID format should be rejected by auction:join");
    }

    // Try joining with non-existent ObjectId
    const nonExistentId = new mongoose.Types.ObjectId();
    const notFoundRes = await new Promise((res) => {
      socketBuyer1.emit("auction:join", { listingId: nonExistentId.toString() }, res);
    });
    if (notFoundRes.success !== false) {
      throw new Error("Non-existent listing ID should be rejected by auction:join");
    }

    // Join valid auction room for Buyer 1, Buyer 2, and Observer
    const joinRes1 = await new Promise((res) => {
      socketBuyer1.emit("auction:join", { listingId: testListing._id.toString() }, res);
    });
    const joinRes2 = await new Promise((res) => {
      socketBuyer2.emit("auction:join", { listingId: testListing._id.toString() }, res);
    });
    const joinResObs = await new Promise((res) => {
      socketObserver.emit("auction:join", { listingId: testListing._id.toString() }, res);
    });

    if (!joinRes1.success || !joinRes2.success || !joinResObs.success) {
      throw new Error("Valid auction room join failed");
    }
    console.log("✓ Clients successfully joined room 'auction:" + testListing._id + "'.");

    // -----------------------------------------------------------------
    // TEST 3: REST Bid Acceptance & Real-Time Room Broadcast
    // -----------------------------------------------------------------
    console.log("\n[4/7] Testing REST Bidding & Live Broadcast to All Room Viewers...");

    // Set up listeners on Buyer 2 and Observer for the live bid broadcast
    const bidUpdatePromiseBuyer2 = new Promise((resolve) => {
      socketBuyer2.once("auction:bid-updated", (payload) => resolve(payload));
    });
    const bidUpdatePromiseObserver = new Promise((resolve) => {
      socketObserver.once("auction:bid-updated", (payload) => resolve(payload));
    });

    // Also set up private notification listener on Seller for "NEW_BID"
    const sellerNotifPromise = new Promise((resolve) => {
      socketSeller.once("notification:new", (notif) => resolve(notif));
    });

    // Observer should NOT receive any private notification
    let observerGotPrivateNotif = false;
    socketObserver.once("notification:new", () => {
      observerGotPrivateNotif = true;
    });

    // Buyer 1 submits first bid of ₹100 via authoritative REST endpoint
    const bidResponse = await fetch(`${TEST_URL}/api/listings/${testListing._id}/bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${buyer1Token}`,
      },
      body: JSON.stringify({ amount: 100 }),
    });

    const bidData = await bidResponse.json();
    if (bidResponse.status !== 201) {
      throw new Error(`First bid placement failed: ${bidData.message}`);
    }
    console.log("✓ REST bid successfully accepted and committed to MongoDB.");

    // Wait for the Socket.IO broadcasts
    const [payloadBuyer2, payloadObserver, sellerNotif] = await Promise.all([
      bidUpdatePromiseBuyer2,
      bidUpdatePromiseObserver,
      sellerNotifPromise,
    ]);

    // Verify broadcast payload integrity
    if (payloadBuyer2.listingId !== testListing._id.toString()) {
      throw new Error("Broadcast payload listingId mismatch");
    }
    if (payloadBuyer2.currentPrice !== 100) {
      throw new Error(`Expected currentPrice 100, got ${payloadBuyer2.currentPrice}`);
    }
    if (payloadBuyer2.nextMinBid !== 110) {
      throw new Error(`Expected nextMinBid 110 (100 + 10), got ${payloadBuyer2.nextMinBid}`);
    }
    if (payloadBuyer2.latestBid.amount !== 100) {
      throw new Error(`Expected latestBid.amount 100, got ${payloadBuyer2.latestBid?.amount}`);
    }
    if (!payloadBuyer2.latestBid.bidder.name.includes("Buyer One")) {
      throw new Error("Bidder name not correctly populated in live broadcast payload");
    }

    // Verify both passive viewers received identical authoritative payload
    if (JSON.stringify(payloadBuyer2) !== JSON.stringify(payloadObserver)) {
      throw new Error("Discrepancy between payloads received by two independent room viewers");
    }
    console.log("✓ Both viewers received identical 'auction:bid-updated' event in real time.");

    // Verify private notification went strictly to Seller
    if (sellerNotif.type !== "NEW_BID") {
      throw new Error(`Expected Seller notification type NEW_BID, got ${sellerNotif.type}`);
    }
    if (observerGotPrivateNotif) {
      throw new Error("Security leak: Observer received Seller's private notification!");
    }
    console.log("✓ Private notification delivered exclusively to Seller's private room.");

    // -----------------------------------------------------------------
    // TEST 4: Rejected / Invalid Bids Produce Zero Broadcasts
    // -----------------------------------------------------------------
    console.log("\n[5/7] Testing Invalid Bids Do Not Broadcast...");

    let unexpectedBroadcast = false;
    const tempListener = () => { unexpectedBroadcast = true; };
    socketBuyer2.on("auction:bid-updated", tempListener);

    // Attempt 1: Bid below minimum increment (₹105 < required ₹110)
    const lowBidRes = await fetch(`${TEST_URL}/api/listings/${testListing._id}/bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${buyer2Token}`,
      },
      body: JSON.stringify({ amount: 105 }),
    });
    if (lowBidRes.status !== 400) {
      throw new Error("Under-increment bid was not rejected with status 400");
    }

    // Attempt 2: Seller attempting to bid on their own item
    const selfBidRes = await fetch(`${TEST_URL}/api/listings/${testListing._id}/bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({ amount: 200 }),
    });
    if (selfBidRes.status !== 403) {
      throw new Error("Self-bidding was not rejected with status 403");
    }

    // Wait 200ms to confirm no broadcast was emitted
    await new Promise((r) => setTimeout(r, 200));
    socketBuyer2.off("auction:bid-updated", tempListener);

    if (unexpectedBroadcast) {
      throw new Error("Rejected bids erroneously emitted a live bid broadcast!");
    }
    console.log("✓ Rejected bids (under-increment and self-bidding) produced zero live broadcasts.");

    // -----------------------------------------------------------------
    // TEST 5: Outbid Live Event & Outbid Private Notification
    // -----------------------------------------------------------------
    console.log("\n[6/7] Testing Higher Competing Bid & Real-Time Outbid Notification...");

    const buyer2BidPromise = new Promise((resolve) => {
      socketObserver.once("auction:bid-updated", (payload) => resolve(payload));
    });

    // Buyer 1 should receive private OUTBID notification
    const outbidNotifPromise = new Promise((resolve) => {
      socketBuyer1.once("notification:new", (notif) => resolve(notif));
    });

    // Buyer 2 places valid higher bid of ₹120
    const higherBidRes = await fetch(`${TEST_URL}/api/listings/${testListing._id}/bids`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${buyer2Token}`,
      },
      body: JSON.stringify({ amount: 120 }),
    });

    if (higherBidRes.status !== 201) {
      throw new Error("Higher bid placement failed");
    }

    const [higherPayload, outbidNotif] = await Promise.all([
      buyer2BidPromise,
      outbidNotifPromise,
    ]);

    if (higherPayload.currentPrice !== 120 || higherPayload.nextMinBid !== 130) {
      throw new Error("Higher bid payload pricing incorrect");
    }
    if (outbidNotif.type !== "OUTBID") {
      throw new Error(`Expected OUTBID notification, got ${outbidNotif.type}`);
    }
    console.log("✓ Real-time outbid alert dispatched instantly to Buyer 1.");

    // -----------------------------------------------------------------
    // TEST 6: Real-Time Lifecycle Updates (Expiration & Status)
    // -----------------------------------------------------------------
    console.log("\n[7/7] Testing Real-Time Lifecycle Transitions (Sold & Cancelled)...");

    const statusUpdatePromise = new Promise((resolve) => {
      socketObserver.once("auction:status-updated", (payload) => resolve(payload));
    });

    // Set deadline to past and run closeExpiredAuction
    await Listing.updateOne(
      { _id: testListing._id },
      { $set: { auctionEndTime: new Date(Date.now() - 1000) } }
    );

    await closeExpiredAuction(testListing._id.toString());

    const statusPayload = await statusUpdatePromise;
    if (statusPayload.status !== "completed" || statusPayload.outcome !== "sold") {
      throw new Error(`Expected completed/sold status broadcast, got ${statusPayload.status}/${statusPayload.outcome}`);
    }
    if (statusPayload.finalPrice !== 120) {
      throw new Error(`Expected finalPrice 120, got ${statusPayload.finalPrice}`);
    }
    console.log("✓ Auction expiry broadcast 'auction:status-updated' with winner and final price.");

    // Test cancellation broadcast
    cancelTestListing = await Listing.create({
      title: `Temporary Item ${timestamp}`,
      description: "Item to test cancellation broadcast",
      category: "Supplies",
      condition: "Good",
      startingPrice: 30,
      currentPrice: 30,
      minBidIncrement: 5,
      auctionEndTime: new Date(Date.now() + 1000 * 60 * 60),
      seller: sellerUser._id,
      status: "active",
    });

    // Join room for cancel test listing
    await new Promise((res) => {
      socketObserver.emit("auction:join", { listingId: cancelTestListing._id.toString() }, res);
    });

    const cancelPromise = new Promise((resolve) => {
      socketObserver.once("auction:status-updated", (payload) => resolve(payload));
    });

    const cancelRes = await fetch(`${TEST_URL}/api/listings/${cancelTestListing._id}/cancel`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${sellerToken}`,
      },
    });

    if (cancelRes.status !== 200) {
      throw new Error("Cancellation request failed");
    }

    const cancelPayload = await cancelPromise;
    if (cancelPayload.status !== "cancelled") {
      throw new Error(`Expected status 'cancelled', got ${cancelPayload.status}`);
    }
    console.log("✓ Cancellation broadcast 'auction:status-updated' to room.");

    // -----------------------------------------------------------------
    // CLEANUP
    // -----------------------------------------------------------------
    console.log("\nCleaning up test records and closing connections...");
    for (const s of activeSockets) {
      s.disconnect();
    }

    await Notification.deleteMany({
      recipient: { $in: [sellerUser._id, buyer1User._id, buyer2User._id, observerUser._id] },
    });
    await Transaction.deleteMany({
      listing: { $in: [testListing._id, cancelTestListing._id] },
    });
    await Bid.deleteMany({
      listing: { $in: [testListing._id, cancelTestListing._id] },
    });
    await Listing.deleteMany({
      _id: { $in: [testListing._id, cancelTestListing._id] },
    });
    await User.deleteMany({
      _id: { $in: [sellerUser._id, buyer1User._id, buyer2User._id, observerUser._id] },
    });

    await new Promise((res) => server.close(res));
    console.log("✓ Test server closed.");

    console.log("\n=========================================================");
    console.log("   ALL REAL-TIME LIVE BIDDING TESTS PASSED (100% OK)     ");
    console.log("=========================================================");
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
    for (const s of activeSockets) {
      s.disconnect();
    }
    server.close();
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("✓ MongoDB connection closed.");
  }
}

runSocketBiddingTests();
