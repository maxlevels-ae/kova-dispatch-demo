import mongoose from 'mongoose';
const schema=new mongoose.Schema({ownerId:{type:mongoose.Schema.Types.ObjectId,required:true},deliveryId:mongoose.Schema.Types.ObjectId,kind:{type:String,enum:['package','proof'],required:true},bytes:{type:Buffer,select:false},contentType:String,expiresAt:Date},{timestamps:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
export default mongoose.models.DeliveryEvidence||mongoose.model('DeliveryEvidence',schema);
