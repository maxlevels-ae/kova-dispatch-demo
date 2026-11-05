import mongoose from 'mongoose';
const schema=new mongoose.Schema({_id:{type:String,default:'global'},activeCountry:{type:String,default:'EG'},revision:{type:Number,default:0},countries:mongoose.Schema.Types.Mixed,audit:[{at:Date,actorId:mongoose.Schema.Types.ObjectId,action:String,country:String,revision:Number,changes:mongoose.Schema.Types.Mixed}]},{timestamps:true});
export default mongoose.models.OperatingAreas||mongoose.model('OperatingAreas',schema);
