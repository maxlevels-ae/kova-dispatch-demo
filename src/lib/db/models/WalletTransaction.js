import mongoose from 'mongoose';
import { CURRENCY } from '@/lib/currency';

const walletTransactionSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    reason: { type: String, maxlength: 200 },
    reference: { type: String, maxlength: 100 },
    balanceBefore: Number,
    currency: { type: String, default: function () { return this.isNew ? CURRENCY : undefined; } },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'topup', 'manual_credit', 'manual_debit',
        'ride_payment',
        'ride_earning',
        'refund',
        'cancellation_fee',
        'payout',
        // Platform commission charged directly to a driver (reserved)
        'commission',
      ],
      required: true,
    },
    // Positive = credit, negative = debit
    amount: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      default: null,
    },
    note: {
      type: String,
      maxlength: 200,
      default: '',
    },
    // External reference (e.g. Stripe checkout session id) — makes credits
    // idempotent when both the webhook and the return page try to apply them
    ref: {
      type: String,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// Ledger entries are append-only. Corrections require a separate compensating entry.
walletTransactionSchema.pre('save', function () { if (!this.isNew) throw new Error('Wallet ledger entries are immutable'); });
for (const operation of ['updateOne','updateMany','findOneAndUpdate','replaceOne','findOneAndReplace','deleteOne','deleteMany','findOneAndDelete']) {
  walletTransactionSchema.pre(operation, function () { throw new Error('Wallet ledger entries are immutable'); });
}

walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ ref: 1 }, { unique: true, sparse: true });

const WalletTransaction =
  mongoose.models.WalletTransaction ||
  mongoose.model('WalletTransaction', walletTransactionSchema);
export default WalletTransaction;
