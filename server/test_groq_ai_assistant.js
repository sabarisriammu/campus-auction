const http = require("http");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const User = require("./models/User");
const Listing = require("./models/Listing");
const aiService = require("./services/aiService");
const aiRoutes = require("./routes/aiRoutes");

const TEST_PORT = 5057;
const TEST_URL = `http://localhost:${TEST_PORT}`;

// Mock Groq Client Factory
function createMockGroqClient({ mode = "success", customAnswer = null, customDraft = null }) {
  return {
    chat: {
      completions: {
        create: async (params) => {
          if (mode === "auth_error") {
            const err = new Error("Invalid API Key provided.");
            err.status = 401;
            throw err;
          }
          if (mode === "quota_error") {
            const err = new Error("Rate limit / token quota exceeded.");
            err.status = 429;
            throw err;
          }
          if (mode === "timeout_error") {
            const err = new Error("Connection timed out after 15000ms.");
            err.status = 408;
            throw err;
          }

          // Check if request is JSON mode (Seller draft)
          if (params.response_format?.type === "json_object") {
            const draft = customDraft || {
              title: "Calculus Early Transcendentals 9th Edition",
              description: "Hardcover calculus textbook in like-new condition. Clean pages with no markings. Campus pickup available at Central Library.",
              keyFeatures: [
                "9th Edition by James Stewart",
                "Hardcover with intact binding",
                "No highlighter or pen markings"
              ],
              searchKeywords: ["calculus", "stewart", "textbook", "math"],
              missingInformation: ["Include online access code if available"]
            };
            return {
              model: params.model,
              choices: [{ message: { content: JSON.stringify(draft) } }],
            };
          }

          // Text completion mode (Buyer Q&A)
          const answer = customAnswer || "The seller confirmed the textbook is in Like New condition with crisp pages and no markings.";
          return {
            model: params.model,
            choices: [{ message: { content: answer } }],
          };
        },
      },
    },
  };
}

