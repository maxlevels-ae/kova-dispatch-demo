import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    _id: String,
    value: mongoose.Schema.Types.Mixed,
    revision: { type: Number, default: 0 },
    history: [
      {
        actor: String,
        at: Date,
        fields: [String],
        value: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  { timestamps: true },
);
export default mongoose.models.PlatformSettings ||
  mongoose.model("PlatformSettings", schema);
