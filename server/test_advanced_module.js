const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const User = require("./models/User");
const Listing = require("./models/Listing");
const Bid = require("./models/Bid");
const Transaction = require("./models/Transaction");
const Notification = require("./models/Notification");
const SecondChanceOffer = require("./models/SecondChanceOffer");
const Watchlist = require("./models/Watchlist");

const { recordOutcome } = require("./services/transactionService");
const {
  getRankedEligibleBidders,
  createSecondChanceOffer,
  acceptSecondChanceOffer,
  declineSecondChanceOffer,
} = require("./services/secondChanceService");
const { processAuctionReminders } = require("./services/reminderService");

async function runTests() {
  console.log("=================================================");
  console.log("   CAMPUS AUCTION - ADVANCED MODULE TEST SUITE   ");
  console.log("=================================================\n");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✓ Connected to MongoDB Atlas");

  // Ensure old unique index on listing in transactions collection is removed
  try {
    const txIndexes = await mongoose.connection.collection("transactions").indexes();
    const listingUniqueIdx = txIndexes.find((idx) => idx.name === "listing_1" && idx.unique);
    if (listingUniqueIdx) {
      await mongoose.connection.collection("transactions").dropIndex("listing_1");
      await mongoose.connection.collection("transactions").createIndex({ listing: 1 });
      console.log("✓ Migrated transactions.listing index to non-unique.");
    }
  } catch (idxErr) {
    // Ignore if not present
  }

  const timestamp = Date.now();
  let sellerUser, buyer1User, buyer2User, testListing, testTransaction;

  try {
    // ----------------------------------------------------
    // SETUP: Users & Initial Listing
    // ----------------------------------------------------
    console.log("\n[1/5] Setting up test participants and auction...");
    sellerUser = await User.create({
      name: `Seller ${timestamp}`,
      email: `seller_${timestamp}@campus.edu`,
      password: "Password123!",
      role: "seller",
    });

    buyer1User = await User.create({
      name: `Runner-Up Buyer ${timestamp}`,
      email: `buyer1_${timestamp}@campus.edu`,
      password: "Password123!",
      role: "buyer",
    });

    buyer2User = await User.create({
      name: `Winning Buyer ${timestamp}`,
      email: `buyer2_${timestamp}@campus.edu`,
      password: "Password123!",
      role: "buyer",
    });

    console.log("✓ Test users created (Seller, Buyer 1 Runner-Up, Buyer 2 Winner)");

    testListing = await Listing.create({
      title: `Calculus 10th Ed Textbook [Test ${timestamp}]`,
      description: "Hardcover university calculus textbook in good condition.",
      category: "Textbooks",
      condition: "Good",
      startingPrice: 50,
      currentPrice: 150,
      minBidIncrement: 10,
      auctionEndTime: new Date(Date.now() + 1000 * 60 * 60), // Valid future date at creation
      seller: sellerUser._id,
      winner: buyer2User._id,
      finalPrice: 150,
      status: "completed",
      outcome: "sold",
    });

    // Place historical bids: buyer1 at 100 and 120, buyer2 at 150
    await Bid.create({
      listing: testListing._id,
      bidder: buyer1User._id,
      amount: 100,
      createdAt: new Date(Date.now() - 30000),
    });
    const runnerUpBid = await Bid.create({
      listing: testListing._id,
      bidder: buyer1User._id,
      amount: 120,
      createdAt: new Date(Date.now() - 20000),
    });
    await Bid.create({
      listing: testListing._id,
      bidder: buyer2User._id,
      amount: 150,
      createdAt: new Date(Date.now() - 10000),
    });

    // Create Initial Handover Transaction
    testTransaction = await Transaction.create({
      listing: testListing._id,
      seller: sellerUser._id,
      buyer: buyer2User._id,
      finalPrice: 150,
      status: "PENDING",
      history: [
        {
          action: "CREATED",
          performedBy: sellerUser._id,
          timestamp: new Date(),
          previousStatus: null,
          newStatus: "PENDING",
          notes: "Transaction created upon auction conclusion.",
        },
      ],
    });

    console.log("✓ Initial auction, bids, and pending transaction created.");

    // ----------------------------------------------------
    // TEST 1: Explicit Transaction Outcomes & Audit History
    // ----------------------------------------------------
    console.log("\n[2/5] Testing Explicit Transaction Outcomes (CANCELLED / FAILED)...");
    
    // Test recording outcome: Seller marks FAILED due to BUYER_NO_SHOW
    const failedTx = await recordOutcome(
      testTransaction._id,
      { id: sellerUser._id.toString(), role: "seller", name: sellerUser.name },
      {
        outcomeType: "FAILED",
        reason: "BUYER_NO_SHOW: Buyer failed to meet at Student Center lobby after 30 minute wait.",
      }
    );

    if (failedTx.status !== "FAILED") {
      throw new Error(`Expected transaction status FAILED, got ${failedTx.status}`);
    }
    if (!failedTx.outcomeReason.includes("BUYER_NO_SHOW")) {
      throw new Error(`Expected outcomeReason to contain BUYER_NO_SHOW, got ${failedTx.outcomeReason}`);
    }
    if (!failedTx.outcomeInitiatedBy.equals(sellerUser._id)) {
      throw new Error("Expected outcomeInitiatedBy to match seller");
    }
    if (!failedTx.history || failedTx.history.length < 2) {
      throw new Error("Expected audit history to contain initial and outcome entries");
    }

    const lastEntry = failedTx.history[failedTx.history.length - 1];
    if (lastEntry.action !== "OUTCOME_RECORDED" || lastEntry.newStatus !== "FAILED") {
      throw new Error("Last audit history entry must be OUTCOME_RECORDED with status FAILED");
    }

    console.log("✓ Handover outcome FAILED successfully recorded with persistent audit history.");

    // ----------------------------------------------------
    // TEST 2: Second-Chance Winner Fallback Workflow
    // ----------------------------------------------------
    console.log("\n[3/5] Testing Second-Chance Fallback Service...");

    // Fetch ranked candidates
    const candidatesResult = await getRankedEligibleBidders(testListing._id);
    if (!candidatesResult.candidates || candidatesResult.candidates.length !== 1) {
      throw new Error(
        `Expected 1 eligible candidate (buyer1), found ${candidatesResult.candidates?.length}`
      );
    }

    const topCandidate = candidatesResult.candidates[0];
    if (topCandidate.bidder._id.toString() !== buyer1User._id.toString()) {
      throw new Error("Rank #1 candidate must be Buyer 1");
    }
    if (topCandidate.highestBid !== 120) {
      throw new Error(`Expected highest bid 120, got ${topCandidate.highestBid}`);
    }
    console.log("✓ Ranked runner-up bidder successfully identified (Buyer 1 at ₹120).");

    // Create Second-Chance Offer to buyer1
    const offer = await createSecondChanceOffer(
      testListing._id,
      { id: sellerUser._id.toString(), role: "seller" },
      { candidateBidderId: buyer1User._id.toString(), durationHours: 24 }
    );

    if (offer.status !== "OFFERED") {
      throw new Error(`Expected offer status OFFERED, got ${offer.status}`);
    }
    if (offer.offerPrice !== 120) {
      throw new Error(`Expected offerPrice 120, got ${offer.offerPrice}`);
    }
    console.log("✓ Second-chance offer successfully created and candidate notified.");

    // Duplicate offer prevention check:
    let caughtConflict = false;
    try {
      await createSecondChanceOffer(
        testListing._id,
        { id: sellerUser._id.toString(), role: "seller" },
        { candidateBidderId: buyer1User._id.toString(), durationHours: 24 }
      );
    } catch (e) {
      if (e.status === 409) caughtConflict = true;
    }
    if (!caughtConflict) {
      throw new Error("Duplicate active second chance offer should be rejected with 409 Conflict");
    }
    console.log("✓ Concurrent/duplicate second-chance offer correctly blocked (409 Conflict).");

    // Candidate buyer1 accepts the second-chance offer
    const acceptResult = await acceptSecondChanceOffer(offer._id, {
      id: buyer1User._id.toString(),
      name: buyer1User.name,
      role: "buyer",
    });

    if (acceptResult.offer.status !== "ACCEPTED") {
      throw new Error(`Expected accepted offer status, got ${acceptResult.offer.status}`);
    }
    if (!acceptResult.listing.winner.equals(buyer1User._id)) {
      throw new Error("Listing winner was not updated to Buyer 1 on offer acceptance");
    }
    if (acceptResult.listing.finalPrice !== 120) {
      throw new Error("Listing finalPrice was not updated to 120 on offer acceptance");
    }
    if (!acceptResult.transaction || acceptResult.transaction.status !== "PENDING") {
      throw new Error("New handover transaction was not created in PENDING status for new winner");
    }
    console.log("✓ Second-chance offer accepted: Listing winner reassigned and new handover opened.");

    // ----------------------------------------------------
    // TEST 3: Relist Auction Lineage & Integrity
    // ----------------------------------------------------
    console.log("\n[4/5] Testing Relisting Workflow & Lineage Tracking...");

    const relistedListing = await Listing.create({
      title: testListing.title,
      description: testListing.description,
      category: testListing.category,
      condition: testListing.condition,
      startingPrice: 40,
      currentPrice: 40,
      minBidIncrement: 5,
      auctionEndTime: new Date(Date.now() + 1000 * 60 * 60 * 48), // 48h future
      seller: sellerUser._id,
      status: "active",
      outcome: null,
      isRelisted: true,
      relistedFrom: testListing._id,
    });

    testListing.relistedTo = relistedListing._id;
    await testListing.save();

    const verifiedRelisted = await Listing.findById(relistedListing._id);
    if (!verifiedRelisted.isRelisted || !verifiedRelisted.relistedFrom.equals(testListing._id)) {
      throw new Error("Relisted item missing relistedFrom pointer or isRelisted flag");
    }
    const verifiedOriginal = await Listing.findById(testListing._id);
    if (!verifiedOriginal.relistedTo.equals(relistedListing._id)) {
      throw new Error("Original item missing relistedTo pointer");
    }
    console.log("✓ Relisted auction created with bidirectional lineage (relistedFrom / relistedTo).");

    // ----------------------------------------------------
    // TEST 4: Buyer Watchlist & Ending Reminders (15m & 5m)
    // ----------------------------------------------------
    console.log("\n[5/5] Testing Buyer Watchlist & Auction Ending Reminders...");

    // Watchlist persistence
    await Watchlist.findOneAndUpdate(
      { user: buyer1User._id, listing: relistedListing._id },
      { $setOnInsert: { user: buyer1User._id, listing: relistedListing._id } },
      { upsert: true, new: true }
    );
    const savedEntry = await Watchlist.findOne({ user: buyer1User._id, listing: relistedListing._id });
    if (!savedEntry) {
      throw new Error("Watchlist entry not found");
    }
    console.log("✓ Listing bookmarked to Buyer Watchlist with MongoDB persistence.");

    // Test 15-Minute Auction Ending Reminder
    // Set relisted listing auctionEndTime to 10 minutes from now (between 5m and 15m)
    relistedListing.auctionEndTime = new Date(Date.now() + 10 * 60 * 1000);
    await relistedListing.save();

    await processAuctionReminders();

    const notif15m = await Notification.findOne({
      recipient: buyer1User._id,
      type: "AUCTION_REMINDER",
      listing: relistedListing._id,
      threshold: "15m",
    });
    if (!notif15m) {
      throw new Error("15-minute ending reminder notification was not created");
    }
    console.log(`✓ 15-minute reminder dispatched: "${notif15m.title}"`);

    // Deduplication check: Running processAuctionReminders() again should NOT duplicate 15m notif
    await processAuctionReminders();
    const count15m = await Notification.countDocuments({
      recipient: buyer1User._id,
      type: "AUCTION_REMINDER",
      listing: relistedListing._id,
      threshold: "15m",
    });
    if (count15m !== 1) {
      throw new Error(`Deduplication failed: Expected exactly 1 15m reminder, found ${count15m}`);
    }
    console.log("✓ 15-minute reminder deduplication verified (no duplicate dispatched).");

    // Test 5-Minute Auction Ending Reminder
    // Set auctionEndTime to 3 minutes from now (<= 5m)
    relistedListing.auctionEndTime = new Date(Date.now() + 3 * 60 * 1000);
    await relistedListing.save();

    await processAuctionReminders();

    const notif5m = await Notification.findOne({
      recipient: buyer1User._id,
      type: "AUCTION_REMINDER",
      listing: relistedListing._id,
      threshold: "5m",
    });
    if (!notif5m) {
      throw new Error("5-minute ending reminder notification was not created");
    }
    console.log(`✓ 5-minute reminder dispatched: "${notif5m.title}"`);

    // Deduplication check for 5m
    await processAuctionReminders();
    const count5m = await Notification.countDocuments({
      recipient: buyer1User._id,
      type: "AUCTION_REMINDER",
      listing: relistedListing._id,
      threshold: "5m",
    });
    if (count5m !== 1) {
      throw new Error(`Deduplication failed: Expected exactly 1 5m reminder, found ${count5m}`);
    }
    console.log("✓ 5-minute reminder deduplication verified (no duplicate dispatched).");

    // ----------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------
    console.log("\nCleaning up test data...");
    await Notification.deleteMany({
      recipient: { $in: [sellerUser._id, buyer1User._id, buyer2User._id] },
    });
    await Watchlist.deleteMany({
      user: { $in: [sellerUser._id, buyer1User._id, buyer2User._id] },
    });
    await SecondChanceOffer.deleteMany({
      listing: { $in: [testListing._id, relistedListing._id] },
    });
    await Transaction.deleteMany({
      listing: { $in: [testListing._id, relistedListing._id] },
    });
    await Bid.deleteMany({
      listing: { $in: [testListing._id, relistedListing._id] },
    });
    await Listing.deleteMany({
      _id: { $in: [testListing._id, relistedListing._id] },
    });
    await User.deleteMany({
      _id: { $in: [sellerUser._id, buyer1User._id, buyer2User._id] },
    });
    console.log("✓ Test records cleaned up successfully.");

    console.log("\n=================================================");
    console.log("   ALL ADVANCED MODULE TESTS PASSED (100% OK)   ");
    console.log("=================================================");
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("✓ MongoDB connection closed.");
  }
}

runTests();
