import mongoose from 'mongoose';
const schema=new mongoose.Schema({rideId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},driverId:{type:mongoose.Schema.Types.ObjectId,required:true},at:{type:Date,required:true},lat:Number,lng:Number,accuracy:Number,expiresAt:{type:Date,required:true}});
schema.index({expiresAt:1},{expireAfterSeconds:0});schema.index({rideId:1,at:1});
export default mongoose.models.RideGpsSample||mongoose.model('RideGpsSample',schema,'ridegpssamples');
