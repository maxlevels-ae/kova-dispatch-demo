import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    key: { type: String, unique: true },
    event: String,
    text: String,
    readAt: Date,
  },
  { timestamps: true },
);
export default mongoose.models.Notification ||
  mongoose.model("Notification", schema);
