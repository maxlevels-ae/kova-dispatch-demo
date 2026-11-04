import mongoose from 'mongoose';
const schema=new mongoose.Schema({driverUserId:{type:mongoose.Schema.Types.ObjectId,required:true},bytes:{type:Buffer,required:true},contentType:{type:String,default:'image/webp'},uploadedBy:mongoose.Schema.Types.ObjectId},{timestamps:true});
export default mongoose.models.VehiclePhoto||mongoose.model('VehiclePhoto',schema);
