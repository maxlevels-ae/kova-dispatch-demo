import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    _id: String,
    value: mongoose.Schema.Types.Mixed,
    revision: { type: Number, default: 0 },
    history: [{ actor: String, at: Date, action: String }],
  },
  { timestamps: true },
);
export default mongoose.models.ProviderConfig ||
  mongoose.model("ProviderConfig", schema);
