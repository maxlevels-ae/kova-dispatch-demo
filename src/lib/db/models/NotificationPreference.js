import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    _id: mongoose.Schema.Types.ObjectId,
    inApp: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export default mongoose.models.NotificationPreference ||
  mongoose.model("NotificationPreference", schema);
