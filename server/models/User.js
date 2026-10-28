const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: [true, "Password must be at least 8 characters long."],
      minlength: 8,
      select: false,
    },

    role: {
      type: String,
      enum: {
        values: ["buyer", "seller", "admin"],
        message: "{VALUE} is not a valid role. Allowed roles: buyer, seller, admin.",
      },
      default: "buyer",
    },
  },
  {
    timestamps: true,
  }
);

// Hash the password before saving a user.
userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 12);
});

module.exports = mongoose.model("User", userSchema);
