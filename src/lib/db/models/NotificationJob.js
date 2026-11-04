import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    key: { type: String, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, index: true },
    event: String,
    text: String,
    rideId: mongoose.Schema.Types.ObjectId,
    href: String,
    expiresAt: Date,
    role: String,
    status: {
      type: String,
      enum: ["queued", "processing", "delivered", "failed", "suppressed"],
      default: "queued",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    availableAt: { type: Date, default: Date.now },
    lastError: String,
  },
  { timestamps: true },
);
export default mongoose.models.NotificationJob ||
  mongoose.model("NotificationJob", schema);
