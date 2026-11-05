import mongoose from 'mongoose';
const schema=new mongoose.Schema({_id:String,draft:mongoose.Schema.Types.Mixed,published:mongoose.Schema.Types.Mixed,revision:{type:Number,default:0},publishedRevision:Number,publishedAt:Date,history:[{actor:String,at:Date,action:String,revision:Number,value:mongoose.Schema.Types.Mixed}]},{timestamps:true});
export default mongoose.models.RiderContent||mongoose.model('RiderContent',schema);
