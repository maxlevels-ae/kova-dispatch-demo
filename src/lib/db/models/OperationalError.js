import mongoose from 'mongoose';
const schema = new mongoose.Schema({ source: String, code: String }, { timestamps: true });
export default mongoose.models.OperationalError || mongoose.model('OperationalError', schema);
