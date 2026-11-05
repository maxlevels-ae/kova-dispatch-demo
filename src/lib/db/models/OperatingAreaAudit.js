import mongoose from 'mongoose';
const schema=new mongoose.Schema({at:{type:Date,required:true,immutable:true},actorId:{type:mongoose.Schema.Types.ObjectId,required:true,immutable:true},action:{type:String,required:true,immutable:true},country:{type:String,required:true,immutable:true},revision:{type:Number,required:true,unique:true,immutable:true},changes:{type:mongoose.Schema.Types.Mixed,immutable:true}},{versionKey:false});
export default mongoose.models.OperatingAreaAudit||mongoose.model('OperatingAreaAudit',schema);
