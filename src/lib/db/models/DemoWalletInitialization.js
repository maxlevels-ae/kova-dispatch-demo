import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    _id: String,
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actorName: String,
    executedAt: { type: Date, required: true },
    accounts: [
      {
        _id: false,
        username: String,
        userId: mongoose.Schema.Types.ObjectId,
        driverProfileId: mongoose.Schema.Types.ObjectId,
        status: { type: String, enum: ["initialized", "blocked"] },
        reason: String,
        legacyWallet: mongoose.Schema.Types.Mixed,
        operationalWallet: mongoose.Schema.Types.Mixed,
        ledgerRef: String,
      },
    ],
  },
  { versionKey: false },
);
schema.pre("save", function () {
  if (!this.isNew)
    throw new Error("Demo initialization receipts are immutable");
});
for (const operation of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
])
  schema.pre(operation, function () {
    throw new Error("Demo initialization receipts are immutable");
  });
export default mongoose.models.DemoWalletInitialization ||
  mongoose.model("DemoWalletInitialization", schema);
