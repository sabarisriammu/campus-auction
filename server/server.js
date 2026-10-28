const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const authRoutes = require("./routes/authRoutes");
const listingRoutes = require("./routes/listingRoutes");
const bidRoutes = require("./routes/bidRoutes");
const { processExpiredAuctions } = require("./services/auctionService");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded product images statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/listings", bidRoutes);
app.use("/api/bids", bidRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Campus Auction API is running!",
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected successfully!");

    // Initialize periodic background scheduler for closing expired auctions (runs every 30 seconds)
    setInterval(async () => {
      try {
        await processExpiredAuctions();
      } catch (err) {
        console.error("Background auction expiry check error:", err.message);
      }
    }, 30000);

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
