import mongoose from 'mongoose';
import { CURRENCY } from '@/lib/currency';

const pricingRuleSchema = new mongoose.Schema(
  {
    currency: { type: String, default: function () { return this.isNew ? CURRENCY : undefined; } },
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

pricingRuleSchema.index({ vehicleType: 1, city: 1 }, { unique: true });

const PricingRule =
  mongoose.models.PricingRule || mongoose.model('PricingRule', pricingRuleSchema);
export default PricingRule;
