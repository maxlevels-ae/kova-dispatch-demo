import mongoose from 'mongoose';
import { CURRENCY } from '@/lib/currency';

const egpPricingRuleSchema = new mongoose.Schema(
  {
    history: [{ actor: String, at: Date, value: mongoose.Schema.Types.Mixed }],
    currency: { type: String, enum: [CURRENCY], default: CURRENCY, required: true },
    vehicleType: {
      type: String,
      enum: ['economy', 'comfort', 'premium', 'xl'],
      required: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    cancellationFee: { type: Number, min: 0, max: 1000, default: 30 },
    baseFare: {
      type: Number,
      required: true,
      default: 20,
    },
    perKmRate: {
      type: Number,
      required: true,
      default: 8,
    },
    perMinRate: {
      type: Number,
      required: true,
      default: 1,
    },
    minimumFare: {
      type: Number,
      required: true,
      default: 40,
    },
    bookingFee: {
      type: Number,
      default: 5,
    },
    platformCommission: {
      type: Number,
      required: true,
      default: 20, // percentage
      min: 0,
      max: 50,
    },
    surgeMultiplierCap: {
      type: Number,
      default: 3.0,
      min: 1.0,
      max: 10.0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

egpPricingRuleSchema.index({ vehicleType: 1, city: 1 }, { unique: true });

const EgpPricingRule =
  mongoose.models.EgpPricingRule || mongoose.model('EgpPricingRule', egpPricingRuleSchema, 'egppricingrules');
export default EgpPricingRule;


