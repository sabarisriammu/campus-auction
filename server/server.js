const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("./models/User");
const authRoutes = require("./routes/authRoutes");
const listingRoutes = require("./routes/listingRoutes");
const bidRoutes = require("./routes/bidRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const watchlistRoutes = require("./routes/watchlistRoutes");
const secondChanceRoutes = require("./routes/secondChanceRoutes");
const notificationService = require("./services/notificationService");
const { processExpiredAuctions } = require("./services/auctionService");
const { processAuctionReminders } = require("./services/reminderService");
const { checkAndExpireOffers } = require("./services/secondChanceService");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  },
});

// Register io instance with notificationService for real-time dispatch
notificationService.setIo(io);

// Authenticate WebSocket connections using JWT
io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

    if (!token) {
      return next(new Error("Authentication error: Token required."));
    }

    if (!process.env.JWT_SECRET) {
      return next(new Error("Authentication error: Server missing JWT_SECRET."));
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
  // Join the authenticated user to their private, secure room
  const userRoom = `user:${socket.user.id}`;
  socket.join(userRoom);

  socket.on("disconnect", () => {
    // Room membership cleaned up automatically by socket.io
  });
});

app.use(cors());
app.use(express.json());

// Serve uploaded product images statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/listings", bidRoutes);
app.use("/api/bids", bidRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api", secondChanceRoutes);

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

    // Index migration: ensure old unique index on transactions.listing is dropped to allow failed + fallback transactions
    try {
      const txIndexes = await mongoose.connection.collection("transactions").indexes();
      const listingUniqueIdx = txIndexes.find((idx) => idx.name === "listing_1" && idx.unique);
      if (listingUniqueIdx) {
        await mongoose.connection.collection("transactions").dropIndex("listing_1");
        await mongoose.connection.collection("transactions").createIndex({ listing: 1 });
        console.log("Migrated transactions listing index to non-unique for historical logs.");
      }
    } catch (idxErr) {
      // Ignore if collection or index does not exist
    }

    // Initialize periodic background scheduler (runs every 30 seconds):
    // 1. Expire past-deadline auctions and assign winners
    // 2. Dispatch 15-minute and 5-minute auction ending reminders
    // 3. Mark elapsed second-chance offers as EXPIRED
    setInterval(async () => {
      try {
        await processExpiredAuctions();
      } catch (err) {
        console.error("Background auction expiry check error:", err.message);
      }

      try {
        await processAuctionReminders();
      } catch (err) {
        console.error("Background auction reminder error:", err.message);
      }

      try {
        await checkAndExpireOffers();
      } catch (err) {
        console.error("Background second-chance expiry check error:", err.message);
      }
    }, 30000);

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
