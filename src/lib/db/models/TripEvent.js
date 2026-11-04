import mongoose from 'mongoose';
const schema=new mongoose.Schema({rideId:{type:mongoose.Schema.Types.ObjectId,index:true,required:true},key:{type:String,unique:true},event:String,actorId:mongoose.Schema.Types.ObjectId,at:{type:Date,default:Date.now},details:String,expiresAt:{type:Date,default:()=>new Date(Date.now()+90*86400000)}});
schema.index({expiresAt:1},{expireAfterSeconds:0});
export default mongoose.models.TripEvent||mongoose.model('TripEvent',schema);
