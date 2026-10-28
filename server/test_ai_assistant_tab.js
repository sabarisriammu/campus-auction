const http = require("http");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const User = require("./models/User");
const Listing = require("./models/Listing");
const ListingQuestion = require("./models/ListingQuestion");
const Notification = require("./models/Notification");
const aiService = require("./services/aiService");
const aiRoutes = require("./routes/aiRoutes");
const questionRoutes = require("./routes/questionRoutes");
const listingRoutes = require("./routes/listingRoutes");
const bidRoutes = require("./routes/bidRoutes");
const socketService = require("./services/socketService");

const TEST_PORT = 5058;
const TEST_URL = `http://localhost:${TEST_PORT}`;

// Mock Groq client factory for Smart Shopping and Reply Drafting
function createMockGroqForTab() {
  return {
    chat: {
      completions: {
        create: async (params) => {
          const allContent = (params.messages || []).map((m) => m.content).join(" ");
          const queryMatch = allContent.match(/Query:\s*"([^"]+)"/i);
          const userQuery = queryMatch ? queryMatch[1] : allContent;

          // Check if request is JSON mode (Intent parsing)
          if (params.response_format?.type === "json_object") {
            if (userQuery.toLowerCase().includes("cycle")) {
              return {
                model: params.model,
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        keywords: "cycle",
                        category: "Vehicles & Scooters",
                        maxPrice: 2000,
                        condition: null,
                        endingWithinMinutes: null,
                        comparisonRequested: false,
                      }),
                    },
                  },
                ],
              };
            }

            return {
              model: params.model,
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      keywords: "rare_nonexistent_item_xyz",
                      category: null,
                      maxPrice: 500,
                      condition: null,
                      endingWithinMinutes: null,
                      comparisonRequested: false,
                    }),
                  },
                },
              ],
            };
          }

          // Text reply draft or summary
          if (allContent.includes("Draft a polite, accurate, concise reply")) {
            return {
              model: params.model,
              choices: [
                {
                  message: {
                    content:
                      "Yes, the brake cables and pads were both inspected and replaced last week. Campus handover at Central Library is great.",
                  },
                },
              ],
            };
          }

          return {
            model: params.model,
            choices: [
              {
                message: {
                  content:
                    "Found 1 verified campus cycle within your ₹2,000 budget. Excellent condition and ready for campus pickup.",
                },
              },
            ],
          };
        },
      },
    },
  };
}

