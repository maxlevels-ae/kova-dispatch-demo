import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: { type: String, required: true },
    changes: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);
export default mongoose.models.AdminAudit ||
  mongoose.model("AdminAudit", schema);
