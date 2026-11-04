import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: { type: String, default: 'public' },
  history: [{ actor: String, at: Date, name: String, hasLogo: Boolean, hasLoginLogo: Boolean }],
  name: { type: String, required: true, maxlength: 60 },
  logo: { type: String, default: null },
  loginLogo: { type: String, default: null },
}, { timestamps: true });
export default mongoose.models.Branding || mongoose.model('Branding', schema);
