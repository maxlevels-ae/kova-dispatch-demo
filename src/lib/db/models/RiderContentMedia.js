import mongoose from 'mongoose';
const schema=new mongoose.Schema({country:{type:String,required:true},bytes:{type:Buffer,required:true,select:false},width:Number,height:Number,uploadedBy:{type:mongoose.Schema.Types.ObjectId,required:true},published:{type:Boolean,default:false}},{timestamps:true});
export default mongoose.models.RiderContentMedia||mongoose.model('RiderContentMedia',schema);