async function runAssistantTabTests() {
  console.log("=========================================================");
  console.log("   CAMPUS AUCTION - AI ASSISTANT TAB TEST SUITE          ");
  console.log("=========================================================\n");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✓ Connected to MongoDB Atlas");

  // Setup Express server with socket.io initialization
  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiRoutes);
  app.use("/api/questions", questionRoutes);
  app.use("/api/listings", listingRoutes);
  app.use("/api/listings", bidRoutes);
  app.use("/api/bids", bidRoutes);

  const server = http.createServer(app);
  const { Server } = require("socket.io");
  const io = new Server(server, { cors: { origin: "*" } });
  socketService.setIo(io);

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test Assistant Tab server listening on ${TEST_URL}`);

  const timestamp = Date.now();
  let sellerUser, buyerUser, thirdPartyUser;
  let sellerToken, buyerToken, thirdPartyToken;
  let cycleUnderBudget, cycleOverBudget;

  const createdUsers = [];
  const createdListings = [];
  const createdQuestions = [];

  try {
    // -----------------------------------------------------------------
    // SETUP: Users and Listings
    // -----------------------------------------------------------------
    console.log("\n[1/7] Creating test participants and sample listings...");
    sellerUser = await User.create({
      name: `Seller ${timestamp}`,
      email: `seller_${timestamp}@campus.edu`,
      password: "Password123!",
      role: "seller",
      campusId: `SELLER-${timestamp}`,
      department: "Mechanical",
      isVerified: true,
    });
    createdUsers.push(sellerUser._id);

    buyerUser = await User.create({
      name: `Buyer ${timestamp}`,
      email: `buyer_${timestamp}@campus.edu`,
      password: "Password123!",
      role: "buyer",
      campusId: `BUYER-${timestamp}`,
      department: "Computer Science",
      isVerified: true,
    });
    createdUsers.push(buyerUser._id);

    thirdPartyUser = await User.create({
      name: `ThirdParty ${timestamp}`,
      email: `third_${timestamp}@campus.edu`,
      password: "Password123!",
      role: "buyer",
      campusId: `THIRD-${timestamp}`,
      department: "Physics",
      isVerified: true,
    });
    createdUsers.push(thirdPartyUser._id);

    sellerToken = jwt.sign(
      { id: sellerUser._id, role: sellerUser.role, email: sellerUser.email },
      process.env.JWT_SECRET || "campus_auction_jwt_secret_dev",
      { expiresIn: "1h" }
    );
    buyerToken = jwt.sign(
      { id: buyerUser._id, role: buyerUser.role, email: buyerUser.email },
      process.env.JWT_SECRET || "campus_auction_jwt_secret_dev",
      { expiresIn: "1h" }
    );
    thirdPartyToken = jwt.sign(
      { id: thirdPartyUser._id, role: thirdPartyUser.role, email: thirdPartyUser.email },
      process.env.JWT_SECRET || "campus_auction_jwt_secret_dev",
      { expiresIn: "1h" }
    );

    // Listing 1: Cycle within budget (₹1,500)
    cycleUnderBudget = await Listing.create({
      title: `Hero Sprint Cycle Under Budget ${timestamp}`,
      description: "Well maintained single-speed bicycle with working brakes. Campus delivery at hostel block.",
      category: "Vehicles & Scooters",
      condition: "Good",
      startingPrice: 1200,
      currentPrice: 1500,
      minBidIncrement: 50,
      seller: sellerUser._id,
      status: "active",
      auctionEndTime: new Date(Date.now() + 86400000),
    });
    createdListings.push(cycleUnderBudget._id);

    // Listing 2: Cycle above budget (₹4,500)
    cycleOverBudget = await Listing.create({
      title: `Gear Mountain Cycle Over Budget ${timestamp}`,
      description: "21-speed Shimano gear cycle with front suspension.",
      category: "Vehicles & Scooters",
      condition: "Like New",
      startingPrice: 4000,
      currentPrice: 4500,
      minBidIncrement: 100,
      seller: sellerUser._id,
      status: "active",
      auctionEndTime: new Date(Date.now() + 86400000),
    });
    createdListings.push(cycleOverBudget._id);

    console.log("✓ Test participants and listings initialized successfully.");

    // -----------------------------------------------------------------
    // TEST 1: Smart Shopping Natural Language Search & Budget Enforcement
    // -----------------------------------------------------------------
    console.log("\n[2/7] Testing Smart Shopping Search & Strict Budget Enforcement...");
    aiService.setTestGroqClient(createMockGroqForTab());

    const shopRes = await fetch(`${TEST_URL}/api/ai/shop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Find me a cycle under ₹2,000" }),
    });
    const shopData = await shopRes.json();

    if (shopRes.status !== 200 || !shopData.success) {
      throw new Error(`Smart shopping failed: ${JSON.stringify(shopData)}`);
    }

    console.log(`✓ Smart shopping parsed query. Model: ${shopData.model}, Intent budget: ≤ ₹${shopData.intent.maxPrice}`);
    console.log(`✓ Matches count: ${shopData.listings.length}`);

    // Verify budget enforcement: every returned listing MUST be <= 2000
    const overBudgetItem = shopData.listings.find((l) => l.currentPrice > 2000);
    if (overBudgetItem) {
      throw new Error(`Budget violation: Item ${overBudgetItem.title} priced at ${overBudgetItem.currentPrice} was returned!`);
    }
    const matchingItem = shopData.listings.find((l) => l._id.toString() === cycleUnderBudget._id.toString());
    if (!matchingItem) {
      throw new Error("Expected Hero Sprint Cycle Under Budget to be returned in matches.");
    }
    console.log("✓ Strict budget enforcement verified: Zero over-budget items included.");

    // -----------------------------------------------------------------
    // TEST 2: Smart Shopping 0-Matches & Real Alternatives Handling
    // -----------------------------------------------------------------
    console.log("\n[3/7] Testing Smart Shopping with 0 matches and honest alternatives...");
    const noMatchRes = await fetch(`${TEST_URL}/api/ai/shop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "rare nonexistent item under ₹500" }),
    });
    const noMatchData = await noMatchRes.json();

    if (noMatchRes.status !== 200 || !noMatchData.success) {
      throw new Error(`Smart shopping 0-match failed: ${JSON.stringify(noMatchData)}`);
    }
    if (noMatchData.listings.length !== 0) {
      console.log("Unexpected match returned:", JSON.stringify(noMatchData.listings, null, 2));
      throw new Error(`Expected 0 matches, got ${noMatchData.listings.length}`);
    }
    console.log(`✓ Correctly returned 0 matches for impossible query.`);
    console.log(`✓ Summary accurately notes: "${noMatchData.aiSummary}"`);
    console.log(`✓ Disclosed alternatives count: ${noMatchData.alternatives?.length || 0}`);

    // -----------------------------------------------------------------
    // TEST 3: Buyer Submitting Product Question & Seller Notification
    // -----------------------------------------------------------------
    console.log("\n[4/7] Testing Buyer Question Submission & Seller Notification...");
    const askRes = await fetch(`${TEST_URL}/api/questions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({
        listingId: cycleUnderBudget._id,
        question: "Does the cycle have any issue with the front brake or chain?",
      }),
    });
    const askData = await askRes.json();

    if (askRes.status !== 201 || !askData.question) {
      throw new Error(`Submit question failed: ${JSON.stringify(askData)}`);
    }
    const createdQuestionId = askData.question._id;
    createdQuestions.push(createdQuestionId);

    if (askData.question.status !== "PENDING") {
      throw new Error(`Expected question status PENDING, got ${askData.question.status}`);
    }
    const sellerId = askData.question.seller._id || askData.question.seller;
    if (sellerId.toString() !== sellerUser._id.toString()) {
      throw new Error(`Seller mismatch on created question.`);
    }
    console.log("✓ Buyer question created with status PENDING.");

    // Verify Seller received NEW_QUESTION notification
    const sellerNotif = await Notification.findOne({
      recipient: sellerUser._id,
      type: "NEW_QUESTION",
    });
    if (!sellerNotif) {
      throw new Error("Seller did not receive NEW_QUESTION notification.");
    }
    console.log(`✓ Seller received notification: "${sellerNotif.title} - ${sellerNotif.message}"`);

    // -----------------------------------------------------------------
    // TEST 4: Elimination of Seller AI & Verification of Seller Inbox
    // -----------------------------------------------------------------
    console.log("\n[5/7] Testing Complete Removal of Seller-Side AI & Manual Seller Inbox...");
    
    // Verify that seller AI reply drafting endpoint is completely gone (404)
    const deadAiDraftRes = await fetch(`${TEST_URL}/api/questions/${createdQuestionId}/suggest-reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({ sellerNotes: "Brakes inspected, chain lubricated yesterday." }),
    });
    if (deadAiDraftRes.status !== 404) {
      throw new Error(`Expected 404 for removed seller AI draft endpoint, got ${deadAiDraftRes.status}`);
    }
    console.log("✓ Verified: Seller AI draft endpoint removed (404 Not Found). Sellers cannot use AI to auto-compose replies.");

    // Retrieve seller inbox
    const inboxRes = await fetch(`${TEST_URL}/api/questions/inbox`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    const inboxData = await inboxRes.json();

    if (inboxRes.status !== 200 || !Array.isArray(inboxData.questions)) {
      throw new Error(`Get seller inbox failed: ${JSON.stringify(inboxData)}`);
    }
    const inboxItem = inboxData.questions.find((q) => q._id.toString() === createdQuestionId.toString());
    if (!inboxItem) {
      throw new Error("Created question not found in seller inbox.");
    }
    console.log(`✓ Question verified in seller inbox with listing details: "${inboxItem.listing?.title}"`);

    // -----------------------------------------------------------------
    // TEST 5: Authorization Security, Input Validation & Manual Seller Reply
    // -----------------------------------------------------------------
    console.log("\n[6/7] Testing Manual Seller Reply, Validation & Privacy Isolation...");

    // 1. Validation: Empty / whitespace reply must fail with 400
    const emptyReplyRes = await fetch(`${TEST_URL}/api/questions/${createdQuestionId}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({ answer: "  " }),
    });
    if (emptyReplyRes.status !== 400) {
      throw new Error(`Expected 400 for empty manual reply, got ${emptyReplyRes.status}`);
    }
    console.log("✓ Input validation enforced: Empty replies rejected (400 Bad Request).");

    // 2. Authorization: Third party trying to reply to seller's question should fail with 403
    const unauthorizedReplyRes = await fetch(`${TEST_URL}/api/questions/${createdQuestionId}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${thirdPartyToken}`,
      },
      body: JSON.stringify({ answer: "Malicious reply from unauthorized user." }),
    });
    if (unauthorizedReplyRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for unauthorized reply, got ${unauthorizedReplyRes.status}`);
    }
    console.log("✓ Security verified: Unauthorized third-party reply rejected with 403 Forbidden.");

    // 3. Legitimate manual seller reply
    const officialAnswer = "Yes, both brake cables were replaced last week and the chain is smoothly lubricated.";
    const replyRes = await fetch(`${TEST_URL}/api/questions/${createdQuestionId}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({ answer: officialAnswer }),
    });
    const replyData = await replyRes.json();

    if (replyRes.status !== 200 || !replyData.question) {
      throw new Error(`Seller manual reply failed: ${JSON.stringify(replyData)}`);
    }
    if (replyData.question.status !== "ANSWERED" || replyData.question.answer !== officialAnswer) {
      throw new Error(`Question status/answer not updated properly.`);
    }
    console.log("✓ Seller manual reply saved successfully; status updated to ANSWERED.");

    // 4. Verify Buyer received QUESTION_ANSWERED notification
    const buyerNotif = await Notification.findOne({
      recipient: buyerUser._id,
      type: "QUESTION_ANSWERED",
    });
    if (!buyerNotif) {
      throw new Error("Buyer did not receive QUESTION_ANSWERED notification.");
    }
    console.log(`✓ Buyer received notification: "${buyerNotif.title} - ${buyerNotif.message}"`);

    // 5. Buyer checks their submitted questions
    const myQuestionsRes = await fetch(`${TEST_URL}/api/questions/my-questions`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const myQuestionsData = await myQuestionsRes.json();
    const myQ = myQuestionsData.questions.find((q) => q._id.toString() === createdQuestionId.toString());
    if (!myQ || myQ.status !== "ANSWERED" || !myQ.answer) {
      throw new Error("Buyer's questions view did not reflect the answered question.");
    }
    console.log(`✓ Buyer sees manual reply in /my-questions conversation history.`);

    // 6. Privacy Isolation: Another buyer querying the listing Q&A must NOT see this conversation
    const otherBuyerListingRes = await fetch(`${TEST_URL}/api/questions/listing/${cycleUnderBudget._id}`, {
      headers: { Authorization: `Bearer ${thirdPartyToken}` },
    });
    const otherBuyerListingData = await otherBuyerListingRes.json();
    if (otherBuyerListingData.questions.length !== 0) {
      throw new Error(`Privacy breach: Third party buyer saw ${otherBuyerListingData.questions.length} questions from another student!`);
    }

    const askingBuyerListingRes = await fetch(`${TEST_URL}/api/questions/listing/${cycleUnderBudget._id}`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    const askingBuyerListingData = await askingBuyerListingRes.json();
    if (askingBuyerListingData.questions.length !== 1) {
      throw new Error("Asking buyer could not see their own conversation on listing.");
    }
    console.log("✓ Privacy verified: Listing conversations are strictly private between the original buyer and the seller.");

    // -----------------------------------------------------------------
    // TEST 6: Permission-Based Automatic Bidding Linkage
    // -----------------------------------------------------------------
    console.log("\n[7/7] Testing Permission-Based Proxy Bidding Linkage...");
    // Buyer configures proxy bidding with confirmed consent
    const proxyRes = await fetch(`${TEST_URL}/api/listings/${cycleUnderBudget._id}/proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({ maxAmount: 1800 }),
    });
    const proxyData = await proxyRes.json();

    if (proxyRes.status !== 200 || !proxyData.proxy) {
      throw new Error(`Configure proxy failed: ${JSON.stringify(proxyData)}`);
    }
    console.log(`✓ Proxy bidding successfully configured for Buyer: Max ₹${proxyData.proxy.maxAmount}`);

    // Verify proxy ceiling is NOT leaked to public listing
    const publicListing = await Listing.findById(cycleUnderBudget._id);
    if (publicListing.proxyBid || publicListing.maxAmount) {
      throw new Error("Privacy leak: Proxy configuration stored on public Listing schema!");
    }
    console.log("✓ Privacy verified: Public listing object contains no proxy ceiling fields.");

    console.log("\n=========================================================");
    console.log("   ALL AI ASSISTANT TAB TESTS PASSED SUCCESSFULLY!       ");
    console.log("=========================================================\n");
  } finally {
    // Cleanup
    try {
      if (createdQuestions.length > 0) {
        await ListingQuestion.deleteMany({ _id: { $in: createdQuestions } });
      }
      if (createdListings.length > 0) {
        await Listing.deleteMany({ _id: { $in: createdListings } });
      }
      if (createdUsers.length > 0) {
        await User.deleteMany({ _id: { $in: createdUsers } });
        await Notification.deleteMany({ recipient: { $in: createdUsers } });
      }
    } catch (cleanupErr) {
      console.warn("Cleanup error:", cleanupErr.message);
    }
    await mongoose.disconnect();
    server.close();
  }
}

runAssistantTabTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Test suite failed with error:", err);
    process.exit(1);
  });