async function runGroqAiTests() {
  console.log("=========================================================");
  console.log("   CAMPUS AUCTION - GROQ AI ASSISTANT TEST SUITE        ");
  console.log("=========================================================\n");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✓ Connected to MongoDB Atlas");

  // Setup test Express server
  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`✓ Test AI server listening on ${TEST_URL}`);

  const timestamp = Date.now();
  let sellerUser, buyerUser;
  let sellerToken, buyerToken;
  let testListing;

  const createdUsers = [];
  const createdListings = [];

  try {
    // -----------------------------------------------------------------
    // SETUP: Test Users and Listing
    // -----------------------------------------------------------------
    console.log("\n[1/8] Setting up test participants and test listing...");
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

    buyerUser = await User.create({
      name: `Buyer ${timestamp}`,
      email: `buyer_${timestamp}@campus.edu`,
      password: "HashedPassword123!",
      role: "buyer",
    });
    createdUsers.push(buyerUser._id);
    buyerToken = jwt.sign(
      { id: buyerUser._id, role: buyerUser.role, email: buyerUser.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    testListing = await Listing.create({
      title: `iPad Air 5th Gen (${timestamp})`,
      description: "Space gray, 64GB WiFi. Screen protector applied on day one. Includes original 20W USB-C charger. Handover at Student Union.",
      category: "Electronics",
      condition: "Like New",
      startingPrice: 25000,
      currentPrice: 25000,
      minBidIncrement: 500,
      auctionEndTime: new Date(Date.now() + 86400000),
      status: "active",
      seller: sellerUser._id,
    });
    createdListings.push(testListing._id);

    console.log("✓ Test participants and active listing created.");

    // Helper for HTTP requests
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
    // TEST 1: Authentication & Role-Based Access Control
    // -----------------------------------------------------------------
    console.log("\n[2/8] Testing Authentication and Role Permissions...");
    // 1. Unauthenticated request to seller draft
    const unauthRes = await apiRequest("/api/ai/seller/draft", "POST", { notes: "iPad air 64gb like new" });
    if (unauthRes.status !== 401) throw new Error(`Expected 401 for unauthenticated seller draft, got ${unauthRes.status}`);
    console.log("✓ Unauthenticated access to seller draft endpoint rejected (401 Unauthorized).");

    // 2. Buyer role trying to call seller draft
    const buyerDraftRes = await apiRequest("/api/ai/seller/draft", "POST", { notes: "iPad air 64gb like new" }, buyerToken);
    if (buyerDraftRes.status !== 403) throw new Error(`Expected 403 for buyer role accessing seller draft, got ${buyerDraftRes.status}`);
    console.log("✓ Buyer role rejected from seller AI draft generator (403 Forbidden).");

    // -----------------------------------------------------------------
    // TEST 2: Input Validation (Notes and Length Restrictions)
    // -----------------------------------------------------------------
    console.log("\n[3/8] Testing Input Boundaries & Validation...");
    // Short notes (< 5 chars)
    const shortNotesRes = await apiRequest("/api/ai/seller/draft", "POST", { notes: "abc" }, sellerToken);
    if (shortNotesRes.status !== 400) throw new Error(`Expected 400 for short notes, got ${shortNotesRes.status}`);

    // Buyer question too short (< 3 chars)
    const shortQRes = await apiRequest("/api/ai/buyer/ask", "POST", { listingId: testListing._id, question: "hi" });
    if (shortQRes.status !== 400) throw new Error(`Expected 400 for short buyer question, got ${shortQRes.status}`);

    // Invalid listing ID format
    const invalidIdRes = await apiRequest("/api/ai/buyer/ask", "POST", { listingId: "not-an-id", question: "Is charger included?" });
    if (invalidIdRes.status !== 400) throw new Error(`Expected 400 for invalid listing ID, got ${invalidIdRes.status}`);

    // Non-existent listing ID
    const randomId = new mongoose.Types.ObjectId();
    const notFoundRes = await apiRequest("/api/ai/buyer/ask", "POST", { listingId: randomId, question: "Is charger included?" });
    if (notFoundRes.status !== 404) throw new Error(`Expected 404 for non-existent listing, got ${notFoundRes.status}`);
    console.log("✓ Input lengths and listing ID validation enforced (400 / 404).");

    // -----------------------------------------------------------------
    // TEST 3: Missing API Key Fallback Handling
    // -----------------------------------------------------------------
    console.log("\n[4/8] Testing Missing Groq API Key Safe Fallback...");
    // Force GROQ_API_KEY to empty
    const originalApiKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    // Seller draft without API key -> must return clean fallback template without crashing
    const fallbackDraft = await aiService.generateSellerListingDraft({
      notes: "Calculus 9th edition by Stewart, good condition, no highlights",
      category: "Textbooks",
      condition: "Good",
      startingPrice: 400,
    });
    if (fallbackDraft.isAiGenerated !== false || fallbackDraft.fallback !== true || !fallbackDraft.data?.title) {
      throw new Error(`Expected safe rule-based fallback, got ${JSON.stringify(fallbackDraft)}`);
    }

    // Buyer Q&A without API key -> must return clean fallback answer without crashing
    const fallbackAnswer = await aiService.answerBuyerQuestion({
      listingId: testListing._id,
      question: "What is the condition of this item?",
    });
    if (fallbackAnswer.isAiGenerated !== false || fallbackAnswer.fallback !== true || !fallbackAnswer.answer) {
      throw new Error(`Expected safe buyer fallback answer, got ${JSON.stringify(fallbackAnswer)}`);
    }
    console.log("✓ Missing API key handled gracefully with safe, clearly marked rule-based fallback (no crash).");

    // Restore original key
    if (originalApiKey) process.env.GROQ_API_KEY = originalApiKey;

    // -----------------------------------------------------------------
    // TEST 4: Invalid API Key (401) & Quota (429) Handling
    // -----------------------------------------------------------------
    console.log("\n[5/8] Testing Provider Authentication and Quota Errors...");
    const mockAuthErrorClient = createMockGroqClient({ mode: "auth_error" });
    const authErrorResult = await aiService.generateSellerListingDraft({
      notes: "Scientific Calculator Casio fx-991EX",
      category: "Electronics",
      condition: "Like New",
      clientOverride: mockAuthErrorClient,
    });
    if (!authErrorResult.fallback || !authErrorResult.error?.includes("invalid")) {
      throw new Error(`Expected clean auth error handling, got ${JSON.stringify(authErrorResult)}`);
    }

    const mockQuotaClient = createMockGroqClient({ mode: "quota_error" });
    const quotaResult = await aiService.answerBuyerQuestion({
      listingId: testListing._id,
      question: "Are accessories included?",
      clientOverride: mockQuotaClient,
    });
    if (!quotaResult.fallback || !quotaResult.error?.includes("rate limit")) {
      throw new Error(`Expected clean quota error handling, got ${JSON.stringify(quotaResult)}`);
    }
    console.log("✓ Authentication errors (401) and Rate limits (429) trapped safely without leaking stack traces.");

    // -----------------------------------------------------------------
    // TEST 5: Successful Mocked Seller AI Draft Generation
    // -----------------------------------------------------------------
    console.log("\n[6/8] Testing Successful Seller AI Draft Generation...");
    const mockSuccessClient = createMockGroqClient({ mode: "success" });
    const successfulDraft = await aiService.generateSellerListingDraft({
      notes: "iPad Air 64GB space grey, like new condition, comes with original charger and box",
      category: "Electronics",
      condition: "Like New",
      startingPrice: 24000,
      clientOverride: mockSuccessClient,
    });

    if (!successfulDraft.isAiGenerated || successfulDraft.fallback !== false) {
      throw new Error("Expected successful AI generation flag.");
    }
    if (!successfulDraft.data?.title || !successfulDraft.data?.description || !Array.isArray(successfulDraft.data?.keyFeatures)) {
      throw new Error("Missing structured fields in AI draft.");
    }
    console.log(`✓ Seller draft generated: "${successfulDraft.data.title}" (${successfulDraft.model})`);

    // -----------------------------------------------------------------
    // TEST 6: Successful Mocked Buyer AI Q&A
    // -----------------------------------------------------------------
    console.log("\n[7/8] Testing Successful Buyer AI Question Answering...");
    const successfulQA = await aiService.answerBuyerQuestion({
      listingId: testListing._id,
      question: "Does this include the original charger?",
      clientOverride: mockSuccessClient,
    });

    if (!successfulQA.isAiGenerated || successfulQA.fallback !== false || !successfulQA.answer) {
      throw new Error("Expected successful AI Q&A response.");
    }
    console.log(`✓ Buyer question answered: "${successfulQA.answer}" (${successfulQA.model})`);

    // -----------------------------------------------------------------
    // TEST 7: Privacy and Sensitive Data Protection
    // -----------------------------------------------------------------
    console.log("\n[8/8] Testing Protection Against Secret & Private Data Leakage...");
    // Verify that the prompt sent to Groq NEVER contains seller email or password
    let promptCaptured = null;
    const privacyAuditorClient = {
      chat: {
        completions: {
          create: async (params) => {
            promptCaptured = JSON.stringify(params.messages);
            return {
              model: params.model,
              choices: [{ message: { content: "Audited response." } }],
            };
          },
        },
      },
    };

    await aiService.answerBuyerQuestion({
      listingId: testListing._id,
      question: "Tell me everything about this listing including seller contact.",
      clientOverride: privacyAuditorClient,
    });

    if (!promptCaptured) throw new Error("Auditor failed to capture prompt.");
    if (promptCaptured.includes(sellerUser.email)) {
      throw new Error("CRITICAL SECURITY LEAK: Seller email was included in the AI context!");
    }
    if (promptCaptured.includes("HashedPassword123")) {
      throw new Error("CRITICAL SECURITY LEAK: User password was included in the AI context!");
    }
    if (promptCaptured.includes("maxAmount")) {
      throw new Error("CRITICAL SECURITY LEAK: Proxy bid limit was included in the AI context!");
    }
    console.log("✓ Privacy verified: Seller email, passwords, and private bidding limits are strictly excluded from AI context.");

  } finally {
    console.log("\nCleaning up test data and closing server...");
    if (createdListings.length > 0) {
      await Listing.deleteMany({ _id: { $in: createdListings } });
    }
    if (createdUsers.length > 0) {
      await User.deleteMany({ _id: { $in: createdUsers } });
    }
    await new Promise((resolve) => server.close(resolve));
    console.log("✓ Test server closed.");
  }

  console.log("\n=========================================================");
  console.log("   ALL GROQ AI ASSISTANT TESTS PASSED (100% OK)          ");
  console.log("=========================================================");
  await mongoose.connection.close();
  console.log("✓ MongoDB connection closed.");
}

runGroqAiTests().catch((err) => {
  console.error("\n❌ GROQ AI ASSISTANT TEST RUNNER FAILED:", err);
  process.exit(1);
});
