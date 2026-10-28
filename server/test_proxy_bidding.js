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
const ProxyBid = require("./models/ProxyBid");
const Notification = require("./models/Notification");

const notificationService = require("./services/notificationService");
const socketService = require("./services/socketService");
const bidRoutes = require("./routes/bidRoutes");
const listingRoutes = require("./routes/listingRoutes");

const TEST_PORT = 5056;
const TEST_URL = `http://localhost:${TEST_PORT}`;

async function runProxyBiddingTests() {
  console.log("=========================================================");
  console.log("   CAMPUS AUCTION - PROXY / AUTOMATIC BIDDING TESTS      ");
  console.log("=========================================================\n");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✓ Connected to MongoDB Atlas");

  // Setup test Express and Socket.IO server
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);

  const io = new Server(server, { cors: { origin: "*" } });
  notificationService.setIo(io);
  socketService.setIo(io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next();
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");
      if (user) {
        socket.user = { id: user._id.toString(), name: user.name, role: user.role };
      }
      next();
    } catch {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }
    socket.on("auction:join", async (data, callback) => {
      const listingId = data?.listingId || data;
      if (listingId && mongoose.Types.ObjectId.isValid(listingId)) {
        socket.join(`auction:${listingId}`);
        if (typeof callback === "function") callback({ success: true });
      }
    });
  });

  app.use("/api/listings", bidRoutes);
  app.use("/api/listings", listingRoutes);

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test Socket.IO + Express server listening on ${TEST_URL}`);

  const timestamp = Date.now();
  let sellerUser, buyer1User, buyer2User, buyer3User;
  let sellerToken, buyer1Token, buyer2Token, buyer3Token;
  let activeListing;
  const activeSockets = [];

  const createdUsers = [];
  const createdListings = [];

  try {
    // -----------------------------------------------------------------
    // SETUP: Test Users and Active Auction
    // -----------------------------------------------------------------
    console.log("\n[1/10] Setting up test participants and listing...");
    sellerUser = await User.create({
      name: `Seller ${timestamp}`,
      email: `seller_${timestamp}@campus.edu`,
      password: "HashedPassword123!",
      role: "seller",
    });
    createdUsers.push(sellerUser._id);
    sellerToken = jwt.sign(
      { id: sellerUser._id, role: sellerUser.role, email: sellerUser.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    buyer1User = await User.create({
      name: `Buyer One ${timestamp}`,
      email: `buyer1_${timestamp}@campus.edu`,
      password: "HashedPassword123!",
      role: "buyer",
    });
    createdUsers.push(buyer1User._id);
    buyer1Token = jwt.sign(
      { id: buyer1User._id, role: buyer1User.role, email: buyer1User.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    buyer2User = await User.create({
      name: `Buyer Two ${timestamp}`,
      email: `buyer2_${timestamp}@campus.edu`,
      password: "HashedPassword123!",
      role: "buyer",
    });
    createdUsers.push(buyer2User._id);
    buyer2Token = jwt.sign(
      { id: buyer2User._id, role: buyer2User.role, email: buyer2User.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    buyer3User = await User.create({
      name: `Buyer Three ${timestamp}`,
      email: `buyer3_${timestamp}@campus.edu`,
      password: "HashedPassword123!",
      role: "buyer",
    });
    createdUsers.push(buyer3User._id);
    buyer3Token = jwt.sign(
      { id: buyer3User._id, role: buyer3User.role, email: buyer3User.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    activeListing = await Listing.create({
      title: `Engineering Textbook (${timestamp})`,
      description: "Mint condition second year syllabus book.",
      category: "Textbooks",
      condition: "Like New",
      startingPrice: 100,
      currentPrice: 100,
      minBidIncrement: 10,
      auctionEndTime: new Date(Date.now() + 600000), // 10 minutes in future
      status: "active",
      seller: sellerUser._id,
    });
    createdListings.push(activeListing._id);

    console.log(`✓ Participants created and active auction initialized (Start: ₹100, Increment: ₹10).`);

    // Helper for authenticated HTTP requests
    async function apiRequest(path, method = "GET", body = null, token = null) {
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${TEST_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }

    // -----------------------------------------------------------------
    // TEST 1: Unauthenticated & Seller RBAC Restrictions
    // -----------------------------------------------------------------
    console.log("\n[2/10] Testing RBAC & Authentication Restrictions...");
    // 1. Unauthenticated request
    const unauthRes = await apiRequest(`/api/listings/${activeListing._id}/proxy`, "POST", { maxAmount: 150 });
    if (unauthRes.status !== 401) throw new Error(`Expected 401 for unauthenticated proxy setup, got ${unauthRes.status}`);
    console.log("✓ Unauthenticated proxy request correctly rejected with 401.");

    // 2. Seller trying to proxy bid
    const sellerProxyRes = await apiRequest(`/api/listings/${activeListing._id}/proxy`, "POST", { maxAmount: 150 }, sellerToken);
    if (sellerProxyRes.status !== 403) throw new Error(`Expected 403 for seller configuring proxy, got ${sellerProxyRes.status}`);
    console.log("✓ Seller role rejected from configuring proxy bidding (403 Forbidden).");

    // -----------------------------------------------------------------
    // TEST 2: Validation of Proxy Max Amount
    // -----------------------------------------------------------------
    console.log("\n[3/10] Testing Amount & Floor Validations...");
    // 1. Negative or zero amount
    const invalidAmountRes = await apiRequest(`/api/listings/${activeListing._id}/proxy`, "POST", { maxAmount: -50 }, buyer1Token);
    if (invalidAmountRes.status !== 400) throw new Error(`Expected 400 for negative maxAmount, got ${invalidAmountRes.status}`);

    // 2. Amount below minimum valid starting bid (startingPrice is 100, tried 80)
    const belowMinRes = await apiRequest(`/api/listings/${activeListing._id}/proxy`, "POST", { maxAmount: 80 }, buyer1Token);
    if (belowMinRes.status !== 400) throw new Error(`Expected 400 for maxAmount below startingPrice, got ${belowMinRes.status}`);
    console.log("✓ Amounts below starting price and non-positive numbers rejected (400 Bad Request).");

    // -----------------------------------------------------------------
    // TEST 3: Initial Proxy Setup & Automatic Opening Bid
    // -----------------------------------------------------------------
    console.log("\n[4/10] Testing Initial Proxy Setup & First Automatic Bid...");
    // Buyer 1 sets proxy with max 150 on an auction with 0 bids
    const b1ProxyRes = await apiRequest(`/api/listings/${activeListing._id}/proxy`, "POST", { maxAmount: 150 }, buyer1Token);
    if (b1ProxyRes.status !== 200) throw new Error(`Failed to configure proxy: ${JSON.stringify(b1ProxyRes.data)}`);
    if (!b1ProxyRes.data.proxy?.isActive || b1ProxyRes.data.proxy?.maxAmount !== 150) {
      throw new Error("Proxy configuration was not saved properly.");
    }

    // Verify Buyer 1 automatically opened the auction at starting price ₹100
    const bidsAfterB1 = await Bid.find({ listing: activeListing._id }).sort({ amount: -1 });
    if (bidsAfterB1.length !== 1 || bidsAfterB1[0].amount !== 100 || bidsAfterB1[0].bidder.toString() !== buyer1User._id.toString()) {
      throw new Error(`Expected Buyer 1 to automatically place starting bid of ₹100, got ${JSON.stringify(bidsAfterB1)}`);
    }
    console.log("✓ Buyer 1 proxy configured with max ₹150; automatic opening bid placed at ₹100.");

    // -----------------------------------------------------------------
    // TEST 4: Privacy & Security Checks (No Leaks)
    // -----------------------------------------------------------------
    console.log("\n[5/10] Testing Privacy & Data Isolation...");
    // 1. Buyer 2 queries proxy endpoint -> must return null
    const b2ProxyView = await apiRequest(`/api/listings/${activeListing._id}/proxy`, "GET", null, buyer2Token);
    if (b2ProxyView.data.proxy !== null) {
      throw new Error(`Buyer 2 should not see Buyer 1's proxy! Got: ${JSON.stringify(b2ProxyView.data)}`);
    }

    // 2. Public bid history must NOT leak maxAmount
    const publicBidHistory = await apiRequest(`/api/listings/${activeListing._id}/bids`, "GET");
    const serializedHistory = JSON.stringify(publicBidHistory.data);
    if (serializedHistory.includes("maxAmount") || serializedHistory.includes("150")) {
      throw new Error("Public bid history leaked private proxy limit!");
    }
    console.log("✓ Buyer 1's max limit is completely private and not exposed to other buyers or public APIs.");

    // -----------------------------------------------------------------
    // TEST 5: Competing Manual Bid Triggers Automatic Counter-Bid
    // -----------------------------------------------------------------
    console.log("\n[6/10] Testing Automatic Counter-Response to Competing Bid...");
    // Current price is ₹100, min increment is ₹10. Buyer 2 manually bids ₹110.
    const b2ManualBid = await apiRequest(`/api/listings/${activeListing._id}/bids`, "POST", { amount: 110 }, buyer2Token);
    if (b2ManualBid.status !== 201) throw new Error(`Buyer 2 manual bid failed: ${JSON.stringify(b2ManualBid.data)}`);

    // Buyer 1's proxy (max 150) should automatically counter with ₹120!
    const bidsAfterCounter = await Bid.find({ listing: activeListing._id }).sort({ createdAt: 1 });
    // Bids should be: [100 (B1), 110 (B2), 120 (B1 auto)]
    if (bidsAfterCounter.length !== 3) {
      throw new Error(`Expected 3 bids after counter, got ${bidsAfterCounter.length}`);
    }
    const latestBid = bidsAfterCounter[2];
    if (latestBid.amount !== 120 || latestBid.bidder.toString() !== buyer1User._id.toString()) {
      throw new Error(`Expected Buyer 1 automatic counter of ₹120, got ₹${latestBid.amount} by ${latestBid.bidder}`);
    }

    const updatedListing = await Listing.findById(activeListing._id);
    if (updatedListing.currentPrice !== 120) {
      throw new Error(`Listing currentPrice should be ₹120, got ₹${updatedListing.currentPrice}`);
    }
    console.log("✓ Competing manual bid of ₹110 triggered immediate automatic counter-bid of ₹120 for Buyer 1.");

    // -----------------------------------------------------------------
    // TEST 6: Competing Bid Exceeds Proxy Limit & Notification
    // -----------------------------------------------------------------
    console.log("\n[7/10] Testing Competing Bid Exceeding Proxy Limit...");
    // Buyer 2 places a high bid of ₹160 (which exceeds Buyer 1's max of ₹150)
    const b2HighBid = await apiRequest(`/api/listings/${activeListing._id}/bids`, "POST", { amount: 160 }, buyer2Token);
    if (b2HighBid.status !== 201) throw new Error(`Buyer 2 bid of ₹160 failed: ${JSON.stringify(b2HighBid.data)}`);

    // Buyer 1's proxy cannot bid above ₹150. No new automatic bids should be added.
    const bidsAfterHigh = await Bid.find({ listing: activeListing._id }).sort({ createdAt: 1 });
    if (bidsAfterHigh.length !== 4) {
      throw new Error(`Expected 4 bids total (no counter above limit), got ${bidsAfterHigh.length}`);
    }
    if (bidsAfterHigh[3].amount !== 160 || bidsAfterHigh[3].bidder.toString() !== buyer2User._id.toString()) {
      throw new Error("Buyer 2 should be the current leader at ₹160.");
    }

    // Verify Buyer 1 received outbid / limit reached notification
    const b1Notifs = await Notification.find({ recipient: buyer1User._id, listing: activeListing._id });
    const hasOutbid = b1Notifs.some((n) => n.type === "OUTBID" || n.type === "PROXY_LIMIT_REACHED");
    if (!hasOutbid) throw new Error("Buyer 1 was not notified when proxy limit was exceeded.");
    console.log("✓ Bid above proxy limit correctly stops automatic bidding and dispatches outbid alert.");

    // -----------------------------------------------------------------
    // TEST 7: Proxy-vs-Proxy Competition & Equal Max Tie-Break Policy
    // -----------------------------------------------------------------
    console.log("\n[8/10] Testing Proxy vs Proxy & Equal Maximum Tie-Break Rule...");
    // Create a fresh test listing for clean competition
    const tieListing = await Listing.create({
      title: `Vintage Camera (${timestamp})`,
      description: "Classic SLR camera.",
      category: "Electronics",
      condition: "Good",
      startingPrice: 200,
      currentPrice: 200,
      minBidIncrement: 10,
      auctionEndTime: new Date(Date.now() + 600000),
      status: "active",
      seller: sellerUser._id,
    });
    createdListings.push(tieListing._id);

    // Buyer 1 sets proxy with max 300 (registered first)
    await apiRequest(`/api/listings/${tieListing._id}/proxy`, "POST", { maxAmount: 300 }, buyer1Token);

    // Give a 50ms pause to ensure distinct creation timestamps
    await new Promise((r) => setTimeout(r, 50));

    // Buyer 2 sets proxy with IDENTICAL max of 300 (registered second)
    await apiRequest(`/api/listings/${tieListing._id}/proxy`, "POST", { maxAmount: 300 }, buyer2Token);

    // Under the deterministic tie rule: Buyer 1 (first to activate) wins the tie at ₹300!
    const tieBids = await Bid.find({ listing: tieListing._id }).sort({ createdAt: 1 });
    const highestTieBid = tieBids[tieBids.length - 1];

    if (highestTieBid.amount !== 300) {
      throw new Error(`Expected winning bid of ₹300, got ₹${highestTieBid.amount}`);
    }
    if (highestTieBid.bidder.toString() !== buyer1User._id.toString()) {
      throw new Error(`Tie-breaker failed: Expected earlier registrant Buyer 1 to win, got ${highestTieBid.bidder}`);
    }
    console.log("✓ Deterministic tie-breaking verified: Earlier proxy activation wins tie at maximum limit.");

    // -----------------------------------------------------------------
    // TEST 8: Disabling Proxy Does Not Retract Existing Bids
    // -----------------------------------------------------------------
    console.log("\n[9/10] Testing Proxy Disabling & Bid Retention...");
    const disableRes = await apiRequest(`/api/listings/${tieListing._id}/proxy`, "DELETE", null, buyer1Token);
    if (disableRes.status !== 200) throw new Error(`Disable proxy failed: ${JSON.stringify(disableRes.data)}`);

    // Verify proxy is disabled in DB
    const disabledProxy = await ProxyBid.findOne({ listing: tieListing._id, buyer: buyer1User._id });
    if (disabledProxy.isActive !== false) throw new Error("Proxy isActive should be false.");

    // Verify Buyer 1's winning bid is STILL on the ledger
    const remainingBids = await Bid.find({ listing: tieListing._id, bidder: buyer1User._id });
    if (remainingBids.length === 0) throw new Error("Disabling proxy should NOT delete accepted bids!");
    console.log("✓ Disabling proxy marked isActive: false while preserving all previously placed bids.");

    // -----------------------------------------------------------------
    // TEST 9: Ended Auction Rejects Proxy Modifications
    // -----------------------------------------------------------------
    console.log("\n[10/10] Testing Ended Auction Rejection...");
    await Listing.updateOne({ _id: tieListing._id }, { $set: { status: "completed", auctionEndTime: new Date(Date.now() - 1000) } });
    const endedRes = await apiRequest(`/api/listings/${tieListing._id}/proxy`, "POST", { maxAmount: 400 }, buyer1Token);
    if (endedRes.status !== 400) throw new Error(`Expected 400 when setting proxy on ended auction, got ${endedRes.status}`);
    console.log("✓ Modifications to ended/completed auctions strictly rejected (400 Bad Request).");

  } finally {
    console.log("\nCleaning up test data and stopping server...");
    for (const socket of activeSockets) {
      socket.disconnect();
    }
    if (createdListings.length > 0) {
      await Listing.deleteMany({ _id: { $in: createdListings } });
      await Bid.deleteMany({ listing: { $in: createdListings } });
      await ProxyBid.deleteMany({ listing: { $in: createdListings } });
      await Notification.deleteMany({ listing: { $in: createdListings } });
    }
    if (createdUsers.length > 0) {
      await User.deleteMany({ _id: { $in: createdUsers } });
    }
    await new Promise((resolve) => server.close(resolve));
    console.log("✓ Test server closed.");
  }

  console.log("\n=========================================================");
  console.log("   ALL PROXY / AUTOMATIC BIDDING TESTS PASSED (100% OK)  ");
  console.log("=========================================================");
  await mongoose.connection.close();
  console.log("✓ MongoDB connection closed.");
}

runProxyBiddingTests().catch((err) => {
  console.error("\n❌ PROXY BIDDING TEST RUNNER FAILED:", err);
  process.exit(1);
});
