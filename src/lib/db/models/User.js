import mongoose from 'mongoose';
import { CURRENCY } from '@/lib/currency';

const userSchema = new mongoose.Schema(
  {
    authVersion: { type: Number, default: 0 },
    language:{type:String,enum:['en','ar'],default:'en'},
    egpWallet: { type: new mongoose.Schema({ balance: { type: Number, default: 0 }, currency: { type: String, enum: ['EGP'], default: 'EGP' } }, { _id: false }), default: undefined },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-z0-9_.]+$/,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      enum: ['rider', 'driver', 'admin'],
      default: 'rider',
    },
    wallet: {
      balance: { type: Number, default: 0 },
      currency: { type: String, default: function () { return this.isNew ? CURRENCY : undefined; } },
    },
    rating: {
      average: { type: Number, default: 5.0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
    savedPlaces: [
      {
        label: { type: String, required: true },
        address: { type: String, required: true },
        location: {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number], required: true },
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.index({ role: 1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
